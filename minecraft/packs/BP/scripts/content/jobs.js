// =============================================================
// 職業の登録（第3弾）
// ・無職（初期職業。484 に含めない）
// ・通常職業 484（content/jobs/jobFactory.js がツリーデータから作る）
// ・隠し職業（content/jobs/hidden.js。発見するまで表示しない）
// IDは保存データ（現在の職業・職業レベル・転職履歴）に記録されるため変更禁止。
// =============================================================
import { Registry } from "./registry.js";
import { buildAllJobs } from "./jobs/jobFactory.js";
import { HIDDEN_JOBS } from "./jobs/hidden.js";
import { TIER_RULES } from "./jobs/catalog.js";

export const DEFAULT_JOB_ID = "unemployed";

export const UNEMPLOYED = Object.freeze({
  id: "unemployed",
  code: "",
  name: "無職",
  category: "none",
  tier: 0,
  tierName: "無職",
  line: null,
  parent: null,
  children: ["warrior", "mage", "thief", "priest"],
  defined: true,
  description: "まだ何者でもない。ここから全てが始まる。",
  role: null,
  weapons: [],
  elements: [],
  stats: { flat: {} },
  growth: {},
  special: { flat: {} },
  levelCap: TIER_RULES[0].levelCap,
  requirements: [],
});

export const jobs = new Registry("職業").registerAll([UNEMPLOYED, ...buildAllJobs(), ...HIDDEN_JOBS.map((h) => ({ parent: null, children: [], fusedLines: [], composition: null, defined: true, ...h, levelCap: h.levelCap ?? 50 }))]);

/** 通常職業（484） */
export function normalJobs() {
  return jobs.all().filter((j) => j.category === "normal");
}

export function hiddenJobs() {
  return jobs.all().filter((j) => j.category === "hidden");
}

export function jobsOfTier(tier) {
  return normalJobs().filter((j) => j.tier === tier);
}
