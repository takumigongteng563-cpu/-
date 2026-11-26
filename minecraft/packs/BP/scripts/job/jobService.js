// =============================================================
// 職業システム（第3弾）
//  ・職業経験値・職業レベル（プレイヤーレベルとは別。過去の職業のレベルも保存）
//  ・転職・職業融合の判定と実行（条件は職業データに書かれた複合条件）
//  ・新しい職業の解放（必要時のみ判定：転職・レベルアップ・職業レベルアップ・行動の集計時）
//  ・隠し職業の発見、引き継ぎパッシブ
// 転職の種類：
//   first  … 無職 → 第1次職業（初期職業は強制しない。どれを選んでもよい）
//   fusion … 現在の職業 → その進化先（職業融合）
//   return … 以前に経験した職業へ戻る（職業レベルを引き継ぐ。条件の再判定なし）
//   cross  … 別系統への転職（第1次職業、または経験済みの職業の進化先）。特殊アイテム「転職の証」を消費
//   hidden … 発見済みの隠し職業
// =============================================================
import { jobs, DEFAULT_JOB_ID } from "../content/jobs.js";
import { JOB_ACTION_EXP, JOB_EXP_SHARE } from "../balance/jobs.js";
import { checkAll, checkCondition } from "../talents/conditions.js";
import { recalcData } from "../stats/statService.js";
import { evaluateTalentsData } from "../talents/talentService.js";
import { jobExpToNext, jobLevelOf, inheritSlots, inheritableJobs } from "./jobBonus.js";
import { emit } from "../core/eventBus.js";
import { createLogger } from "../core/log.js";

const log = createLogger("job");
/** 隠し職業の一覧（毎回 487 職業を走査しないよう起動時に一度だけ作る） */
const HIDDEN = jobs.all().filter((j) => j.category === "hidden");
const HISTORY_MAX = 200;

/** 行動キー → 職業経験値の設定 */
function actionRule(key) {
  if (JOB_ACTION_EXP[key]) return JOB_ACTION_EXP[key];
  const prefix = key.split(".").slice(0, 2).join(".");
  return JOB_ACTION_EXP[prefix];
}

/** 職業の系統構成（無職は全系統0.5） */
function affinity(def, line) {
  if (!line) return 1;
  if (!def || !def.composition) return 0.5;
  return Math.min(1, (def.composition[line] || 0) * 2 + 0.1);
}

/**
 * 転職できるかを判定する（純粋な計算）
 * @returns {{ok: boolean, kind?: string, reason?: string, unmet?: any[], needsToken?: boolean}}
 */
export function judgeChange(data, targetId, env = {}) {
  const t = jobs.get(targetId);
  if (!t) return { ok: false, reason: "存在しない職業" };
  if (targetId === data.job.current) return { ok: false, reason: "現在の職業です" };
  if (t.category === "none") return { ok: false, reason: "無職には戻れません" };
  const held = new Set(data.job.held || []);
  if (t.category === "hidden") {
    if (!data.job.discoveredHidden[targetId]) return { ok: false, reason: "まだ発見されていない職業" };
    const unmet = (t.requirements || []).filter((c) => !checkCondition(c, data, env));
    return unmet.length ? { ok: false, kind: "hidden", reason: "条件を満たしていません", unmet } : { ok: true, kind: "hidden" };
  }
  if (held.has(targetId)) return { ok: true, kind: "return" };
  let kind;
  if (data.job.current === DEFAULT_JOB_ID && t.tier === 1) kind = "first";
  else if (t.parent === data.job.current) kind = "fusion";
  else if (t.tier === 1 || held.has(t.parent)) kind = "cross";
  else return { ok: false, reason: "この職業の進化元をまだ経験していません" };
  const unmet = (t.requirements || []).filter((c) => !checkCondition(c, data, env));
  if (kind === "cross") {
    for (const c of t.crossLineRequirements || []) if (!checkCondition(c, data, env)) unmet.push(c);
  }
  if (unmet.length) return { ok: false, kind, reason: "条件を満たしていません", unmet, needsToken: kind === "cross" };
  return { ok: true, kind, needsToken: kind === "cross" };
}

/** 転職先の候補（表示用）：進化先・第1次職業・経験済み・発見済み隠し職業 */
export function changeCandidates(data, env = {}) {
  const cur = jobs.get(data.job.current);
  const ids = new Set([...(cur ? cur.children : []), ...(data.job.held || [])]);
  for (const id of Object.keys(data.job.discoveredHidden || {})) ids.add(id);
  ids.delete(data.job.current);
  ids.delete(DEFAULT_JOB_ID);
  return [...ids].map((id) => ({ job: jobs.get(id), judge: judgeChange(data, id, env) })).filter((x) => x.job);
}

export class JobService {
  /**
   * @param {import("../player/playerService.js").PlayerService} playerService
   * @param {import("../world/worldService.js").WorldService} worldService
   * @param {() => number} nowTick
   */
  constructor(playerService, worldService, nowTick) {
    this.playerService = playerService;
    this.worldService = worldService;
    this.nowTick = nowTick;
    /** 職業レベルの上昇・転職のあと（第4弾：スキルの習得判定。app.js が設定） @type {((playerId: string) => void)|null} */
    this.afterChange = null;
  }

