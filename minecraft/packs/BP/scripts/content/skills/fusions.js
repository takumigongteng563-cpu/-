// =============================================================
// スキル融合（第4弾）
// 融合できる組み合わせはここに定義したものだけ（無制限な組み合わせはしない）。
// 融合元のスキルは消えない。属性の融合はあるが、属性そのものの進化はしない。
// requires：両方の融合元のスキルレベル下限、追加条件（才能など）
// =============================================================
import { S, P } from "./helpers.js";

export const FUSION_SKILLS = [
  S({ id: "flame_tornado", name: "炎の竜巻", description: "炎をまとった竜巻で敵を巻き上げる。", category: "element_magic", elements: ["fire", "wind"], rarity: "rare", cost: { mp: 26 }, cooldown: 140, castTicks: 10, shape: "target_area", range: 4, distance: 18, power: P(60, 8, { mag: 1.3, int: 0.5 }), effect: { type: "area", lift: 0.8 }, actions: ["charge"] }),
  S({ id: "thunder_water_array", name: "雷水陣", description: "水で濡らした範囲に雷を流す陣。", category: "element_magic", elements: ["water", "thunder"], rarity: "rare", cost: { mp: 24 }, cooldown: 140, shape: "circle", range: 5, power: P(55, 7, { mag: 1.2, int: 0.5 }), effect: { type: "area", center: "self", statusEffects: [{ id: "slowness", amplifier: 1 }] }, duration: 60, actions: ["charge", "jump"] }),
  S({ id: "flame_sword_art", name: "炎属性の剣技", description: "炎を纏わせた一撃。物理と魔法の両方の力を使う。", category: "physical", elements: ["fire"], rarity: "rare", cost: { mp: 10, stamina: 15 }, cooldown: 60, shape: "cone", range: 3.5, power: P(45, 6, { str: 0.8, mag: 0.8 }, "physical"), effect: { type: "melee" }, actions: ["tap", "charge"] }),
  S({ id: "healing_barrier", name: "治癒結界", description: "結界の中の仲間を守りながら癒す。", category: "heal", elements: ["holy", "life"], rarity: "rare", cost: { mp: 30 }, cooldown: 300, shape: "party", range: 6, target: "ally", duration: 300, power: P(30, 6, { mnd: 1, lif: 0.6 }, "heal"), effect: { type: "heal", buff: { derived: { pct: { physDef: 15, magDef: 15, hpRegen: 100 } } } }, actions: ["charge"] }),
  S({ id: "shadow_familiar", name: "影の眷属召喚", description: "影から眷属を呼び出す。", category: "summon", elements: ["dark"], rarity: "rare", cost: { mp: 35 }, cooldown: 900, castTicks: 15, shape: "self", target: "self", duration: 600, effect: { type: "summon", entity: "minecraft:wolf", count: 2 }, actions: ["charge"] }),
  S({ id: "frostfire_twin", name: "氷炎双撃", description: "炎と氷を同時に叩きつける。", category: "element_magic", elements: ["fire", "ice"], rarity: "rare", cost: { mp: 20 }, cooldown: 90, distance: 16, duration: 60, power: P(50, 7, { mag: 1.2, int: 0.4 }), effect: { type: "projectile", pierce: 1, statusEffects: [{ id: "slowness", amplifier: 0 }] }, actions: ["tap", "jump"] }),
  S({ id: "radiant_barrier", name: "聖光結界", description: "触れた敵を焼く光の結界。", category: "defense", elements: ["holy", "light"], rarity: "rare", cost: { mp: 28 }, cooldown: 300, shape: "circle", range: 5, target: "ally", duration: 300, power: P(30, 5, { mag: 0.6, mnd: 0.8 }), effect: { type: "shield", buff: { derived: { pct: { physDef: 20, magDef: 30 } } }, alsoDamage: true }, actions: ["charge"] }),
  S({ id: "venom_blade", name: "毒の刃", description: "毒を塗った一撃。", category: "status", elements: ["poison"], rarity: "advanced", cost: { stamina: 15, mp: 5 }, cooldown: 60, shape: "cone", range: 3, duration: 120, power: P(24, 4, { str: 0.6, dex: 0.6 }, "physical"), effect: { type: "melee", statusEffects: [{ id: "poison", amplifier: 1 }] }, actions: ["tap", "sprint"] }),
  S({ id: "thunder_step", name: "雷迅歩", description: "雷となって突進し、通り道の敵を痺れさせる。", category: "movement", elements: ["thunder"], rarity: "rare", cost: { mp: 10, stamina: 15 }, cooldown: 60, shape: "self", distance: 7, power: P(30, 5, { mag: 0.8, agi: 0.6 }), effect: { type: "dash", force: 1.8, strikeRadius: 3, statusEffects: [{ id: "slowness", amplifier: 2 }] }, duration: 40, actions: ["sprint"] }),
  S({ id: "earth_guard", name: "岩壁の守り", description: "大地の力で仲間を固く守る。", category: "defense", elements: ["earth", "holy"], rarity: "rare", cost: { mp: 26 }, cooldown: 300, shape: "party", range: 6, target: "ally", duration: 400, effect: { type: "shield", buff: { derived: { pct: { physDef: 35, maxHp: 10 } } }, resistance: 1 }, actions: ["charge"] }),
  S({ id: "storm_arrow", name: "嵐の矢", description: "風の刃を矢に乗せ、射線上の敵をまとめて射抜く。", category: "physical", elements: ["wind"], rarity: "rare", cost: { mp: 8, stamina: 12 }, cooldown: 70, shape: "ray", distance: 30, power: P(40, 6, { dex: 1, mag: 0.5 }, "physical"), effect: { type: "projectile", pierce: 4 }, actions: ["tap", "charge"] }),
  S({ id: "life_link", name: "生命の絆", description: "仲間全員の傷を分け合うように癒す。", category: "heal", elements: ["life", "mind"], rarity: "epic", cost: { mp: 40 }, cooldown: 600, shape: "party", range: 12, target: "ally", power: P(50, 8, { mnd: 1, lif: 1 }, "heal"), effect: { type: "heal" }, actions: ["charge", "ultimate"] }),
];

