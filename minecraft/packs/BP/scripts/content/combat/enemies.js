// =============================================================
// 敵の戦闘データ（第5弾）：レベル・属性・耐性・防御・体勢値・部位・ヘイトの優先条件
// ・バニラのモンスターは typeId で引く（未登録は既定値）。専用の敵・ボスは第7弾で追加する
// resist：{ 属性: AFFINITY_LEVELS のキー }（基本の相性を上書き。同じ属性の敵でも個体ごとに変えられる）
// caps：固定ダメージ・割合ダメージの上限（ボスで万能にならないように）
// hate：ヘイトの優先条件 "hate"（ヘイト順）/ "nearest"（最も近い）/ "lowestHp"（HPの低い人）/ "healer"（回復した人を優先）
// parts：部位（大型ボス用）{ id, name, hp, weak: 属性, onBreak: { defDown, disableAbility, newWeak, reward } }
// =============================================================
import { VANILLA_MOB_LEVEL } from "../../balance/progression.js";

const base = { level: 1, element: "none", resist: {}, def: 5, mdef: 5, poise: 30, undead: false, tags: [], hate: "hate", caps: { fixed: 50, percent: 0.05 }, parts: [] };
const E = (o) => ({ ...base, ...o, caps: { ...base.caps, ...(o.caps || {}) } });

export const ENEMY_PROFILES = Object.freeze({
  "minecraft:zombie": E({ undead: true, resist: { holy: "weak", light: "weak", poison: "resist" } }),
  "minecraft:husk": E({ undead: true, element: "earth", resist: { holy: "weak", water: "weak", fire: "resist" } }),
  "minecraft:drowned": E({ undead: true, element: "water", resist: { thunder: "major_weak", water: "strong_resist" } }),
  "minecraft:skeleton": E({ undead: true, resist: { holy: "weak", earth: "weak", poison: "immune" }, hate: "nearest" }),
  "minecraft:stray": E({ undead: true, element: "ice", resist: { fire: "major_weak", ice: "immune" } }),
  "minecraft:spider": E({ element: "poison", resist: { fire: "weak" }, hate: "lowestHp" }),
  "minecraft:cave_spider": E({ element: "poison", resist: { poison: "immune" }, hate: "lowestHp" }),
  "minecraft:creeper": E({ element: "explosion", resist: { thunder: "weak" }, poise: 10 }),
  "minecraft:blaze": E({ element: "fire", resist: { water: "major_weak", ice: "weak", fire: "immune" }, tags: ["burn_immune"] }),
  "minecraft:enderman": E({ element: "space", resist: { water: "major_weak" }, poise: 50 }),
  "minecraft:witch": E({ element: "mind", resist: { poison: "resist" }, hate: "healer" }),
  "minecraft:phantom": E({ undead: true, element: "wind", resist: { light: "weak", holy: "weak" } }),
  "minecraft:pillager": E({ resist: {} }),
  "minecraft:vindicator": E({ def: 10, poise: 60 }),
  "minecraft:ravager": E({ element: "earth", def: 25, mdef: 10, poise: 200, tags: ["boss_like"], caps: { fixed: 30, percent: 0.02 } }),
  "minecraft:warden": E({ element: "abyss", def: 40, mdef: 40, poise: 400, resist: { holy: "weak", abyss: "immune" }, tags: ["boss_like", "fear_immune"], caps: { fixed: 20, percent: 0.01 } }),
  // 開発者専用の訓練ダミー（耐性・HP は管理者テストで変更できる）
  "noguchi:training_dummy": E({ level: 1, poise: 100, tags: ["dummy"], parts: [{ id: "head", name: "頭", hp: 50, weak: "thunder", onBreak: { defDown: 0.2, newWeak: { fire: "weak" } } }, { id: "arm", name: "腕", hp: 80, weak: "metal", onBreak: { disableAbility: "smash" } }] }),
});

export function enemyProfile(typeId) {
  const p = ENEMY_PROFILES[typeId];
  if (p) return p;
  return E({ level: VANILLA_MOB_LEVEL[typeId] || 1 });
}
