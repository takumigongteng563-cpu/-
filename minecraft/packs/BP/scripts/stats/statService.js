// 能力値の再計算と保存（計算結果を data.computed と vitals の最大値に反映）
import { computeStats } from "./statCalc.js";
import { emit } from "../core/eventBus.js";

/**
 * データを再計算する（mutator の中で使う）。何度呼んでも結果は同じ。
 * @param {any} data
 * @param {number} nowTick
 */
export function recalcData(data, nowTick) {
  // 期限切れの一時効果を取り除く
  if (Array.isArray(data.buffs)) data.buffs = data.buffs.filter((b) => b && (!b.untilTick || b.untilTick > nowTick));
  const r = computeStats(data, nowTick);
  data.computed = { primary: r.primary, derived: r.derived, elements: r.elements, special: r.special, statCap: r.statCap, at: nowTick };
  const v = data.vitals;
  const d = r.derived;
  v.hpMax = d.maxHp;
  v.mpMax = d.maxMp;
  v.staminaMax = d.maxStamina;
  if (v.mpFillOnRecalc) {
    v.mp = v.mpMax;
    v.stamina = v.staminaMax;
    delete v.mpFillOnRecalc;
  }
  v.hp = Math.max(0, Math.min(v.hp, v.hpMax));
  v.mp = Math.max(0, Math.min(v.mp, v.mpMax));
  v.stamina = Math.max(0, Math.min(v.stamina, v.staminaMax));
  return r;
}

export class StatService {
  /**
   * @param {import("../player/playerService.js").PlayerService} playerService
   * @param {() => number} nowTick
   */
  constructor(playerService, nowTick) {
    this.playerService = playerService;
    this.nowTick = nowTick;
  }

  /** 再計算（ログイン時・能力変化時・管理者操作） */
  recalc(playerId, opt = {}) {
    const ok = this.playerService.update(playerId, (d) => recalcData(d, this.nowTick()), opt);
    if (ok) emit("statsChanged", { playerId });
    return ok;
  }

  /** 表示用：内訳つきの計算結果（保存はしない） */
  inspect(playerId) {
    const d = this.playerService.dataFor(playerId);
    return d ? computeStats(d, this.nowTick()) : undefined;
  }

  /**
   * 一時効果を付ける。同じ id の効果は上書き（重複して積み上がらない）。
   * @param {{id: string, name?: string, source?: string, stats?: any, derived?: any, special?: any, durationTicks: number}} buff
   */
  addBuff(playerId, buff) {
    const until = this.nowTick() + Math.max(1, Math.floor(buff.durationTicks));
    const ok = this.playerService.update(playerId, (d) => {
      d.buffs = d.buffs.filter((b) => b.id !== buff.id);
      d.buffs.push({ id: buff.id, name: buff.name, source: buff.source, stats: buff.stats, derived: buff.derived, special: buff.special, untilTick: until });
      recalcData(d, this.nowTick());
    });
    if (ok) emit("statsChanged", { playerId });
    return ok;
  }
}
