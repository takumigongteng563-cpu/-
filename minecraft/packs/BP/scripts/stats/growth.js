// レベルアップ時の能力値の自動成長（純粋な計算・乱数なし）
import { STAT_IDS } from "../content/stats.js";
import { BASE_GROWTH } from "../balance/growth.js";
import { statCapForStage } from "../content/tiers.js";
import { INITIAL_STATS } from "../balance/stats.js";

/**
 * levels 分の成長を data.statGrowth に加える。
 * @param {any} data
 * @param {number} levels
 * @param {Record<string, number>} multipliers growthMultipliers() の結果
 * @returns {Record<string, number>} 実際に上がった値
 */
export function applyLevelGrowth(data, levels, multipliers) {
  /** @type {Record<string, number>} */
  const gained = {};
  if (levels <= 0) return gained;
  const cap = statCapForStage(data.limitBreak ? data.limitBreak.stage : 0);
  for (const s of STAT_IDS) {
    const natural = (data.stats[s] ?? INITIAL_STATS[s]) + (data.statGrowth[s] || 0) + (data.statAllocated[s] || 0);
    if (natural >= cap) continue; // 能力値の成長上限（限界突破で解放）
    const add = (BASE_GROWTH[s] || 0) * (multipliers[s] ?? 1) * levels;
    // 浮動小数の誤差が貯まらないよう小数第6位で丸める
    const frac = Math.round(((data.statGrowthFrac[s] || 0) + add) * 1e6) / 1e6;
    const whole = Math.floor(frac);
    data.statGrowthFrac[s] = Math.round((frac - whole) * 1e6) / 1e6;
    const room = Math.max(0, cap - natural);
    const up = Math.min(whole, room);
    if (up > 0) {
      data.statGrowth[s] = (data.statGrowth[s] || 0) + up;
      gained[s] = up;
    }
  }
  return gained;
}
