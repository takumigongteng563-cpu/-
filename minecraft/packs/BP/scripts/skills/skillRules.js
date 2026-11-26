// =============================================================
// スキルの規則（純粋な計算。@minecraft/server に依存しない）
// ・使用条件（職業・系統・武器・才能・潜在能力・使徒・装備）
// ・スキルレベル・熟練度による性能の変化、才能の親和による補正
// ・パッシブスキルの能力値補正
// =============================================================
import { skills, isApostleSkill } from "../content/skills.js";
import { jobs } from "../content/jobs.js";
import { talents } from "../content/talents/index.js";
import { activeFamilies, currentJobLines, checkCondition, setDescribeEnv } from "../talents/conditions.js";
import { gods } from "../content/gods.js";
import { WEAPONS, ELEMENT_NAMES } from "../content/jobs/catalog.js";
import { SKILL_LEVEL_EFFECTS as LV, PROFICIENCY_CURVE, MASTERY_CURVE, AFFINITY_CAP, INHERITED_SKILL_LIMIT, FAITH_CURVE } from "../balance/skills.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 条件の説明文でスキル名・神名・武器名を表示する
setDescribeEnv({
  skillName: (id) => skills.get(id)?.name ?? id,
  godName: (id) => gods.get(id)?.name ?? id,
  weaponName: (w) => WEAPONS[w] ?? w,
  masteryName: (kind, key) => (kind === "weapon" ? WEAPONS[key] : ELEMENT_NAMES[key]) ?? key,
});

export function maxLevelOf(id) {
  const d = skills.get(id);
  return d ? d.maxLevel : 1;
}

/** 条件判定に渡す env（スキルの最大レベルを解決する） */
export function skillEnv(world) {
  return { world, skillMaxLevel: maxLevelOf };
}

/** スキルレベル L → L+1 に必要な熟練度 */
export function proficiencyToNext(level) {
  return Math.max(1, Math.round(PROFICIENCY_CURVE.base * Math.pow(Math.max(1, level), PROFICIENCY_CURVE.p)));
}

/** 武器・魔法の熟練度 L → L+1 */
export function masteryToNext(level) {
  return Math.max(1, Math.round(MASTERY_CURVE.base * Math.pow(Math.max(1, level), MASTERY_CURVE.p)));
}

export function faithToNext(level) {
  return Math.max(1, Math.round(FAITH_CURVE.base * Math.pow(Math.max(1, level), FAITH_CURVE.p)));
}

/** 習得記録（使徒専用スキルは data.apostle.skills、それ以外は data.skills.learned） */
export function learnedRecord(data, id) {
  const def = skills.get(id);
  if (!def || !data) return undefined;
  if (isApostleSkill(def)) return data.apostle && data.apostle.god === def.god ? data.apostle.skills[id] : undefined;
  return data.skills.learned[id];
}

/** スキルに関係するタグ（才能の skillAffinity との照合用） */
export function affinityTags(def) {
  const t = new Set(def.tags || []);
  for (const w of def.weapons || []) t.add(w);
  if (["attack_magic", "element_magic", "heal", "support", "defense", "summon", "control", "status"].includes(def.category) || (def.power && def.power.kind === "magic")) t.add("magic");
  if (def.category === "heal" || (def.effect && def.effect.type === "heal")) t.add("heal");
  if (def.category === "summon") t.add("summon");
  return t;
}

/** 才能の親和（skillAffinity）の合計。威力・消費・成長速度に使う */
export function affinityOf(def, data) {
  const tags = affinityTags(def);
  let sum = 0;
  for (const a of data.talents.active) {
    const t = talents.get(a.id);
    if (!t || !t.skillAffinity) continue;
    for (const [k, v] of Object.entries(t.skillAffinity)) if (tags.has(k)) sum += Number(v) || 0;
  }
  return sum;
}

/** 熟練度の上がりやすさ（パッシブ・才能による補正。1 = 通常） */
export function growthMultiplier(def, data) {
  let bonus = Math.min(AFFINITY_CAP.growth, affinityOf(def, data));
  for (const [id] of Object.entries(data.skills.learned)) {
    const p = skills.get(id);
    if (p && p.effect && p.effect.type === "passive" && p.effect.proficiencyBonus) bonus += p.effect.proficiencyBonus;
  }
  return 1 + clamp(bonus, 0, 1);
}

/**
 * スキルの実際の性能（レベル・才能の親和で変化）
 * @returns {{level:number, power:number, mp:number, stamina:number, cooldown:number, castTicks:number, range:number, distance:number, duration:number, accuracy:number}}
 */
export function skillStats(def, rec, data) {
  const level = clamp(rec ? rec.level || 1 : 1, 1, def.maxLevel || 1);
  const d = level - 1;
  const aff = affinityOf(def, data);
  const costMul = (1 - Math.min(LV.costReduceMax, d * LV.costReducePerLevel)) * (1 - Math.min(AFFINITY_CAP.cost, aff * 0.5));
  const cdMul = 1 - Math.min(LV.cooldownReduceMax, d * LV.cooldownReducePerLevel);
  const castMul = 1 - Math.min(LV.castReduceMax, d * LV.castReducePerLevel);
  let power = 0;
  if (def.power) {
    const p = (data.computed && data.computed.primary) || {};
    power = def.power.base + def.power.perLevel * d;
    for (const [s, c] of Object.entries(def.power.stats || {})) power += c * (p[s] ?? data.stats[s] ?? 0);
    power *= 1 + Math.min(AFFINITY_CAP.power, aff);
  }
  return {
    level,
    power: Math.round(power * 10) / 10,
    mp: Math.ceil(((def.cost && def.cost.mp) || 0) * costMul),
    stamina: Math.ceil(((def.cost && def.cost.stamina) || 0) * costMul),
    cooldown: Math.max(0, Math.round((def.cooldown ?? def.cooldownTicks ?? 0) * cdMul)),
    castTicks: Math.max(0, Math.round((def.castTicks || 0) * castMul)),
    range: Math.round((def.range || 0) * (1 + d * LV.rangePerLevel) * 10) / 10,
    distance: def.distance || 0,
    duration: Math.round((def.duration || 0) * (1 + d * LV.durationPerLevel)),
    accuracy: d * LV.accuracyPerLevel,
  };
}