/**
 * 融合のレシピ（両方とも習得済みで、指定のスキルレベル以上なら融合できる）
 * extra：追加の条件（才能・行動など。talents/conditions.js の書き方）
 */
export const FUSION_RECIPES = [
  { id: "fusion.flame_tornado", inputs: ["fire_ball", "wind_blade"], output: "flame_tornado", minLevel: 5 },
  { id: "fusion.thunder_water", inputs: ["water_bolt", "thunder_bolt"], output: "thunder_water_array", minLevel: 5 },
  { id: "fusion.flame_sword", inputs: ["power_strike", "fire_ball"], output: "flame_sword_art", minLevel: 5 },
  { id: "fusion.healing_barrier", inputs: ["heal", "barrier"], output: "healing_barrier", minLevel: 5 },
  { id: "fusion.shadow_familiar", inputs: ["dark_bolt", "summon_spirit"], output: "shadow_familiar", minLevel: 5 },
  { id: "fusion.frostfire", inputs: ["fire_ball", "frost_bolt"], output: "frostfire_twin", minLevel: 6 },
  { id: "fusion.radiant_barrier", inputs: ["light_bolt", "barrier"], output: "radiant_barrier", minLevel: 6 },
  { id: "fusion.venom_blade", inputs: ["power_strike", "poison_mist"], output: "venom_blade", minLevel: 4 },
  { id: "fusion.thunder_step", inputs: ["dash", "thunder_bolt"], output: "thunder_step", minLevel: 5 },
  { id: "fusion.earth_guard", inputs: ["rock_bullet", "barrier"], output: "earth_guard", minLevel: 6 },
  { id: "fusion.storm_arrow", inputs: ["aimed_shot", "wind_blade"], output: "storm_arrow", minLevel: 6 },
  // 才能による特別な組み合わせ（才能がないと融合できない）
  { id: "fusion.life_link", inputs: ["healing_circle", "focus_prayer"], output: "life_link", minLevel: 8, extra: [{ type: "familyCount", families: ["heal", "will", "life"], min: 1 }] },
];
