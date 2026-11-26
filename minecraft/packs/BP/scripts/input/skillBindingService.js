// =============================================================
// ホットバーの技の割り当てと発動（最終仕様 第11章・第4弾）
// ・保存：data.skillBindings.slots[0..8] = { tap, jump, sprint, charge, ultimate }（スキルID or null）
// ・9枠 × 5操作 = 最大45種類
// ・発動チェック（この順）：連続使用 → 割り当て → 習得・使用条件（職業・武器・才能・使徒…）→ クールタイム
//   → MP・スタミナ（足りなければ不発・消費なし）→ 詠唱（詠唱時間があれば詠唱を開始し、完了時にもう一度チェック）→ 実行
// ・効果は「独自処理（registerSkillExecutor）」→「効果の型の共通処理（runner。main.js が skillEffects を設定）」の順
// ・発動後：使用回数・熟練度（命中数）・武器/魔法熟練度・信仰・行動「skill.hit」を記録
// ・クールタイム・詠唱は保存しない（再ログインでリセットされても、熟練度は最短間隔で稼げない）
// =============================================================
import { ACTION_TYPES, HOTBAR_SLOTS, INPUT } from "../balance/input.js";
import { LINK_WINDOW_TICKS, LINK_POWER_BONUS } from "../balance/skills.js";
import { skills, skillExecutors, isApostleSkill } from "../content/skills.js";
import { jobs } from "../content/jobs.js";
import { skillStats, learnedRecord } from "../skills/skillRules.js";
import { emit } from "../core/eventBus.js";

const ACTIONS = ACTION_TYPES.map((a) => a.id);

export function emptyBindings() {
  return Array.from({ length: HOTBAR_SLOTS }, () => ({ tap: null, jump: null, sprint: null, charge: null, ultimate: null }));
}

/**
 * @typedef {{hits: number, allies?: number, practice?: boolean}} RunResult
 * @typedef {(player: any, def: any, stats: any, info: {playerId: string, slot: number, action: string, linked: boolean}) => RunResult|boolean|null} SkillRunner
 */

export class SkillBindingService {
  /**
   * @param {import("../player/playerService.js").PlayerService} playerService
   * @param {import("../vitals/vitalsService.js").VitalsService} vitals
   * @param {() => number} nowTick
   */
  constructor(playerService, vitals, nowTick) {
    this.playerService = playerService;
    this.vitals = vitals;
    this.nowTick = nowTick;
    /** @type {Map<string, Map<string, number>>} playerId → (skillId → 次に使えるtick) */
    this.cooldowns = new Map();
    /** @type {Map<string, number>} playerId → 全体の再使用待ち */
    this.globalCd = new Map();
    /** @type {Map<string, {skillId: string, slot: number, action: string, startTick: number, until: number}>} 詠唱中 */
    this.casts = new Map();
    /** 直近に使われたスキル（連携スキル用） @type {{playerId: string, category: string, tick: number}[]} */
    this.recent = [];
    /** 直近の結果（HUD 表示用） @type {Map<string, {ok: boolean, text: string, tick: number}>} */
    this.lastResult = new Map();
    /** @type {import("../skills/skillService.js").SkillService|null} app.js が設定 */
    this.skillService = null;
    /** @type {import("../faith/faithService.js").FaithService|null} */
    this.faith = null;
    /** @type {import("../actions/actionService.js").ActionService|null} */
    this.actions = null;
    /** 効果の型の共通処理（ゲーム側。main.js が設定） @type {SkillRunner|null} */
    this.runner = null;
  }

  get(playerId, slot, action) {
    const d = this.playerService.dataFor(playerId);
    const s = d && d.skillBindings.slots[slot];
    return s ? s[action] ?? null : null;
  }

  /**
   * 技を割り当てる。未習得・その操作に割り当てられない技・引き継ぎの上限を超える技は拒否。
   * skillId に null を渡すと解除。
   */
  bind(playerId, slot, action, skillId) {
    if (!(slot >= 0 && slot < HOTBAR_SLOTS) || !ACTIONS.includes(action)) return { ok: false, reason: "枠または操作が不正" };
    if (skillId !== null) {
      const def = skills.get(skillId);
      if (!def) return { ok: false, reason: "存在しないスキル" };
      const d = this.playerService.dataFor(playerId);
      if (!d || !learnedRecord(d, skillId)) return { ok: false, reason: "未習得のスキル" };
      if (this.skillService) {
        const c = this.skillService.canBind(playerId, slot, action, skillId);
        if (!c.ok) return c;
      } else if (Array.isArray(def.actions) && !def.actions.includes(action)) return { ok: false, reason: "その操作には割り当てられない" };
    }
    const ok = this.playerService.update(playerId, (d) => {
      d.skillBindings.slots[slot][action] = skillId;
    }, { important: true });
    if (ok) this.cancelCast(playerId, "割り当ての変更");
    return ok ? { ok: true } : { ok: false, reason: "参加していない" };
  }

