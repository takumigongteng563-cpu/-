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

// 第4弾：各章の主題（構成のみ。会話・演出は第17弾）
export const chapters = new Registry("章").registerAll([
  { ...ch(1, "第1章"), summary: "滅亡寸前の富里王国で、女王ホープと出会う。王国の復興が始まる（チュートリアル）。", defined: true },
  { ...ch(2, "第2章"), summary: "周辺の村や街を救い、住民を富里王国へ迎える。" },
  { ...ch(3, "第3章"), summary: "隣国への遠征と古代遺跡。神々の迷宮への道が開かれる。" },
  { ...ch(4, "第4章"), summary: "魔神軍の三魔将との初めての接触。" },
  { ...ch(5, "第5章"), summary: "魔神軍との全面戦争。" },
  { ...ch(6, "第6章"), summary: "富里王国防衛戦。" },
  { ...ch(7, "第7章"), summary: "三魔将との再戦。" },
  { ...ch(8, "第8章"), summary: "魔神野口との初対面。" },
  { ...ch(9, "第9章"), summary: "魔王城への大遠征。" },
  { ...ch(10, "最終章"), summary: "魔王城攻略。三魔将との決着（ステージ94～96）と魔神野口との最終決戦（ステージ98～100）。" },
  // 本編クリア後に解放される章（内容は本編クリアまで明かさない）
  { ...ch(11, "裏章"), postgame: true, summary: "本編クリア後に解放される物語。" },
]);

/** 本編の章数（ストーリーの進行 story.chapter は 1～10） */
export const CHAPTER_COUNT = 10;
/** クリア後の章（ステージ101～110） */
export const POSTGAME_CHAPTER = 11;
/** 全ステージ数（本編100＋クリア後10） */
export const TOTAL_STAGES = 110;
export const MAIN_STAGES = 100;

/** ステージ番号（1～110）から章番号 */
export function chapterOfStage(stageNumber) {
  if (stageNumber > MAIN_STAGES) return POSTGAME_CHAPTER;
  return Math.min(CHAPTER_COUNT, Math.max(1, Math.ceil(stageNumber / 10)));
}
