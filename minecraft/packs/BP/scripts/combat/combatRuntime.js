// =============================================================
// 戦闘のゲーム内処理（第5弾）。安定版 Script API のみ
// ・二重適用の防止：バニラの攻撃で入ったダメージを基準に、戦闘計算との差分だけを applyDamage（または回復）で調整する。
//   アドオン自身の applyDamage は ownDamage に記録し、entityHurt で再計算しない
// ・敵からの攻撃：ガード・回避の結果に応じて、受けたダメージの一部を回復で戻す（バニラのダメージは止められないため）
// ・ガード＝しゃがみ（技の触媒・盾・剣を持っているとき）。しゃがみ始めて6tick以内に受けるとジャストガード
// ・回避＝ダッシュ中にジャンプ（または移動技の使用）。開始4tick以内に受けるとジャスト回避
// ・継続ダメージ・ヘイト・戦闘終了は1秒ごと、ガード・回避の確認は2tickごと（戦闘中のプレイヤーだけ）
// =============================================================
import { world, system, EntityComponentTypes, EntityDamageCause, Player } from "@minecraft/server";
import { ctx } from "../core/context.js";
import { subscribe } from "../core/events.js";
import { every } from "../core/scheduler.js";
import { COMBAT, PARTY_SCALING, COMBAT_LIMITS } from "../balance/combat.js";
import { STATUS_EFFECTS, VANILLA_TO_STATUS } from "../content/combat/statusEffects.js";
import { ELEMENTS } from "../content/combat/elements.js";
import { enemyProfile } from "../content/combat/enemies.js";
import { weaponCategory, isMonster } from "../actions/combatHooks.js";
import { notifyActionBar } from "../hud/hud.js";

/** アドオンが与えたダメージ（entityId → tick）。entityHurt で二重に計算しない */
const ownDamage = new Map();
/** 直前に攻撃した敵（HUD 表示用） playerId → { entity, tick, result } */
export const lastTarget = new Map();
const sneakOn = new Map();
const sprintJump = new Map();
const lastPos = new Map();
/** 戦闘中のエンティティ（継続ダメージ・ヘイトの処理対象。範囲を限定して検索しない） */
const tracked = new Map();
export const DUMMY_TAG = "noguchi_dummy";

function valid(e) {
  try {
    return !!e && e.isValid;
  } catch {
    return false;
  }
}

function health(e) {
  try {
    return e.getComponent(EntityComponentTypes.Health);
  } catch {
    return undefined;
  }
}

export function markOwn(entity) {
  ownDamage.set(entity.id, system.currentTick);
}

function isOwn(entity) {
  const t = ownDamage.get(entity.id);
  return t !== undefined && system.currentTick - t <= 1;
}

/** アドオンからダメージを与える（二重計算しない） */
export function dealVanilla(target, amount, player, magic = true) {
  if (!(amount > 0) || !valid(target)) return false;
  markOwn(target);
  try {
    return target.applyDamage(Math.min(amount, 2048), { cause: magic ? EntityDamageCause.magic : EntityDamageCause.entityAttack, damagingEntity: player });
  } catch {
    return false;
  }
}

