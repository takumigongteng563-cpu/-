// 職業の定義
// ・無職（初期職業。484 に含めない）
// ・通常職業 484 枠（content/jobTree.js で生成。中身は第3弾で定義）
// ・隠し職業・特殊職業・クリア後限定職業は別カテゴリで後から追加する
// tier（段階）や requirements（転職条件）などの項目は転職システム（第3弾）が参照する。
import { Registry } from "./registry.js";
import { buildJobTree } from "./jobTree.js";

export const DEFAULT_JOB_ID = "unemployed";

export const jobs = new Registry("職業").registerAll([
  {
    id: "unemployed",
    name: "無職",
    category: "none",
    tier: 0,
    line: null,
    defined: true,
    description: "まだ何者でもない。ここから全てが始まる。",
    maxLevel: 10,
  },
  ...buildJobTree(),
]);

/** 通常職業（484枠） */
export function normalJobs() {
  return jobs.all().filter((j) => j.category === "normal");
}