  /** 全枠の割り当てを外す */
  clearAll(playerId) {
    return this.playerService.update(playerId, (d) => (d.skillBindings.slots = emptyBindings()), { important: true });
  }

  /** 使用前の共通チェック（消費はしない） */
  precheck(playerId, skillId, now) {
    const def = skills.get(skillId);
    const d = this.playerService.dataFor(playerId);
    if (!def || !d || !learnedRecord(d, skillId)) return { ok: false, reason: "未習得", skillId };
    if (this.skillService) {
      const u = this.skillService.canUse(playerId, skillId);
      if (!u.ok) return { ok: false, reason: u.reason, skillId };
    }
    const cds = this.cooldowns.get(playerId);
    if (cds && (cds.get(skillId) || 0) > now) return { ok: false, reason: "クールタイム中", skillId };
    const st = skillStats(def, learnedRecord(d, skillId), d);
    if (!this.vitals.canUseMp(playerId, st.mp) || (st.stamina > 0 && !this.vitals.canUseStamina(playerId, st.stamina))) return { ok: false, reason: "MPまたはスタミナが足りない", skillId };
    if (!skillExecutors.get(skillId) && !(this.runner && def.effect && def.effect.type)) return { ok: false, reason: "技の効果が未設定", skillId };
    return { ok: true, def, d, st };
  }

  /**
   * 発動を試みる（詠唱時間があれば詠唱を開始する）
   * @returns {{ok: boolean, reason?: string, skillId?: string|null, casting?: number, hits?: number}}
   */
  tryActivate(playerId, slot, action, player) {
    const now = this.nowTick();
    if ((this.globalCd.get(playerId) || 0) > now) return this.result(playerId, { ok: false, reason: "連続使用不可" });
    if (this.casts.has(playerId)) return this.result(playerId, { ok: false, reason: "詠唱中" });
    const skillId = this.get(playerId, slot, action);
    if (!skillId) return { ok: false, reason: "技が割り当てられていない", skillId: null };
    const pre = this.precheck(playerId, skillId, now);
    if (!pre.ok) return this.result(playerId, pre);
    this.globalCd.set(playerId, now + INPUT.globalCooldownTicks);
    if (pre.st.castTicks > 0 && !skillExecutors.get(skillId)) {
      this.casts.set(playerId, { skillId, slot, action, startTick: now, until: now + pre.st.castTicks });
      emit("skillCastStart", { playerId, id: skillId, ticks: pre.st.castTicks });
      return { ok: true, skillId, casting: pre.st.castTicks };
    }
    return this.execute(playerId, skillId, slot, action, player, pre);
  }

  /** 詠唱の進み（HUD 用） */
  castProgress(playerId) {
    const c = this.casts.get(playerId);
    if (!c) return null;
    const total = Math.max(1, c.until - c.startTick);
    return { skillId: c.skillId, ratio: Math.min(1, (this.nowTick() - c.startTick) / total), left: Math.max(0, c.until - this.nowTick()) };
  }

  /** 詠唱を中断する（持ち替え・割り当ての変更・被弾など） */
  cancelCast(playerId, reason = "中断") {
    const c = this.casts.get(playerId);
    if (!c) return false;
    this.casts.delete(playerId);
    this.result(playerId, { ok: false, reason: `詠唱を中断（${reason}）`, skillId: c.skillId });
    emit("skillCastCancel", { playerId, id: c.skillId, reason });
    return true;
  }

  /**
   * 詠唱の完了を処理する（定期処理から呼ぶ）。完了時にもう一度条件・消費をチェックする
   * @param {(playerId: string) => any} getPlayer
   * @param {(playerId: string, slot: number) => boolean} [stillHolding] 同じ枠を持っているか
   */
  updateCasts(getPlayer, stillHolding) {
    const now = this.nowTick();
    const out = [];
    for (const [pid, c] of [...this.casts]) {
      if (c.until > now) continue;
      this.casts.delete(pid);
      const player = getPlayer(pid);
      if (!player || (stillHolding && !stillHolding(pid, c.slot))) {
        out.push({ playerId: pid, res: this.result(pid, { ok: false, reason: "詠唱を中断（持ち替え）", skillId: c.skillId }) });
        continue;
      }
      const pre = this.precheck(pid, c.skillId, now);
      if (!pre.ok) {
        out.push({ playerId: pid, res: this.result(pid, pre) });
        continue;
      }
      out.push({ playerId: pid, res: this.execute(pid, c.skillId, c.slot, c.action, player, pre) });
    }
    return out;
  }