function heldWeapon(player) {
  try {
    const inv = player.getComponent(EntityComponentTypes.Inventory);
    const it = inv && inv.container ? inv.container.getItem(player.selectedSlotIndex) : undefined;
    return it ? weaponCategory(it.typeId) : "unarmed";
  } catch {
    return "unarmed";
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** 状態異常の見た目（バニラの状態効果） */
function showStatus(entity, sid) {
  const s = STATUS_EFFECTS[sid];
  if (!s || !s.vanilla) {
    if (sid === "burn") try {
      entity.setOnFire(Math.ceil(s.duration / 20), true);
    } catch {
      // 無視
    }
    return;
  }
  try {
    entity.addEffect(s.vanilla, s.duration, { amplifier: s.amp || 0, showParticles: true });
  } catch {
    // 無視
  }
}

/**
 * プレイヤーの攻撃（スキル・通常攻撃の共通）
 * @param {any} player
 * @param {any} target
 * @param {any} hit combatService.playerAttack の hit
 * @param {{vanillaAlready?: number, knockback?: number}} [opt] vanillaAlready＝バニラの攻撃ですでに入ったダメージ
 */
export function strike(player, target, hit, opt = {}) {
  if (!ctx.ready || !valid(target)) return null;
  const h = health(target);
  const r = ctx.combat.playerAttack(player.id, { id: target.id, typeId: target.typeId, maxHp: h ? h.effectiveMax : 20, distance: dist(player.location, target.location) }, hit);
  if (!r) return null;
  const already = opt.vanillaAlready || 0;
  const delta = Math.round((r.vanilla - already) * 100) / 100;
  if (delta > 0) dealVanilla(target, delta, player, hit.type !== "physical");
  else if (delta < 0 && h) {
    try {
      h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue - delta));
    } catch {
      // 無視
    }
  }
  if (opt.knockback) {
    try {
      const d = player.getViewDirection();
      const k = opt.knockback * (hit.elements && hit.elements.includes("wind") ? 1.5 : 1);
      target.applyKnockback({ x: d.x * k, z: d.z * k }, 0.25);
    } catch {
      // 無視
    }
  }
  for (const sid of r.applied) showStatus(target, sid);
  if (r.fusion) runFusion(player, target, r.fusion, hit);
  if (r.broke) notifyActionBar(player, "§6§l体勢崩し！ §r§e今が攻撃のチャンス", 30);
  if (r.partBroken) notifyActionBar(player, `§6§l部位破壊：${r.partBroken.name}`, 40);
  lastTarget.set(player.id, { entity: target, tick: system.currentTick, result: r });
  if (tracked.size < COMBAT_LIMITS.trackedEnemies) tracked.set(target.id, target);
  return r;
}

/** 属性融合の効果（範囲の追加攻撃・回復・召喚） */
function runFusion(player, center, fusion, hit) {
  const f = fusion.effect;
  notifyActionBar(player, `§d§l属性融合：${fusion.name}`, 40);
  try {
    player.dimension.spawnParticle("minecraft:huge_explosion_emitter", center.location);
  } catch {
    // 無視
  }
  if (f.type === "field") {
    let targets = [];
    try {
      targets = center.dimension.getEntities({ location: center.location, maxDistance: f.radius, families: ["monster"] }).slice(0, 12);
    } catch {
      targets = [];
    }
    for (const t of targets) strike(player, t, { type: "elemental", base: hit.base, skillMult: (hit.skillMult || 1) * f.power, elements: fusion.elements, statuses: f.status ? [{ id: f.status, chance: 60 }] : [], noFusion: true, skillId: `fusion:${fusion.id}` });
    if (f.cleanse) for (const p of center.dimension.getEntities({ location: center.location, maxDistance: f.radius, type: "minecraft:player" })) ctx.combat.cure(p.id, "cleanse");
  } else if (f.type === "heal") {
    for (const p of center.dimension.getEntities({ location: center.location, maxDistance: f.radius, type: "minecraft:player" })) {
      const h = health(p);
      if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + h.effectiveMax * f.power * 0.2));
    }
  }
  // 特殊召喚はスキルの召喚と同じ上限で skillEffects が処理する（ここでは演出のみ）
}

/** スキルの攻撃（skillEffects から使う） */
export function skillStrike(player, def, stats, target, extra = 1) {
  const kind = def.power ? def.power.kind : "physical";
  const els = (def.elements || []).filter((e) => e !== "none");
  const d = ctx.playerService.dataFor(player.id);
  const derived = (d && d.computed.derived) || {};
  const type = kind === "physical" ? (def.effect.pierceDef ? "pierce" : "physical") : def.category === "apostle" ? "divine" : els.length ? "elemental" : "magical";
  const statuses = (def.effect.statusEffects || []).map((s) => ({ id: VANILLA_TO_STATUS[s.id] || s.id, chance: 70 })).filter((s) => STATUS_EFFECTS[s.id]);
  return strike(
    player,
    target,
    {
      type,
      base: kind === "physical" ? derived.physAtk : derived.magAtk,
      skillMult: (Math.max(1, stats.power) / 10) * extra * (def.effect.hits || 1),
      elements: def.elements,
      skillId: def.id,
      skillLevel: stats.level,
      statuses,
      linked: !!stats.linked,
      weapon: (def.weapons || [])[0],
      airborne: !!(player.isJumping || !player.isOnGround),
    },
    { knockback: def.effect.knockback || 0 }
  );
}

