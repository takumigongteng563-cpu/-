// =============================================================
// 職業専用スキル・奥義（第4弾）：全484職業の signature（専用スキル）と ultimate（第5次＝奥義／第1〜4次＝秘技）
// ・名前・ID・習得条件は第3弾の職業データ（content/jobs/tree/*.js → jobFactory）のものを維持する
// ・効果は「役割 × 操作」で型を決め、職業の属性・段階・武器で性能を変える（全職業が同じにならない）
//   役割→効果の型：盾役=防御＋弱体、近接火力=前方範囲、技巧=連撃、射撃=貫通弾、魔法火力=着弾範囲、回復=回復、
//   支援=強化、召喚=召喚、暗殺=突進＋攻撃、妨害=弱体化、遊撃=突進、守護回復=回復＋防御
// ・使える条件：現在の職業 =その職業。過去の職業の専用スキルは「引き継ぎ」（職業Lv・武器の条件、枠数の制限あり）
// ・奥義・秘技は引き継げない（その職業でのみ使用可）
// =============================================================
import { S, P } from "./helpers.js";
import { normalJobs } from "../jobs.js";

const ELEMENT_FX = {
  fire: ["minecraft:basic_flame_particle", "mob.blaze.shoot"],
  water: ["minecraft:water_splash_particle", "random.splash"],
  wind: ["minecraft:wind_explosion_emitter", "mob.breeze.shoot"],
  earth: ["minecraft:large_explosion", "dig.stone"],
  thunder: ["minecraft:electric_spark_particle", "ambient.weather.thunder"],
  light: ["minecraft:totem_particle", "random.levelup"],
  holy: ["minecraft:totem_particle", "random.levelup"],
  dark: ["minecraft:sculk_soul_particle", "mob.wither.shoot"],
  abyss: ["minecraft:sculk_soul_particle", "mob.wither.shoot"],
  ice: ["minecraft:snowflake_particle", "random.glass"],
  poison: ["minecraft:villager_angry", "mob.spider.say"],
  explosion: ["minecraft:large_explosion", "random.explode"],
  metal: ["minecraft:basic_crit_particle", "random.anvil_land"],
  plant: ["minecraft:crop_growth_emitter", "dig.grass"],
  gravity: ["minecraft:portal_reverse_particle", "mob.endermen.portal"],
  space: ["minecraft:portal_reverse_particle", "mob.endermen.portal"],
  time: ["minecraft:enchanting_table_particle", "block.bell.hit"],
  life: ["minecraft:heart_particle", "random.orb"],
  mind: ["minecraft:enchanting_table_particle", "mob.evocation_illager.cast_spell"],
  creation: ["minecraft:totem_particle", "random.totem"],
  annihilation: ["minecraft:sculk_soul_particle", "mob.wither.death"],
  none: ["minecraft:basic_crit_particle", "random.orb"],
};

/** 役割ごとの効果の型（k = 段階による強さ。奥義は ult=true） */
const ROLE_SKILL = {
  guardian: (k, ult) => ({ cat: "defense", shape: "circle", range: 5 + k, target: "self", cost: { stamina: 12 + 4 * k }, cd: 200, duration: 160 + 40 * k, effect: { type: "shield", self: true, buff: { derived: { pct: { physDef: 8 + 4 * k, magDef: 6 + 3 * k } } }, alsoDebuff: [{ id: "weakness", amplifier: ult ? 1 : 0 }], resistance: ult ? 2 : k >= 4 ? 1 : 0 } }),
  striker: (k) => ({ cat: "physical", shape: "cone", range: 3.5 + k * 0.4, cost: { stamina: 10 + 4 * k }, cd: 60, power: { base: 26, per: 5, stats: { str: 1.1, dex: 0.3 }, kind: "physical" }, effect: { type: "melee", knockback: 0.6 } }),
  duelist: (k) => ({ cat: "physical", shape: "single", range: 4, cost: { stamina: 6 + 2 * k }, cd: 24, power: { base: 12, per: 2, stats: { dex: 0.9, agi: 0.5 }, kind: "physical" }, effect: { type: "melee", hits: 2 + Math.floor(k / 2) } }),
  marksman: (k) => ({ cat: "physical", shape: "ray", distance: 22 + 2 * k, cost: { stamina: 6 + 2 * k }, cd: 30, power: { base: 20, per: 4, stats: { dex: 1.0, foc: 0.4 }, kind: "physical" }, effect: { type: "projectile", pierce: 1 + Math.floor(k / 2) } }),
  caster: (k) => ({ cat: "attack_magic", shape: "target_area", range: 3 + k * 0.4, distance: 18 + k, cost: { mp: 10 + 5 * k }, cd: 70, cast: 8, power: { base: 30, per: 5, stats: { mag: 1.1, int: 0.4 }, kind: "magic" }, effect: { type: "area" } }),
  healer: (k) => ({ cat: "heal", shape: "party", range: 8 + k, target: "ally", cost: { mp: 8 + 4 * k }, cd: 80, power: { base: 20, per: 4, stats: { mnd: 1.0, lif: 0.6 }, kind: "heal" }, effect: { type: "heal", cleanse: k >= 3 } }),
  buffer: (k) => ({ cat: "support", shape: "party", range: 8 + k, target: "ally", cost: { mp: 10 + 4 * k }, cd: 300, duration: 300 + 60 * k, effect: { type: "buff", buff: { derived: { pct: { physAtk: 4 + 2 * k, magAtk: 4 + 2 * k }, flat: { hitRate: k } } } } }),
  summoner: (k, ult) => ({ cat: "summon", shape: "self", target: "self", cost: { mp: 16 + 5 * k }, cd: 400, cast: 10, duration: 300 + 60 * k, effect: { type: "summon", entity: ult || k >= 4 ? "minecraft:iron_golem" : k >= 2 ? "minecraft:wolf" : "minecraft:snow_golem", count: ult ? 2 : 1 } }),
  assassin: (k) => ({ cat: "movement", shape: "single", range: 3, distance: 6 + k, cost: { stamina: 10 + 3 * k }, cd: 80, power: { base: 30, per: 6, stats: { agi: 0.8, dex: 0.8 }, kind: "physical" }, effect: { type: "dash", strike: true, critBonus: 0.5 } }),
  controller: (k) => ({ cat: "control", shape: "circle", range: 5 + k * 0.5, cost: { mp: 10 + 4 * k }, cd: 160, duration: 60 + 20 * k, effect: { type: "debuff", center: "self", statusEffects: [{ id: "slowness", amplifier: Math.min(3, 1 + Math.floor(k / 2)) }, { id: "weakness", amplifier: 0 }] } }),
  skirmisher: (k) => ({ cat: "movement", shape: "self", target: "self", distance: 7 + k, cost: { stamina: 8 + 2 * k }, cd: 60, duration: 100, effect: { type: "dash", buff: { derived: { pct: { physAtk: 5 + 2 * k } } } } }),
  warden: (k) => ({ cat: "heal", shape: "party", range: 6 + k, target: "ally", cost: { mp: 10 + 4 * k, stamina: 6 }, cd: 200, duration: 200, power: { base: 14, per: 3, stats: { vit: 0.6, mnd: 0.6, lif: 0.4 }, kind: "heal" }, effect: { type: "heal", buff: { derived: { pct: { physDef: 6 + 2 * k } } } } }),
};

