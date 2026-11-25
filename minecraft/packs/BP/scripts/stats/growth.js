// レベルアップ時の能力値の自動成長（純粋な計算・乱数なし）
import { STAT_IDS } from "../content/stats.js";
import { BASE_GROWTH } from "../balance/growth.js";

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
  for (const s of STAT_IDS) {
    const add = (BASE_GROWTH[s] || 0) * (multipliers[s] ?? 1) * levels;
    // 浮動小数の誤差が貯まらないよう小数第6位で丸める
    const frac = Math.round(((data.statGrowthFrac[s] || 0) + add) * 1e6) / 1e6;
    const whole = Math.floor(frac);
    data.statGrowthFrac[s] = Math.round((frac - whole) * 1e6) / 1e6;
    if (whole > 0) {
      data.statGrowth[s] = (data.statGrowth[s] || 0) + whole;
      gained[s] = whole;
    }
  }
  return gained;
}