// ---------------- 受けたダメージ ----------------
function onHurt(ev) {
  const victim = ev.hurtEntity;
  const src = ev.damageSource || {};
  const by = src.damagingEntity;
  if (!ctx.ready || !valid(victim)) return;
  if (isOwn(victim)) return;
  // プレイヤーの通常攻撃 → モンスター
  if (by instanceof Player && !(victim instanceof Player)) {
    if (!isMonster(victim) && !victim.hasTag("noguchi_dummy")) return;
    const d = ctx.playerService.dataFor(by.id);
    if (!d) return;
    strike(by, victim, { type: "physical", base: d.computed.derived.physAtk, weaponMult: Math.max(1, ev.damage), isNormal: true, weapon: heldWeapon(by), airborne: !!(by.isJumping || !by.isOnGround) }, { vanillaAlready: ev.damage });
    return;
  }
  // 仲間への誤攻撃は無効（プレイヤー同士）
  if (by instanceof Player && victim instanceof Player) {
    const h = health(victim);
    if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + ev.damage));
    return;
  }
  // 敵 → プレイヤー
  if (victim instanceof Player && by && !(by instanceof Player)) {
    const r = ctx.combat.incoming(victim.id, { id: by.id, typeId: by.typeId }, ev.damage, ctx.vitals);
    const back = ev.damage * (1 - r.keep);
    const h = health(victim);
    if (h && back !== 0) {
      try {
        h.setCurrentValue(Math.min(h.effectiveMax, Math.max(0.5, h.currentValue + back)));
      } catch {
        // 無視
      }
    }
    if (r.outcome !== "hit") notifyActionBar(victim, OUTCOME_TEXT[r.outcome], 20);
    if (r.guardHeal > 0) for (const p of world.getAllPlayers()) if (dist(p.location, victim.location) < 6) {
      const ph = health(p);
      if (ph) ph.setCurrentValue(Math.min(ph.effectiveMax, ph.currentValue + ph.effectiveMax * r.guardHeal));
    }
    // 敵の属性による状態異常
    const prof = enemyProfile(by.typeId);
    if (r.outcome === "hit") for (const sid of ELEMENTS[prof.element].status) if (ctx.combat.applyStatus(victim.id, sid, { source: by.typeId, chance: STATUS_EFFECTS[sid].chance * 0.3, resistPct: (ctx.playerService.dataFor(victim.id)?.computed.derived.statusResist) || 0 })) showStatus(victim, sid);
    ctx.combat.cure(victim.id, "hit");
  }
}

const OUTCOME_TEXT = { guard: "§7ガード", just_guard: "§b§lジャストガード！ §r§b反撃のチャンス", dodge: "§7回避", just_dodge: "§d§lジャスト回避！ §r§d反撃のチャンス" };

function onDie(ev) {
  const dead = ev.deadEntity;
  if (!ctx.ready) return;
  if (dead instanceof Player) {
    const by = ev.damageSource && ev.damageSource.damagingEntity;
    ctx.combat.onDefeat(dead.id, { cause: String(ev.damageSource ? ev.damageSource.cause : "unknown"), by: by ? by.typeId : null, statuses: Object.keys(ctx.combat.statusesOf(dead.id)) });
    return;
  }
  ctx.combat.forgetEntity(dead.id);
}

