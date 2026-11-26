// =============================================================
// 全22属性・属性相性・属性融合（第5弾）
// ・相性は「攻撃の属性 → 防御側の属性」の基本表（strong＝弱点を突く／same＝同属性は耐性）に、
//   敵ごとの耐性表（content/combat/enemies.js の resist）を上書きで重ねる
// ・上位属性（神聖・深淵・創造・消滅）も弱点を突ける相手は2つだけ。すべての属性に勝てる属性はない
// ・属性そのものの進化はない。属性融合は ELEMENT_FUSIONS に定義した組み合わせのみ
// =============================================================
import { ELEMENT_NAMES } from "../jobs/catalog.js";

/** 相性の段階と倍率（暫定・指示書第10章） */
export const AFFINITY_LEVELS = Object.freeze({
  major_weak: { name: "大弱点", mult: 2.0 },
  weak: { name: "弱点", mult: 1.5 },
  normal: { name: "等倍", mult: 1.0 },
  resist: { name: "耐性", mult: 0.5 },
  strong_resist: { name: "強耐性", mult: 0.25 },
  immune: { name: "無効", mult: 0 },
});

/**
 * 属性の役割（指示書第9章）と基本の相性
 * status = この属性の攻撃で付与しうる状態異常（content/combat/statusEffects.js）
 * strong = この属性で攻撃すると「弱点」になる防御側の属性
 */
export const ELEMENTS = Object.freeze({
  fire: { role: "火傷・継続ダメージ", status: ["burn"], strong: ["ice", "plant", "metal"] },
  water: { role: "水濡れ・属性連携", status: ["wet"], strong: ["fire", "explosion"] },
  wind: { role: "機動力・吹き飛ばし", status: [], knockback: 1, strong: ["earth", "poison"] },
  earth: { role: "防御・体勢崩し", status: [], poise: 1.5, strong: ["thunder", "explosion"] },
  thunder: { role: "麻痺・連鎖攻撃", status: ["shock", "paralysis"], chain: 1, strong: ["water", "metal"] },
  light: { role: "浄化・幻影への対抗", status: [], dispel: ["illusion"], strong: ["dark", "mind"] },
  dark: { role: "呪い・視界妨害", status: ["curse", "blind"], strong: ["light", "life"] },
  none: { role: "属性に依存しない攻撃", status: [], strong: [] },
  ice: { role: "鈍化・凍結", status: ["slow", "freeze"], strong: ["wind", "water"] },
  poison: { role: "継続ダメージ・回復妨害", status: ["poison", "heal_block"], strong: ["plant", "life"] },
  explosion: { role: "範囲攻撃", status: [], aoe: 1.2, strong: ["metal", "earth"] },
  metal: { role: "防御・貫通", status: [], pierce: 0.2, strong: ["ice", "earth"] },
  plant: { role: "拘束・再生", status: ["bind"], strong: ["water", "earth"] },
  gravity: { role: "移動制限・引き寄せ", status: ["slow"], pull: 1, strong: ["wind", "space"] },
  space: { role: "転移・位置操作", status: [], strong: ["gravity", "time"] },
  time: { role: "行動速度・クールタイム操作", status: ["slow"], strong: ["space", "life"] },
  life: { role: "回復・再生", status: [], healBonus: 0.2, strong: ["abyss", "poison"] },
  mind: { role: "混乱・恐怖", status: ["confusion", "fear"], strong: ["thunder", "time"] },
  holy: { role: "浄化・魔物への特殊効果", status: [], undeadBonus: 0.5, strong: ["abyss", "dark"] },
  abyss: { role: "特殊妨害・弱体化", status: ["def_down", "resist_down"], strong: ["holy", "mind"] },
  creation: { role: "結界・特殊物体生成", status: [], strong: ["annihilation", "gravity"] },
  annihilation: { role: "一部の効果の解除・特殊攻撃", status: [], dispelBuffs: 1, strong: ["creation", "holy"] },
});

export const ELEMENT_IDS = Object.freeze(Object.keys(ELEMENTS));
export { ELEMENT_NAMES };

/** 基本の相性（敵の耐性表を重ねる前） */
export function baseAffinity(attackEl, defendEl) {
  if (!defendEl || attackEl === "none" || defendEl === "none") return "normal";
  if (attackEl === defendEl) return "resist";
  return ELEMENTS[attackEl] && ELEMENTS[attackEl].strong.includes(defendEl) ? "weak" : "normal";
}

/**
 * 属性融合（指示書第11章）。直前に別の属性で攻撃された対象に、組み合わせの属性で攻撃すると発生する
 * effect：field＝範囲の追加ダメージ＋状態異常 / heal＝周囲の仲間を回復 / summon＝検証用の召喚（召喚の上限に従う）
 */
export const ELEMENT_FUSIONS = Object.freeze([
  { id: "flame_tornado", name: "炎の竜巻", elements: ["fire", "wind"], effect: { type: "field", power: 0.6, radius: 4, status: "burn" } },
  { id: "electro_chain", name: "感電連鎖", elements: ["water", "thunder"], effect: { type: "field", power: 0.5, radius: 5, status: "shock" } },
  { id: "frozen_field", name: "凍結領域", elements: ["water", "ice"], effect: { type: "field", power: 0.3, radius: 4, status: "freeze" } },
  { id: "lava_field", name: "溶岩領域", elements: ["earth", "fire"], effect: { type: "field", power: 0.7, radius: 3.5, status: "burn" } },
  { id: "thunderstorm", name: "雷嵐", elements: ["wind", "thunder"], effect: { type: "field", power: 0.6, radius: 5, status: "paralysis" } },
  { id: "electromagnetic", name: "電磁領域", elements: ["metal", "thunder"], effect: { type: "field", power: 0.5, radius: 4, status: "def_down" } },
  { id: "regrowth_field", name: "再生領域", elements: ["plant", "life"], effect: { type: "heal", power: 0.5, radius: 6 } },
  { id: "holy_purge", name: "神聖浄化", elements: ["light", "holy"], effect: { type: "field", power: 0.6, radius: 5, cleanse: true } },
  { id: "bewitch_field", name: "幻惑領域", elements: ["dark", "mind"], effect: { type: "field", power: 0.3, radius: 5, status: "confusion" } },
  { id: "space_compress", name: "空間圧縮", elements: ["gravity", "space"], effect: { type: "field", power: 0.8, radius: 3, status: "bind" } },
  { id: "spacetime_warp", name: "時空の歪み", elements: ["time", "space"], effect: { type: "field", power: 0.4, radius: 5, status: "slow" } },
  { id: "special_summon", name: "特殊召喚", elements: ["creation", "life"], effect: { type: "summon", entity: "minecraft:iron_golem", duration: 300 } },
]);

/** 2つの属性から融合を探す（順不同） */
export function findFusion(a, b) {
  if (!a || !b || a === b) return null;
  return ELEMENT_FUSIONS.find((f) => f.elements.includes(a) && f.elements.includes(b)) || null;
}
