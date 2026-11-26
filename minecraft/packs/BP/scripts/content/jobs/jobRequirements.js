// =============================================================
// 転職・職業融合の条件（第3弾 第9章）【暫定の複合条件方式】
// 職業ごとの条件は「職業段階」と「融合する系統」から自動で作る。
// 個別に変えたい職業は jobFactory.js の OVERRIDES に requirements を書く。
//
// 融合のルール：融合する系統の職業に実際に転職しておく必要はない。
//   その系統の「適性」（能力値・行動実績・才能のいずれか）を満たせばよい。
//   例：戦士 → 魔剣士 ＝ 戦士の職業経験 ＋ 魔法の適性
//
// 条件の書き方は talents/conditions.js と同じ（第3弾で種類を追加）。
// =============================================================

const LETTER_TO_LINE = { W: "warrior", M: "mage", T: "thief", P: "priest" };

/**
 * 段階ごとの基準値（調整用）
 * statSum は「適性のある2能力値の合計」。レベルアップの自動成長だけで届く値（基礎5＋成長0.5/Lv ×2）より
 * 約12以上高くしてあり、自由振り分けでその系統に力を注ぐと満たせる。
 *   第2次：Lv15 で自然に約24 → 36　第3次：Lv25 で約34 → 52　第4次：Lv35 で約44 → 70　第5次：Lv45 で約54 → 90
 */
export const REQUIREMENT_TIERS = Object.freeze({
  1: { level: 5 },
  2: { level: 15, parentJobLevel: 15, statSum: 36, counter: 100 },
  3: { level: 25, parentJobLevel: 20, statSum: 52, counter: 400, kills: 100 },
  4: { level: 35, parentJobLevel: 25, statSum: 70, counter: 1200, bossKills: 1 },
  5: { level: 45, parentJobLevel: 30, statSum: 90, counter: 3000, bossKills: 3, mainStatSum: 80 },
});

/** 系統の適性に使う値 */
export const LINE_APTITUDE = Object.freeze({
  warrior: {
    stats: ["str", "vit"],
    counters: ["hit.melee.sword", "hit.melee.axe", "hit.melee.spear", "hit.melee.mace", "hit.melee.unarmed", "hit.melee.other"],
    families: ["sword", "spear", "axe", "martial", "body", "sturdy", "endure", "giant"],
  },
  mage: {
    stats: ["mag", "int"],
    counters: ["magic.cast"],
    families: ["mana", "mage", "mana_eff", "fire", "water", "wind", "earth", "thunder", "ice", "light", "dark"],
  },
  thief: {
    stats: ["agi", "dex"],
    counters: ["hit.ranged.bow", "hit.ranged.crossbow", "hit.ranged.trident"],
    families: ["bow", "dual", "reflex", "dexterity", "eye", "hunter", "night"],
  },
  priest: {
    stats: ["mnd", "lif"],
    counters: ["heal.amount", "protect.ally"],
    families: ["heal", "will", "defense", "life", "spirit"],
  },
});

/** 系統の適性（いずれか1つを満たせばよい） */
export function aptitude(lineId, tier) {
  const t = REQUIREMENT_TIERS[tier];
  const a = LINE_APTITUDE[lineId];
  return {
    type: "any",
    label: `${lineId}の適性`,
    of: [
      { type: "stat", stats: a.stats, min: t.statSum },
      { type: "counterSum", keys: a.counters, min: t.counter },
      { type: "familyCount", families: a.families, min: 1 },
    ],
  };
}

/** 職業コードから転職条件を作る */
export function jobRequirements(code) {
  const tier = code.length;
  const t = REQUIREMENT_TIERS[tier];
  /** @type {any[]} */
  const out = [{ type: "level", min: t.level }];
  if (tier === 1) return out;
  const parentId = code.slice(0, -1).split("").map((c) => LETTER_TO_LINE[c]).join(".");
  out.push({ type: "jobLevel", job: parentId, min: t.parentJobLevel });
  out.push(aptitude(LETTER_TO_LINE[code[code.length - 1]], tier));
  if (t.kills) out.push({ type: "counter", key: "kill.hostile", min: t.kills });
  if (t.bossKills) out.push({ type: "bossKill", min: t.bossKills });
  if (t.mainStatSum) out.push({ type: "stat", stats: LINE_APTITUDE[LETTER_TO_LINE[code[0]]].stats, min: t.mainStatSum });
  return out;
}

/**
 * 他系統への転職（別の系統の第1次職業へ移る等）の追加条件。
 * 特殊アイテム「転職の証」（job.tokens.crossLine）を1つ消費する。試練による代替は第13弾以降。
 */
export function crossLineRequirements() {
  return [{ type: "item", id: "cross_line_token", label: "転職の証" }];
}