// ---------------- ガード・回避の確認（2tickごと・戦闘中のプレイヤーだけ） ----------------
function pollDefense() {
  if (!ctx.ready) return;
  for (const p of world.getAllPlayers()) {
    const s = ctx.combat.players.get(p.id);
    if (!s || !s.battle) {
      sneakOn.delete(p.id);
      continue;
    }
    const guard = !!p.isSneaking;
    if (guard && !sneakOn.get(p.id)) ctx.combat.startGuard(p.id);
    if (!guard && sneakOn.get(p.id)) ctx.combat.stopGuard(p.id);
    sneakOn.set(p.id, guard);
    const sj = !!(p.isSprinting && p.isJumping);
    if (sj && !sprintJump.get(p.id)) {
      const r = ctx.combat.tryDodge(p.id, ctx.vitals);
      if (!r.ok) notifyActionBar(p, `§7回避できない（${r.reason}）`, 15);
    }
    sprintJump.set(p.id, sj);
    const lp = lastPos.get(p.id);
    if (lp) s.moved += Math.min(8, dist(lp, p.location));
    lastPos.set(p.id, { ...p.location });
  }
}

// ---------------- 1秒ごと ----------------
function perSecond() {
  if (!ctx.ready) return;
  const entities = new Map();
  for (const p of world.getAllPlayers()) entities.set(p.id, p);
  for (const [id, e] of tracked) {
    if (!valid(e) || !ctx.combat.enemies.has(id)) tracked.delete(id);
    else entities.set(id, e);
  }
  // 訓練ダミーは倒れない（受けたダメージは戦闘ログで確認）
  for (const e of entities.values()) if (e.hasTag && e.hasTag(DUMMY_TAG)) {
    const h = health(e);
    if (h) h.resetToMaxValue();
  }
  // 参加人数（近くにいるプレイヤー）
  const players = world.getAllPlayers();
  ctx.combat.partyCount = () => Math.max(1, Math.min(4, players.length));
  const r = ctx.combat.tick((id) => {
    const e = entities.get(id);
    const h = e && health(e);
    return h ? h.effectiveMax : 20;
  });
  for (const dot of r.dots.slice(0, COMBAT_LIMITS.statusTickBatch)) {
    const e = entities.get(dot.id);
    if (!valid(e)) continue;
    const src = typeof dot.source === "string" ? players.find((p) => p.id === dot.source) : undefined;
    markOwn(e);
    try {
      e.applyDamage(dot.vanilla, src ? { cause: EntityDamageCause.magic, damagingEntity: src } : { cause: EntityDamageCause.magic });
    } catch {
      // 無視
    }
  }
  // 敵の標的（ヘイト）。標的を変えるときは、標的のプレイヤーからごく小さいダメージを与えて注意を向けさせる【暫定】
  for (const [eid, en] of ctx.combat.enemies) {
    const e = entities.get(eid);
    if (!valid(e)) continue;
    const cands = players.filter((p) => dist(p.location, e.location) <= PARTY_SCALING.radius).map((p) => {
      const h = health(p);
      return { pid: p.id, distance: dist(p.location, e.location), hpRatio: h ? h.currentValue / h.effectiveMax : 1 };
    });
    const c = ctx.combat.chooseTarget(eid, cands);
    if (c && c.changed) {
      const p = players.find((x) => x.id === c.target);
      if (p) dealVanilla(e, 0.01, p, true);
    }
    void en;
  }
  for (const [id, t] of ownDamage) if (system.currentTick - t > 40) ownDamage.delete(id);
  for (const [id, lt] of lastTarget) if (!valid(lt.entity) || system.currentTick - lt.tick > 400) lastTarget.delete(id);
}

export function registerCombatRuntime() {
  subscribe(world.afterEvents.entityHurt, "combat5.hurt", onHurt);
  subscribe(world.afterEvents.entityDie, "combat5.die", onDie);
  every("combat5.defense", 2, pollDefense);
  every("combat5.second", 20, perSecond);
}

export function forgetCombatRuntime(playerId) {
  sneakOn.delete(playerId);
  sprintJump.delete(playerId);
  lastPos.delete(playerId);
  lastTarget.delete(playerId);
  tracked.delete(playerId);
}

export { COMBAT };
