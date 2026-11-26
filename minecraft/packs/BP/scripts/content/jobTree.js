// 職業ツリーの参照（第3弾で content/jobs/ に移行。互換のための窓口）
import { JOB_LINES } from "./jobs/catalog.js";

export { JOB_LINES };

/** 段階ごとの職業数（検証用） */
export const EXPECTED_PER_TIER = Object.freeze([4, 12, 36, 108, 324]);

/** 職業IDから段階（1～5）を求める（通常職業のみ） */
export function tierOfJobId(id) {
  return id.split(".").length;
}
