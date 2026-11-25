// =============================================================
// 才能・潜在能力の管理
// ・初期才能/潜在能力の抽選（初回のみ。シード固定で再抽選しても同じ結果）
// ・後天性才能の獲得、才能の進化、潜在能力の覚醒の判定
// =============================================================
import { talents, innateTalents, acquiredTalents } from "../content/talents/index.js";
import { potentials } from "../content/potentials.js";
import { GRADE_WEIGHTS, INITIAL_TALENT_SLOTS, POTENTIAL_COUNT } from "../balance/talentRoll.js";
import { createRng } from "../core/rng.js";
import { emit } from "../core/eventBus.js";
import { rollInitialTalents, rollPotentials } from "./talentRoller.js";
import { checkAll, activeFamilies, hasActiveTalent } from "./conditions.js";
import { recalcData } from "../stats/statService.js";
import { createLogger } from "../core/log.js";
import { recordNameForUid } from "../player/playerService.js";

const log = createLogger("talent");
const MAX_HISTORY = 100;

function pushHistory(d, entry) {
  d.talents.history.push(entry);
  if (d.talents.history.length > MAX_HISTORY) d.talents.history.splice(0, d.talents.history.length - MAX_HISTORY);
}

/**
 * 条件を満たした才能の獲得・進化・潜在能力の覚醒を判定してデータに反映する（mutator 内で使う）。
 * @returns {{type: string, id: string, from?: string}[]} 発生した出来事
 */
export function evaluateTalentsData(d, now = Date.now()) {
  const events = [];
  // 1) 後天性才能
  for (const def of acquiredTalents()) {
    if (d.talents.acquired.includes(def.id)) continue; // 一度獲得したものは二度と獲得しない
    if (hasActiveTalent(d, def.id)) continue;
    if (def.exclusiveFamily && activeFamilies(d).has(def.family)) continue;
    if (!checkAll(def.awaken, d)) continue;
    d.talents.acquired.push(def.id);
    d.talents.active.push({ id: def.id, origin: "acquired", since: now, lineage: [] });
    pushHistory(d, { type: "acquire", id: def.id, at: now });
    events.push({ type: "acquired", id: def.id });
  }
  // 2) 進化（1回の判定で1段階まで）
  for (const entry of d.talents.active) {
    const def = talents.get(entry.id);
    if (!def || !Array.isArray(def.evolvesTo) || def.evolvesTo.length === 0) continue;
    const branches = [...def.evolvesTo].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    for (const br of branches) {
      if (!talents.has(br.to) || hasActiveTalent(d, br.to)) continue;
      if (!checkAll(br.conditions, d)) continue;
      const from = entry.id;
      entry.lineage = [...(entry.lineage || []), from];
      entry.id = br.to;
      entry.since = now;
      pushHistory(d, { type: "evolve", id: br.to, from, at: now });
      events.push({ type: "evolved", id: br.to, from });
      break;
    }
  }
  // 3) 潜在能力
  for (const e of d.hiddenPotential.entries) {
    if (!e || e.awakened) continue;
    const def = potentials.get(e.id);
    if (!def || !checkAll(def.awaken, d)) continue;
    e.awakened = true;
    e.awakenedAt = now;
    if (!d.hiddenPotential.revealed.includes(e.id)) d.hiddenPotential.revealed.push(e.id);
    events.push({ type: "potential", id: e.id });
  }
  return events;
}

export class TalentService {
  /**
   * @param {import("../player/playerService.js").PlayerService} playerService
   * @param {import("../world/worldService.js").WorldService} worldService
   * @param {() => number} nowTick
   */
  constructor(playerService, worldService, nowTick) {
    this.playerService = playerService;
    this.worldService = worldService;
    this.nowTick = nowTick;
  }

  /**
   * 初期才能・潜在能力の抽選（未抽選の場合のみ）。結果は即時保存する。
   * @returns {string[]|null} 抽選した才能ID（すでに抽選済みなら null）
   */
  ensureRolled(playerId) {
    const d0 = this.playerService.dataFor(playerId);
    if (!d0 || d0.talents.rolled) return null;
    const assigned = this.worldService.world.talentStats.potentialAssigned;
    let rolled = null;
    let pots = [];
    const ok = this.playerService.update(
      playerId,
      (d) => {
        if (d.talents.rolled) return;
        if (!d.hiddenPotential.seed) d.hiddenPotential.seed = (Math.random() * 0x7fffffff) | 0;
        const rng = createRng(d.hiddenPotential.seed);
        rolled = rollInitialTalents(rng, innateTalents(), GRADE_WEIGHTS, INITIAL_TALENT_SLOTS);
        const now = Date.now();
        for (const id of rolled) {
          if (!d.talents.innate.includes(id)) d.talents.innate.push(id);
          if (!hasActiveTalent(d, id)) d.talents.active.push({ id, origin: "innate", since: now, lineage: [] });
          pushHistory(d, { type: "innate", id, at: now });
        }
        if (d.hiddenPotential.entries.length === 0) {
          pots = rollPotentials(rng, potentials.all(), assigned, POTENTIAL_COUNT);
          d.hiddenPotential.entries = pots.map((id) => ({ id, awakened: false, awakenedAt: 0 }));
        }
        d.talents.rolled = true;
        d.talents.rolledAt = now;
        recalcData(d, this.nowTick());
        // 才能で最大値が変わるため、抽選直後は MP・スタミナを満タンにして冒険を始める
        d.vitals.mp = d.vitals.mpMax;
        d.vitals.stamina = d.vitals.staminaMax;
      },
      { important: true }
    );
    if (!ok) return null;
    if (pots.length > 0) {
      this.worldService.updateWorld((w) => {
        for (const id of pots) w.talentStats.potentialAssigned[id] = (w.talentStats.potentialAssigned[id] || 0) + 1;
      });
    }
    log.info(`初期才能を抽選: ${playerId} → ${(rolled || []).join(",")}`);
    return rolled;
  }

