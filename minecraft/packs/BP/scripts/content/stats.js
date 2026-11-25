// 基礎能力値の定義。表示順もこの順番。
// 初期値は「一般人相当」。具体的な成長処理は後続の開発で実装する。

export const STAT_DEFS = Object.freeze([
  { id: "str", name: "筋力", initial: 5 },
  { id: "vit", name: "体力", initial: 5 },
  { id: "agi", name: "敏捷", initial: 5 },
  { id: "dex", name: "器用", initial: 5 },
  { id: "int", name: "知力", initial: 5 },
  { id: "mnd", name: "精神", initial: 5 },
  { id: "luk", name: "幸運", initial: 5 },
]);

/** HP・MP・スタミナの初期値（一般人相当） */
export const INITIAL_VITALS = Object.freeze({
  hp: 100,
  mp: 10,
  stamina: 100,
});

export function initialBaseStats() {
  const out = {};
  for (const s of STAT_DEFS) out[s.id] = s.initial;
  return out;
}
