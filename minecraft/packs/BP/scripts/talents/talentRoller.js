// 初期才能・潜在能力の抽選（純粋な計算。シード付き乱数を使う）
import { GRADES } from "../content/grades.js";
import { weightedPick } from "../core/rng.js";

/**
 * @param {() => number} rng
 * @param {any[]} innateDefs        初期才能の定義一覧
 * @param {Record<string, number>} gradeWeights
 * @param {{base: number, extraChance: number}} slots
 * @returns {string[]} 才能ID
 */
export function rollInitialTalents(rng, innateDefs, gradeWeights, slots) {
  const count = slots.base + (rng() * 100 < slots.extraChance ? 1 : 0);
  const picked = [];
  const usedFamilies = new Set();
  const gradeIds = GRADES.map((g) => g.id);
  for (let i = 0; i < count; i++) {
    const grade = weightedPick(rng, gradeIds, (g) => gradeWeights[g] || 0);
    const gi = gradeIds.indexOf(grade);
    // その等級に候補が無ければ1つ下の等級、さらに無ければ上の等級を探す
    const order = [gi];
    for (let d = 1; d < gradeIds.length; d++) {
      if (gi - d >= 0) order.push(gi - d);
      if (gi + d < gradeIds.length) order.push(gi + d);
    }
    let chosen;
    for (const idx of order) {
      const pool = innateDefs.filter((t) => t.grade === gradeIds[idx] && !usedFamilies.has(t.family) && !picked.includes(t.id));
      chosen = weightedPick(rng, pool, (t) => t.weight ?? 1);
      if (chosen) break;
    }
    if (!chosen) break;
    picked.push(chosen.id);
    usedFamilies.add(chosen.family);
  }
  return picked;
}

/**
 * 【旧仕様・未使用】潜在能力の抽選（第2弾）。最終仕様では行動による形成（potentialFormation.js）に変更。
 * 旧データの調査・テスト用に残している。
 * 潜在能力の抽選。ほかのプレイヤーに割り当て済みのものほど当たりにくくする（パーティ内の偏り防止）。
 * @param {() => number} rng
 * @param {any[]} defs
 * @param {Record<string, number>} assignedCounts
 * @param {number} count
 */
export function rollPotentials(rng, defs, assignedCounts, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const pool = defs.filter((d) => !out.includes(d.id));
    const p = weightedPick(rng, pool, (d) => (d.weight ?? 1) / (1 + (assignedCounts[d.id] || 0)));
    if (!p) break;
    out.push(p.id);
  }
  return out;
}