  /** 条件判定（行動・レベルアップ後などに呼ぶ） */
  evaluate(playerId) {
    let events = [];
    this.playerService.update(playerId, (d) => {
      events = evaluateTalentsData(d);
      if (events.length > 0) recalcData(d, this.nowTick());
    });
    if (events.length > 0) {
      this.playerService.records.save(this.recordName(playerId));
      this.emitEvents(playerId, events);
    }
    return events;
  }

  recordName(playerId) {
    const s = this.playerService.getSession(playerId);
    return s ? recordNameForUid(s.uid) : "";
  }

  emitEvents(playerId, events) {
    for (const e of events) {
      if (e.type === "acquired") emit("talentAcquired", { playerId, id: e.id, origin: "acquired" });
      else if (e.type === "evolved") emit("talentEvolved", { playerId, from: e.from, to: e.id });
      else if (e.type === "potential") emit("potentialAwakened", { playerId, id: e.id });
    }
    emit("statsChanged", { playerId });
  }

  // ---------------- 管理者テスト用 ----------------

  /** 才能を直接付与 */
  grant(playerId, id) {
    if (!talents.has(id)) return { ok: false, reason: "存在しない才能です" };
    /** @type {any} */
    let res = { ok: false, reason: "付与できません" };
    this.playerService.update(
      playerId,
      (d) => {
        if (hasActiveTalent(d, id)) {
          res = { ok: false, reason: "すでに所持しています" };
          return;
        }
        const now = Date.now();
        d.talents.active.push({ id, origin: "admin", since: now, lineage: [] });
        pushHistory(d, { type: "admin", id, at: now });
        recalcData(d, this.nowTick());
        res = { ok: true };
      },
      { important: true }
    );
    if (res.ok) this.emitEvents(playerId, [{ type: "acquired", id }]);
    return res;
  }

  /** 進化テスト：条件を無視して指定の進化先へ進化させる（to 省略時は最初の分岐） */
  forceEvolve(playerId, fromId, toId) {
    const def = talents.get(fromId);
    if (!def || !Array.isArray(def.evolvesTo) || def.evolvesTo.length === 0) return { ok: false, reason: "進化先がありません" };
    const br = toId ? def.evolvesTo.find((b) => b.to === toId) : def.evolvesTo[0];
    if (!br) return { ok: false, reason: "その進化先はありません" };
    /** @type {any} */
    let res = { ok: false, reason: "その才能を所持していません" };
    this.playerService.update(
      playerId,
      (d) => {
        const entry = d.talents.active.find((a) => a.id === fromId);
        if (!entry) return;
        const now = Date.now();
        entry.lineage = [...(entry.lineage || []), fromId];
        entry.id = br.to;
        entry.since = now;
        pushHistory(d, { type: "evolve", id: br.to, from: fromId, at: now, admin: true });
        recalcData(d, this.nowTick());
        res = { ok: true, to: br.to };
      },
      { important: true }
    );
    if (res.ok) this.emitEvents(playerId, [{ type: "evolved", id: br.to, from: fromId }]);
    return res;
  }

  /** 覚醒テスト：条件を無視して潜在能力を覚醒させる（id 省略時は所持している最初の未覚醒） */
  forceAwaken(playerId, id) {
    /** @type {any} */
    let res = { ok: false, reason: "未覚醒の潜在能力がありません" };
    let awakened = null;
    this.playerService.update(
      playerId,
      (d) => {
        const e = d.hiddenPotential.entries.find((x) => !x.awakened && (!id || x.id === id));
        if (!e) return;
        e.awakened = true;
        e.awakenedAt = Date.now();
        if (!d.hiddenPotential.revealed.includes(e.id)) d.hiddenPotential.revealed.push(e.id);
        awakened = e.id;
        recalcData(d, this.nowTick());
        res = { ok: true, id: e.id };
      },
      { important: true }
    );
    if (awakened) this.emitEvents(playerId, [{ type: "potential", id: awakened }]);
    return res;
  }
}