  /** 連携の成立：別のプレイヤーが条件の分類のスキルを直前に使っている */
  linked(playerId, def, now) {
    if (!def.linkAfter) return false;
    this.recent = this.recent.filter((r) => now - r.tick <= LINK_WINDOW_TICKS);
    return this.recent.some((r) => r.playerId !== playerId && def.linkAfter.categories.includes(r.category));
  }

  execute(playerId, skillId, slot, action, player, pre) {
    const now = this.nowTick();
    const { def, d, st } = pre;
    if (!this.vitals.trySpend(playerId, { mp: st.mp, stamina: st.stamina })) return this.result(playerId, { ok: false, reason: "MPまたはスタミナが足りない", skillId });
    const cds = this.cooldowns.get(playerId) || new Map();
    cds.set(skillId, now + st.cooldown);
    this.cooldowns.set(playerId, cds);
    const linked = this.linked(playerId, def, now);
    const stats = linked ? { ...st, power: st.power * (1 + LINK_POWER_BONUS) } : st;
    /** @type {any} */
    let res = null;
    try {
      const exec = skillExecutors.get(skillId);
      res = exec ? exec(player, { playerId, slot, action, def, stats }) : this.runner(player, def, stats, { playerId, slot, action, linked });
    } catch {
      res = null;
    }
    if (!res) return this.result(playerId, { ok: false, reason: "発動に失敗", skillId });
    const r = typeof res === "object" ? res : { hits: 0 };
    this.recent.push({ playerId, category: def.category, tick: now });
    if (this.recent.length > 32) this.recent.shift();
    this.afterUse(playerId, def, d, r);
    emit("skillUsed", { playerId, id: skillId, hits: r.hits || 0, linked });
    return this.result(playerId, { ok: true, skillId, hits: r.hits || 0, linked });
  }

  /** 発動後の記録（熟練度・武器/魔法熟練度・信仰・行動） */
  afterUse(playerId, def, d, r) {
    const hits = (r.hits || 0) + (r.allies || 0);
    const ss = this.skillService;
    if (ss) {
      ss.recordUse(playerId, def.id);
      ss.gainProficiency(playerId, def.id, { hits, practice: hits === 0 });
      if (hits > 0) {
        const cur = jobs.get(d.job.current);
        const weapon = (def.weapons || []).find((w) => cur && Array.isArray(cur.weapons) && cur.weapons.includes(w));
        if (weapon && def.power && def.power.kind === "physical") ss.addMastery(playerId, "weapon", weapon, Math.min(5, hits));
        if (def.power && def.power.kind !== "physical") for (const e of def.elements || []) ss.addMastery(playerId, "magic", e, Math.min(5, hits));
      }
    }
    if (this.faith && hits > 0) this.faith.onSkillUsed(playerId, def);
    if (this.actions && hits > 0) this.actions.record(playerId, "skill.hit", Math.min(5, hits));
    if (this.actions && isApostleSkill(def)) this.actions.record(playerId, "skill.apostle", 1);
  }

  result(playerId, r) {
    const def = r.skillId ? skills.get(r.skillId) : null;
    this.lastResult.set(playerId, { ok: r.ok, text: r.ok ? `${def ? def.name : ""}` : `${def ? `${def.name}：` : ""}${r.reason || ""}`, tick: this.nowTick() });
    return r;
  }

  /** クールタイムの残り（HUD 表示用） */
  cooldownLeft(playerId, skillId) {
    const cds = this.cooldowns.get(playerId);
    return cds ? Math.max(0, (cds.get(skillId) || 0) - this.nowTick()) : 0;
  }

  /** 管理者テスト：クールタイムをすべて解除 */
  resetCooldowns(playerId) {
    this.cooldowns.delete(playerId);
    this.globalCd.delete(playerId);
  }

  forget(playerId) {
    this.cooldowns.delete(playerId);
    this.globalCd.delete(playerId);
    this.casts.delete(playerId);
    this.lastResult.delete(playerId);
    this.recent = this.recent.filter((r) => r.playerId !== playerId);
  }
}
