// =============================================================
// スキルの登録（第4弾）
// ・すべてのスキルはデータ（content/skills/*.js）で定義し、効果は効果の型（effect.type）ごとの共通処理で動く
// ・スキルIDは保存データ（習得・割り当て・プリセット）に記録されるため変更・削除しない
// ・registerSkillExecutor(id, fn) で特定のスキルだけ独自の処理に差し替えることもできる
// =============================================================
import { Registry } from "../registry.js";
import { COMMON_SKILLS } from "./common.js";
import { FUSION_SKILLS, FUSION_RECIPES } from "./fusions.js";
import { WEAPON_SKILLS } from "./weapon.js";
import { LINE_SKILLS, FUSION_LINE_SKILLS } from "./lineSkills.js";
import { TALENT_SKILLS, POTENTIAL_SKILLS, LINK_SKILLS } from "./talentSkills.js";
import { JOB_SKILLS } from "./jobSkills.js";
import { DIVINE_SKILLS } from "./divine.js";
import { EQUIPMENT_SKILLS } from "./equipment.js";

export const SKILL_GROUPS = Object.freeze({
  common: COMMON_SKILLS,
  fusion: FUSION_SKILLS,
  weapon: WEAPON_SKILLS,
  line: LINE_SKILLS,
  fusionLine: FUSION_LINE_SKILLS,
  talent: TALENT_SKILLS,
  potential: POTENTIAL_SKILLS,
  link: LINK_SKILLS,
  job: JOB_SKILLS,
  divine: DIVINE_SKILLS,
  equipment: EQUIPMENT_SKILLS,
});

export const skills = new Registry("スキル").registerAll(Object.values(SKILL_GROUPS).flat());

/** 融合のレシピ */
export const fusionRecipes = new Registry("スキル融合").registerAll(FUSION_RECIPES);

/** 進化元の逆引き { [進化先ID]: 進化元ID[] } */
export const EVOLVES_FROM = (() => {
  const out = {};
  for (const s of skills.all()) for (const e of s.evolvesTo || []) (out[e.to] = out[e.to] || []).push(s.id);
  return out;
})();

/** @type {Map<string, (player: any, ctx: any) => boolean>} 独自処理（効果の型より優先） */
export const skillExecutors = new Map();

export function registerSkillExecutor(id, fn) {
  skillExecutors.set(id, fn);
}

/** 使徒専用スキルか（通常スキルとは別に管理し、契約解除で完全に消える） */
export function isApostleSkill(def) {
  return !!def && def.category === "apostle";
}

/** 実際に効果が動くスキル（名前だけ・未接続のものは数えない） */
export function isConnected(def) {
  return !!def && def.implemented === true && !!def.effect && typeof def.effect.type === "string";
}
