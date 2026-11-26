// =============================================================
// 職業データの共通カタログ（第3弾）
// 系統・役割・武器・属性・防具の定義。職業データはこれらのIDを参照する。
// =============================================================

/** 初期4系統（第1次職業）。letter は職業コード（融合の記録）に使う */
export const JOB_LINES = Object.freeze([
  {
    id: "warrior",
    letter: "W",
    name: "戦士",
    stats: { str: 0.35, vit: 0.35, endr: 0.3 },
    trait: "近接物理攻撃・防御・敵の引き付け",
  },
  {
    id: "mage",
    letter: "M",
    name: "魔法使い",
    stats: { mag: 0.4, int: 0.35, foc: 0.25 },
    trait: "攻撃魔法・属性魔法・広範囲攻撃",
  },
  {
    id: "thief",
    letter: "T",
    name: "盗賊",
    stats: { agi: 0.4, dex: 0.35, luk: 0.25 },
    trait: "遠距離攻撃・短剣・素早い移動・回避",
  },
  {
    id: "priest",
    letter: "P",
    name: "僧侶",
    stats: { mnd: 0.4, lif: 0.35, mag: 0.25 },
    trait: "回復魔法・支援魔法・防御魔法",
  },
]);

export const LINE_BY_LETTER = Object.freeze(Object.fromEntries(JOB_LINES.map((l) => [l.letter, l])));
export const LINE_BY_ID = Object.freeze(Object.fromEntries(JOB_LINES.map((l) => [l.id, l])));

/**
 * 役割。stats = 役割による能力値の傾き、armor = 使用可能な防具、
 * strengths / weaknesses / situations = 強み・弱点・得意な戦闘状況
 * passive = 今すぐ効果がある固有パッシブ（派生能力値の補正。段階が上がるほど大きい）
 * mechanic = 後続（第4弾・第5弾）で実装する固有パッシブの仕組み
 * skillAction = 専用スキルを割り当てる操作の基本
 */
export const ROLES = Object.freeze({
  guardian: {
    name: "盾役",
    stats: { vit: 0.5, endr: 0.3, str: 0.2 },
    armor: ["heavy", "shield"],
    strengths: ["被ダメージに強い", "敵の注意を引きつけられる"],
    weaknesses: ["与えるダメージが低い", "移動が遅い"],
    situations: "強力なボスの攻撃を正面から受け止める場面",
    passive: { derived: { pct: { physDef: 4, maxHp: 2 } } },
    mechanic: "敵の攻撃を引きつけ、被ダメージの一部を軽減する",
    skillAction: "charge",
  },
  striker: {
    name: "近接火力",
    stats: { str: 0.5, dex: 0.3, vit: 0.2 },
    armor: ["medium"],
    strengths: ["近接での瞬間火力が高い"],
    weaknesses: ["遠距離の敵に手間取る", "被弾しやすい"],
    situations: "ボスの隙に大技を叩き込む場面",
    passive: { derived: { pct: { physAtk: 4 } } },
    mechanic: "連続で攻撃を当てるほど威力が上がる",
    skillAction: "charge",
  },
  duelist: {
    name: "技巧（連撃・見切り）",
    stats: { dex: 0.45, agi: 0.35, str: 0.2 },
    armor: ["light"],
    strengths: ["連撃と回避が得意", "クリティカルを出しやすい"],
    weaknesses: ["打たれ弱い", "範囲攻撃が少ない"],
    situations: "強敵との一対一",
    passive: { derived: { flat: { critRate: 2, evasionRate: 1 } } },
    mechanic: "攻撃を見切って回避した直後の攻撃が必ずクリティカルになる",
    skillAction: "tap",
  },
  marksman: {
    name: "射撃",
    stats: { dex: 0.5, foc: 0.3, agi: 0.2 },
    armor: ["light"],
    strengths: ["遠距離から安全に攻撃できる", "弱点を正確に狙える"],
    weaknesses: ["接近されると弱い"],
    situations: "離れた敵や飛んでいる敵を狙う場面",
    passive: { derived: { flat: { hitRate: 2, critRate: 1 } } },
    mechanic: "距離が離れているほど威力が上がる",
    skillAction: "tap",
  },
  caster: {
    name: "魔法火力",
    stats: { mag: 0.5, int: 0.3, foc: 0.2 },
    armor: ["robe"],
    strengths: ["広範囲に大ダメージを与えられる", "属性の弱点を突きやすい"],
    weaknesses: ["詠唱中を狙われやすい", "MPが尽きると戦えない"],
    situations: "大量の敵をまとめて倒す場面",
    passive: { derived: { pct: { magAtk: 4 } } },
    mechanic: "同じ属性の魔法を続けて使うと威力が上がる",
    skillAction: "charge",
  },
  healer: {
    name: "回復",
    stats: { mnd: 0.45, lif: 0.35, mag: 0.2 },
    armor: ["robe"],
    strengths: ["仲間を回復し続けられる", "状態異常を治せる"],
    weaknesses: ["攻撃手段が少ない", "狙われると脆い"],
    situations: "長期戦や被ダメージの大きいボス戦",
    passive: { derived: { flat: { healPower: 5 } } },
    mechanic: "回復した量に応じて、次の回復の効果が上がる",
    skillAction: "tap",
  },
  buffer: {
    name: "支援",
    stats: { lead: 0.4, mnd: 0.35, int: 0.25 },
    armor: ["robe", "light"],
    strengths: ["仲間全体を強化できる", "戦況を有利に保てる"],
    weaknesses: ["単独での火力が低い"],
    situations: "4人で協力する長いボス戦",
    passive: { derived: { flat: { leadership: 5 } } },
    mechanic: "強化を与えた仲間の数だけ自分も少し強くなる",
    skillAction: "tap",
  },
  summoner: {
    name: "召喚",
    stats: { lead: 0.45, int: 0.35, mag: 0.2 },
    armor: ["robe"],
    strengths: ["召喚獣で手数を増やせる", "召喚獣が攻撃を引き受ける"],
    weaknesses: ["本人は脆い", "召喚中はMPを消費し続ける"],
    situations: "敵の数が多い場面",
    passive: { derived: { flat: { leadership: 6 } } },
    mechanic: "召喚獣の強さが召喚者の能力値に応じて上がる（同時召喚数は少数）",
    skillAction: "charge",
  },
  assassin: {
    name: "暗殺",
    stats: { agi: 0.4, dex: 0.4, luk: 0.2 },
    armor: ["light"],
    strengths: ["背後や不意打ちで一撃必殺", "姿を隠せる"],
    weaknesses: ["正面からの殴り合いに弱い", "持久戦が苦手"],
    situations: "弱った敵や後衛の敵を素早く倒す場面",
    passive: { derived: { flat: { critRate: 3 } } },
    mechanic: "敵に気づかれていない状態の攻撃が大ダメージになる",
    skillAction: "sprint",
  },
  controller: {
    name: "妨害・制御",
    stats: { int: 0.4, foc: 0.35, mnd: 0.25 },
    armor: ["robe"],
    strengths: ["敵の動きを止められる", "状態異常に強い"],
    weaknesses: ["直接の火力が低い"],
    situations: "危険な攻撃を止めたい場面",
    passive: { derived: { flat: { interruptResist: 5, statusResist: 2 } } },
    mechanic: "状態異常にかかった敵への効果時間が延びる",
    skillAction: "jump",
  },
  skirmisher: {
    name: "遊撃",
    stats: { agi: 0.45, endr: 0.3, str: 0.25 },
    armor: ["light", "medium"],
    strengths: ["素早く移動して戦場を支える", "スタミナが多い"],
    weaknesses: ["一撃の威力が低い"],
    situations: "広い戦場を走り回る場面",
    passive: { derived: { pct: { staminaRegen: 6, maxStamina: 2 } } },
    mechanic: "移動距離に応じて次の攻撃が強化される",
    skillAction: "sprint",
  },
  warden: {
    name: "守護回復",
    stats: { vit: 0.4, lif: 0.35, mnd: 0.25 },
    armor: ["medium", "shield"],
    strengths: ["守りながら仲間を癒せる", "倒れにくい"],
    weaknesses: ["攻撃も回復も専門職には劣る"],
    situations: "少人数で耐え続ける場面",
    passive: { derived: { pct: { maxHp: 3 }, flat: { healPower: 3 } } },
    mechanic: "仲間を守ったときに自分と仲間を少し回復する",
    skillAction: "charge",
  },
});

