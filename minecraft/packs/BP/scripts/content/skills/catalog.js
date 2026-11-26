// =============================================================
// スキルの共通カタログ（第4弾）
// =============================================================

/** スキル分類（指示書 第2章の21種） */
export const SKILL_CATEGORIES = Object.freeze({
  physical: "物理攻撃",
  weapon: "武器専用",
  attack_magic: "攻撃魔法",
  element_magic: "属性魔法",
  heal: "回復魔法",
  support: "支援魔法",
  defense: "防御魔法",
  movement: "移動",
  summon: "召喚魔法",
  control: "妨害",
  status: "状態異常",
  passive: "パッシブ",
  job: "職業専用",
  talent: "才能専用",
  potential: "潜在能力専用",
  blessing: "神々の加護",
  apostle: "使徒専用",
  equipment: "装備固有",
  link: "連携",
  ultimate: "奥義",
  hidden: "隠し",
});

export const SKILL_RARITIES = Object.freeze([
  { id: "common", name: "一般" },
  { id: "advanced", name: "上級" },
  { id: "rare", name: "希少" },
  { id: "epic", name: "英雄" },
  { id: "legendary", name: "伝説" },
  { id: "mythic", name: "神話" },
]);

/** 操作（ホットバー複合操作） */
export const ACTION_NAMES = Object.freeze({
  tap: "通常使用（小技）",
  jump: "ジャンプ中に使用（中技）",
  sprint: "ダッシュ中に使用（移動技）",
  charge: "しゃがみ溜め（大技）",
  ultimate: "長時間溜め（奥義）",
});

/**
 * 効果の型（実際に動作する処理。skills/skillEffects.js）
 * どの型も「1回の発動で1回だけ処理」し、毎tickの処理は持たない（召喚・持続効果は期限で自動解除）。
 */
export const EFFECT_TYPES = Object.freeze({
  projectile: "視線の先の敵に命中（貫通数あり）",
  area: "視線の先（または自分の周囲）の範囲攻撃",
  melee: "自分の前方・周囲の近接攻撃",
  dash: "向いている方向へ突進（到着点で攻撃可）",
  blink: "向いている方向へ瞬間移動",
  heal: "自分と周囲の仲間を回復",
  buff: "自分と周囲の仲間を強化（一時効果）",
  shield: "防御を固める（一時効果＋耐性）",
  debuff: "周囲の敵を弱体化（バニラの状態効果。本格的な状態異常は第5弾）",
  summon: "召喚獣を呼ぶ（数と時間に上限）",
  passive: "習得して使用条件を満たしている間、常に効果",
  // 第5弾：神の権能（使徒の最終段階。DIVINE_LIMITS で制限）
  rewind: "時間逆行：戦闘中の自分のHP・MPを少し前に戻す",
  share: "能力共有：自分の能力値の一部を仲間に一時的に分ける（増殖しない）",
  fortune: "確率操作：仲間のクリティカル率を上げる（上限あり）",
  law: "法則改変：定義済みの戦闘効果から1つを周囲の敵に適用",
  analyze: "万物解析：周囲の敵の弱点をすべて明らかにする",
});

/** 範囲の形 */
export const SHAPES = Object.freeze({
  self: "自分",
  single: "単体",
  ray: "直線",
  cone: "前方扇形",
  circle: "自分の周囲",
  target_area: "視線の先の範囲",
  party: "周囲の仲間",
});

export const TARGETS = Object.freeze({
  enemy: "敵",
  ally: "仲間（自分を含む）",
  self: "自分",
});

/** 属性（最終仕様 第13章の22種。属性相性は第5弾） */
export { ELEMENT_NAMES } from "../jobs/catalog.js";
