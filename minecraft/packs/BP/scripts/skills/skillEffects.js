// =============================================================
// スキルの効果（ゲーム側・第4弾）：効果の型ごとの共通処理
// ・1回の発動で1回だけ処理する（毎tickの処理を持たない）
// ・攻撃判定は必要な範囲だけ（getEntities の半径・視線の距離を限定）
// ・パーティクルは1回の発動あたり PARTICLE_LIMIT 個まで、召喚は1人 SUMMON_LIMIT.perPlayer 体・ワールド perWorld 体まで
// ・召喚・一時効果は期限で確実に消える（召喚獣はワールドを開き直したときも掃除する）
// ・ダメージは暫定の換算（威力 × DAMAGE_SCALE をバニラの体力で与える）。本格的な戦闘計算・属性相性は第5弾
// 使う安定版 API：Entity.applyDamage / applyKnockback / addEffect / teleport / getViewDirection /
//   getEntitiesFromViewDirection / getBlockFromViewDirection、Dimension.getEntities / spawnEntity / spawnParticle / playSound
// =============================================================
import { world, system, EntityComponentTypes, EntityDamageCause } from "@minecraft/server";
import { ctx } from "../core/context.js";
import { createLogger } from "../core/log.js";
import { DAMAGE_SCALE, MAX_DAMAGE_PER_HIT, PARTICLE_LIMIT, SUMMON_LIMIT } from "../balance/skills.js";

const log = createLogger("skillfx");
export const SUMMON_TAG = "mnq_summon";
const EXCLUDE_FAMILIES = ["player", "inanimate", "villager", "wandering_trader", "npc"];
const EXCLUDE_TYPES = ["minecraft:item", "minecraft:xp_orb", "minecraft:armor_stand", "minecraft:arrow", "minecraft:painting", "minecraft:minecart", "minecraft:boat", "minecraft:chest_boat"];
const BAD_EFFECTS = ["poison", "wither", "slowness", "weakness", "blindness", "nausea", "mining_fatigue"];

/** @type {Map<string, {entity: any, until: number}[]>} 召喚者 → 召喚獣 */
const summons = new Map();

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

function valid(e) {
  try {
    return !!e && e.isValid;
  } catch {
    return false;
  }
}

function enemiesAround(dim, center, radius, player) {
  try {
    return dim
      .getEntities({ location: center, maxDistance: radius, excludeFamilies: EXCLUDE_FAMILIES, excludeTypes: EXCLUDE_TYPES, excludeTags: [SUMMON_TAG] })
      .filter((e) => e.id !== player.id && !isTamed(e));
  } catch {
    return [];
  }
}

function isTamed(e) {
  try {
    const t = e.getComponent(EntityComponentTypes.IsTamed);
    return !!t;
  } catch {
    return false;
  }
}

function alliesAround(player, radius) {
  try {
    return player.dimension.getEntities({ location: player.location, maxDistance: radius, type: "minecraft:player" });
  } catch {
    return [player];
  }
}

function particles(player, def, points) {
  const id = def.fx && def.fx.particle;
  if (!id) return;
  const n = Math.min(PARTICLE_LIMIT, points.length);
  for (let i = 0; i < n; i++) {
    try {
      player.dimension.spawnParticle(id, points[i]);
    } catch {
      return; // 存在しないパーティクルは以降も出さない
    }
  }
}

function sound(player, def) {
  const id = def.fx && def.fx.sound;
  if (!id) return;
  try {
    player.dimension.playSound(id, player.location, { volume: 0.8 });
  } catch {
    // 無視
  }
}

/** 輪の形の点（パーティクル用） */
function ring(center, r, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    out.push({ x: center.x + Math.cos(a) * r, y: center.y + 0.3, z: center.z + Math.sin(a) * r });
  }
  return out;
}

function line(from, dir, length, n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(add(from, mul(dir, (length * i) / n)));
  return out;
}