/** 武器（第6弾で実際の装備と結びつける） */
export const WEAPONS = Object.freeze({
  sword: "剣",
  greatsword: "大剣",
  katana: "刀",
  dual: "双剣",
  dagger: "短剣",
  axe: "斧",
  spear: "槍",
  lance: "騎槍",
  shield: "盾",
  mace: "メイス",
  fist: "拳",
  scythe: "大鎌",
  whip: "鞭",
  shuriken: "手裏剣",
  bow: "弓",
  crossbow: "クロスボウ",
  staff: "杖",
  grimoire: "魔導書",
  holy_staff: "聖杖",
  scripture: "聖典",
  orb: "宝珠",
});

/** 防具の種類 */
export const ARMORS = Object.freeze({
  heavy: "重鎧",
  medium: "中鎧",
  light: "軽装",
  robe: "法衣",
  shield: "盾",
});

/**
 * 属性（最終仕様 第13章の候補22種）。属性システムの実装は第5弾。
 * 第3弾では職業の「得意属性」として使う。
 */
export const ELEMENT_NAMES = Object.freeze({
  fire: "火",
  water: "水",
  wind: "風",
  earth: "地",
  thunder: "雷",
  light: "光",
  dark: "闇",
  none: "無",
  ice: "氷",
  poison: "毒",
  explosion: "爆発",
  metal: "金属",
  plant: "植物",
  gravity: "重力",
  space: "空間",
  time: "時間",
  life: "生命",
  mind: "精神",
  holy: "神聖",
  abyss: "深淵",
  creation: "創造",
  annihilation: "消滅",
});

/** 職業段階ごとの設定（調整用） */
export const TIER_RULES = Object.freeze({
  0: { name: "無職", levelCap: 10, statBudget: 0, expMultiplier: 0.6, specialCount: 0, specialBase: 0 },
  1: { name: "第1次職業", levelCap: 30, statBudget: 6, expMultiplier: 1.0, specialCount: 1, specialBase: 4 },
  2: { name: "第2次職業", levelCap: 40, statBudget: 12, expMultiplier: 1.4, specialCount: 2, specialBase: 8 },
  3: { name: "第3次職業", levelCap: 50, statBudget: 20, expMultiplier: 2.0, specialCount: 2, specialBase: 14 },
  4: { name: "第4次職業", levelCap: 60, statBudget: 30, expMultiplier: 2.8, specialCount: 3, specialBase: 22 },
  5: { name: "第5次職業", levelCap: 70, statBudget: 42, expMultiplier: 4.0, specialCount: 3, specialBase: 32 },
});
