// スキル定義の補助（既定値の補完）
const DEFAULTS = {
  rarity: "common",
  maxLevel: 10,
  cost: { mp: 0, stamina: 0 },
  cooldown: 40,
  castTicks: 0,
  actions: ["tap"],
  condition: null,
  shape: "single",
  range: 0,
  distance: 0,
  target: "enemy",
  duration: 0,
  power: null,
  jobs: null,
  weapons: null,
  talents: null,
  learn: [],
  evolvesTo: [],
  fx: { particle: "minecraft:basic_crit_particle", sound: "random.orb", animation: null },
  tags: [],
  implemented: true,
};

/** スキル定義を作る（省略した項目は既定値） */
export function S(def) {
  const out = { ...DEFAULTS, ...def };
  out.fx = { ...DEFAULTS.fx, ...(def.fx || {}) };
  out.tags = [...new Set([...(def.tags || []), ...(def.elements || []), def.category])];
  return out;
}

/** 威力の式 */
export const P = (base, perLevel, stats, kind = "magic") => ({ base, perLevel, stats, kind });

/** 習得方法 */
export const learn = {
  level: (min) => ({ method: "playerLevel", conditions: [{ type: "level", min }] }),
  sp: (cost, minLevel = 1) => ({ method: "skillPoint", sp: cost, conditions: [{ type: "level", min: minLevel }] }),
  action: (key, min) => ({ method: "action", conditions: [{ type: "counter", key, min }] }),
  grimoire: (id) => ({ method: "grimoire", conditions: [{ type: "item", id: `grimoire_${id}` }] }),
  master: (id) => ({ method: "master", conditions: [{ type: "flag", id: `master:${id}` }] }),
  boss: (n) => ({ method: "boss", conditions: [{ type: "bossKill", min: n }] }),
  stage: (id) => ({ method: "stage", conditions: [{ type: "stageClear", stage: id }] }),
  talent: (id) => ({ method: "talent", conditions: [{ type: "hasTalent", id }] }),
  family: (fam) => ({ method: "talent", conditions: [{ type: "familyCount", families: [fam], min: 1 }] }),
  potential: (id) => ({ method: "potential", conditions: [{ type: "potential", id }] }),
  equipment: (id) => ({ method: "equipment", conditions: [{ type: "uniqueItem", id }] }),
  trial: (id) => ({ method: "godTrial", conditions: [{ type: "trial", id }] }),
  hidden: (conds) => ({ method: "hidden", conditions: conds }),
  mastery: (kind, key, min) => ({ method: kind === "weapon" ? "weaponMastery" : "magicMastery", conditions: [{ type: "mastery", kind, key, min }] }),
};

/** 進化先 */
export const evo = (to, style, conditions) => ({ to, style, conditions });
export const skillMax = (id) => ({ type: "skillLevel", id, min: "max" });
export const skillLv = (id, min) => ({ type: "skillLevel", id, min });
