// =============================================================
// 共通ダメージ計算（第5弾・指示書第5章）。純粋な計算（@minecraft/server に依存しない）
// 処理の順番（breakdown に記録）：
//  1 基礎攻撃力 → 2 スキル倍率 → 3 武器性能 → 4 職業補正 → 5 才能補正 → 6 熟練度補正
//  → 7 防御（分類で軽減の仕方が違う）→ 8 属性相性（上限2.0）→ 9 クリティカル → 10 部位弱点・体勢崩し
//  → 11 バフ・デバフ → 12 神々の加護 → 13 特殊効果（コンボ・反撃・連携）→ 14 上限（固定・割合は敵ごとの上限）
// ・すべての値は有限の数に丸める（極端な能力値・未定義の値でも NaN・Infinity にならない）
// ・バニラのダメージとの二重適用は combatRuntime が防ぐ（ここでは戦闘の数値だけを計算）
// =============================================================
import { COMBAT } from "../balance/combat.js";
import { AFFINITY_LEVELS, baseAffinity } from "../content/combat/elements.js";
import { STATUS_EFFECTS } from "../content/combat/statusEffects.js";

/** ダメージ分類（指示書第5章） */
export const DAMAGE_TYPES = Object.freeze({
  physical: { name: "物理", def: "def", defRate: 1 },
  magical: { name: "魔法", def: "mdef", defRate: 1 },
  elemental: { name: "属性", def: "mdef", defRate: 0.8 },
  fixed: { name: "固定", def: null, defRate: 0, noCrit: true, noElement: true, cap: "fixed" },
  pierce: { name: "貫通", def: "def", defRate: 0.3 },
  dot: { name: "継続", def: null, defRate: 0, noCrit: true },
  reflect: { name: "反射", def: null, defRate: 0, noCrit: true, noElement: true },
  percent: { name: "割合", def: null, defRate: 0, noCrit: true, noElement: true, cap: "percent" },
  divine: { name: "神性", def: "mdef", defRate: 0.5 },
  special: { name: "特殊", def: null, defRate: 0, noCrit: true },
});

export const fin = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, fin(v, a)));

/**
 * 属性倍率：攻撃の属性ごとの倍率の平均（複数属性で倍率が掛け算で重ならない）に、状態による補正を足し、上限で止める
 * @param {string[]} elements
 * @param {{element?: string, resist?: Record<string,string>}} profile
 * @param {any} [defMods] { elementTaken: 0.2, elementWeak: { thunder: 1.25 } }
 */
export function elementMultiplier(elements, profile, defMods = {}) {
  const list = (elements && elements.length ? elements : ["none"]).filter((e) => e);
  let sum = 0;
  const levels = [];
  for (const e of list) {
    const lv = (profile.resist && profile.resist[e]) || baseAffinity(e, profile.element);
    levels.push(lv);
    let m = AFFINITY_LEVELS[lv] ? AFFINITY_LEVELS[lv].mult : 1;
    if (m > 0 && defMods.elementWeak && defMods.elementWeak[e]) m *= defMods.elementWeak[e];
    sum += m;
  }
  let mult = sum / list.length;
  if (mult > 0) mult *= 1 + fin(defMods.elementTaken);
  return { mult: clamp(mult, 0, COMBAT.elementMax), levels };
}

/**
 * @typedef {Object} Combatant
 * @property {Record<string, number>} [derived]  派生能力値（physAtk, magAtk, physDef, magDef, critRate, critMultiplier, hitRate, ...）
 * @property {number} [level]
 * @property {any} [profile] 敵の戦闘データ（enemies.js）
 * @property {any} [mods] 戦闘補正 { atk, damageTaken, elementTaken, elementWeak, critRate, divine }
 * @property {number} [maxHp] 割合ダメージの基準
 */

/**
 * @param {Combatant} attacker
 * @param {Combatant} defender
 * @param {{type?: string, base?: number, skillMult?: number, weaponMult?: number, jobMult?: number, talentMult?: number,
 *   skillLevel?: number, elements?: string[], part?: any, broken?: boolean, special?: number, divine?: number,
 *   percent?: number, fixed?: number, canCrit?: boolean, critBonus?: number}} hit
 * @param {() => number} [rng]
 */
