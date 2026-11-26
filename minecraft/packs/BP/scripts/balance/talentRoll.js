// =============================================================
// 【設定ファイル】初期才能の抽選・潜在能力の形成
// 1. 等級を下の確率で抽選する
// 2. その等級の初期才能の中から、各才能の weight（重み）で1つ選ぶ
// 最終仕様 Ver.1.0：初期才能は全員1個
// =============================================================

/** 等級の抽選確率（%）。合計 100 */
export const GRADE_WEIGHTS = Object.freeze({
  F: 30,
  E: 25,
  D: 18,
  C: 12,
  B: 7,
  A: 4.5,
  S: 2.4,
  SS: 0.8,
  SSS: 0.25,
  EX: 0.05,
});

/** 初期才能の数（最終仕様：全員1個） */
export const INITIAL_TALENT_SLOTS = Object.freeze({ base: 1, extraChance: 0 });

/**
 * 第2弾（v0.2.0）で2個以上の初期才能を得ていたプレイヤーの扱い（データ移行時）
 *   "archive" : 最初の1個だけ有効にし、残りは記録（talents.archived）に移して無効化する（削除はしない）
 *   "keep"    : すべて有効のまま残す
 */
export const LEGACY_EXTRA_INNATE_POLICY = "archive";

/**
 * 潜在能力の形成（最終仕様 第8章：行動・職業・戦闘スタイル・攻略実績から形成）
 * 形成スコア = Σ(行動回数 ÷ 単位 × 重み) ＋ 職業・才能系統のボーナス
 * 最も高いスコアが「閾値 × (形成済みの数 + 1)」を超えると、その潜在能力が形成される（本人には非公開）。
 */
export const POTENTIAL_FORMATION = Object.freeze({
  threshold: 30,
  maxFormed: 3,
  /** 行動キーごとの「1点」に相当する量 */
  units: {
    "hit.melee.sword": 100,
    "hit.melee.axe": 100,
    "hit.melee.spear": 100,
    "hit.melee.mace": 100,
    "hit.melee.unarmed": 100,
    "hit.ranged.bow": 80,
    "hit.ranged.crossbow": 80,
    "hit.ranged.trident": 60,
    "kill.hostile": 40,
    "kill.night": 20,
    "kill.strong": 1,
    "damage.taken.mob": 300,
    "survive.lowhp": 5,
    "move.distance": 5000,
    "magic.cast": 50,
    "heal.amount": 1000,
    "protect.ally": 10,
    "stage.clear": 2,
    "boss.kill": 1,
  },
});
