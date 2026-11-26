// =============================================================
// 隠された潜在能力（最終仕様 Ver.1.0：行動による形成方式）
// ・開始時点では未確定。プレイヤーの行動・職業・戦闘スタイル・攻略実績の記録から
//   formation の重みでスコアを計算し、閾値を超えた潜在能力が「形成」される
// ・形成後、awaken の条件を満たすと「覚醒」。覚醒するまで名前・条件は本人にも表示しない
// ・formation の書き方：
//     actions: { "行動キー": 重み }       行動回数（単位は balance/talentRoll.js）
//     jobLines: { warrior: 点 }           現在の職業の系統（第3弾以降）
//     talentFamilies: { sword: 点 }       所持している才能の系統
// ・効果の書き方は才能と同じ（stats / derived / elements / growth）
// =============================================================
import { Registry } from "./registry.js";
import { counter, level, flag, familyCount, ELEMENT_FAMILIES, allElements, allStats, allGrowth } from "./talents/schema.js";

export const potentials = new Registry("潜在能力").registerAll([
  {
    id: "sword_limit",
    name: "剣術の極限",
    description: "剣の道の果てに至る力。",
    weight: 10,
    formation: { actions: { "hit.melee.sword": 1.5, "kill.hostile": 0.3 }, talentFamilies: { sword: 5 }, jobLines: { warrior: 3 } },
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
    formation: { actions: { "magic.cast": 1 }, talentFamilies: { fire: 3, water: 3, wind: 3, earth: 3, thunder: 3, ice: 3, light: 3, dark: 3 }, jobLines: { mage: 3 } },
    awaken: [familyCount(ELEMENT_FAMILIES, 4)],
    stats: { flat: { mag: 8, int: 4 } },
    elements: allElements(20),
  },
  {
    id: "endless_curiosity",
    name: "無限の探究心",
    description: "世界の果てまで知りたいという渇望。",
    weight: 10,
    formation: { actions: { "move.distance": 1.5, "stage.clear": 0.5 } },
    awaken: [counter("move.distance", 100000), level(20)],
    stats: { flat: { int: 8, luk: 5 } },
    growth: { int: 0.3 },
  },
  {
    id: "guardian_instinct",
    name: "守護者の本能",
    description: "仲間を守るときに真価を発揮する。",
    weight: 10,
    formation: { actions: { "protect.ally": 2, "damage.taken.mob": 1 }, talentFamilies: { defense: 5 }, jobLines: { warrior: 2, priest: 2 } },
    awaken: [counter("protect.ally", 200), level(20)],
    stats: { flat: { vit: 10 } },
    derived: { pct: { maxHp: 15, physDef: 15, magDef: 10 } },
  },
  {
    id: "miracle_healing",
    name: "奇跡の治癒",
    description: "死の淵からさえ人を呼び戻す癒しの力。",
    weight: 10,
    formation: { actions: { "heal.amount": 2 }, talentFamilies: { heal: 5 }, jobLines: { priest: 4 } },
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
    formation: { actions: { "magic.cast": 0.5, "move.distance": 0.5 }, talentFamilies: { spirit: 8 } },
    awaken: [flag("spirit_resonance")],
    stats: { flat: { mag: 6, mnd: 6 } },
    elements: allElements(10),
  },
  {
    id: "transcendence",
    name: "限界超越",
    description: "定められた限界を越えていく力。",
    weight: 10,
    formation: { actions: { "kill.strong": 3, "boss.kill": 3 } },
    awaken: [level(50), counter("kill.strong", 3)],
    stats: { flat: allStats(5) },
    growth: allGrowth(0.1),
  },
  {
    id: "combat_learning",
    name: "戦闘学習能力",
    description: "戦うほどに強くなる。",
    weight: 10,
    formation: { actions: { "kill.hostile": 1, "survive.lowhp": 1 } },
    awaken: [counter("kill.hostile", 1000), counter("survive.lowhp", 30)],
    stats: { flat: { str: 5, agi: 5, dex: 5 } },
    growth: { str: 0.15, agi: 0.15, dex: 0.15 },
  },
  {
    id: "mana_mastery",
    name: "魔力制御の極致",
    description: "魔力を完全に支配する。",
    weight: 10,
    formation: { actions: { "magic.cast": 2 }, talentFamilies: { mana: 5, mage: 5 }, jobLines: { mage: 4 } },
    awaken: [counter("magic.cast", 5000), level(40)],
    stats: { flat: { mag: 10, int: 6 } },
    derived: { pct: { maxMp: 25, mpRegen: 25 } },
  },
  {
    id: "undying_soul",
    name: "不滅の魂",
    description: "何度倒れても立ち上がる魂。",
    weight: 10,
    formation: { actions: { "survive.lowhp": 2, "damage.taken.mob": 0.5 }, talentFamilies: { will: 5 } },
    awaken: [counter("survive.lowhp", 100), level(30)],
    stats: { flat: { vit: 6, mnd: 6 } },
    derived: { flat: { statusResist: 10 } },
  },
]);
