// 能力値・派生能力値の定義（表示名・表示順）
// 数値（初期値・計算式）は balance/stats.js で調整する。
// ※ ID は保存データに使われるため変更しないこと
//   第1弾 str/vit/agi/dex/int/mnd/luk → 第2弾 mag を追加 → 最終仕様 lif/endr/foc/lead を追加（12種）
import { INITIAL_STATS, INITIAL_VITALS as BALANCE_VITALS } from "../balance/stats.js";

export const STAT_DEFS = Object.freeze([
  { id: "str", name: "筋力", short: "筋", role: "物理攻撃力・積載量" },
  { id: "vit", name: "耐久", short: "耐", role: "最大HP・物理防御力" },
  { id: "mag", name: "魔力", short: "魔", role: "魔法攻撃力・最大MP" },
  { id: "mnd", name: "精神", short: "精", role: "魔法防御力・状態異常耐性" },
  { id: "agi", name: "敏捷", short: "敏", role: "移動・回避性能" },
  { id: "dex", name: "器用", short: "器", role: "命中・クリティカル・武器操作" },
  { id: "luk", name: "幸運", short: "運", role: "希少報酬・特殊効果の発生" },
  { id: "int", name: "知力", short: "知", role: "魔法効率・スキル習得" },
  // --- 最終仕様 Ver.1.0 で追加 ---
  { id: "lif", name: "生命力", short: "命", role: "HP回復・回復効果" },
  { id: "endr", name: "持久力", short: "久", role: "スタミナ・疲労耐性" },
  { id: "foc", name: "集中力", short: "集", role: "詠唱速度・詠唱妨害耐性" },
  { id: "lead", name: "統率力", short: "統", role: "召喚獣・仲間NPCへの補正" },
]);

export const STAT_IDS = Object.freeze(STAT_DEFS.map((s) => s.id));

/** 派生能力値の表示定義。unit: "" | "%" | "x" */
export const DERIVED_DEFS = Object.freeze([
  { id: "maxHp", name: "最大HP", unit: "" },
  { id: "maxMp", name: "最大MP", unit: "" },
  { id: "maxStamina", name: "最大スタミナ", unit: "" },
  { id: "physAtk", name: "物理攻撃力", unit: "" },
  { id: "magAtk", name: "魔法攻撃力", unit: "" },
  { id: "physDef", name: "物理防御力", unit: "" },
  { id: "magDef", name: "魔法防御力", unit: "" },
  { id: "critRate", name: "クリティカル率", unit: "%" },
  { id: "critMultiplier", name: "クリティカル倍率", unit: "x" },
  { id: "hitRate", name: "命中率", unit: "%" },
  { id: "evasionRate", name: "回避率", unit: "%" },
  { id: "moveSpeed", name: "移動速度", unit: "x" },
  { id: "hpRegen", name: "HP自然回復(5秒)", unit: "" },
  { id: "mpRegen", name: "MP自然回復(5秒)", unit: "" },
  { id: "staminaRegen", name: "スタミナ回復(5秒)", unit: "" },
  { id: "carryWeight", name: "最大積載重量", unit: "" },
  { id: "statusResist", name: "状態異常耐性", unit: "%" },
  { id: "healPower", name: "回復効果", unit: "%" },
  { id: "fatigueResist", name: "疲労耐性", unit: "%" },
  { id: "castSpeed", name: "詠唱速度", unit: "%" },
  { id: "interruptResist", name: "詠唱妨害耐性", unit: "%" },
  { id: "leadership", name: "召喚・仲間補正", unit: "%" },
]);

/** 第1弾互換：初期能力値（一般人相当） */
export function initialBaseStats() {
  return { ...INITIAL_STATS };
}

export const INITIAL_VITALS = BALANCE_VITALS;
