// =============================================================
// 経験値・レベル・能力ポイント・限界突破
//
// 後続のシステム（討伐・ボス・ダンジョン・クエスト・イベント・試練）は
//   ctx.progression.grantExp(player.id, 量, { source: "quest", key: "quest:xxx", once: true })
// のように呼ぶだけで経験値を付与できる。
//   key  : 同じ報酬を二度処理しないための識別子（例：討伐なら "kill:<エンティティID>"）
//   once : true なら、そのキーの報酬は永久に1回だけ（クエスト報酬など）
// =============================================================
import {
  STAT_POINTS_PER_LEVEL,
  MAX_EXP_PER_GRANT,
  CATCH_UP,
  REWARD_LOG_SIZE,
  EXP_SOURCES,
  RESTORE_ON_LEVEL_UP,
  LEVEL_DIFF_EXP,
  EXP_BONUS_CAP,
  PERSONAL_BREAK_REQUIREMENTS,
} from "../balance/progression.js";
import { addExp, expToNext } from "./levelMath.js";
import { levelCapForStage, tierForStage, nextTier } from "../content/tiers.js";
import { applyLevelGrowth } from "../stats/growth.js";
import { collectModifiers, growthMultipliers } from "../stats/statCalc.js";
import { recalcData } from "../stats/statService.js";
import { evaluateTalentsData } from "../talents/talentService.js";
import { checkAll } from "../talents/conditions.js";
import { emit } from "../core/eventBus.js";
import { createLogger } from "../core/log.js";

const log = createLogger("progress");

/**
 * @typedef {Object} GrantResult
 * @property {boolean} ok
 * @property {string} [reason]
 * @property {number} [granted]      実際に加算した経験値
 * @property {number} [levelsGained]
 * @property {number} [level]
 * @property {number} [stored]       上限で保留した量
 * @property {number} [discarded]    上限で捨てた量
 */

export class ProgressionService {
  /**
   * @param {import("../player/playerService.js").PlayerService} playerService
   * @param {import("../world/worldService.js").WorldService} worldService
   * @param {() => number} nowTick
   */
  constructor(playerService, worldService, nowTick) {
    this.playerService = playerService;
    this.worldService = worldService;
    this.nowTick = nowTick;
    /** 経験値を得たときに呼ばれる（職業経験値・職業の解放判定。app.js が設定） @type {((playerId: string, amount: number, levelsGained: number) => void)|null} */
    this.onExpGranted = null;
  }

  get settings() {
    return this.worldService.world.settings.progression;
  }

  /** 敵とのレベル差による倍率（格上は増加・格下は減少） */
  levelDiffMultiplier(myLevel, enemyLevel) {
    if (typeof enemyLevel !== "number" || !Number.isFinite(enemyLevel)) return 1;
    const m = 1 + (enemyLevel - myLevel) * LEVEL_DIFF_EXP.perLevel;
    return Math.min(LEVEL_DIFF_EXP.max, Math.max(LEVEL_DIFF_EXP.min, m));
  }

  /** 才能・潜在能力・職業などの経験値ボーナス（expBonus）の合計（上限あり） */
  expBonus(d) {
    let sum = 0;
    for (const m of collectModifiers(d, this.nowTick())) sum += typeof m.def.expBonus === "number" ? m.def.expBonus : 0;
    return Math.max(-0.5, Math.min(EXP_BONUS_CAP, sum));
  }

  /** 追いつき補正の倍率（オンラインの最高レベルとの差） */
  catchUpMultiplier(playerId) {
    if (!CATCH_UP.enabled) return 1;
    const me = this.playerService.dataFor(playerId);
    if (!me) return 1;
    let top = me.level;
    for (const s of this.playerService.onlineSessions()) {
      const d = this.playerService.dataFor(s.playerId);
      if (d && d.level > top) top = d.level;
    }
    const gap = top - me.level - CATCH_UP.threshold;
    return gap > 0 ? 1 + Math.min(CATCH_UP.maxBonus, gap * CATCH_UP.perLevel) : 1;
  }

