// =============================================================
// 【設定ファイル】ステージ報酬（最終仕様 Ver.1.0 第15章）
// 報酬はプレイヤーごとに個別抽選。確率・上限はここで調整する。
//
// 1項目ごとの当選確率 = 基本確率 × 希少度倍率 × 難易度倍率 × (1 + 幸運補正 + 才能補正 + 周回補正)
//   幸運補正 = min(luckMax, (幸運 − 5) × luckPerPoint)
//   周回補正 = min(repeatMax, クリア回数 × repeatPerClear)   ← 周回するほど上がるが上限あり
//   当選確率は最終的に maxChance を超えない
// =============================================================

export const RARITIES = Object.freeze([
  { id: "common", name: "一般", multiplier: 1.0 },
  { id: "uncommon", name: "良品", multiplier: 0.6 },
  { id: "rare", name: "希少", multiplier: 0.3 },
  { id: "epic", name: "英雄", multiplier: 0.1 },
  { id: "legendary", name: "伝説", multiplier: 0.03 },
  { id: "mythic", name: "超希少", multiplier: 0.005 },
  { id: "unique", name: "世界唯一", multiplier: 0.001 },
]);

export const REWARD_MODIFIERS = Object.freeze({
  luckPerPoint: 0.01,
  luckMax: 0.5,
  repeatPerClear: 0.02,
  repeatMax: 0.3,
  /** 難易度1ごとの倍率の増加 */
  difficultyPerLevel: 0.05,
  maxChance: 0.95,
});
