// =============================================================
// 神々の加護スキル・使徒専用スキル（第4弾）
// ・加護スキル：その神の信仰レベルが一定以上で習得（通常スキルとして管理。信仰レベルは解除されない）
// ・使徒専用スキル：使徒契約中だけ存在する。通常スキルとは別に管理し（data.apostle.skills）、
//   契約が解除されると完全に消える（再契約しても成長記録は戻らない）
// ・使徒スキルは神ごとに5段階（信仰レベル1/10/20/30/50。第5弾で3段階から拡張）。最終段階は神の権能の一部（制限つき）
// 【暫定】神々の能力が確定するまで、効果は司る力に対応した属性の仮の効果
// =============================================================
import { S, P } from "./helpers.js";
import { gods, GOD_DETAILS, APOSTLE_STAGES, apostleStageNames } from "../gods.js";

const ARCHETYPES = {
  light: { type: "area", shape: "target_area", range: 4, distance: 18 },
  wind: { type: "projectile", shape: "ray", pierce: 3, distance: 20 },
  water: { type: "heal", shape: "party", range: 8, target: "ally" },
  metal: { type: "shield", shape: "party", range: 6, target: "ally" },
  dark: { type: "debuff", shape: "circle", range: 6, center: "self" },
  mind: { type: "debuff", shape: "circle", range: 6, center: "self" },
  time: { type: "buff", shape: "party", range: 8, target: "ally" },
  none: { type: "melee", shape: "circle", range: 4, center: "self" },
  life: { type: "heal", shape: "party", range: 10, target: "ally" },
  abyss: { type: "area", shape: "circle", range: 5, center: "self" },
  earth: { type: "shield", shape: "party", range: 6, target: "ally" },
  thunder: { type: "area", shape: "target_area", range: 3.5, distance: 20 },
  fire: { type: "area", shape: "target_area", range: 4, distance: 18 },
  ice: { type: "debuff", shape: "circle", range: 6, center: "self" },
  plant: { type: "heal", shape: "party", range: 8, target: "ally" },
  space: { type: "blink", shape: "self", distance: 12, target: "self" },
  creation: { type: "buff", shape: "party", range: 8, target: "ally" },
  explosion: { type: "area", shape: "circle", range: 5, center: "self" },
};

function effectFor(element, stage) {
  const a = ARCHETYPES[element] || ARCHETYPES.none;
  const k = stage;
  const base = { ...a };
  const fx = {};
  if (a.type === "heal") Object.assign(fx, { power: P(30 * k, 6 * k, { mnd: 0.8 * k, lif: 0.6 * k }, "heal") });
  else if (a.type === "buff") Object.assign(fx, { duration: 300 + 100 * k, buff: { derived: { pct: { physAtk: 8 * k, magAtk: 8 * k, castSpeed: 5 * k } } } });
  else if (a.type === "shield") Object.assign(fx, { duration: 300 + 100 * k, buff: { derived: { pct: { physDef: 12 * k, magDef: 12 * k } } }, resistance: k - 1 });
  else if (a.type === "debuff") Object.assign(fx, { duration: 80 + 20 * k, statusEffects: element === "ice" ? [{ id: "slowness", amplifier: k }] : [{ id: "weakness", amplifier: k - 1 }, { id: "slowness", amplifier: k - 1 }] });
  else if (a.type === "blink") Object.assign(fx, {});
  else Object.assign(fx, { power: P(40 * k, 8 * k, { mag: 0.8 * k, str: 0.4 * k }) });
  return { base, fx };
}

const STAGES = APOSTLE_STAGES.map((faith, i) => ({
  n: i + 1,
  faith,
  rarity: ["rare", "epic", "epic", "legendary", "mythic"][i],
  cost: [15, 25, 35, 50, 80][i],
  cooldown: [300, 360, 420, 600, 1200][i],
}));

/** 最終段階の神の権能（制限は skillEffects と DIVINE_LIMITS） */
const POWER_EFFECT = {
  rewind: { type: "rewind", shape: "self", target: "self" },
  share: { type: "share", shape: "party", target: "ally", range: 10 },
  fortune: { type: "fortune", shape: "party", target: "ally", range: 10 },
  law: { type: "law", shape: "circle", target: "enemy", range: 8 },
  analyze: { type: "analyze", shape: "circle", target: "enemy", range: 16 },
};

function build(god) {
  const out = [];
  // 加護スキル（パッシブ）
  out.push(
    S({
      id: `blessing.${god.id}`,
      name: `${god.name}の加護`,
      description: `${god.domain}を司る神${god.name}の加護。【暫定効果】`,
      category: "blessing",
      god: god.id,
      elements: [god.element],
      rarity: "rare",
      actions: [],
      shape: "self",
      target: "self",
      effect: { type: "passive", buff: { derived: { pct: { maxHp: 3, maxMp: 3 } } } },
      learn: [{ method: "faith", conditions: [{ type: "faithLevel", god: god.id, min: 3 }] }],
      provisional: true,
    })
  );
  // 使徒専用スキル（3段階の進化ルート）
  const names = apostleStageNames(god);
  const detail = GOD_DETAILS[god.id];
  STAGES.forEach((st, i) => {
    const r = effectFor(god.element, Math.min(3, Math.ceil(st.n * 0.7)));
    let { base, fx } = r;
    const power = st.n === 5 && POWER_EFFECT[detail.power];
    if (power) base = { ...power };
    out.push(
      S({
        id: `apostle.${god.id}.${st.n}`,
        name: names[i],
        description: `${god.name}の使徒だけが使える力「${detail.ability}」の第${st.n}段階${st.n === 5 ? "（神の権能の一部）" : ""}。${detail.limit && st.n === 5 ? detail.limit + "。" : ""}【暫定効果】`,
        category: "apostle",
        god: god.id,
        apostleStage: st.n,
        elements: [god.element],
        rarity: st.rarity,
        maxLevel: 10,
        cost: { mp: st.cost },
        cooldown: st.cooldown,
        castTicks: 5 * st.n,
        actions: st.n >= 4 ? ["ultimate", "charge"] : ["charge", "tap"],
        shape: base.shape,
        range: base.range || 0,
        distance: base.distance || 0,
        target: base.target || "enemy",
        duration: fx.duration || 0,
        power: fx.power || (power && ["law", "analyze"].includes(detail.power) ? P(60, 10, { mag: 1, int: 0.6 }) : null),
        effect: { type: base.type, center: base.center, pierce: base.pierce, buff: fx.buff, statusEffects: fx.statusEffects, resistance: fx.resistance, ...(power ? { divinePower: detail.power } : {}) },
        apostleFaith: st.faith,
        evolvesTo: i < STAGES.length - 1 ? [{ to: `apostle.${god.id}.${st.n + 1}`, style: "信仰による進化", conditions: [{ type: "faithLevel", god: god.id, min: STAGES[i + 1].faith }] }] : [],
        learn: [],
        provisional: true,
        fx: { particle: "minecraft:totem_particle", sound: "random.totem" },
      })
    );
  });
  return out;
}

export const DIVINE_SKILLS = gods.all().flatMap(build);
