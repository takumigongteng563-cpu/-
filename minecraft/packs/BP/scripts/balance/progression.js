// =============================================================
// 【設定ファイル】レベル・経験値・存在階級（暫定値。自由に調整してよい）
// 数値を変えても保存データは壊れません（必要経験値などは毎回この式で計算するため）。
// =============================================================

/**
 * 次のレベルまでに必要な経験値
 *   必要経験値(L) = round( a × L^p + b × L + c )
 * 既定値：Lv1→2 = 100、Lv10→11 ≒ 1,865、Lv50→51 ≒ 17,140、Lv100→101 ≒ 46,000
 */
export const EXP_CURVE = Object.freeze({
  a: 40,
  p: 1.5,
  b: 60,
  c: 0,
  /** 必要経験値の上限（極端な数値にならないように） */
  max: 50000000,
});

/** 1レベル上昇ごとに得る能力ポイント */
export const STAT_POINTS_PER_LEVEL = 5;

/** 一度に付与できる経験値の上限（不正な値・桁あふれ防止） */
export const MAX_EXP_PER_GRANT = 100000000;

/**
 * 存在階級。種族とは別の「勇者の成長段階」。
 * cap = その階級でのレベル上限。stage = 限界突破回数。
 * requirements = 次の階級へ進むための条件。null は「未実装（突破不可）」を表す。
 * 試練・素材・ボス討伐などの条件は後続アップデートでここに定義する。
 */
export const EXISTENCE_TIERS = Object.freeze([
  { stage: 0, id: "common", name: "一般級", cap: 50, requirements: null },
  { stage: 1, id: "superhuman", name: "超人級", cap: 100, requirements: null },
  { stage: 2, id: "hero", name: "英雄級", cap: 150, requirements: null },
  { stage: 3, id: "legend", name: "伝説級", cap: 200, requirements: null },
  { stage: 4, id: "myth", name: "神話級", cap: 300, requirements: null },
  { stage: 5, id: "demigod", name: "半神級", cap: 500, requirements: null },
  { stage: 6, id: "god", name: "神級", cap: 999, requirements: null },
  // 上限は未定。暫定的に神級と同じ値を置き、突破条件も未実装
  { stage: 7, id: "unknown", name: "未知の領域", cap: 999, requirements: null },
]);

/**
 * レベル上限に達したあとの余剰経験値の扱い（ワールド設定の初期値）
 *   "store"   : 保留して、限界突破したときに加算する（保留量には上限あり）
 *   "discard" : 捨てる
 */
export const DEFAULT_OVERFLOW_POLICY = "store";
/** 保留できる経験値の上限 = 上限レベルの必要経験値 × この倍率 */
export const OVERFLOW_STORE_LEVELS = 3;

/**
 * 追いつき補正：パーティ内の最高レベルより低いプレイヤーは経験値が増える。
 * 後から参加した人・低才能の人が単調な稼ぎをしなくても追いつけるようにするため。
 *   倍率 = 1 + min(maxBonus, (最高Lv − 自分のLv − threshold) × perLevel)  （差が threshold 以下なら 1）
 */
export const CATCH_UP = Object.freeze({
  enabled: true,
  threshold: 3,
  perLevel: 0.05,
  maxBonus: 1.0, // 最大 2倍
});

/** 同じ報酬の重複付与を防ぐため、最近の報酬キーを何件まで覚えておくか（プレイヤーごと） */
export const REWARD_LOG_SIZE = 200;

/**
 * 経験値の入手元の種類（後続システムが grantExp に渡す source）
 * 表示名と、入手元ごとの倍率（調整用）。
 */
export const EXP_SOURCES = Object.freeze({
  monster: { name: "モンスター討伐", multiplier: 1.0 },
  boss: { name: "ボス討伐", multiplier: 1.0 },
  dungeon: { name: "ダンジョンクリア", multiplier: 1.0 },
  quest: { name: "クエスト達成", multiplier: 1.0 },
  event: { name: "特殊イベント", multiplier: 1.0 },
  trial: { name: "試練達成", multiplier: 1.0 },
  admin: { name: "管理者付与", multiplier: 1.0 },
});

/**
 * 【暫定】バニラのモンスター討伐で得られる経験値。
 * 独自モンスターが実装されるまでの仮の入手手段。ワールド設定で無効化できる。
 * 討伐したプレイヤー本人だけが得る（パーティ分配は後続で実装）。
 */
export const VANILLA_MOB_EXP = Object.freeze({
  "minecraft:zombie": 10,
  "minecraft:husk": 12,
  "minecraft:drowned": 12,
  "minecraft:zombie_villager": 10,
  "minecraft:skeleton": 12,
  "minecraft:stray": 14,
  "minecraft:bogged": 14,
  "minecraft:spider": 10,
  "minecraft:cave_spider": 12,
  "minecraft:creeper": 15,
  "minecraft:slime": 4,
  "minecraft:magma_cube": 6,
  "minecraft:silverfish": 3,
  "minecraft:endermite": 3,
  "minecraft:witch": 25,
  "minecraft:phantom": 18,
  "minecraft:pillager": 18,
  "minecraft:vindicator": 25,
  "minecraft:evocation_illager": 60,
  "minecraft:vex": 8,
  "minecraft:ravager": 120,
  "minecraft:enderman": 30,
  "minecraft:blaze": 30,
  "minecraft:ghast": 35,
  "minecraft:wither_skeleton": 35,
  "minecraft:zombie_pigman": 15,
  "minecraft:piglin_brute": 40,
  "minecraft:hoglin": 25,
  "minecraft:zoglin": 30,
  "minecraft:guardian": 30,
  "minecraft:elder_guardian": 400,
  "minecraft:shulker": 30,
  "minecraft:breeze": 40,
  "minecraft:warden": 1500,
  "minecraft:wither": 3000,
  "minecraft:ender_dragon": 5000,
});

/** 「強敵」とみなすモンスター（後天性才能の条件に使う） */
export const STRONG_ENEMIES = Object.freeze([
  "minecraft:ravager",
  "minecraft:elder_guardian",
  "minecraft:warden",
  "minecraft:wither",
  "minecraft:ender_dragon",
  "minecraft:evocation_illager",
  "minecraft:piglin_brute",
]);

/** レベルアップ時に HP・MP・スタミナを全回復するか */
export const RESTORE_ON_LEVEL_UP = true;