function damageOf(stats) {
  return Math.max(1, Math.min(MAX_DAMAGE_PER_HIT, Math.round(stats.power * DAMAGE_SCALE * 10) / 10));
}

function hit(player, def, stats, targets, extra = 1) {
  const physical = def.power && def.power.kind === "physical";
  const dmg = damageOf(stats) * extra * (def.effect.hits || 1);
  const dir = player.getViewDirection();
  let n = 0;
  for (const e of targets) {
    if (!valid(e)) continue;
    try {
      const ok = e.applyDamage(dmg, { cause: physical ? EntityDamageCause.entityAttack : EntityDamageCause.magic, damagingEntity: player });
      if (ok) n++;
      if (def.effect.knockback) e.applyKnockback({ x: dir.x * def.effect.knockback, z: dir.z * def.effect.knockback }, 0.25);
      applyStatus(e, def, stats);
    } catch {
      // 対象が消えた等
    }
  }
  return n;
}

function applyStatus(e, def, stats) {
  for (const s of def.effect.statusEffects || []) {
    try {
      e.addEffect(s.id, Math.max(20, stats.duration || 60), { amplifier: s.amplifier || 0, showParticles: true });
    } catch {
      // 無視
    }
  }
}

function targetPoint(player, distance) {
  const head = player.getHeadLocation();
  const dir = player.getViewDirection();
  try {
    const ent = player.getEntitiesFromViewDirection({ maxDistance: distance, excludeFamilies: EXCLUDE_FAMILIES, excludeTags: [SUMMON_TAG] })[0];
    if (ent && ent.entity) return ent.entity.location;
    const b = player.getBlockFromViewDirection({ maxDistance: distance });
    if (b && b.block) return { x: b.block.location.x + 0.5, y: b.block.location.y + 1, z: b.block.location.z + 0.5 };
  } catch {
    // 無視
  }
  return add(head, mul(dir, distance));
}

function buffTargets(player, def, stats) {
  if (def.shape === "party" || def.target === "ally") return alliesAround(player, stats.range || 8);
  return [player];
}

function giveBuff(def, stats, targets, buff, sourcePrefix) {
  if (!buff) return 0;
  let n = 0;
  for (const t of targets) {
    if (!valid(t)) continue;
    const ok = ctx.stats.addBuff(t.id, { id: `skill:${def.id}`, name: def.name, source: sourcePrefix, stats: buff.stats, derived: buff.derived, durationTicks: Math.max(20, stats.duration || 200) });
    if (ok) n++;
  }
  return n;
}

function sourceOf(def) {
  return def.category === "apostle" ? `apostle:${def.god}` : "skill";
}

/** 安全な移動先（足元と頭の位置が空気のブロック）を前方から探す */
function safeForward(player, distance) {
  const dir = player.getViewDirection();
  const flat = Math.hypot(dir.x, dir.z) || 1;
  const d = { x: dir.x / flat, y: 0, z: dir.z / flat };
  const dim = player.dimension;
  for (let k = distance; k >= 1; k -= 0.5) {
    const p = add(player.location, mul(d, k));
    try {
      const feet = dim.getBlock({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) });
      const head = dim.getBlock({ x: Math.floor(p.x), y: Math.floor(p.y) + 1, z: Math.floor(p.z) });
      if (feet && head && feet.isAir && head.isAir) return p;
    } catch {
      return null;
    }
  }
  return null;
}

function cleanupSummons(owner) {
  const now = system.currentTick;
  const list = (summons.get(owner) || []).filter((s) => valid(s.entity) && s.until > now);
  summons.set(owner, list);
  return list;
}

function totalSummons() {
  let n = 0;
  for (const k of [...summons.keys()]) n += cleanupSummons(k).length;
  return n;
}

