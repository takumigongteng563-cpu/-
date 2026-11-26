// =============================================================
// 装備固有スキル（第4弾は基盤のみ）
// 世界唯一の装備・個人専用装備を持っている間だけ習得・使用できる。本格的な装備は第6弾・第10弾。
// =============================================================
import { S, P, learn } from "./helpers.js";

export const EQUIPMENT_SKILLS = [
  S({ id: "equip.sample_unique_blade", name: "唯一の剣閃", description: "【見本】世界唯一の剣だけが放てる一閃。所持している間だけ使える。", category: "equipment", sample: true, elements: ["creation"], rarity: "legendary", cost: { stamina: 20 }, cooldown: 120, shape: "cone", range: 5, power: P(60, 8, { str: 1.2, dex: 0.5 }, "physical"), effect: { type: "melee" }, actions: ["tap", "charge"], equipment: "sample:unique_blade", learn: [learn.equipment("sample:unique_blade")] }),
];
