// =============================================================
// ボス専用特殊能力の基盤（第5弾・指示書第22章）。ボス本体は第7弾以降
// ・ここでは能力の「種類・効果・攻略手段（counters）・予告」をデータで持ち、combat/bossRuntime.js が実行する
// ・どの能力も攻略手段を後から設定できる（counters に追加）。予告（telegraph）のない即死はしない
// ・卒業拒絶は戦闘中だけ能力を制限する一時効果で、育成記録は一切変更しない
// ※ 使い手（魔神野口・ホープ）の詳細はパックに書かない（MASTER_SPEC のみ）
// =============================================================
export const BOSS_ABILITIES = Object.freeze({
  invisibility: { name: "透明化", duration: 100, counters: ["light", "analyze"], telegraph: 20 },
  invulnerable: { name: "無敵", duration: 80, counters: ["annihilation", "break_part"], telegraph: 20 },
  teleport: { name: "テレポート", range: 12, counters: ["gravity"], telegraph: 10 },
  nullify: { name: "無力化", duration: 60, status: "skill_seal", counters: ["just_dodge", "cleanse"], telegraph: 30, radius: 8 },
  heal: { name: "回復", ratio: 0.1, counters: ["heal_block", "interrupt"], telegraph: 30 },
  instant_down: { name: "即時戦闘不能", radius: 6, counters: ["just_dodge", "just_guard", "leave_area"], telegraph: 60 },
  world_create: { name: "世界創造", duration: 200, field: "law", counters: ["creation"], telegraph: 40 },
  time_rewind: { name: "時間逆行", ratio: 0.15, counters: ["time"], telegraph: 40 },
  graduation_refusal: { name: "卒業拒絶", duration: 200, restrict: ["ultimate", "apostle"], counters: ["bond"], telegraph: 40 },
  memory_replay: { name: "記憶再現", counters: ["just_guard"], telegraph: 30 },
});

/** 攻撃予告の既定（高難易度は短くできるが、最短 minTicks 未満にはしない） */
export const TELEGRAPH = Object.freeze({ defaultTicks: 40, minTicks: 15, particle: "minecraft:villager_angry", ring: 16, sound: "mob.warden.sonic_charge" });
