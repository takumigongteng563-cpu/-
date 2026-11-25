// =============================================================
// 隠された潜在能力
// ・初回参加時に抽選してプレイヤーデータに保存するが、覚醒するまで本人にも内容は見えない
// ・覚醒条件は「レベルだけ」ではなく、行動・実績・試練・特殊イベント（flag）を組み合わせる
// ・効果の書き方は才能と同じ（stats / derived / elements / growth）
// =============================================================
import { Registry } from "./registry.js";
import { counter, level, flag, familyCount, ELEMENT_FAMILIES, allElements, allStats } from "./talents/schema.js";

export const potentials = new Registry("潜在能力").registerAll([
  {
    id: "sword_limit",
    name: "剣術の極限",
    description: "剣の道の果てに至る力。",
    weight: 10,
    awaken: [counter("hit.melee.sword", 5000), level(40), familyCount(["sword"], 1)],
    stats: { flat: { str: 10, dex: 10 }, pct: { str: 10 } },
    derived: { flat: { critMultiplier: 0.3 } },
    growth: { str: 0.2, dex: 0.2 },
  },
  {
    id: "all_element_affinity",
    name: "全属性親和",
    description: "あらゆる属性の魔力と調和する。",
    weight: 10,
    awaken: [familyCount(ELEMENT_FAMILIES, 4)],
    stats: { flat: { mag: 8, int: 4 } },
    elements: allElements(20),
  },
  {
    id: "endless_curiosity",
    name: "無限の探究心",
    description: "世界の果てまで知りたいという渇望。",
    weight: 10,
    awaken: [counter("move.distance", 100000), level(20)],
    stats: { flat: { int: 8, luk: 5 } },
    growth: { int: 0.3 },
  },
  {
    id: "guardian_instinct",
    name: "守護者の本能",
    description: "仲間を守るときに真価を発揮する。",
    weight: 10,
    awaken: [counter("protect.ally", 200), level(20)],
    stats: { flat: { vit: 10 } },
    derived: { pct: { maxHp: 15, physDef: 15, magDef: 10 } },
  },
  {
    id: "miracle_healing",
    name: "奇跡の治癒",
    description: "死の淵からさえ人を呼び戻す癒しの力。",
    weight: 10,
    awaken: [counter("heal.amount", 20000), level(25)],
    stats: { flat: { mnd: 10 } },
    derived: { pct: { mpRegen: 30 } },
    skillAffinity: { heal: 0.5 },
  },
  {
    id: "spirit_resonance",
    name: "精霊との共鳴",
    description: "精霊と魂で繋がる。",
    weight: 10,
    awaken: [flag("spirit_resonance")],
    stats: { flat: { mag: 6, mnd: 6 } },
    elements: allElements(10),
  },
  {
    id: "transcendence",
    name: "限界超越",
    description: "定められた限界を越えていく力。",
    weight: 10,
    awaken: [level(50), counter("kill.strong", 3)],
    stats: { flat: allStats(5) },
    growth: { str: 0.1, vit: 0.1, mag: 0.1, mnd: 0.1, agi: 0.1, dex: 0.1, luk: 0.1, int: 0.1 },
  },
  {
    id: "combat_learning",
    name: "戦闘学習能力",
    description: "戦うほどに強くなる。",
    weight: 10,
    awaken: [counter("kill.hostile", 1000), counter("survive.lowhp", 30)],
    stats: { flat: { str: 5, agi: 5, dex: 5 } },
    growth: { str: 0.15, agi: 0.15, dex: 0.15 },
  },
  {
    id: "mana_mastery",
    name: "魔力制御の極致",
    description: "魔力を完全に支配する。",
    weight: 10,
    awaken: [counter("magic.cast", 5000), level(40)],
    stats: { flat: { mag: 10, int: 6 } },
    derived: { pct: { maxMp: 25, mpRegen: 25 } },
  },
  {
    id: "undying_soul",
    name: "不滅の魂",
    description: "何度倒れても立ち上がる魂。",
    weight: 10,
    awaken: [counter("survive.lowhp", 100), level(30)],
    stats: { flat: { vit: 6, mnd: 6 } },
    derived: { flat: { statusResist: 10 } },
  },
]);
