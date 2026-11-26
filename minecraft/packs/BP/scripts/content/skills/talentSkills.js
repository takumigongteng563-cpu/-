// =============================================================
// 才能専用スキル・潜在能力専用スキル・連携スキル（第4弾）
// ・才能専用：その系統の才能を持っている間だけ使える（才能が進化しても系統が同じなら使える）
// ・潜在能力専用：潜在能力が覚醒すると習得（潜在能力は行動で形成される）
// ・連携：仲間（別のプレイヤー）が条件のスキルを直前に使っていると威力が上がる。1人でも使える
// =============================================================
import { S, P } from "./helpers.js";

const talent = (fam, opt) => S({ category: "talent", talentFamilies: [fam], rarity: "rare", learn: [{ method: "talent", conditions: [{ type: "familyCount", families: [fam], min: 1 }, { type: "level", min: opt.minLevel ?? 10 }] }], ...opt });
const potential = (pid, opt) => S({ category: "potential", potential: pid, rarity: "legendary", maxLevel: 5, learn: [{ method: "potential", conditions: [{ type: "potential", id: pid }] }], ...opt });
const link = (opt) => S({ category: "link", rarity: "rare", learn: [{ method: "playerLevel", conditions: [{ type: "level", min: opt.minLevel ?? 15 }] }], ...opt });

export const TALENT_SKILLS = [
  talent("sword", { id: "talent.sword_flash", name: "剣技・閃", description: "剣の才能が生む神速の一閃。", elements: ["none"], cost: { stamina: 14 }, cooldown: 50, shape: "cone", range: 4, power: P(40, 6, { str: 0.8, dex: 0.8 }, "physical"), effect: { type: "melee" }, actions: ["tap", "charge"] }),
  talent("mana", { id: "talent.mana_surge", name: "魔力の奔流", description: "体内の魔力をそのまま叩きつける。", elements: ["none"], cost: { mp: 16 }, cooldown: 80, shape: "circle", range: 4, power: P(45, 6, { mag: 1.3 }), effect: { type: "area", center: "self" }, actions: ["charge"] }),
  talent("heal", { id: "talent.mercy_light", name: "慈愛の光", description: "穏やかな光で仲間を大きく癒す。", elements: ["holy", "life"], cost: { mp: 14 }, cooldown: 80, shape: "party", range: 7, target: "ally", power: P(45, 8, { mnd: 1.2, lif: 0.6 }, "heal"), effect: { type: "heal" } }),
  talent("bow", { id: "talent.hawk_arrow", name: "鷹の一矢", description: "遥か遠くの獲物を射抜く。", elements: ["none"], cost: { stamina: 12 }, cooldown: 60, distance: 40, power: P(45, 6, { dex: 1.3 }, "physical"), effect: { type: "projectile", pierce: 1 }, actions: ["charge", "tap"] }),
  talent("will", { id: "talent.indomitable_roar", name: "不屈の咆哮", description: "傷ついても心は折れない。自分の守りと回復を高める。", elements: ["none"], cost: { stamina: 15 }, cooldown: 400, shape: "self", target: "self", duration: 300, effect: { type: "buff", buff: { derived: { pct: { physDef: 20, hpRegen: 200 } } } }, actions: ["charge", "jump"] }),
  talent("luck", { id: "talent.lucky_strike", name: "幸運の一撃", description: "運の良さで急所を捉える。", elements: ["none"], cost: { stamina: 10 }, cooldown: 60, shape: "cone", range: 3, power: P(25, 4, { luk: 1.5, dex: 0.5 }, "physical"), effect: { type: "melee" } }),
  talent("otherworld", { id: "talent.otherworld_power", name: "異界の力", description: "この世界の理の外にある力。", elements: ["creation"], rarity: "legendary", cost: { mp: 30 }, cooldown: 600, shape: "target_area", range: 5, distance: 20, power: P(120, 15, { mag: 1, str: 1 }), effect: { type: "area" }, actions: ["charge", "ultimate"] }),
  talent("growth", { id: "talent.growth_spark", name: "成長の閃き", description: "戦うたびに技が冴える。スキルの熟練度が上がりやすい。", elements: ["none"], actions: [], shape: "self", target: "self", effect: { type: "passive", proficiencyBonus: 0.2 } }),
  talent("defense", { id: "talent.iron_wall", name: "鉄壁", description: "生まれ持った守りの才能で、一時的に鉄壁となる。", elements: ["metal"], cost: { stamina: 20 }, cooldown: 400, shape: "self", target: "self", duration: 200, effect: { type: "shield", buff: { derived: { pct: { physDef: 60, magDef: 30 } } }, resistance: 2 }, actions: ["charge"] }),
  talent("summon", { id: "talent.summon_whisper", name: "召喚の囁き", description: "異界の小さな存在が力を貸してくれる。", elements: ["space"], cost: { mp: 20 }, cooldown: 600, shape: "self", target: "self", duration: 400, effect: { type: "summon", entity: "minecraft:allay", count: 1 }, actions: ["charge"] }),
];

