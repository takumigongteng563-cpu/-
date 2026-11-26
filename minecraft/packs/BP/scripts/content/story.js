// =============================================================
// メインストーリー：一本道・全10章（最終仕様 Ver.1.0 第2章・第3章）
// 10ステージで1つの物語。各章の最後のステージに章ボス。
// 章のタイトル・あらすじは第17弾（ストーリーとマップ）で確定する。ここでは構造のみ。
// ※ 本編クリアまで明かさない情報は、このファイルを含むパック内に書かないこと（MASTER_SPEC.md のみに記載）
// =============================================================
import { Registry } from "./registry.js";

const ch = (n, title) => ({
  id: `chapter${String(n).padStart(2, "0")}`,
  number: n,
  title,
  firstStage: (n - 1) * 10 + 1,
  lastStage: n * 10,
  bossStage: n * 10,
  defined: false, // あらすじ・演出は未設定
});

export const chapters = new Registry("章").registerAll([
  { ...ch(1, "第1章"), summary: "滅亡寸前の富里王国で、女王ホープと出会う。", defined: true },
  ch(2, "第2章"),
  ch(3, "第3章"),
  ch(4, "第4章"),
  ch(5, "第5章"),
  ch(6, "第6章"),
  ch(7, "第7章"),
  ch(8, "第8章"),
  ch(9, "第9章"),
  { ...ch(10, "最終章"), summary: "魔神野口との最終決戦（ステージ100）。" },
]);

export const CHAPTER_COUNT = 10;

/** ステージ番号（1～100）から章番号 */
export function chapterOfStage(stageNumber) {
  return Math.min(CHAPTER_COUNT, Math.max(1, Math.ceil(stageNumber / 10)));
}