const HANDLERS = {
  projectile(player, def, stats) {
    const max = (def.effect.pierce || 0) + 1;
    let hits = [];
    try {
      hits = player.getEntitiesFromViewDirection({ maxDistance: stats.distance || 16, excludeFamilies: EXCLUDE_FAMILIES, excludeTypes: EXCLUDE_TYPES, excludeTags: [SUMMON_TAG] }).map((h) => h.entity).filter((e) => !isTamed(e));
    } catch {
      hits = [];
    }
    const targets = hits.slice(0, max);
    particles(player, def, line(player.getHeadLocation(), player.getViewDirection(), stats.distance || 16, 8));
    return { hits: hit(player, def, stats, targets) };
  },
  area(player, def, stats) {
    const center = def.effect.center === "self" || def.shape === "circle" ? player.location : targetPoint(player, stats.distance || 16);
    const targets = enemiesAround(player.dimension, center, stats.range || 3, player);
    particles(player, def, ring(center, stats.range || 3, 12));
    return { hits: hit(player, def, stats, targets) };
  },
  melee(player, def, stats) {
    const r = stats.range || 3;
    const dir = player.getViewDirection();
    let targets = enemiesAround(player.dimension, player.location, r, player);
    if (def.shape === "cone" || def.shape === "single") {
      targets = targets.filter((e) => {
        const v = { x: e.location.x - player.location.x, z: e.location.z - player.location.z };
        const len = Math.hypot(v.x, v.z) || 1;
        return (v.x * dir.x + v.z * dir.z) / len >= 0.45;
      });
      if (def.shape === "single") targets = targets.sort((a, b) => dist2(a.location, player.location) - dist2(b.location, player.location)).slice(0, 1);
    }
    particles(player, def, def.shape === "circle" ? ring(player.location, r, 10) : line(player.getHeadLocation(), dir, r, 5));
    return { hits: hit(player, def, stats, targets) };
  },
  dash(player, def, stats) {
    const to = safeForward(player, stats.distance || 6);
    if (!to) return null; // 移動できない（壁など）→ 不発
    particles(player, def, line(player.location, player.getViewDirection(), stats.distance || 6, 6));
    player.teleport(to, { keepVelocity: false, checkForBlocks: true });
    let hits = 0;
    if (def.effect.strike && def.power) hits = hit(player, def, stats, enemiesAround(player.dimension, to, stats.range || 3, player).slice(0, 3), 1 + (def.effect.critBonus || 0));
    const allies = def.effect.buff ? giveBuff(def, stats, [player], def.effect.buff, sourceOf(def)) : 0;
    return { hits, allies: hits === 0 ? Math.min(1, allies) : 0 };
  },
  blink(player, def, stats) {
    const to = safeForward(player, stats.distance || 8);
    if (!to) return null;
    particles(player, def, [player.location, to]);
    player.teleport(to, { keepVelocity: false, checkForBlocks: true });
    return { hits: 0 };
  },
  heal(player, def, stats) {
    const amount = Math.max(1, Math.round(stats.power * DAMAGE_SCALE));
    let allies = 0;
    const targets = def.shape === "self" ? [player] : alliesAround(player, stats.range || 6);
    for (const t of targets) {
      try {
        const h = t.getComponent(EntityComponentTypes.Health);
        if (h && h.currentValue < h.effectiveMax) {
          h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + amount));
          allies++;
        }
        if (def.effect.cleanse) for (const id of BAD_EFFECTS) t.removeEffect(id);
      } catch {
        // 無視
      }
    }
    if (def.effect.buff) giveBuff(def, stats, targets, def.effect.buff, sourceOf(def));
    particles(player, def, ring(player.location, Math.min(4, stats.range || 3), 8));
    return { hits: 0, allies };
  },
  buff(player, def, stats) {
    const targets = buffTargets(player, def, stats);
    let n = giveBuff(def, stats, targets, def.effect.buff, sourceOf(def));
    if (def.effect.statusEffects) {
      for (const t of targets) applyStatus(t, def, stats);
      n = Math.max(n, targets.length);
    }
    particles(player, def, ring(player.location, 1.2, 8));
    return n > 0 ? { hits: 0, allies: n } : null;
  },
  shield(player, def, stats) {
    const targets = def.effect.self || def.shape !== "party" ? [player] : alliesAround(player, stats.range || 6);
    const n = giveBuff(def, stats, targets, def.effect.buff, sourceOf(def));
    if (def.effect.resistance) for (const t of targets) {
      try {
        t.addEffect("resistance", Math.max(20, stats.duration || 100), { amplifier: def.effect.resistance - 1, showParticles: false });
      } catch {
        // 無視
      }
    }
    let hits = 0;
    if (def.effect.alsoDebuff) {
      const foes = enemiesAround(player.dimension, player.location, stats.range || 5, player);
      for (const e of foes) for (const s of def.effect.alsoDebuff) {
        try {
          e.addEffect(s.id, Math.max(20, stats.duration || 100), { amplifier: s.amplifier || 0 });
          hits++;
        } catch {
          // 無視
        }
      }
    }
    particles(player, def, ring(player.location, 1.5, 10));
    return { hits, allies: n };
  },
  debuff(player, def, stats) {
    const center = def.effect.center === "self" || def.shape === "circle" ? player.location : targetPoint(player, stats.distance || 12);
    const foes = enemiesAround(player.dimension, center, stats.range || 5, player);
    for (const e of foes) applyStatus(e, def, stats);
    particles(player, def, ring(center, stats.range || 5, 10));
    let hits = foes.length;
    if (def.power && foes.length) hits = hit(player, def, stats, foes);
    return { hits };
  },
  summon(player, def, stats) {
    const owner = player.id;
    const mine = cleanupSummons(owner);
    const want = def.effect.count || 1;
    if (mine.length >= SUMMON_LIMIT.perPlayer) return null;
    if (totalSummons() >= SUMMON_LIMIT.perWorld) return null;
    const n = Math.min(want, SUMMON_LIMIT.perPlayer - mine.length, SUMMON_LIMIT.perWorld - totalSummons());
    const until = system.currentTick + Math.max(100, stats.duration || 300);
    for (let i = 0; i < n; i++) {
      try {
        const loc = add(player.location, { x: Math.cos(i * 2) * 1.5, y: 0, z: Math.sin(i * 2) * 1.5 });
        const e = player.dimension.spawnEntity(def.effect.entity || "minecraft:snow_golem", loc);
        e.addTag(SUMMON_TAG);
        try {
          const tm = e.getComponent(EntityComponentTypes.Tameable);
          if (tm) tm.tame(player);
        } catch {
          // 飼いならせない種類
        }
        mine.push({ entity: e, until });
        system.runTimeout(() => {
          if (valid(e)) e.remove();
        }, until - system.currentTick);
      } catch (err) {
        log.warn("召喚に失敗:", err);
      }
    }
    summons.set(owner, mine);
    particles(player, def, ring(player.location, 1.5, 8));
    return n > 0 ? { hits: 0, allies: 1 } : null;
  },
};

/** SkillBindingService.runner に設定する共通処理 */
export function runSkill(player, def, stats) {
  const h = HANDLERS[def.effect && def.effect.type];
  if (!h) return null;
  const r = h(player, def, stats);
  if (r) sound(player, def);
  return r;
}

/** 召喚者の退出・ワールドの再読み込み時に召喚獣を消す */
export function removeSummonsOf(playerId) {
  for (const s of summons.get(playerId) || []) if (valid(s.entity)) s.entity.remove();
  summons.delete(playerId);
}

export function cleanupStraySummons() {
  for (const id of ["overworld", "nether", "the_end"]) {
    try {
      for (const e of world.getDimension(id).getEntities({ tags: [SUMMON_TAG] })) e.remove();
    } catch {
      // 無視
    }
  }
}
