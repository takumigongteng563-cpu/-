// =============================================================
// 信仰（第4弾）：24柱それぞれの信仰レベル。複数の神を同時に育てられる
// ・行動（content/gods.js の faith.actions）や、その神の属性のスキルの使用（faith.elements）で自然に上がる
// ・獲得条件は神ごとに異なる【暫定】。神々の詳細が確定したら content/gods.js を差し替える
// ・信仰レベルは使徒契約を解除しても残る
// =============================================================
import { gods } from "../content/gods.js";
import { emit } from "../core/eventBus.js";
import { FAITH_CURVE, FAITH_GAIN } from "../balance/skills.js";
import { faithToNext } from "../skills/skillRules.js";

export class FaithService {
  /**
   * @param {import("../player/playerService.js").PlayerService} playerService
   * @param {() => number} nowTick
   */
  constructor(playerService, nowTick) {
    this.playerService = playerService;
    this.nowTick = nowTick;
    /** @type {Map<string, number>} `${playerId}|${godId}` → 最後に得たtick */
    this.last = new Map();
    /** 信仰レベルが上がったとき（app.js が設定：加護スキルの習得判定・使徒スキルの進化） @type {((playerId: string, godId: string, level: number) => void)|null} */
    this.onLevelUp = null;
    this.byAction = new Map();
    this.byElement = new Map();
    for (const g of gods.all()) {
      for (const a of g.faith.actions) (this.byAction.get(a) || this.byAction.set(a, []).get(a)).push(g.id);
      for (const e of g.faith.elements) (this.byElement.get(e) || this.byElement.set(e, []).get(e)).push(g.id);
    }
  }

  levelOf(playerId, godId) {
    const d = this.playerService.dataFor(playerId);
    return (d && d.faith[godId] && d.faith[godId].level) || 0;
  }

  /** 信仰経験値を加える（間隔の制限なし。管理者・イベント用） */
  add(playerId, godId, amount) {
    if (!gods.has(godId) || !(amount > 0)) return { ok: false, levelUp: false };
    let levelUp = false;
    let level = 0;
    const ok = this.playerService.update(playerId, (d) => {
      const f = d.faith[godId] || { level: 0, exp: 0 };
      if (f.level >= FAITH_CURVE.maxLevel) {
        d.faith[godId] = f;
        level = f.level;
        return;
      }
      f.exp += amount;
      while (f.level < FAITH_CURVE.maxLevel && f.exp >= faithToNext(f.level + 1)) {
        f.exp -= faithToNext(f.level + 1);
        f.level++;
        levelUp = true;
      }
      if (f.level >= FAITH_CURVE.maxLevel) f.exp = 0;
      level = f.level;
      d.faith[godId] = f;
    }, { important: false });
    if (levelUp) {
      emit("faithLevelUp", { playerId, god: godId, level });
      if (this.onLevelUp) this.onLevelUp(playerId, godId, level);
    }
    return { ok, levelUp, level };
  }

  setLevel(playerId, godId, level) {
    if (!gods.has(godId)) return false;
    const lv = Math.max(0, Math.min(FAITH_CURVE.maxLevel, Math.floor(level)));
    const ok = this.playerService.update(playerId, (d) => (d.faith[godId] = { level: lv, exp: 0 }), { important: true });
    if (ok && this.onLevelUp) this.onLevelUp(playerId, godId, lv);
    return ok;
  }

  throttled(playerId, godId) {
    const k = `${playerId}|${godId}`;
    const now = this.nowTick();
    if (now - (this.last.get(k) ?? -Infinity) < FAITH_GAIN.minIntervalTicks) return true;
    this.last.set(k, now);
    return false;
  }

  /** 行動の記録から（actionService.onRecorded） */
  onAction(playerId, key) {
    for (const g of this.byAction.get(key) || []) if (!this.throttled(playerId, g)) this.add(playerId, g, FAITH_GAIN.perAction);
  }

  /** スキルの使用から（その神の属性のスキル） */
  onSkillUsed(playerId, def) {
    const done = new Set();
    for (const e of def.elements || []) for (const g of this.byElement.get(e) || []) {
      if (done.has(g)) continue;
      done.add(g);
      if (!this.throttled(playerId, g)) this.add(playerId, g, FAITH_GAIN.perSkill);
    }
  }

  forget(playerId) {
    for (const k of [...this.last.keys()]) if (k.startsWith(`${playerId}|`)) this.last.delete(k);
  }
}
