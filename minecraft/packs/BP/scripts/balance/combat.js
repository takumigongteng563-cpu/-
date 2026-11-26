// =============================================================
// 【設定ファイル】戦闘（第5弾）。20tick = 1秒。すべて暫定値（実機の戦闘テストで調整）
// =============================================================
export const COMBAT = Object.freeze({
  /** 戦闘の数値をバニラの体力へ換算する倍率（バニラの体力20＝敵の基準） */
  vanillaScale: 0.1,
  /** 1回のダメージの上限（戦闘の数値）。極端な能力値でも無限大にならない */
  maxDamage: 99999,
  /** 防御による軽減：damage × atk / (atk + def × defFactor)。防御0でも1倍を超えない */
  defFactor: 1.0,
  /** クリティカル倍率の上限 / 属性倍率の上限（大弱点の重複を防ぐ） / 全体倍率の上限 */
  critMax: 3.0,
  elementMax: 2.0,
  totalMultMax: 8.0,
  /** 熟練度補正：スキルレベル1ごと +2%（上限 +40%） */
  masteryPerLevel: 0.02,
  masteryMax: 0.4,
  /** 部位弱点・体勢崩し中の倍率 */
  partWeakMult: 1.3,
  brokenMult: 1.5,
  /** 戦闘の区切り：最後の攻撃からこの時間で戦闘終了（一時効果の解除・ログの確定） */
  combatEndTicks: 200,
});

/** ガード・回避（調整可能） */
export const DEFENSE = Object.freeze({
  guardReduce: 0.5, // 通常ガードの軽減率
  guardStaminaPerDamage: 0.5, // 受けるダメージ1あたりのスタミナ消費（戦闘の数値）
  justGuardWindow: 6, // しゃがみ始めてからこの時間内に攻撃を受けるとジャストガード
  justGuardReduce: 0.9,
  justGuardStaminaMult: 0.2,
  justGuardPoise: 25, // 攻撃した敵の体勢値を削る
  dodgeWindow: 8, // 回避の無敵時間（tick）
  justDodgeWindow: 4, // 回避の開始からこの時間内に攻撃を受けるとジャスト回避
  dodgeCooldown: 24, // 回避の再使用待ち（無限に回避して無敵にならない）
  dodgeStamina: 15,
  counterWindow: 40, // ジャストガード・ジャスト回避の後、反撃が強くなる時間
  counterMult: 1.5,
});

/** コンボ（同じ技の繰り返しは数えない・時間切れで終わる） */
export const COMBO = Object.freeze({
  windowTicks: 40, // 次の攻撃までの猶予
  bonusPerHit: 0.04, // 1段ごとの追加ダメージ
  bonusMax: 0.4,
  sameSkillLimit: 2, // 同じ技は連続2回目までしか段数を増やさない（永久コンボ防止）
  maxCount: 30,
  airBonus: 0.1, // 空中コンボ
  elementSwap: 0.1, // 直前と違う属性で攻撃（属性コンボ）
});

/** 状態異常のボス対策：同じ状態異常を受けるたびの累積耐性 */
export const STATUS_TOLERANCE = Object.freeze({
  perApply: 0.25, // 1回ごとに確率・効果時間 -25%
  max: 0.9,
  decayTicks: 400, // 付与されない時間が続くと累積耐性が減る
  bossChanceMult: 0.5, // boss_like の敵は確率が半分
  controlMaxTicksBoss: 40, // ボスへの行動妨害の最長時間
  tickInterval: 20, // 継続効果をまとめて処理する間隔
});

/** ヘイト */
export const HATE = Object.freeze({
  perDamage: 1,
  perHeal: 0.6,
  provoke: 300,
  protect: 80,
  nearPerSecond: 3, // 近くにいる（4ブロック以内）
  nearRadius: 4,
  decayPerSecond: 0.05, // 1秒ごとに5%ずつ減る
  tankMult: 1.5, // 盾役・守護回復の職業はヘイトが増えやすい
  switchMargin: 1.2, // 今の標的より20%以上高いときだけ標的を変える（ちらつき防止）
});

/** 参加人数による敵の補正（HP のみ。攻撃力は人数に比例して上げない） */
export const PARTY_SCALING = Object.freeze({ hp: { 1: 1.0, 2: 1.6, 3: 2.2, 4: 2.8 }, attack: { 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0 }, radius: 32 });

/** 戦闘ログ */
export const COMBAT_LOG = Object.freeze({ keepBattles: 5, keepSkills: 10 });

/** 処理負荷の上限 */
export const COMBAT_LIMITS = Object.freeze({ trackedEnemies: 64, fieldsPerSecond: 8, particlesPerField: 12, statusTickBatch: 64 });

/** 神の権能の制限（指示書第20章） */
export const DIVINE_LIMITS = Object.freeze({ rewindTicks: 100, fortuneCritMax: 20, shareStatRatio: 0.15, shareMax: 50, goldPerUse: 0 });
