// =============================================================
// 隠し職業（第3弾 第13章）【基盤＋検証用2種】
// ・通常の484職業とは別。発見（discover）するまで職業一覧に表示しない
// ・discover：発見の条件（才能・潜在能力・唯一装備・称号・特殊イベント・ボス討伐・職業融合履歴など）
// ・requirements：発見後に転職するための条件
// 本格的な隠し職業は後続で制作する。以下の2種は仕組みの検証用。
// =============================================================

export const HIDDEN_JOBS = [
  {
    id: "hidden.otherworld_hero",
    code: "H1",
    category: "hidden",
    test: true,
    tier: 3,
    line: null,
    name: "異界の勇者",
    description: "【検証用】この世界の理の外から来た者だけがなれる職業。",
    role: "striker",
    weapons: ["sword", "staff", "bow", "holy_staff"],
    elements: ["creation"],
    stats: { flat: { str: 4, mag: 4, agi: 4, mnd: 4, luk: 4 } },
    growth: { luk: 0.2 },
    special: { flat: {} },
    levelCap: 50,
    discover: [{ type: "any", of: [{ type: "familyCount", families: ["otherworld"], min: 1 }, { type: "flag", id: "event:otherworld_gate" }] }],
    requirements: [{ type: "level", min: 20 }],
  },
  {
    id: "hidden.fusion_seeker",
    code: "H2",
    category: "hidden",
    test: true,
    tier: 3,
    line: null,
    name: "融合の求道者",
    description: "【検証用】4つの系統すべての職業を経験した者が辿り着く職業。",
    role: "buffer",
    weapons: ["staff", "sword", "bow", "mace"],
    elements: ["none"],
    stats: { flat: { str: 3, mag: 3, agi: 3, mnd: 3, lead: 4 } },
    growth: { lead: 0.2 },
    special: { flat: {} },
    levelCap: 50,
    discover: [{ type: "linesHeld", lines: ["warrior", "mage", "thief", "priest"], min: 4 }],
    requirements: [{ type: "level", min: 25 }],
  },
];
