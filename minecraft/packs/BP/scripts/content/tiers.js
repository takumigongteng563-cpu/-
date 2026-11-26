// 存在階級の参照（定義・上限値は balance/progression.js）
import { EXISTENCE_TIERS } from "../balance/progression.js";

export function tierForStage(stage) {
  const s = Math.max(0, Math.min(EXISTENCE_TIERS.length - 1, Math.floor(stage || 0)));
  return EXISTENCE_TIERS[s];
}

export function levelCapForStage(stage) {
  return tierForStage(stage).cap;
}

/** 能力値の成長上限（基礎＋成長＋振り分け） */
export function statCapForStage(stage) {
  return tierForStage(stage).statCap;
}

export function nextTier(stage) {
  return EXISTENCE_TIERS[Math.floor(stage || 0) + 1];
}

export { EXISTENCE_TIERS };