  env() {
    return { world: this.worldService.world };
  }

  current(playerId) {
    const d = this.playerService.dataFor(playerId);
    return d ? jobs.get(d.job.current) : undefined;
  }

  /** 職業経験値を加える（上限で止まる）。上がったレベル数を返す */
  addJobExp(playerId, amount) {
    const value = Math.floor(amount);
    if (!(value > 0)) return 0;
    let gained = 0;
    let jobId = null;
    let toLevel = 0;
    this.playerService.update(playerId, (d) => {
      const def = jobs.get(d.job.current);
      if (!def) return;
      jobId = def.id;
      const rec = d.job.levels[def.id] || (d.job.levels[def.id] = { level: 1, exp: 0 });
      if (rec.level >= def.levelCap) {
        rec.exp = 0;
        return;
      }
      rec.exp += value;
      while (rec.level < def.levelCap) {
        const need = jobExpToNext(rec.level, def.tier);
        if (rec.exp < need) break;
        rec.exp -= need;
        rec.level++;
        gained++;
      }
      if (rec.level >= def.levelCap) rec.exp = 0;
      toLevel = rec.level;
      if (gained > 0) recalcData(d, this.nowTick());
    });
    if (gained > 0) {
      this.saveNow(playerId);
      emit("jobLevelUp", { playerId, jobId, level: toLevel, gained });
      if (this.afterChange) this.afterChange(playerId);
      this.evaluateUnlocks(playerId);
    }
    return gained;
  }

  /** 行動から職業経験値（その行動が得意な系統の職業ほど多い） */
  onAction(playerId, key, amount = 1) {
    const rule = actionRule(key);
    if (!rule) return 0;
    const def = this.current(playerId);
    if (!def) return 0;
    const n = (amount / rule.per) * rule.base * affinity(def, rule.line);
    if (n <= 0) return 0;
    // 端数は職業ごとに貯める
    let whole = 0;
    this.playerService.update(playerId, (d) => {
      const frac = (d.job.expFrac || 0) + n;
      whole = Math.floor(frac);
      d.job.expFrac = Math.round((frac - whole) * 1000) / 1000;
    });
    return whole > 0 ? this.addJobExp(playerId, whole) : 0;
  }

  /** プレイヤー経験値の一部を職業経験値にも */
  onPlayerExp(playerId, amount) {
    return this.addJobExp(playerId, amount * JOB_EXP_SHARE);
  }

  saveNow(playerId) {
    const s = this.playerService.getSession(playerId);
    if (s) this.playerService.records.save(`p.${s.uid}`);
  }

  /**
   * 新しく条件を満たした職業を「解放済み」に、隠し職業を「発見済み」にする（必要時のみ呼ぶ）
   * @returns {{unlocked: string[], discovered: string[]}}
   */
  evaluateUnlocks(playerId) {
    const out = { unlocked: [], discovered: [] };
    const env = this.env();
    this.playerService.update(playerId, (d) => {
      const cur = jobs.get(d.job.current);
      const candidates = [...(cur ? cur.children : [])];
      for (const id of candidates) {
        if (d.job.unlocked.includes(id)) continue;
        const def = jobs.get(id);
        if (def && checkAll(def.requirements, d, env)) {
          d.job.unlocked.push(id);
          out.unlocked.push(id);
        }
      }
      for (const def of HIDDEN) {
        if (d.job.discoveredHidden[def.id]) continue;
        if (checkAll(def.discover, d, env)) {
          d.job.discoveredHidden[def.id] = Date.now();
          out.discovered.push(def.id);
        }
      }
    });
    if (out.unlocked.length || out.discovered.length) {
      this.saveNow(playerId);
      for (const id of out.unlocked) emit("jobUnlocked", { playerId, jobId: id });
      for (const id of out.discovered) emit("hiddenJobDiscovered", { playerId, jobId: id });
    }
    return out;
  }