export function computeDamage(attacker, defender, hit, rng = Math.random) {
  const T = DAMAGE_TYPES[hit.type] || DAMAGE_TYPES.physical;
  const a = attacker.derived || {};
  const d = defender.derived || {};
  const prof = defender.profile || { resist: {}, caps: { fixed: 50, percent: 0.05 } };
  const am = attacker.mods || {};
  const dm = defender.mods || {};
  const steps = [];
  const step = (name, v) => {
    steps.push([name, Math.round(v * 100) / 100]);
    return v;
  };
  let v;
  if (hit.type === "percent") v = fin(defender.maxHp, 20) * clamp(hit.percent, 0, 1);
  else if (hit.type === "fixed") v = fin(hit.fixed);
  else v = fin(hit.base, hit.type === "magical" || hit.type === "elemental" ? a.magAtk : a.physAtk);
  v = step("1 基礎攻撃力", Math.max(0, v));
  v = step("2 スキル倍率", v * clamp(hit.skillMult ?? 1, 0, 50));
  v = step("3 武器性能", v * clamp(hit.weaponMult ?? 1, 0, 10));
  v = step("4 職業補正", v * clamp(hit.jobMult ?? 1, 0, 5));
  v = step("5 才能補正", v * clamp(hit.talentMult ?? 1, 0, 5));
  v = step("6 熟練度補正", v * (1 + Math.min(COMBAT.masteryMax, Math.max(0, fin(hit.skillLevel, 1) - 1) * COMBAT.masteryPerLevel)));
  // 7 防御：atk / (atk + def)。攻撃力が防御力を大きく上回るほど軽減が小さくなる
  if (T.def && T.defRate > 0) {
    const def = clamp((T.def === "def" ? fin(d.physDef, prof.def) : fin(d.magDef, prof.mdef)) * T.defRate * (1 - clamp(dm.defDown, 0, 0.9)), 0, 1e9);
    const atk = Math.max(1, v);
    v = v * (atk / (atk + def * COMBAT.defFactor));
  }
  v = step("7 防御", v);
  let element = { mult: 1, levels: [] };
  if (!T.noElement) element = elementMultiplier(hit.elements, prof, dm);
  v = step("8 属性相性", v * element.mult);
  let crit = false;
  if (!T.noCrit && hit.canCrit !== false) {
    const rate = clamp(fin(a.critRate, 5) + fin(am.critRate) + fin(hit.critBonus) * 100, 0, 100);
    if (rng() * 100 < rate) {
      crit = true;
      v *= clamp(fin(a.critMultiplier, 1.5), 1, COMBAT.critMax);
    }
  }
  v = step("9 クリティカル", v);
  let partMult = 1;
  if (hit.part && hit.part.weak && (hit.elements || []).includes(hit.part.weak)) partMult *= COMBAT.partWeakMult;
  if (hit.broken) partMult *= COMBAT.brokenMult;
  v = step("10 部位弱点・体勢崩し", v * partMult);
  v = step("11 バフ・デバフ", v * clamp(1 + fin(am.atk), 0.1, 3) * clamp(1 + fin(dm.damageTaken), 0, 3));
  v = step("12 神々の加護", v * clamp(1 + fin(hit.divine) + fin(am.divine), 0.5, 2));
  v = step("13 特殊効果", v * clamp(hit.special ?? 1, 0, 4));
  // 全体倍率の上限（基礎攻撃力に対して）
  const baseV = Math.max(1, steps[0][1]);
  if (v > baseV * COMBAT.totalMultMax && T.cap === undefined) v = baseV * COMBAT.totalMultMax;
  if (T.cap === "fixed") v = Math.min(v, fin(prof.caps && prof.caps.fixed, 50));
  if (T.cap === "percent") v = Math.min(v, fin(defender.maxHp, 20) * fin(prof.caps && prof.caps.percent, 0.05));
  v = step("14 上限", clamp(v, 0, COMBAT.maxDamage));
  return { damage: Math.round(v * 10) / 10, crit, elementMult: element.mult, affinity: element.levels, type: hit.type || "physical", steps };
}

/** 継続ダメージ（状態異常）：最大HPの power% × 重ね数（戦闘の数値） */
export function dotDamage(statusId, stacks, maxHp) {
  const s = STATUS_EFFECTS[statusId];
  if (!s || s.kind !== "dot") return 0;
  return Math.max(0.5, Math.round(fin(maxHp, 20) * (s.power / 100) * Math.max(1, stacks) * 10 * 10) / 10);
}
