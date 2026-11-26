// =============================================================
// NPC（最終仕様 Ver.1.0 第5章・第20章）【基盤】
// 名前・性格・会話・好感度・専用クエスト・師匠などは第12弾で本格的に設定する。
// ※ 本編クリアまで明かさない設定・セリフはパック内に書かないこと（MASTER_SPEC.md のみに記載）
// =============================================================
import { Registry } from "./registry.js";

export const npcs = new Registry("NPC").registerAll([
  {
    id: "hope",
    name: "ホープ",
    gender: "female",
    title: "富里王国の王",
    home: "kingdom",
    joinsParty: false,
    fights: false,
    speechStyle: "語尾を伸ばす",
    lines: {
      greet: ["ここは富里王国でしたぁ〜", "昔はとっても栄えていたんですよぉ〜"],
      goal: ["魔神野口を倒せば元の世界に帰れますよぉ〜", "魔王城はものすごく遠いですけどねぇ〜"],
      stage001: ["まずはこの辺の魔物を倒してほしいですぅ〜"],
    },
  },
]);
