// =============================================================
// 110固定ステージ（最終仕様 第3章：本編100＋クリア後10）【管理基盤】
// ・ランダム生成はしない。事前制作した固定マップ（構造物ファイル等）を使う
// ・ステージIDは stage001～stage110（保存データに記録されるため変更禁止）
// ・ステージ101～110は本編クリア（ステージ100）後に解放される（内容は本編クリアまで明かさない）
// ・中身（マップ・敵・条件・報酬など）は STAGE_DEFINITIONS に書く。未記入の枠は defined: false
// ・マップ制作・テレポート・攻略処理の本実装は第8弾・第17弾
// =============================================================
import { Registry } from "./registry.js";
import { chapterOfStage, TOTAL_STAGES, MAIN_STAGES } from "./story.js";

/** 攻略方式（全ステージを同じ構成にしないための分類） */
export const STAGE_TYPES = Object.freeze({
  linear_explore: "一本道の探索",
  free_explore: "自由探索",
  area_liberation: "エリア解放",
  monster_hunt: "魔物討伐",
  boss_battle: "ボス討伐",
  rescue: "住民救出",
  escort: "NPC護衛",
  defense: "防衛",
  puzzle: "謎解き",
  survival: "生存",
  special_trial: "特殊試練",
  story: "会話・ストーリー進行",
});

/**
 * ステージ定義の項目（すべて任意。未設定の項目は既定値）
 *  name            名前
 *  type            攻略方式（STAGE_TYPES のキー）
 *  location        "kingdom"（富里王国内）| "field"（専用マップ）
 *  map             { structure: "mystructure:stage001", origin: {x,y,z}, dimension: "overworld" }  固定マップ
 *  entry           入場地点 {x,y,z}
 *  exit            帰還地点（既定 "kingdom" = 富里王国へ必ず帰還）
 *  enemies         敵配置 [{ type, position, count, level }]
 *  boss            { kind: "chapter"|"mid"|"final", id }
 *  clearCondition  攻略条件 { type: "defeat_all"|"defeat_boss"|"reach"|"protect"|"survive_time"|..., ... }
 *  rewardTable     報酬表ID（content/rewardTables.js）
 *  resetPolicy     再挑戦時のリセット { mode: "full" | "enemies_only" }
 *  residents       初回クリアで富里王国へ移住する住民ID
 *  difficulty      難易度（1～）
 *  estimatedMinutes 想定攻略時間（通常5～15分、高難易度は最大180分）
 *  checkpoints     途中再開・休憩地点 [{ id, position }]
 *  repeatable      クリア後の再挑戦（戦闘ステージは true）
 */
export const STAGE_DEFINITIONS = Object.freeze({
  stage001: {
    name: "富里王国の魔物討伐",
    type: "monster_hunt",
    location: "kingdom",
    clearCondition: { type: "defeat_all" },
    difficulty: 1,
    estimatedMinutes: 10,
    // 初回クリアで王国のマップが変化し、本格的な復興が始まる（kingdomPhaseAfter）
    kingdomPhaseAfter: "restoring",
    buildings: ["castle", "job_temple"],
    repeatable: true,
  },
  // 第1章の施設の解放順（第4弾で確定）：1 王城・転職神殿 → 2 道具屋 → 3 武器屋 → 4 防具屋 → 5 教会
  // → 6 鍛冶場 → 7 魔法研究所 → 8 倉庫 → 9 冒険者ギルド → 10 訓練場
  stage002: { buildings: ["item_shop"] },
  stage003: { buildings: ["weapon_shop"] },
  stage004: { buildings: ["armor_shop"] },
  stage005: { buildings: ["church"] },
  stage006: { buildings: ["smithy"] },
  stage007: { buildings: ["magic_lab"] },
  stage008: { buildings: ["warehouse"] },
  stage009: { buildings: ["guild"] },
  stage010: { buildings: ["training"] },
  // 第3章の最後：神々の迷宮への道が開かれる（ホープから最初のアーティファクトを受け取る）
  stage030: { unlocksLabyrinth: true },
});

/** 決戦のステージ（第4弾で確定） */
const BOSS_STAGES = {
  94: { kind: "general", id: "general_sumire" }, // 三魔将・菫との決着
  95: { kind: "general", id: "general_yagi" }, // 三魔将・山羊との決着
  96: { kind: "general", id: "general_suigyu" }, // 三魔将・水牛との決着
  98: { kind: "final", id: "majin_noguchi", phase: 1 },
  99: { kind: "final", id: "majin_noguchi", phase: 2 },
  100: { kind: "final", id: "majin_noguchi", phase: 3 },
  110: { kind: "postgame_final", id: "stage110_boss" },
};

const pad = (n) => String(n).padStart(3, "0");

function buildStages() {
  const out = [];
  for (let n = 1; n <= TOTAL_STAGES; n++) {
    const id = `stage${pad(n)}`;
    const def = STAGE_DEFINITIONS[id];
    const isChapterBoss = n % 10 === 0;
    out.push({
      id,
      number: n,
      chapter: chapterOfStage(n),
      name: `ステージ${n}`,
      type: null,
      location: "field",
      exit: "kingdom",
      boss: BOSS_STAGES[n] || (isChapterBoss ? { kind: "chapter", id: null } : null),
      postgame: n > MAIN_STAGES,
      enemies: [],
      residents: [],
      buildings: [],
      checkpoints: [],
      resetPolicy: { mode: "full" },
      repeatable: true,
      difficulty: Math.ceil(n / 2),
      defined: !!def,
      ...(def || {}),
    });
  }
  return out;
}

export const stages = new Registry("ステージ").registerAll(buildStages());

export function stageIdOf(n) {
  return `stage${pad(n)}`;
}

export const FIRST_STAGE_ID = "stage001";
