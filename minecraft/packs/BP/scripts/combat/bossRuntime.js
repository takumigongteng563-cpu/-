// =============================================================
// 攻撃予告・ボス特殊能力の実行（第5弾の基盤。ゲーム側）
// 予告：地面に範囲（パーティクルの輪）・効果音・攻撃名の表示 → 予告時間の後に判定。回避・ガードは combatService.incoming で判定
// =============================================================
import { world, system, EntityComponentTypes } from "@minecraft/server";
import { ctx } from "../core/context.js";
import { BOSS_ABILITIES, TELEGRAPH } from "../content/combat/bossAbilities.js";
import { COMBAT } from "../balance/combat.js";
import { notifyActionBar } from "../hud/hud.js";
import { markOwn } from "./combatRuntime.js";

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function ring(dim, c, r, n) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    try {
      dim.spawnParticle(TELEGRAPH.particle, { x: c.x + Math.cos(a) * r, y: c.y + 0.2, z: c.z + Math.sin(a) * r });
    } catch {
      return;
    }
  }
}

/**
 * 範囲攻撃の予告と実行
 * @param {any} source 攻撃する敵
 * @param {{name: string, radius: number, ticks?: number, damage: number, onHit?: (p: any) => void}} atk damage＝戦闘の数値
 */
export function telegraphAttack(source, atk) {
  const ticks = Math.max(TELEGRAPH.minTicks, atk.ticks ?? TELEGRAPH.defaultTicks);
  const center = { ...source.location };
  const dim = source.dimension;
  for (const p of world.getAllPlayers()) if (dist(p.location, center) < atk.radius + 16) {
    notifyActionBar(p, `§c§l⚠ ${atk.name}§r§c（${(ticks / 20).toFixed(1)}秒後・範囲${atk.radius}）`, ticks);
    try {
      p.playSound(TELEGRAPH.sound, { volume: 1 });
    } catch {
      // 無視
    }
  }
  const draw = system.runInterval(() => ring(dim, center, atk.radius, TELEGRAPH.ring), 10);
  system.runTimeout(() => {
    system.clearRun(draw);
    for (const p of world.getAllPlayers()) {
      if (dist(p.location, center) > atk.radius) continue;
      const r = ctx.combat.incoming(p.id, { id: source.id, typeId: source.typeId }, atk.damage * COMBAT.vanillaScale, ctx.vitals);
      const v = atk.damage * COMBAT.vanillaScale * r.keep;
      if (v > 0) {
        markOwn(p);
        try {
          p.applyDamage(v);
        } catch {
          // 無視
        }
        if (atk.onHit) atk.onHit(p);
      }
      notifyActionBar(p, r.outcome === "hit" ? `§c${atk.name}を受けた` : `§b${atk.name}を${r.outcome.includes("dodge") ? "回避" : "防いだ"}！`, 30);
    }
  }, ticks);
  return ticks;
}

/**
 * ボス特殊能力（検証用の実装。ボスごとの調整は第7弾）
 * @returns {boolean}
 */
export function useBossAbility(boss, id) {
  const a = BOSS_ABILITIES[id];
  if (!a) return false;
  const en = ctx.combat.enemy({ id: boss.id, typeId: boss.typeId });
  if (en.disabled.has(id)) return false; // 部位破壊などで止められている
  const near = world.getAllPlayers().filter((p) => dist(p.location, boss.location) < 24);
  for (const p of near) notifyActionBar(p, `§5§l${a.name}`, 40);
  switch (id) {
    case "invisibility":
      boss.addEffect("invisibility", a.duration, { showParticles: false });
      return true;
    case "invulnerable":
      en.invulnerable = true;
      system.runTimeout(() => (en.invulnerable = false), a.duration);
      return true;
    case "teleport": {
      const t = near[Math.floor(Math.random() * near.length)];
      if (t) boss.teleport({ x: t.location.x + 3, y: t.location.y, z: t.location.z + 3 }, { checkForBlocks: true });
      return true;
    }
    case "nullify":
      telegraphAttack(boss, { name: a.name, radius: a.radius, ticks: a.telegraph, damage: 0.1, onHit: (p) => ctx.combat.applyStatus(p.id, a.status, { force: true, source: boss.typeId }) });
      return true;
    case "heal": {
      const h = boss.getComponent(EntityComponentTypes.Health);
      const blocked = Object.keys(ctx.combat.statusesOf(boss.id)).includes("heal_block");
      if (h && !blocked) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + h.effectiveMax * a.ratio));
      return !blocked;
    }
    case "instant_down":
      // 予告つき。ジャスト回避・ジャストガード・範囲外への退避で防げる（戦闘の数値で大ダメージ）
      telegraphAttack(boss, { name: a.name, radius: a.radius, ticks: a.telegraph, damage: 99999 });
      return true;
    case "graduation_refusal":
      // 戦闘中だけ奥義・使徒スキルを使えなくする。保存データ（育成記録）は変更しない
      for (const p of near) ctx.combat.player(p.id).restricted = { until: system.currentTick + a.duration, categories: a.restrict };
      return true;
    case "time_rewind": {
      const h = boss.getComponent(EntityComponentTypes.Health);
      if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + h.effectiveMax * a.ratio));
      return true;
    }
    case "world_create":
      for (const p of near) ctx.combat.applyStatus(p.id, "slow", { force: true, source: boss.typeId });
      return true;
    case "memory_replay":
      telegraphAttack(boss, { name: a.name, radius: 8, ticks: a.telegraph, damage: 200 });
      return true;
    default:
      return false;
  }
}
