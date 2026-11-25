// 冒険者ランクの定義
// 第1弾では「未登録」のみ。ギルド登録・昇格処理は後続の開発で実装する。
import { Registry } from "./registry.js";

export const DEFAULT_RANK_ID = "unregistered";

export const adventurerRanks = new Registry("冒険者ランク").registerAll([
  { id: "unregistered", name: "未登録", order: 0 },
]);
