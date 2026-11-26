// =============================================================
// 【設定ファイル】職業レベル・職業経験値（第3弾）
// =============================================================

/**
 * 職業レベル L → L+1 に必要な職業経験値
 *   = round(base × L^p × 職業段階の倍率)   段階の倍率・レベル上限は content/jobs/catalog.js の TIER_RULES
 */
export const JOB_EXP_CURVE = Object.freeze({ base: 25, p: 1.5 });

/** 職業レベルが上限のとき、職業の能力値補正・専用能力値は基本値の何倍になるか（Lv1 は 1倍） */
export const JOB_LEVEL_BONUS_AT_MAX = 1.8;

/** プレイヤーが得た経験値のうち、現在の職業の経験値にもなる割合 */
export const JOB_EXP_SHARE = 0.3;

/**
 * 行動ごとの職業経験値（その行動が得意な系統の職業ほど多く得る）
 * per = 何回（何ポイント）ごとに base を得るか
 */
export const JOB_ACTION_EXP = Object.freeze({
  "hit.melee": { line: "warrior", base: 3, per: 1 },
  "hit.ranged": { line: "thief", base: 3, per: 1 },
  "damage.taken.mob": { line: "warrior", base: 1, per: 5 },
  "survive.lowhp": { line: "warrior", base: 5, per: 1 },
  "magic.cast": { line: "mage", base: 4, per: 1 },
  "heal.amount": { line: "priest", base: 1, per: 10 },
  "protect.ally": { line: "priest", base: 5, per: 1 },
  "move.distance": { line: "thief", base: 1, per: 50 },
  "kill.hostile": { line: null, base: 15, per: 1 },
});

/** 引き継げる固有パッシブの枠数（現在の職業の段階ごと）。職業レベルを上限まで上げた職業のパッシブだけを引き継げる */
export const INHERIT_SLOTS = Object.freeze({ 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 });

/**
 * 転職神殿の完成（第15弾）までは、冒険者の書の職業メニューから条件付きの転職を行えるようにする（ワールド設定の初期値）。
 * 管理者は「成長・余剰経験値の設定」で OFF にできる。無条件の転職は管理者テストのみ。
 */
export const DEFAULT_JOB_CHANGE_FROM_MENU = true;
