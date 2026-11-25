// =============================================================
// 【設定ファイル】HP・MP・スタミナの回復と消費
// =============================================================
export const VITALS = Object.freeze({
  /** 自然回復の間隔（tick）。20tick = 1秒。派生能力値の「5秒あたり回復量」をこの間隔に換算する */
  regenIntervalTicks: 100,
  /** スタミナ・移動の判定間隔（tick） */
  staminaIntervalTicks: 10,
  /** ダッシュ中のスタミナ消費（1秒あたり） */
  sprintCostPerSecond: 8,
  /** 休息（止まっている・しゃがみ・睡眠）中のスタミナ回復倍率 */
  restMultiplier: 2.5,
  /** 移動中（ダッシュ以外）のスタミナ回復倍率 */
  walkMultiplier: 1.0,
  /** これ以下の速度なら「止まっている」とみなす（ブロック/tick） */
  restSpeed: 0.02,
  /** 1回の判定で数える移動距離の上限（テレポート等を距離に含めない） */
  maxDistancePerSample: 6,
  /** HP 自然回復を行うか（バニラの満腹度による回復とは別に加算） */
  hpRegenEnabled: true,
});

/**
 * スタミナ切れのときの制限（ワールド設定の初期値）
 *   "slow" : 移動低下（鈍化 Lv1 を短時間付与）
 *   "none" : 制限なし
 */
export const DEFAULT_EXHAUSTION_POLICY = "slow";