/** 引き継ぎ（過去の職業の専用スキル）の同時使用の上限 */
export function inheritedSkillLimit(data) {
  const cur = jobs.get(data.job.current);
  return INHERITED_SKILL_LIMIT[cur ? cur.tier : 0] ?? 0;
}

/** 職業専用スキルが「引き継ぎ」で使えるか（現在の職業以外） */
function inheritUsable(def, data) {
  const jobId = def.jobs[0];
  if (!def.inherit) return false;
  if (!(data.job.held || []).includes(jobId)) return false;
  const l = data.job.levels[jobId];
  if (!l || l.level < def.inherit.jobLevel) return false;
  const cur = jobs.get(data.job.current);
  return !!cur && Array.isArray(cur.weapons) && (def.inherit.weapons || []).some((w) => cur.weapons.includes(w));
}

/** 職業スキルの使い方（"current"＝現在の職業 / "inherited"＝引き継ぎ / null＝使えない / "free"＝職業の制限なし） */
export function jobUsage(def, data) {
  if (!def.jobs) return "free";
  if (def.jobs.includes(data.job.current)) return "current";
  return inheritUsable(def, data) ? "inherited" : null;
}

/**
 * 使用条件を満たしているか（習得済みかどうかは見ない）
 * @returns {{ok: boolean, reason?: string, inherited?: boolean}}
 */
export function usability(def, data, world) {
  if (!def) return { ok: false, reason: "存在しないスキル" };
  const usage = jobUsage(def, data);
  if (usage === null) return { ok: false, reason: "今の職業では使えない" };
  if (def.lines && !def.lines.some((l) => currentJobLines(data).has(l))) return { ok: false, reason: "今の職業の系統では使えない" };
  if (def.fusionLines) {
    const set = currentJobLines(data);
    if (!def.fusionLines.every((l) => set.has(l))) return { ok: false, reason: "職業融合の条件を満たしていない" };
  }
  if (def.weapons && !def.jobs && def.category !== "job") {
    const cur = jobs.get(data.job.current);
    if (!cur || !Array.isArray(cur.weapons) || !def.weapons.some((w) => cur.weapons.includes(w))) return { ok: false, reason: "この武器を扱う職業ではない" };
  }
  if (def.talentFamilies) {
    const fam = activeFamilies(data);
    if (!def.talentFamilies.some((f) => fam.has(f))) return { ok: false, reason: "必要な才能がない" };
  }
  if (def.potential && !data.hiddenPotential.entries.some((e) => e && e.awakened && !e.legacy && e.id === def.potential)) return { ok: false, reason: "潜在能力が覚醒していない" };
  if (isApostleSkill(def)) {
    if (!data.apostle || data.apostle.god !== def.god) return { ok: false, reason: "使徒契約がない" };
    if (!data.apostle.skills[def.id]) return { ok: false, reason: "使徒の力が足りない" };
  }
  if (def.equipment && !checkCondition({ type: "uniqueItem", id: def.equipment }, data, { world })) return { ok: false, reason: "必要な装備を持っていない" };
  const c = def.condition;
  if (c) {
    if (c.minLevel && data.level < c.minLevel) return { ok: false, reason: `レベル${c.minLevel}以上で使える` };
    if (c.hpBelow && !(data.vitals.hpMax > 0 && data.vitals.hp / data.vitals.hpMax <= c.hpBelow)) return { ok: false, reason: `HPが${Math.round(c.hpBelow * 100)}%以下のときだけ使える` };
  }
  return { ok: true, inherited: usage === "inherited" };
}

/** 習得済みで、いま使えるパッシブスキル（能力値の計算に使う） */
export function activePassives(data, world) {
  const out = [];
  for (const id of Object.keys(data.skills.learned)) {
    const def = skills.get(id);
    if (!def || !def.effect || def.effect.type !== "passive") continue;
    if (!usability(def, data, world).ok) continue;
    out.push(def);
  }
  return out;
}

/** パッシブスキルの能力値補正（stats/statCalc の collectModifiers から使う） */
export function passiveModifiers(data) {
  return activePassives(data, undefined)
    .filter((def) => def.effect.buff)
    .map((def) => ({ layer: "skill", id: `skill:${def.id}`, name: `スキル：${def.name}`, def: def.effect.buff }));
}

/** 割り当てのうち引き継ぎスキルの数 */
export function countInheritedBindings(data, slots = data.skillBindings.slots) {
  const seen = new Set();
  for (const s of slots) for (const id of Object.values(s || {})) {
    if (!id || seen.has(id)) continue;
    const def = skills.get(id);
    if (def && def.jobs && jobUsage(def, data) === "inherited") seen.add(id);
  }
  return seen.size;
}
