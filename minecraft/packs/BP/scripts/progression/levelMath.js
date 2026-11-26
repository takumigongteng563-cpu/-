// レベル計算（純粋な計算）
import { EXP_CURVE, OVERFLOW_STORE_LEVELS } from "../balance/progression.js";
import { tierForStage } from "../content/tiers.js";

/**
 * レベル L から L+1 に必要な経験値。
 * 限界突破の段階（stage）が上がるほど、存在階級の expMultiplier 倍だけ必要量が増える。
 */
export function expToNext(level, stage = 0) {
  const L = Math.max(1, Math.floor(level));
  const mult = tierForStage(stage).expMultiplier ?? 1;
  const v = Math.round((EXP_CURVE.a * Math.pow(L, EXP_CURVE.p) + EXP_CURVE.b * L + EXP_CURVE.c) * mult);
  return Math.max(1, Math.min(EXP_CURVE.max, v));
}

/** レベル1からレベル L に到達するまでの累計経験値（stage 固定で計算） */
export function totalExpToReach(level, stage = 0) {
  let t = 0;
  for (let l = 1; l < level; l++) t += expToNext(l, stage);
  return t;
}

/** 上限で保留できる経験値の最大量 */
export function overflowStoreCap(cap, stage = 0) {
  return expToNext(cap, stage) * OVERFLOW_STORE_LEVELS;
}

/**
 * 経験値を加える（余剰は次のレベルへ繰り越し、複数レベル上昇にも対応）。
 * @param {{level: number, exp: number, overflow: number}} state
 * @param {number} amount 加える経験値（0以上の整数）
 * @param {{cap: number, policy: "store"|"discard", stage?: number}} opt
 * @returns {{level: number, exp: number, overflow: number, levelsGained: number, stored: number, discarded: number}}
 */
export function addExp(state, amount, opt) {
  let level = Math.max(1, Math.floor(state.level));
  let exp = Math.max(0, Math.floor(state.exp));
  let overflow = Math.max(0, Math.floor(state.overflow || 0));
  let rest = Math.max(0, Math.floor(amount));
  let levelsGained = 0;
  let stored = 0;
  let discarded = 0;

  if (level >= opt.cap) {
    // すでに上限
    exp = 0;
  } else {
    exp += rest;
    rest = 0;
    while (level < opt.cap) {
      const need = expToNext(level, opt.stage || 0);
      if (exp < need) break;
      exp -= need;
      level++;
      levelsGained++;
    }
    if (level >= opt.cap) {
      rest = exp; // 上限到達後の余り
      exp = 0;
    }
  }
  if (rest > 0) {
    if (opt.policy === "store") {
      const room = Math.max(0, overflowStoreCap(opt.cap, opt.stage || 0) - overflow);
      stored = Math.min(room, rest);
      overflow += stored;
      discarded = rest - stored;
    } else {
      discarded = rest;
    }
  }
  return { level, exp, overflow, levelsGained, stored, discarded };
}
