// =============================================================
// 職業専用能力値（最終仕様 第7章・第3弾 第12章）
// ・職業（融合）によって複数の専用能力値を扱える。値は「現在の職業」と職業レベルから計算する
// ・保存場所：data.specialStats = { [id]: { base, unlocked, unlockedAt } }（特殊な入手分）
// ・growth  ：成長条件（どうすれば上がるか）
// ・cap     ：存在階級ごとの上限（限界突破で解放）
// ・links   ：【実装済み】1ポイントあたりの派生能力値への効果（基本12能力値・派生能力値と連携）
// ・planned ：【第4弾以降】スキル・戦闘で使う効果
// =============================================================
import { Registry } from "./registry.js";

export const SPECIAL_STAT_CAPS = Object.freeze([100, 200, 350, 500, 750, 1000, 1500, 2000]);

export const specialStats = new Registry("専用能力値").registerAll([
  {
    id: "sword_aura",
    name: "剣気",
    lines: ["warrior"],
    description: "剣技の威力を高める気。",
    growth: "剣を得意とする職業の職業レベルが上がると成長",
    links: { physAtk: 0.5, critMultiplier: 0.002 },
    planned: "剣技スキルの威力上昇・剣気を消費する技",
  },
  {
    id: "battle_aura",
    name: "闘気",
    lines: ["warrior"],
    description: "肉体の力を引き出す気。",
    growth: "打撃・格闘を得意とする職業の職業レベルが上がると成長",
    links: { physAtk: 0.3, maxHp: 1 },
    planned: "闘気をためて放つ大技・ひるみ無効",
  },
  {
    id: "guard_power",
    name: "守護力",
    lines: ["warrior", "priest"],
    description: "仲間を守る力。",
    growth: "盾役・守護回復の職業の職業レベルが上がると成長",
    links: { physDef: 0.5, magDef: 0.3 },
    planned: "ガード・ジャストガードの性能、仲間をかばう技",
  },
  {
    id: "mana_control",
    name: "魔力制御",
    lines: ["mage"],
    description: "魔法の精度と効率。",
    growth: "魔法使い系統の融合が多い職業の職業レベルが上がると成長",
    links: { magAtk: 0.4, mpRegen: 0.02 },
    planned: "魔法の消費MP軽減・詠唱の安定",
  },
  {
    id: "spirit_affinity",
    name: "精霊親和力",
    lines: ["mage", "thief", "priest"],
    description: "精霊との結びつきの強さ。",
    growth: "精霊を扱う職業の職業レベルが上がると成長",
    links: { magDef: 0.2, mpRegen: 0.02 },
    planned: "精霊召喚・精霊魔法の強化",
  },
  {
    id: "summon_power",
    name: "召喚力",
    lines: ["mage"],
    description: "召喚獣の強さ。",
    growth: "召喚を得意とする職業の職業レベルが上がると成長",
    links: { leadership: 0.5 },
    planned: "召喚獣の能力値・召喚の持続時間",
  },
  {
    id: "bow_control",
    name: "弓術制御",
    lines: ["thief"],
    description: "矢の狙いと威力の制御。",
    growth: "弓・クロスボウを得意とする職業の職業レベルが上がると成長",
    links: { hitRate: 0.05, physAtk: 0.2 },
    planned: "射撃スキルの威力・弱点狙撃",
  },
  {
    id: "stealth",
    name: "隠密力",
    lines: ["thief"],
    description: "気配を消す力。",
    growth: "暗殺・忍の職業の職業レベルが上がると成長",
    links: { evasionRate: 0.03, critRate: 0.02 },
    planned: "姿を隠す技・不意打ちの威力",
  },
  {
    id: "illusion_control",
    name: "幻影制御",
    lines: ["mage", "thief"],
    description: "幻影や分身を操る力。",
    growth: "幻術・幻影の職業の職業レベルが上がると成長",
    links: { statusResist: 0.05, evasionRate: 0.02 },
    planned: "分身・幻影の数と持続時間",
  },
  {
    id: "faith",
    name: "信仰力",
    lines: ["priest"],
    description: "祈りの力。",
    growth: "僧侶系統の融合が多い職業の職業レベルが上がると成長",
    links: { magDef: 0.4, statusResist: 0.03 },
    planned: "祈り・祝福スキルの効果",
  },
  {
    id: "healing_power",
    name: "治癒力",
    lines: ["priest"],
    description: "傷を癒す力。",
    growth: "回復を得意とする職業の職業レベルが上がると成長",
    links: { healPower: 0.5, hpRegen: 0.02 },
    planned: "回復スキルの回復量・蘇生の成功率",
  },
  {
    id: "holy_power",
    name: "神聖力",
    lines: ["priest", "warrior", "mage"],
    description: "神聖属性の力。",
    growth: "神聖属性を得意とする職業の職業レベルが上がると成長",
    links: { magAtk: 0.2, magDef: 0.2 },
    planned: "神聖属性の攻撃・浄化・アンデッドへの特効",
  },
]);
