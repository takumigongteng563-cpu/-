// =============================================================
// 職業系統ごとの専用能力値（最終仕様 第7章）【基盤のみ】
// ・職業（第3弾）や才能・装備が解放・加算する追加の能力値
// ・保存場所：data.specialStats = { [id]: { base, unlocked, unlockedAt } }
// ・補正：才能・職業・装備などの定義に special: { flat: { sword_aura: 5 }, pct: {...} } と書く
// ・どの職業がどの専用能力値を使うか（lines）と、実際の効果は第3弾以降で設定する
// =============================================================
import { Registry } from "./registry.js";

export const specialStats = new Registry("専用能力値").registerAll([
  { id: "sword_aura", name: "剣気", lines: ["warrior"], description: "剣技の威力を高める気。" },
  { id: "battle_aura", name: "闘気", lines: ["warrior"], description: "肉体の力を引き出す気。" },
  { id: "guard_power", name: "守護力", lines: ["warrior", "priest"], description: "仲間を守る力。" },
  { id: "mana_control", name: "魔力制御", lines: ["mage"], description: "魔法の精度と効率。" },
  { id: "summon_power", name: "召喚力", lines: ["mage"], description: "召喚獣の強さ。" },
  { id: "faith", name: "信仰力", lines: ["priest"], description: "神聖な力の強さ。" },
  { id: "stealth", name: "隠密力", lines: ["scout"], description: "気配を消す力。" },
]);
