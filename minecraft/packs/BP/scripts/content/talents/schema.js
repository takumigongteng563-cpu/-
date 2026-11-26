// =============================================================
// 才能定義の書き方
//
// {
//   id: "sword_aptitude",          固有ID（保存データに記録される。変更禁止）
//   name: "剣術適性",               名前
//   description: "…",              説明
//   grade: "F",                    等級（F/E/D/C/B/A/S/SS/SSS/EX）
//   kind: "innate",                innate=初期才能 / acquired=後天性 / evolved=進化で得る
//   family: "sword",               系統。同じ系統の初期才能は重複して抽選されない
//   weight: 10,                    抽選の重み（同じ等級の中での当たりやすさ）。innate のみ
//   stats: { flat: {str: 1}, pct: {str: 5} },          能力値補正（固定値・%）
//   derived: { flat: {maxHp: 10}, pct: {maxHp: 5} },   派生能力値補正
//   elements: { fire: 10 },        属性耐性補正（%）
//   growth: { str: 0.1 },          成長率補正（+10%）
//   expBonus: 0.1,                 経験値ボーナス（+10%。全補正の合計は上限 EXP_BONUS_CAP）
//   special: { flat: { sword_aura: 2 } },  職業系統の専用能力値への補正（基盤のみ）
//   jobAptitude: { swordsman: 0.1 },   職業適性（第3弾の職業システムが参照）
//   skillAffinity: { sword: 0.1 },     スキル習得への影響（後続のスキルシステムが参照）
//   awaken: [条件...],             覚醒条件（acquired はこれを満たすと獲得）
//   exclusiveFamily: true,         acquired のみ：同じ系統の才能を既に持っていれば獲得しない
//   evolvesTo: [{ to, priority, conditions: [条件...] }],  進化先（複数可・priority が大きい順に判定）
// }
//
// 条件（すべて満たすと成立）：
//   { type: "counter", key: "hit.melee.sword", min: 500 }   行動回数
//   { type: "level", min: 10 }                               レベル
//   { type: "stage", min: 1 }                                限界突破回数
//   { type: "hasTalent", id: "mana_affinity" }               才能を所持
//   { type: "familyCount", families: ["fire", ...], min: 4 } 指定系統の才能の所持数
//   { type: "flag", id: "spirit_shrine" }                    特殊イベント・試練などで立つフラグ
//   { type: "any", of: [条件...] }                           いずれかを満たす
// =============================================================

/** 全能力値に同じ値を設定するための補助 */
export function allStats(v) {
  return { str: v, vit: v, mag: v, mnd: v, agi: v, dex: v, luk: v, int: v, lif: v, endr: v, foc: v, lead: v };
}

/** 全能力値に同じ成長率補正 */
export function allGrowth(v) {
  return allStats(v);
}

export function allElements(v) {
  return { fire: v, water: v, wind: v, earth: v, thunder: v, ice: v, light: v, dark: v };
}

export const counter = (key, min) => ({ type: "counter", key, min });
export const level = (min) => ({ type: "level", min });
export const stage = (min) => ({ type: "stage", min });
export const hasTalent = (id) => ({ type: "hasTalent", id });
export const flag = (id) => ({ type: "flag", id });
export const any = (...of) => ({ type: "any", of });
export const familyCount = (families, min) => ({ type: "familyCount", families, min });

/** 属性系統の一覧（全属性親和などで使う） */
export const ELEMENT_FAMILIES = ["fire", "water", "wind", "earth", "thunder", "ice", "light", "dark"];
