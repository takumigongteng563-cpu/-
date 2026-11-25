// =============================================================
// 戦闘行動の記録と、【暫定】バニラのモンスター討伐による経験値
//
// 不正・放置対策：
//   ・数えるのは「モンスター（family: monster）」への命中・討伐だけ（動物・防具立て・プレイヤーは対象外）
//   ・空振りはイベント自体が起きないため数えない
//   ・1人あたり一定間隔より短い連続命中は数えない
//   ・同じ1体への命中は一定回数までしか数えない（倒せない相手を叩き続ける稼ぎを防ぐ）
//   ・討伐経験値は "kill:<エンティティID>" をキーにして二重付与を防ぐ
// =============================================================
import { world, system, EntityComponentTypes, Player } from "@minecraft/server";
import { ctx } from "../core/context.js";
import { subscribe } from "../core/events.js";
import { VANILLA_MOB_EXP, STRONG_ENEMIES } from "../balance/progression.js";

const HIT_MIN_INTERVAL_TICKS = 4;
const MAX_HITS_PER_TARGET = 40;
const LOW_HP_RATIO = 0.2;
const LOW_HP_COOLDOWN_TICKS = 200;
const STRONG = new Set(STRONG_ENEMIES);

/** @type {Map<string, number>} playerId → 最後に数えた命中のtick */
const lastHit = new Map();
/** @type {Map<string, number>} `${playerId}|${targetId}` → 数えた命中回数 */
const hitsPerTarget = new Map();
/** @type {Map<string, number>} playerId → 最後に「瀕死から生還」を数えたtick */
const lastLowHp = new Map();
/** 処理済みの討伐（同じ死亡イベントを二重に処理しない） */
const handledDeaths = new Set();

export function isMonster(entity) {
  try {
    return entity.matches({ families: ["monster"] });
  } catch {
    return VANILLA_MOB_EXP[entity.typeId] !== undefined;
  }
}

/** 手に持っている武器の種類 */
export function weaponCategory(typeId) {
  if (!typeId) return "unarmed";
  if (typeId.endsWith("_sword")) return "sword";
  if (typeId.endsWith("_axe")) return "axe";
  if (typeId.endsWith("_spear") || typeId === "minecraft:trident") return "spear";
  if (typeId === "minecraft:mace") return "mace";
  if (typeId === "minecraft:bow") return "bow";
  if (typeId === "minecraft:crossbow") return "crossbow";
  return "other";
}

function heldTypeId(player) {
  try {
    const inv = player.getComponent(EntityComponentTypes.Inventory);
    const it = inv && inv.container ? inv.container.getItem(player.selectedSlotIndex) : undefined;
    return it ? it.typeId : undefined;
  } catch {
    return undefined;
  }
}

/** 命中を数えてよいか（連続命中・同一対象の上限） */
function acceptHit(playerId, targetId) {
  const now = system.currentTick;
  if (now - (lastHit.get(playerId) ?? -999) < HIT_MIN_INTERVAL_TICKS) return false;
  const key = `${playerId}|${targetId}`;
  const n = hitsPerTarget.get(key) || 0;
  if (n >= MAX_HITS_PER_TARGET) return false;
  lastHit.set(playerId, now);
  hitsPerTarget.set(key, n + 1);
  if (hitsPerTarget.size > 2000) hitsPerTarget.clear(); // 記録が溜まりすぎないように
  return true;
}

function isNight() {
  const t = world.getTimeOfDay();
  return t >= 13000 && t < 23000;
}

/** 攻撃者（矢などの場合は撃ったプレイヤー）を取り出す */
function attackerPlayer(source) {
  if (!source) return undefined;
  if (source.damagingEntity instanceof Player) return source.damagingEntity;
  return undefined;
}

export function registerCombatHooks() {
  subscribe(world.afterEvents.entityHitEntity, "combat.hit", (ev) => {
    if (!ctx.ready) return;
    const p = ev.damagingEntity;
    if (!(p instanceof Player) || !isMonster(ev.hitEntity)) return;
    if (!acceptHit(p.id, ev.hitEntity.id)) return;
    const cat = weaponCategory(heldTypeId(p));
    // 弓・クロスボウでの殴りは近接の「その他」として数える
    ctx.actions.record(p.id, `hit.melee.${cat === "bow" || cat === "crossbow" ? "other" : cat}`);
  });

  subscribe(world.afterEvents.projectileHitEntity, "combat.projectile", (ev) => {
    if (!ctx.ready) return;
    const p = ev.source;
    if (!(p instanceof Player)) return;
    const hit = ev.getEntityHit();
    const target = hit && hit.entity;
    if (!target || !isMonster(target)) return;
    let cat;
    if (ev.projectile.typeId === "minecraft:thrown_trident") cat = "trident";
    else if (ev.projectile.typeId === "minecraft:arrow") cat = weaponCategory(heldTypeId(p)) === "crossbow" ? "crossbow" : "bow";
    else return;
    if (!acceptHit(p.id, target.id)) return;
    ctx.actions.record(p.id, `hit.ranged.${cat}`);
  });

  subscribe(world.afterEvents.entityDie, "combat.die", (ev) => {
    if (!ctx.ready) return;
    const dead = ev.deadEntity;
    if (dead instanceof Player) {
      ctx.vitals.onDeath(dead.id);
      return;
    }
    const p = attackerPlayer(ev.damageSource);
    if (!p || !isMonster(dead)) return;
    if (handledDeaths.has(dead.id)) return;
    handledDeaths.add(dead.id);
    if (handledDeaths.size > 500) handledDeaths.clear();
    const typeId = dead.typeId;
    ctx.actions.record(p.id, "kill.hostile");
    if (isNight()) ctx.actions.record(p.id, "kill.night");
    if (STRONG.has(typeId)) ctx.actions.record(p.id, "kill.strong");
    const exp = VANILLA_MOB_EXP[typeId];
    if (exp && ctx.worldService.world.settings.progression.vanillaMobExp) {
      ctx.progression.grantExp(p.id, exp, { source: "monster", key: `kill:${dead.id}` });
    }
  });

  subscribe(world.afterEvents.entityHurt, "combat.hurt", (ev) => {
    if (!ctx.ready) return;
    const p = ev.hurtEntity;
    if (!(p instanceof Player)) return;
    const src = ev.damageSource && ev.damageSource.damagingEntity;
    if (!src || !isMonster(src) || !(ev.damage > 0)) return;
    ctx.actions.record(p.id, "damage.taken.mob", Math.min(ev.damage, 1000));
    const h = p.getComponent(EntityComponentTypes.Health);
    if (h && h.currentValue > 0 && h.currentValue <= h.effectiveMax * LOW_HP_RATIO) {
      const now = system.currentTick;
      if (now - (lastLowHp.get(p.id) ?? -9999) >= LOW_HP_COOLDOWN_TICKS) {
        lastLowHp.set(p.id, now);
        ctx.actions.record(p.id, "survive.lowhp");
      }
    }
  });
}

export function forgetCombatState(playerId) {
  lastHit.delete(playerId);
  lastLowHp.delete(playerId);
}
