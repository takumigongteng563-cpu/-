// =============================================================
// 富里王国（最終仕様 Ver.1.0 第4章）【復興データの基盤】
// ・住民（residents）と建物（buildings）と施設（facilities）を定義する
// ・ステージを初めてクリアすると、そのステージの residents が移住し、
//   住民・ステージに紐づく buildings が建設され、建物の facility が解放される
// ・約100棟の建物・具体的な解放順は第15弾・第17弾で設定する
// =============================================================
import { Registry } from "./registry.js";

/** 王国の状態 */
export const KINGDOM_PHASES = Object.freeze({
  ruined: "滅亡寸前",
  restoring: "復興中",
  capital: "王都",
});

/** 施設 */
export const facilities = new Registry("施設").registerAll([
  { id: "castle", name: "王城" },
  { id: "item_shop", name: "道具屋" },
  { id: "weapon_shop", name: "武器屋" },
  { id: "armor_shop", name: "防具屋" },
  { id: "smithy", name: "鍛冶場" },
  { id: "guild", name: "冒険者ギルド" },
  { id: "job_temple", name: "転職神殿" },
  { id: "church", name: "教会" },
  { id: "magic_lab", name: "魔法研究所" },
  { id: "training", name: "訓練場" },
  { id: "warehouse", name: "倉庫" },
  { id: "library", name: "図書館" },
  { id: "inn", name: "宿屋" },
  { id: "trial_temple", name: "試練の神殿" },
  { id: "house", name: "民家" },
  { id: "barracks", name: "兵舎" },
]);

/** 開始時点で使える施設（宿屋のみ） */
export const INITIAL_FACILITIES = Object.freeze(["inn"]);

/** 住民。first = 開始時点からいる住民（ホープのみ） */
export const residents = new Registry("住民").registerAll([
  { id: "hope", name: "ホープ", role: "富里王国の王", initial: true, buildings: [] },
]);

/**
 * 建物。structure = 建築データ（構造物ファイルのID。第15弾で作成）
 * facility = この建物が解放する施設
 */
export const buildings = new Registry("建物").registerAll([
  { id: "castle", name: "王城", facility: "castle", structure: null, defined: false },
  { id: "inn", name: "宿屋", facility: "inn", structure: null, defined: false },
  // 第4弾：第1章で解放される施設の建物（建築データは第15弾）
  { id: "job_temple", name: "転職神殿", facility: "job_temple", structure: null, defined: false },
  { id: "item_shop", name: "道具屋", facility: "item_shop", structure: null, defined: false },
  { id: "weapon_shop", name: "武器屋", facility: "weapon_shop", structure: null, defined: false },
  { id: "armor_shop", name: "防具屋", facility: "armor_shop", structure: null, defined: false },
  { id: "church", name: "教会", facility: "church", structure: null, defined: false },
  { id: "smithy", name: "鍛冶場", facility: "smithy", structure: null, defined: false },
  { id: "magic_lab", name: "魔法研究所", facility: "magic_lab", structure: null, defined: false },
  { id: "warehouse", name: "倉庫", facility: "warehouse", structure: null, defined: false },
  { id: "guild", name: "冒険者ギルド", facility: "guild", structure: null, defined: false },
  { id: "training", name: "訓練場", facility: "training", structure: null, defined: false },
]);

/**
 * 施設の強化（第4弾：基盤）。金貨・素材の提供でワールド全体の施設レベルが上がる。
 * 強化による具体的な効果（品ぞろえ・割引など）は各施設の実装（第6弾・第15弾）で設定する。
 * cost(level) = 次のレベルに必要な金貨
 */
export const FACILITY_UPGRADE = Object.freeze({ maxLevel: 10, goldBase: 500, goldGrowth: 1.6 });

/** 最終的な建物数の目標（約100棟） */
export const TARGET_BUILDING_COUNT = 100;
