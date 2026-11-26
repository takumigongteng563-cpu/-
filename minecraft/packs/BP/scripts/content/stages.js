// =============================================================
// 100固定ステージ（最終仕様 Ver.1.0 第3章）【管理基盤】
// ・ランダム生成はしない。事前制作した固定マップ（構造物ファイル等）を使う
// ・ステージIDは stage001～stage100（保存データに記録されるため変更禁止）
// ・中身（マップ・敵・条件・報酬など）は STAGE_DEFINITIONS に書く。未記入の枠は defined: false
// ・マップ制作・テレポート・攻略処理の本実装は第8弾・第17弾
// =============================================================
import { Registry } from "./registry.js";
import { chapterOfStage } from "./story.js";

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
    buildings: ["castle"],
    repeatable: true,
  },
});

const pad = (n) => String(n).padStart(3, "0");

function buildStages() {
  const out = [];
  for (let n = 1; n <= 100; n++) {
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
      boss: n === 100 ? { kind: "final", id: "majin_noguchi" } : isChapterBoss ? { kind: "chapter", id: null } : null,
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
