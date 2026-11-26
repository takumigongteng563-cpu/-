// =============================================================
// 【設定ファイル】スキル（第4弾）
// =============================================================

/**
 * 暫定のダメージ換算：RPGの威力 → バニラの体力ダメージ
 * 本格的なダメージ計算（防御・属性相性・クリティカル）は第5弾。
 */
export const DAMAGE_SCALE = 0.1;
/** 1回の発動で与えるダメージの上限（バニラの体力単位） */
export const MAX_DAMAGE_PER_HIT = 200;

/** スキルレベルごとの変化（レベル1からの差分 × 値。上限あり） */
export const SKILL_LEVEL_EFFECTS = Object.freeze({
  costReducePerLevel: 0.02, // 消費MP・スタミナ -2%/Lv
  costReduceMax: 0.3,
  cooldownReducePerLevel: 0.02,
  cooldownReduceMax: 0.3,
  castReducePerLevel: 0.03,
  castReduceMax: 0.4,
  rangePerLevel: 0.03, // 範囲 +3%/Lv
  durationPerLevel: 0.04, // 効果時間 +4%/Lv
  accuracyPerLevel: 1, // 命中性能（第5弾で使用）
});

/** 熟練度：スキルレベル L → L+1 に必要な熟練度 */
export const PROFICIENCY_CURVE = Object.freeze({ base: 20, p: 1.3 });

/** 熟練度の獲得 */
export const PROFICIENCY_GAIN = Object.freeze({
  perHit: 2, // 敵に命中（または回復・強化が仲間に効いた）1回あたり
  maxHitsCounted: 5, // 1回の発動で数える命中数の上限（範囲攻撃の連打稼ぎ防止）
  practice: 1, // 訓練（敵がいない状態での使用）1回あたり。訓練場が解放されている場合のみ
  practicePerDay: 20, // 1スキルあたり1日（ゲーム内）に訓練で得られる上限
  minIntervalTicks: 20, // 同じスキルで熟練度を得られる最短間隔
});

/** スキルポイント */
export const SKILL_POINTS = Object.freeze({
  perPlayerLevel: 1,
  perJobLevels: 5, // 職業レベル5ごとに1
  levelUpCostFactor: 1, // 熟練度が半分以上たまっていれば、(レベル × この値) ポイントでレベルアップできる
});

/** 武器・魔法の熟練度：L → L+1 に必要な経験 */
export const MASTERY_CURVE = Object.freeze({ base: 30, p: 1.3, maxLevel: 50 });

/** 才能の skillAffinity（タグ一致）による補正の上限 */
export const AFFINITY_CAP = Object.freeze({ power: 0.3, cost: 0.25, growth: 0.5 });

/** 召喚の上限 */
export const SUMMON_LIMIT = Object.freeze({ perPlayer: 2, perWorld: 8 });

/** パーティクルの上限（1回の発動あたり） */
export const PARTICLE_LIMIT = 24;

/** 連携スキルの受付時間（tick）：仲間が条件のスキルを使ってからこの時間内なら連携成立 */
export const LINK_WINDOW_TICKS = 60;
export const LINK_POWER_BONUS = 0.5;

/** プリセットの数 */
export const PRESET_SLOTS = 5;

/** 技の触媒（ホットバーに置いて技を使うアイテム）を受け取れる最大数 */
export const MAX_SKILL_FOCUS = 9;

/** 過去の職業の専用スキル（引き継ぎ）を同時に割り当てられる数（現在の職業の段階ごと）。無制限な重複を防ぐ */
export const INHERITED_SKILL_LIMIT = Object.freeze({ 0: 1, 1: 1, 2: 2, 3: 2, 4: 3, 5: 4 });

/** 信仰レベル：L → L+1 に必要な信仰経験値。最大レベル */
export const FAITH_CURVE = Object.freeze({ base: 20, p: 1.4, maxLevel: 30 });
/** 信仰経験値の獲得量（行動1回・属性スキル1回あたり）と最短間隔 */
export const FAITH_GAIN = Object.freeze({ perAction: 1, perSkill: 2, minIntervalTicks: 40 });

/** 隠しスキルの「ひらめき」：条件を満たしたとき、通知を出して習得する（行動を繰り返すと思いがけないスキルを発見） */
export const HIDDEN_DISCOVERY_NOTICE = "§d§l ひらめいた！ §r§d新しいスキルを発見した：";