  /**
   * 経験値を付与する（共通処理）。
   * @param {string} playerId
   * @param {number} amount
   * @param {{source: keyof typeof EXP_SOURCES, key?: string, once?: boolean, noBonus?: boolean, enemyLevel?: number}} opt
   *   enemyLevel : 敵のレベル。指定すると格上は増加・格下は減少（LEVEL_DIFF_EXP）
   * @returns {GrantResult}
   */
  grantExp(playerId, amount, opt) {
    const src = EXP_SOURCES[opt && opt.source];
    if (!src) return { ok: false, reason: "不明な入手元" };
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "経験値が不正" };
    const me = this.playerService.dataFor(playerId);
    let mult = src.multiplier;
    if (!opt.noBonus && me) {
      mult *= this.catchUpMultiplier(playerId);
      mult *= this.levelDiffMultiplier(me.level, opt.enemyLevel);
      mult *= 1 + this.expBonus(me);
    }
    const value = Math.min(MAX_EXP_PER_GRANT, Math.floor(amount * mult));
    if (value <= 0) return { ok: false, reason: "経験値が0" };

    /** @type {GrantResult} */
    /** @type {any} */
    let res = { ok: false, reason: "このプレイヤーは参加していません" };
    let fromLevel = 0;
    let talentEvents = [];
    const ok = this.playerService.update(playerId, (d) => {
      // 二重付与の防止
      if (opt.key) {
        if (opt.once ? d.rewardLog.once[opt.key] : d.rewardLog.recent.includes(opt.key) || d.rewardLog.once[opt.key]) {
          res = { ok: false, reason: "この報酬は受け取り済みです" };
          return;
        }
        if (opt.once) d.rewardLog.once[opt.key] = Date.now();
        else {
          d.rewardLog.recent.push(opt.key);
          if (d.rewardLog.recent.length > REWARD_LOG_SIZE) d.rewardLog.recent.splice(0, d.rewardLog.recent.length - REWARD_LOG_SIZE);
        }
      }
      fromLevel = d.level;
      const r = addExp(
        { level: d.level, exp: d.exp, overflow: d.expOverflow },
        value,
        { cap: levelCapForStage(d.limitBreak.stage), policy: this.settings.overflowPolicy === "discard" ? "discard" : "store", stage: d.limitBreak.stage }
      );
      d.level = r.level;
      d.exp = r.exp;
      d.expOverflow = r.overflow;
      d.totalExp += value - r.discarded;
      if (r.levelsGained > 0) talentEvents = this.onLevelsGained(d, r.levelsGained);
      res = { ok: true, granted: value - r.discarded, levelsGained: r.levelsGained, level: r.level, stored: r.stored, discarded: r.discarded };
    });
    if (!ok) return res;
    if (res.ok) {
      if (res.levelsGained > 0) {
        this.saveNow(playerId);
        emit("levelUp", { playerId, from: fromLevel, to: res.level, points: res.levelsGained * STAT_POINTS_PER_LEVEL });
        this.emitTalentEvents(playerId, talentEvents);
      }
      emit("expGained", { playerId, amount: res.granted, source: opt.source });
      if (this.onExpGranted) this.onExpGranted(playerId, res.granted, res.levelsGained);
    }
    return res;
  }

  /** レベルが上がったときの処理（mutator 内） */
  onLevelsGained(d, levels) {
    d.unspentStatPoints += levels * STAT_POINTS_PER_LEVEL;
    d.statPointsEarned += levels * STAT_POINTS_PER_LEVEL;
    applyLevelGrowth(d, levels, /** @type {Record<string, number>} */ (growthMultipliers(collectModifiers(d, this.nowTick()))));
    const events = evaluateTalentsData(d);
    recalcData(d, this.nowTick());
    if (RESTORE_ON_LEVEL_UP) {
      d.vitals.mp = d.vitals.mpMax;
      d.vitals.stamina = d.vitals.staminaMax;
      d.vitals.exhausted = false;
      d.vitals.healRequest = true; // HP はバニラの体力側で回復する（vitalsRuntime が処理）
    }
    return events;
  }

  emitTalentEvents(playerId, events) {
    for (const e of events) {
      if (e.type === "acquired") emit("talentAcquired", { playerId, id: e.id, origin: "acquired" });
      else if (e.type === "evolved") emit("talentEvolved", { playerId, from: e.from, to: e.id });
      else if (e.type === "potential") emit("potentialAwakened", { playerId, id: e.id });
    }
    emit("statsChanged", { playerId });
  }

  saveNow(playerId) {
    const s = this.playerService.getSession(playerId);
    if (s) this.playerService.records.save(`p.${s.uid}`);
  }

  /** 表示用の進行状況 */
  info(playerId) {
    const d = this.playerService.dataFor(playerId);
    if (!d) return undefined;
    const tier = tierForStage(d.limitBreak.stage);
    const atCap = d.level >= tier.cap;
    return {
      level: d.level,
      exp: d.exp,
      need: atCap ? 0 : expToNext(d.level, d.limitBreak.stage),
      atCap,
      cap: tier.cap,
      tier,
      next: nextTier(d.limitBreak.stage),
      overflow: d.expOverflow,
      totalExp: d.totalExp,
    };
  }

  /**
   * 限界突破を試みる。
   * 通常は次の階級の requirements をすべて満たす必要がある。requirements が null（未実装）なら突破できない。
   * force は管理者テスト専用。
   */
  limitBreak(playerId, { force = false, by = "player" } = {}) {
    /** @type {any} */
    let res = { ok: false, reason: "このプレイヤーは参加していません" };
    let from = 0;
    let to = 0;
    let talentEvents = [];
    this.playerService.update(playerId, (d) => {
      const nt = nextTier(d.limitBreak.stage);
      if (!nt) {
        res = { ok: false, reason: "これ以上の階級はありません" };
        return;
      }
      if (!force) {
        if (d.level < levelCapForStage(d.limitBreak.stage)) {
          res = { ok: false, reason: "レベルが上限に達していません" };
          return;
        }
        if (!nt.requirements) {
          res = { ok: false, reason: "限界突破の条件はまだ解明されていない（今後実装予定）" };
          return;
        }
        const personal = PERSONAL_BREAK_REQUIREMENTS[nt.stage];
        const reqs = [...nt.requirements, ...(typeof personal === "function" ? personal(d) || [] : [])];
        if (!checkAll(reqs, d)) {
          res = { ok: false, reason: "限界突破の条件を満たしていません" };
          return;
        }
      }
      from = d.limitBreak.stage;
      to = from + 1;
      d.limitBreak.stage = to;
      d.limitBreak.history.push({ from, to, at: Date.now(), by });
      // 保留していた経験値を新しい上限で加算
      const stored = d.expOverflow;
      d.expOverflow = 0;
      const r = addExp({ level: d.level, exp: d.exp, overflow: 0 }, stored, {
        cap: levelCapForStage(to),
        policy: this.settings.overflowPolicy === "discard" ? "discard" : "store",
        stage: to,
      });
      d.level = r.level;
      d.exp = r.exp;
      d.expOverflow = r.overflow;
      if (r.levelsGained > 0) talentEvents = this.onLevelsGained(d, r.levelsGained);
      else {
        talentEvents = evaluateTalentsData(d);
        recalcData(d, this.nowTick());
      }
      res = { ok: true, from, to, tier: tierForStage(to).name, levelsGained: r.levelsGained };
    });
    if (res.ok) {
      this.saveNow(playerId);
      log.info(`限界突破 ${playerId}: ${from} → ${to} (${by})`);
      emit("limitBreak", { playerId, from, to });
      this.emitTalentEvents(playerId, talentEvents);
    }
    return res;
  }

  // ---------------- 管理者テスト用 ----------------

  /**
   * レベルを設定する。上げる場合は通常のレベルアップと同じ処理（ポイント・成長）を行う。
   * 下げる場合はレベルのみ変更（得たポイント・成長は戻さない）。存在階級の上限は超えない。
   */
  setLevel(playerId, level) {
    /** @type {any} */
    let res = { ok: false, reason: "このプレイヤーは参加していません" };
    let talentEvents = [];
    let from = 0;
    this.playerService.update(playerId, (d) => {
      const cap = levelCapForStage(d.limitBreak.stage);
      const target = Math.max(1, Math.min(cap, Math.floor(level)));
      from = d.level;
      const diff = target - d.level;
      d.level = target;
      d.exp = 0;
      if (diff > 0) talentEvents = this.onLevelsGained(d, diff);
      else recalcData(d, this.nowTick());
      res = { ok: true, level: target, capped: target !== Math.floor(level) };
    });
    if (res.ok) {
      this.saveNow(playerId);
      if (res.level > from) emit("levelUp", { playerId, from, to: res.level, points: (res.level - from) * STAT_POINTS_PER_LEVEL });
      this.emitTalentEvents(playerId, talentEvents);
    }
    return res;
  }

  /** 能力ポイントを付与する */
  addStatPoints(playerId, n) {
    const k = Math.floor(n);
    if (!Number.isFinite(k) || k <= 0) return { ok: false, reason: "数値が不正" };
    const ok = this.playerService.update(
      playerId,
      (d) => {
        d.unspentStatPoints += k;
        d.statPointsEarned += k;
      },
      { important: true }
    );
    if (ok) emit("statsChanged", { playerId });
    return ok ? { ok: true } : { ok: false, reason: "このプレイヤーは参加していません" };
  }
}
