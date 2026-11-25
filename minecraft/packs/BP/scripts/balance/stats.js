// =============================================================
// 【設定ファイル】能力値・派生能力値（暫定値。自由に調整してよい）
// =============================================================

/** 基礎能力値の初期値（一般人相当） */
export const INITIAL_STATS = Object.freeze({
  str: 5, // 筋力
  vit: 5, // 耐久
  mag: 5, // 魔力
  mnd: 5, // 精神
  agi: 5, // 敏捷
  dex: 5, // 器用
  luk: 5, // 幸運
  int: 5, // 知力
});

/** HP・MP・スタミナの初期値（能力値が初期値・レベル1のときの最大値） */
export const INITIAL_VITALS = Object.freeze({
  hp: 100,
  mp: 50,
  stamina: 100,
});

/** 能力値1つあたりの上限（極端な数値の防止） */
export const STAT_HARD_CAP = 99999;

/** 割合補正（%）の合計の上限・下限。全ての割合補正を合計してからこの範囲に収める */
export const STAT_PERCENT_CAP = Object.freeze({ max: 200, min: -50 });

/**
 * 派生能力値の計算式の係数。
 * 各値 = base + Σ(係数 × (能力値 − 初期値)) + perLevel × (レベル − 1)
 * （初期値との差で計算するため、初期状態では base の値になる）
 * その後、才能などの派生値補正（固定値 → 割合）を加え、min/max の範囲に収める。
 * int: true の値は整数（切り捨て）、それ以外は小数第2位まで。
 * 単位：rate 系は %、moveSpeed は倍率、regen 系は「5秒あたり」
 */
export const DERIVED_FORMULAS = Object.freeze({
  maxHp: { int: true, base: INITIAL_VITALS.hp, coef: { vit: 12, str: 2 }, perLevel: 5, min: 1, max: 9999999 },
  maxMp: { int: true, base: INITIAL_VITALS.mp, coef: { mag: 8, int: 3 }, perLevel: 2, min: 0, max: 9999999 },
  maxStamina: { int: true, base: INITIAL_VITALS.stamina, coef: { vit: 4, agi: 4 }, perLevel: 1, min: 10, max: 99999 },
  physAtk: { int: true, base: 10, coef: { str: 2, dex: 0.5 }, perLevel: 1, min: 0, max: 9999999 },
  magAtk: { int: true, base: 10, coef: { mag: 2, int: 0.5 }, perLevel: 1, min: 0, max: 9999999 },
  physDef: { int: true, base: 5, coef: { vit: 1.5, str: 0.3 }, perLevel: 0.5, min: 0, max: 9999999 },
  magDef: { int: true, base: 5, coef: { mnd: 1.5, mag: 0.3 }, perLevel: 0.5, min: 0, max: 9999999 },
  critRate: { base: 5, coef: { dex: 0.2, luk: 0.1 }, perLevel: 0, min: 0, max: 75 },
  critMultiplier: { base: 1.5, coef: { dex: 0.005 }, perLevel: 0, min: 1, max: 3 },
  hitRate: { base: 90, coef: { dex: 0.3 }, perLevel: 0, min: 10, max: 100 },
  evasionRate: { base: 5, coef: { agi: 0.2, luk: 0.05 }, perLevel: 0, min: 0, max: 60 },
  moveSpeed: { base: 1.0, coef: { agi: 0.004 }, perLevel: 0, min: 0.5, max: 1.5 },
  hpRegen: { base: 1, coef: { vit: 0.2 }, perLevel: 0.05, min: 0, max: 99999 },
  mpRegen: { base: 2, coef: { mnd: 0.2, int: 0.1 }, perLevel: 0.05, min: 0, max: 99999 },
  staminaRegen: { base: 10, coef: { vit: 0.3, agi: 0.3 }, perLevel: 0, min: 1, max: 99999 },
  carryWeight: { int: true, base: 50, coef: { str: 5 }, perLevel: 0, min: 1, max: 9999999 },
  statusResist: { base: 0, coef: { mnd: 0.5 }, perLevel: 0, min: 0, max: 80 },
});

/** 属性耐性（%）の種類。初期値はすべて 0。才能などで増減する */
export const ELEMENTS = Object.freeze([
  { id: "fire", name: "火" },
  { id: "water", name: "水" },
  { id: "wind", name: "風" },
  { id: "earth", name: "土" },
  { id: "thunder", name: "雷" },
  { id: "ice", name: "氷" },
  { id: "light", name: "光" },
  { id: "dark", name: "闇" },
]);
/** 属性耐性の範囲（%） */
export const ELEMENT_RESIST_CAP = Object.freeze({ min: -100, max: 75 });
