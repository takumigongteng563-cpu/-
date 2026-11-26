// ステージ報酬の個別抽選（純粋な計算）【基盤】
import { RARITIES, REWARD_MODIFIERS } from "../balance/rewards.js";

const RARITY = Object.fromEntries(RARITIES.map((r) => [r.id, r]));

/**
 * 1項目の当選確率
 * @param {{chance: number, rarity: string}} entry
 * @param {{luck: number, talentBonus?: number, clears: number, difficulty: number}} c
 */
export function dropChance(entry, c) {
  const m = REWARD_MODIFIERS;
  const luck = Math.min(m.luckMax, Math.max(0, (c.luck - 5) * m.luckPerPoint));
  const repeat = Math.min(m.repeatMax, Math.max(0, c.clears * m.repeatPerClear));
  const diff = 1 + Math.max(0, c.difficulty - 1) * m.difficultyPerLevel;
  const rar = (RARITY[entry.rarity] || RARITY.common).multiplier;
  const p = entry.chance * rar * diff * (1 + luck + (c.talentBonus || 0) + repeat);
  return Math.min(m.maxChance, Math.max(0, p));
}

/**
 * 報酬を抽選する（1人分）。世界唯一の装備は候補として返すだけで、
 * 実際に渡せるかは uniqueItemService.issue で確認する（複数人への同時配布を防ぐ）。
 * @returns {{gold: number, exp: number, items: {id: string, count: number, rarity: string, unique: boolean}[]}}
 */
export function rollRewards(table, c, rng) {
  const out = { gold: 0, exp: table.exp || 0, items: [] };
  if (Array.isArray(table.gold)) out.gold = table.gold[0] + Math.floor(rng() * (table.gold[1] - table.gold[0] + 1));
  for (const e of table.entries || []) {
    if (rng() >= dropChance(e, c)) continue;
    const [lo, hi] = e.count || [1, 1];
    out.items.push({ id: e.id, count: lo + Math.floor(rng() * (hi - lo + 1)), rarity: e.rarity, unique: !!e.unique });
  }
  return out;
}