export const POTENTIAL_SKILLS = [
  potential("sword_limit", { id: "potential.sword_limit", name: "極剣・無我", description: "剣の極限に至った者だけが放てる一閃。", elements: ["none"], cost: { stamina: 40 }, cooldown: 600, castTicks: 10, shape: "cone", range: 5, power: P(200, 30, { str: 1.5, dex: 1.5 }, "physical"), effect: { type: "melee" }, actions: ["charge", "ultimate"] }),
  potential("all_element_affinity", { id: "potential.prism", name: "七彩魔導", description: "あらゆる属性を一度に放つ。", elements: ["fire", "water", "wind", "earth", "thunder", "light", "dark"], cost: { mp: 60 }, cooldown: 600, castTicks: 20, shape: "target_area", range: 6, distance: 22, power: P(180, 25, { mag: 2 }), effect: { type: "area" }, actions: ["ultimate", "charge"] }),
  potential("endless_curiosity", { id: "potential.explorer_sense", name: "探究者の直感", description: "未知への渇望が感覚を研ぎ澄ます。", elements: ["none"], actions: [], shape: "self", target: "self", effect: { type: "passive", buff: { derived: { pct: { staminaRegen: 30 }, flat: { evasionRate: 3 } } }, proficiencyBonus: 0.15 } }),
  potential("guardian_instinct", { id: "potential.guardian_wall", name: "守護者の城壁", description: "仲間全員を城壁のように守る。", elements: ["holy", "earth"], cost: { mp: 40 }, cooldown: 900, shape: "party", range: 10, target: "ally", duration: 400, effect: { type: "shield", buff: { derived: { pct: { physDef: 50, magDef: 50 } } }, resistance: 2 }, actions: ["ultimate", "charge"] }),
  potential("miracle_healing", { id: "potential.miracle", name: "奇跡", description: "死の淵にいる仲間さえ癒す奇跡。", elements: ["life", "holy"], cost: { mp: 80 }, cooldown: 1200, castTicks: 20, shape: "party", range: 12, target: "ally", power: P(300, 40, { mnd: 2, lif: 2 }, "heal"), effect: { type: "heal" }, actions: ["ultimate"] }),
  potential("spirit_resonance", { id: "potential.spirit_choir", name: "精霊の合唱", description: "精霊たちが歌い、仲間の力を高める。", elements: ["wind", "water", "earth", "fire"], cost: { mp: 40 }, cooldown: 900, shape: "party", range: 10, target: "ally", duration: 600, effect: { type: "buff", buff: { derived: { pct: { physAtk: 20, magAtk: 20, mpRegen: 50 } } } }, actions: ["ultimate", "charge"] }),
  potential("transcendence", { id: "potential.beyond", name: "限界突破の一撃", description: "定められた限界を越える一撃。", elements: ["none"], cost: { mp: 40, stamina: 40 }, cooldown: 900, castTicks: 15, shape: "target_area", range: 4, distance: 16, power: P(250, 30, { str: 1, mag: 1, dex: 1 }), effect: { type: "area" }, actions: ["ultimate"] }),
  potential("combat_learning", { id: "potential.battle_insight", name: "戦闘学習", description: "戦うほどに技が磨かれていく。", elements: ["none"], actions: [], shape: "self", target: "self", effect: { type: "passive", buff: { derived: { flat: { critRate: 5, hitRate: 5 } } }, proficiencyBonus: 0.3 } }),
  potential("mana_mastery", { id: "potential.mana_zero", name: "無詠唱", description: "魔力を完全に支配し、詠唱なしで魔法を放つ。", elements: ["none"], actions: [], shape: "self", target: "self", effect: { type: "passive", buff: { derived: { pct: { castSpeed: 50, mpRegen: 30 } } }, castReduce: 0.5 } }),
  potential("undying_soul", { id: "potential.undying", name: "不滅の魂", description: "一時的に倒れない体となる。", elements: ["life"], cost: { mp: 30 }, cooldown: 1800, shape: "self", target: "self", duration: 200, effect: { type: "shield", buff: { derived: { pct: { physDef: 80, magDef: 80, hpRegen: 300 } } }, resistance: 3 }, actions: ["ultimate", "charge"] }),
];

export const LINK_SKILLS = [
  link({ id: "link.element_slash", name: "連携・属性斬り", description: "仲間の属性魔法の直後に斬り込むと、その属性を纏って威力が上がる。", elements: ["none"], cost: { stamina: 15 }, cooldown: 60, shape: "cone", range: 3.5, power: P(30, 5, { str: 1 }, "physical"), effect: { type: "melee" }, linkAfter: { categories: ["element_magic", "attack_magic"] }, actions: ["tap", "charge"] }),
  link({ id: "link.barrier_heal", name: "連携・結界治癒", description: "仲間の結界の中で使うと回復量が大きく上がる。", elements: ["holy", "life"], cost: { mp: 12 }, cooldown: 80, shape: "party", range: 6, target: "ally", power: P(30, 6, { mnd: 1 }, "heal"), effect: { type: "heal" }, linkAfter: { categories: ["defense"] } }),
  link({ id: "link.enchanted_arrow", name: "連携・属性矢", description: "仲間の付与魔法・属性魔法の直後に放つと威力が上がる。", elements: ["none"], cost: { stamina: 12 }, cooldown: 50, distance: 30, power: P(30, 5, { dex: 1 }, "physical"), effect: { type: "projectile", pierce: 1 }, linkAfter: { categories: ["element_magic", "support"] } }),
  link({ id: "link.union_ultimate", name: "合体奥義・四勇の誓い", description: "仲間が奥義を放った直後に重ねる合体奥義。", elements: ["holy", "creation"], rarity: "legendary", maxLevel: 5, cost: { mp: 50, stamina: 50 }, cooldown: 1200, castTicks: 10, shape: "target_area", range: 6, distance: 20, power: P(150, 20, { str: 0.7, mag: 0.7, dex: 0.4, mnd: 0.4 }), effect: { type: "area" }, linkAfter: { categories: ["ultimate"] }, actions: ["ultimate"], minLevel: 30 }),
];
