// =============================================================
// 通常職業の分岐ツリー（最終仕様 Ver.1.0 第9章）【データ構造の基盤】
//
//   初期4系統 × 1職業につき3分岐 × 全5段階
//   第1次 4 / 第2次 12 / 第3次 36 / 第4次 108 / 第5次 324 = 合計 484
//
// ・職業IDは「ツリー上の位置」で決まる（名前を後から決めても ID は変わらない）
//     第1次：warrior / mage / scout / priest
//     第2次：warrior.a / warrior.b / warrior.c
//     第5次：warrior.a.b.c.a のように「.」と a/b/c を4つ続ける
// ・IDは保存データ（現在の職業・職業レベル・転職履歴）に記録されるため変更禁止
// ・職業の中身（名前・補正・転職条件・スキル）は JOB_DEFINITIONS に書く。
//   書かれていない枠は defined: false（未設定）として扱い、転職先として選べない
// ・無職・隠し職業・特殊職業は 484 に含めない（category で区別）
// =============================================================

export const JOB_LINES = Object.freeze([
  { id: "warrior", name: "戦士" },
  { id: "mage", name: "魔法使い" },
  { id: "scout", name: "斥候" },
  { id: "priest", name: "僧侶" },
]);

export const JOB_TIERS = 5;
export const JOB_BRANCHES = ["a", "b", "c"];

/** 段階ごとの職業数（検証用） */
export const EXPECTED_PER_TIER = Object.freeze([4, 12, 36, 108, 324]);

/**
 * 職業の定義（第3弾で本格的に追加する）。キー = 職業ID。
 * 第1次職の名前は最終仕様の暫定案。補正・転職条件はまだ設定していない。
 * 書ける項目：name, description, stats, derived, growth, special, expBonus,
 *   requirements（転職条件の配列。talents/conditions.js と同じ書き方）,
 *   crossLineRequirements（他系統から転職する場合の追加条件）, inheritSkills（引き継げるスキル）
 */
export const JOB_DEFINITIONS = Object.freeze({
  warrior: { name: "戦士", description: "武器を手に前線で戦う職業。（暫定）" },
  mage: { name: "魔法使い", description: "魔法を操る職業。（暫定）" },
  scout: { name: "斥候", description: "素早さと技巧で戦う職業。（暫定）" },
  priest: { name: "僧侶", description: "祈りと癒しの職業。（暫定）" },
});

/** 職業IDから段階（1～5）を求める */
export function tierOfJobId(id) {
  return id.split(".").length;
}

/** ツリーの全枠を作る（484） */
export function buildJobTree() {
  /** @type {any[]} */
  const out = [];
  const walk = (id, line, parent, tier) => {
    const children = tier < JOB_TIERS ? JOB_BRANCHES.map((b) => `${id}.${b}`) : [];
    const def = JOB_DEFINITIONS[id];
    out.push({
      id,
      category: "normal",
      line,
      tier,
      parent,
      children,
      defined: !!def,
      name: def ? def.name : `（未設定の職業 ${id}）`,
      ...(def || {}),
    });
    for (const c of children) walk(c, line, id, tier + 1);
  };
  for (const l of JOB_LINES) walk(l.id, l.id, null, 1);
  return out;
}
