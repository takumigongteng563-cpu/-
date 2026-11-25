// =============================================================
// HP・MP・スタミナのゲーム内処理
//  ・HP：バニラの体力の変化を RPG の HP に反映（entityHealthChanged）
//  ・自然回復：一定間隔で MP・スタミナ・HP を回復
//  ・スタミナ：ダッシュで消費、休息で回復、0 で疲労（ワールド設定で制限）
//  ・移動距離の記録（後天性才能の条件）
// =============================================================
import { world, EntityComponentTypes } from "@minecraft/server";
import { ctx } from "../core/context.js";
import { subscribe } from "../core/events.js";
import { every } from "../core/scheduler.js";
import { VITALS } from "../balance/vitals.js";

/** @type {Map<string, {x: number, y: number, z: number, dim: string, dist: number}>} */
const lastPos = new Map();

function health(player) {
  return player.getComponent(EntityComponentTypes.Health);
}

/** 参加・リスポーン時：バニラの体力から HP を合わせる */
export function syncHp(player) {
  const h = health(player);
  if (h) ctx.vitals.syncHpFromHealth(player.id, h.currentValue, h.effectiveMax);
}

/** HP の回復・設定の要求（レベルアップ時の全回復・管理者の設定）をバニラの体力へ反映 */
function applyHpRequests(player, d) {
  const v = d.vitals;
  if (!v.healRequest && v.hpSetRequest === undefined) return;
  const h = health(player);
  if (!h) return;
  if (v.healRequest) h.resetToMaxValue();
  if (typeof v.hpSetRequest === "number") h.setCurrentValue(Math.max(1, (h.effectiveMax * v.hpSetRequest) / v.hpMax));
  ctx.playerService.update(player.id, (pd) => {
    delete pd.vitals.healRequest;
    delete pd.vitals.hpSetRequest;
  });
  ctx.vitals.syncHpFromHealth(player.id, h.currentValue, h.effectiveMax);
}

function staminaTick() {
  if (!ctx.ready) return;
  const sec = VITALS.staminaIntervalTicks / 20;
  const exhaustion = ctx.worldService.world.settings.vitals.exhaustion;
  for (const p of world.getAllPlayers()) {
    const d = ctx.playerService.dataFor(p.id);
    if (!d) continue;
    applyHpRequests(p, d);

    // 移動距離
    const l = p.location;
    const dim = p.dimension.id;
    const prev = lastPos.get(p.id);
    let speed = 0;
    if (prev && prev.dim === dim) {
      const dist = Math.hypot(l.x - prev.x, l.z - prev.z);
      speed = dist / VITALS.staminaIntervalTicks;
      if (dist <= VITALS.maxDistancePerSample) prev.dist += dist;
      prev.x = l.x;
      prev.y = l.y;
      prev.z = l.z;
      if (prev.dist >= 10) {
        const whole = Math.floor(prev.dist);
        prev.dist -= whole;
        ctx.actions.record(p.id, "move.distance", whole);
      }
    } else {
      lastPos.set(p.id, { x: l.x, y: l.y, z: l.z, dim, dist: 0 });
    }

    // スタミナ
    const v = d.vitals;
    let delta = 0;
    if (p.isSprinting) delta = -VITALS.sprintCostPerSecond * sec;
    else if (v.stamina < v.staminaMax) {
      const resting = p.isSneaking || p.isSleeping || speed < VITALS.restSpeed;
      const perSec = (d.computed.derived.staminaRegen || 0) / 5;
      delta = perSec * sec * (resting ? VITALS.restMultiplier : VITALS.walkMultiplier);
    }
    if (delta !== 0) {
      const r = ctx.vitals.tickStamina(p.id, delta);
      if (r.exhausted && exhaustion === "slow") {
        try {
          p.addEffect("slowness", VITALS.staminaIntervalTicks + 10, { amplifier: 1, showParticles: false });
        } catch {
          // 無視
        }
      }
    }
  }
}

function regenTick() {
  if (!ctx.ready) return;
  const ratio = VITALS.regenIntervalTicks / 100; // 派生値は「5秒あたり」
  for (const p of world.getAllPlayers()) {
    const d = ctx.playerService.dataFor(p.id);
    if (!d) continue;
    const dv = d.computed.derived;
    if (d.vitals.mp < d.vitals.mpMax) ctx.vitals.restore(p.id, { mp: (dv.mpRegen || 0) * ratio });
    if (VITALS.hpRegenEnabled && d.vitals.hp > 0 && d.vitals.hp < d.vitals.hpMax) {
      const h = health(p);
      if (h && h.currentValue > 0 && h.currentValue < h.effectiveMax) {
        const heal = ((dv.hpRegen || 0) * ratio * h.effectiveMax) / d.vitals.hpMax;
        h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + heal));
      }
    }
  }
}

export function registerVitalsRuntime() {
  subscribe(world.afterEvents.entityHealthChanged, "vitals.health", (ev) => {
    if (!ctx.ready) return;
    const e = ev.entity;
    if (e.typeId !== "minecraft:player") return;
    const h = health(e);
    ctx.vitals.syncHpFromHealth(e.id, ev.newValue, h ? h.effectiveMax : 20);
  });
  every("vitals.stamina", VITALS.staminaIntervalTicks, staminaTick);
  every("vitals.regen", VITALS.regenIntervalTicks, regenTick);
}

export function forgetVitalsState(playerId) {
  lastPos.delete(playerId);
}