const ULT_CATEGORY = { ultimate: "ultimate", secret: "job" };

function makePower(p, mult) {
  if (!p) return null;
  const stats = {};
  for (const [k, v] of Object.entries(p.stats)) stats[k] = Math.round(v * mult * 100) / 100;
  return P(Math.round(p.base * mult), Math.round(p.per * mult * 10) / 10, stats, p.kind);
}

function fxFor(el, ult) {
  const [particle, sound] = ELEMENT_FX[el] || ELEMENT_FX.none;
  return { particle: ult ? "minecraft:huge_explosion_emitter" : particle, sound: ult ? "random.totem" : sound, animation: ult ? "animation.player.attack.positions" : null };
}

function signature(job) {
  const k = job.tier;
  const r = ROLE_SKILL[job.role](k, false);
  const sk = job.skills[0];
  const el = job.elements[0] || "none";
  const mult = 1 + (k - 1) * 0.35;
  return S({
    id: sk.id,
    name: sk.name,
    description: sk.effect,
    category: "job",
    style: r.cat,
    jobSkillKind: "signature",
    elements: job.elements.length ? [...job.elements] : ["none"],
    rarity: ["common", "common", "advanced", "rare", "epic", "legendary"][k],
    maxLevel: 10,
    cost: { mp: r.cost.mp || 0, stamina: r.cost.stamina || 0 },
    cooldown: r.cd,
    castTicks: r.cast || 0,
    actions: [sk.action, "tap"].filter((a, i, arr) => arr.indexOf(a) === i),
    shape: r.shape,
    range: r.range || 0,
    distance: r.distance || 0,
    target: r.target || "enemy",
    duration: r.duration || 0,
    power: makePower(r.power, mult),
    effect: r.effect,
    jobs: [job.id],
    weapons: job.weapons,
    inherit: sk.inherit,
    learn: [{ method: "jobLevel", conditions: [{ type: "jobLevel", job: job.id, min: sk.learn.jobLevel }] }],
    fx: fxFor(el, false),
  });
}

function ultimate(job) {
  const k = job.tier;
  const u = job.ultimate;
  const r = ROLE_SKILL[job.role](k, true);
  const el = job.elements[0] || "none";
  const isUlt = u.kind === "ultimate";
  const mult = (1 + (k - 1) * 0.35) * (isUlt ? 3 : 2);
  const range = r.range ? r.range * (isUlt ? 1.8 : 1.4) : 0;
  return S({
    id: u.id,
    name: u.name,
    description: u.effect,
    category: ULT_CATEGORY[u.kind],
    jobSkillKind: u.kind,
    elements: job.elements.length ? [...job.elements] : ["none"],
    rarity: isUlt ? "mythic" : "epic",
    maxLevel: 5,
    cost: { mp: Math.round((r.cost.mp || 0) * (isUlt ? 4 : 2.5)), stamina: Math.round((r.cost.stamina || 0) * (isUlt ? 4 : 2.5)) },
    cooldown: isUlt ? 1200 : 600,
    castTicks: isUlt ? 20 : 10,
    actions: ["ultimate"],
    condition: isUlt ? { minLevel: 50 } : null,
    shape: r.shape === "single" || r.shape === "ray" ? "circle" : r.shape,
    range: Math.max(range, r.shape === "single" || r.shape === "ray" ? 6 : 0),
    distance: r.distance || 0,
    target: r.target || "enemy",
    duration: r.duration ? Math.round(r.duration * 1.5) : 0,
    power: makePower(r.power, mult),
    effect: { ...r.effect, ...(r.shape === "single" || r.shape === "ray" ? { center: "self", type: r.effect.type === "projectile" ? "area" : r.effect.type } : {}) },
    jobs: [job.id],
    weapons: job.weapons,
    inherit: null,
    learn: [{ method: "jobLevel", conditions: [{ type: "jobLevel", job: job.id, min: u.learn.jobLevel }] }],
    fx: fxFor(el, true),
  });
}

export const JOB_SKILLS = normalJobs().flatMap((j) => [signature(j), ultimate(j)]);
