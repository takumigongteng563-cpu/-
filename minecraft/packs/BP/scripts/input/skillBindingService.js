// =============================================================
// ホットバーの技の割り当てと発動の共通処理（最終仕様 Ver.1.0 第11章）【基盤】
// ・保存：data.skillBindings.slots[0..8] = { tap, jump, sprint, charge, ultimate }（スキルID or null）
// ・9枠 × 5操作 = 最大45種類
// ・発動チェック：割り当て → 習得済み → クールタイム → MP・スタミナ（足りなければ不発・消費なし）→ 実行
// スキル本体（第4弾）が無い間は、割り当て・判定・チェックのみ動作する。
// =============================================================
import { ACTION_TYPES, HOTBAR_SLOTS, INPUT } from "../balance/input.js";
import { skills, skillExecutors } from "../content/skills.js";

const ACTIONS = ACTION_TYPES.map((a) => a.id);

export function emptyBindings() {
  return Array.from({ length: HOTBAR_SLOTS }, () => ({ tap: null, jump: null, sprint: null, charge: null, ultimate: null }));
}

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
  }

  get(playerId, slot, action) {
    const d = this.playerService.dataFor(playerId);
    const s = d && d.skillBindings.slots[slot];
    return s ? s[action] ?? null : null;
  }

  /**
   * 技を割り当てる。未習得・その操作に割り当てられない技は拒否。
   * skillId に null を渡すと解除。
   */
  bind(playerId, slot, action, skillId) {
    if (!(slot >= 0 && slot < HOTBAR_SLOTS) || !ACTIONS.includes(action)) return { ok: false, reason: "枠または操作が不正" };
    if (skillId !== null) {
      const def = skills.get(skillId);
      if (!def) return { ok: false, reason: "存在しないスキル" };
      const d = this.playerService.dataFor(playerId);
      if (!d || !d.skills.learned[skillId]) return { ok: false, reason: "未習得のスキル" };
      if (Array.isArray(def.actions) && !def.actions.includes(action)) return { ok: false, reason: "その操作には割り当てられない" };
    }
    const ok = this.playerService.update(playerId, (d) => {
      d.skillBindings.slots[slot][action] = skillId;
    }, { important: true });
    return ok ? { ok: true } : { ok: false, reason: "参加していない" };
  }

  /**
   * 発動を試みる
   * @returns {{ok: boolean, reason?: string, skillId?: string|null}}
   */
  tryActivate(playerId, slot, action, player) {
    const now = this.nowTick();
    if ((this.globalCd.get(playerId) || 0) > now) return { ok: false, reason: "連続使用不可" };
    const skillId = this.get(playerId, slot, action);
    if (!skillId) return { ok: false, reason: "技が割り当てられていない", skillId: null };
    const def = skills.get(skillId);
    const d = this.playerService.dataFor(playerId);
    if (!def || !d || !d.skills.learned[skillId]) return { ok: false, reason: "未習得", skillId };
    const cds = this.cooldowns.get(playerId) || new Map();
    if ((cds.get(skillId) || 0) > now) return { ok: false, reason: "クールタイム中", skillId };
    const exec = skillExecutors.get(skillId);
    if (!exec) return { ok: false, reason: "技の効果が未実装（第4弾）", skillId };
    const cost = def.cost || {};
    if (!this.vitals.trySpend(playerId, { mp: cost.mp || 0, stamina: cost.stamina || 0 })) return { ok: false, reason: "MPまたはスタミナが足りない", skillId };
    this.globalCd.set(playerId, now + INPUT.globalCooldownTicks);
    cds.set(skillId, now + (def.cooldownTicks || 0));
    this.cooldowns.set(playerId, cds);
    let done = false;
    try {
      done = !!exec(player, { playerId, slot, action });
    } catch {
      done = false;
    }
    return { ok: done, skillId, reason: done ? undefined : "発動に失敗" };
  }

  /** クールタイムの残り（HUD 表示用） */
  cooldownLeft(playerId, skillId) {
    const cds = this.cooldowns.get(playerId);
    return cds ? Math.max(0, (cds.get(skillId) || 0) - this.nowTick()) : 0;
  }

  forget(playerId) {
    this.cooldowns.delete(playerId);
    this.globalCd.delete(playerId);
  }
}
