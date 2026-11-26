// 報酬表（最終仕様 Ver.1.0 第15章）【基盤】
// 実際の報酬表はステージ・装備の制作時（第6弾・第8弾）に追加する。
// entries: [{ id: アイテムID, rarity, chance: 基本確率(0～1), count: [最小, 最大], unique?: true }]
// gold: [最小, 最大]（金貨）、exp: 経験値
import { Registry } from "./registry.js";

export const rewardTables = new Registry("報酬表").registerAll([
  {
    id: "sample",
    sample: true, // テスト用の見本。実際のステージには使わない
    gold: [10, 30],
    exp: 50,
    entries: [
      { id: "sample:herb", rarity: "common", chance: 0.8, count: [1, 3] },
      { id: "sample:ore", rarity: "rare", chance: 0.5, count: [1, 1] },
      { id: "sample:unique_blade", rarity: "unique", chance: 1.0, count: [1, 1], unique: true },
    ],
  },
]);
