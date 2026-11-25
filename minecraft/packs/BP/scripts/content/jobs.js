// 職業の定義
// 第1弾では初期職業「無職」のみ。職業の追加・転職処理は後続の開発で実装する。
// tier（段階）や requires（転職条件）などの項目は将来の拡張用。
import { Registry } from "./registry.js";

export const DEFAULT_JOB_ID = "unemployed";

export const jobs = new Registry("職業").registerAll([
  {
    id: "unemployed",
    name: "無職",
    tier: 0,
    description: "まだ何者でもない。ここから全てが始まる。",
    maxLevel: 10,
  },
]);