  /**
   * 転職する。
   * @param {{force?: boolean, by?: string}} [opt] force は管理者テスト専用（条件を無視）
   */
  changeJob(playerId, targetId, opt = {}) {
    const d0 = this.playerService.dataFor(playerId);
    if (!d0) return { ok: false, reason: "参加していません" };
    const target = jobs.get(targetId);
    if (!target) return { ok: false, reason: "存在しない職業" };
    const judge = opt.force ? { ok: true, kind: "admin" } : judgeChange(d0, targetId, this.env());
    if (!judge.ok) return judge;
    let from = null;
    let talentEvents = [];
    const ok = this.playerService.update(
      playerId,
      (d) => {
        // 同時に操作された場合に備えて、保存直前にもう一度判定する
        if (!opt.force) {
          const again = judgeChange(d, targetId, this.env());
          if (!again.ok) return;
          if (again.needsToken) d.job.tokens.crossLine--;
        }
        from = d.job.current;
        const now = Date.now();
        d.job.current = targetId;
        if (!d.job.levels[targetId]) d.job.levels[targetId] = { level: 1, exp: 0 };
        if (!d.job.held.includes(targetId)) d.job.held.push(targetId);
        if (!d.job.unlocked.includes(targetId)) d.job.unlocked.push(targetId);
        d.job.history.push({ from, to: targetId, at: now, kind: judge.kind, by: opt.by || "player" });
        if (d.job.history.length > HISTORY_MAX) d.job.history.splice(0, d.job.history.length - HISTORY_MAX);
        if (judge.kind === "fusion" || judge.kind === "admin" || judge.kind === "first") {
          d.job.fusionHistory.push({ job: targetId, fusedLine: target.fusionLine ?? null, at: now });
        }
        // 引き継ぎパッシブの枠が減った場合は先頭から残す
        d.job.inheritedPassives = d.job.inheritedPassives.filter((id) => id !== targetId).slice(0, inheritSlots(d));
        recalcData(d, this.nowTick());
        talentEvents = evaluateTalentsData(d);
        if (talentEvents.length) recalcData(d, this.nowTick());
      },
      { important: true }
    );
    if (!ok || from === null) return { ok: false, reason: "転職できませんでした（条件が変わった可能性があります）" };
    log.info(`${playerId} 転職 ${from} → ${targetId} (${judge.kind})`);
    emit("jobChanged", { playerId, from, to: targetId, kind: judge.kind });
    if (this.afterChange) this.afterChange(playerId);
    for (const e of talentEvents) {
      if (e.type === "potentialFormed") emit("potentialFormed", { playerId, id: e.id });
      if (e.type === "potential") emit("potentialAwakened", { playerId, id: e.id });
    }
    emit("statsChanged", { playerId });
    this.evaluateUnlocks(playerId);
    return { ok: true, kind: judge.kind, from };
  }

  /** 引き継ぐ固有パッシブを設定（枠の数まで・職業レベル上限の職業のみ） */
  setInheritedPassives(playerId, jobIds) {
    /** @type {any} */
    let res = { ok: false, reason: "参加していません" };
    this.playerService.update(
      playerId,
      (d) => {
        const allowed = new Set(inheritableJobs(d).map((x) => x.id));
        const unique = [...new Set(jobIds)];
        const list = unique.filter((id) => allowed.has(id));
        if (list.length !== unique.length) {
          res = { ok: false, reason: "引き継げない職業が含まれています" };
          return;
        }
        if (list.length > inheritSlots(d)) {
          res = { ok: false, reason: `引き継ぎ枠は${inheritSlots(d)}つまでです` };
          return;
        }
        d.job.inheritedPassives = list;
        recalcData(d, this.nowTick());
        res = { ok: true };
      },
      { important: true }
    );
    if (res.ok) emit("statsChanged", { playerId });
    return res;
  }

  /**
   * 使えるスキル（第4弾のスキルシステムに接続する入口）
   * 現在の職業の専用スキル・奥義（習得レベル到達分）＋ 過去の職業の専用スキル（引き継ぎ条件を満たすもの）
   */
  availableSkills(playerId) {
    const d = this.playerService.dataFor(playerId);
    if (!d) return [];
    const out = [];
    const cur = jobs.get(d.job.current);
    const curLevel = jobLevelOf(d, d.job.current);
    if (cur && cur.skills) {
      for (const s of [...cur.skills, cur.ultimate]) if (s && curLevel >= s.learn.jobLevel) out.push({ skill: s, source: "current", jobId: cur.id });
    }
    for (const id of d.job.held || []) {
      if (id === d.job.current) continue;
      const def = jobs.get(id);
      if (!def || !def.skills) continue;
      for (const s of def.skills) {
        if (!s.inherit) continue;
        const usable = jobLevelOf(d, id) >= s.inherit.jobLevel && (!cur || !cur.weapons || s.inherit.weapons.some((w) => cur.weapons.includes(w)));
        if (usable) out.push({ skill: s, source: "inherited", jobId: id });
      }
    }
    return out;
  }

  // ---------------- 管理者テスト用 ----------------
  setJobLevel(playerId, level, jobId) {
    /** @type {any} */
    let res = { ok: false, reason: "参加していません" };
    this.playerService.update(
      playerId,
      (d) => {
        const id = jobId || d.job.current;
        const def = jobs.get(id);
        if (!def) return;
        const l = Math.max(1, Math.min(def.levelCap, Math.floor(level)));
        d.job.levels[id] = { level: l, exp: 0 };
        recalcData(d, this.nowTick());
        res = { ok: true, level: l };
      },
      { important: true }
    );
    if (res.ok) {
      emit("statsChanged", { playerId });
      this.evaluateUnlocks(playerId);
      if (this.afterChange) this.afterChange(playerId);
    }
    return res;
  }

  addCrossLineToken(playerId, n = 1) {
    const ok = this.playerService.update(playerId, (d) => (d.job.tokens.crossLine += Math.max(0, Math.floor(n))), { important: true });
    return ok ? { ok: true } : { ok: false, reason: "参加していません" };
  }
}
