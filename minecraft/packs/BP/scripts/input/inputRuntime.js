// =============================================================
// ホットバー複数操作のゲーム内処理（最終仕様 Ver.1.0 第11章）
//
// 判定に使う安定版 API：
//   ・通常使用       world.afterEvents.itemUse
//   ・押して離す     world.afterEvents.itemStartUse / itemReleaseUse / itemStopUse（使用時間のあるアイテムのみ）
//   ・ジャンプ中     Player.isJumping / Player.isOnGround
//   ・ダッシュ中     Player.isSprinting
//   ・しゃがみ溜め   Player.isSneaking をしゃがみ続けた時間として計測（技アイテムを持っている人だけ、2tickごと）
// 判定は input/inputResolver.js（純粋な計算）で行う。
// 「操作判定テスト」タグ（noguchi_input_test）を持つと、判定結果だけを画面に表示する（実機確認用）。
// 第4弾：
//  ・溜めの進み具合を HUD に表示（chargeOf）。しゃがみを解く・持ち替えると溜めは取り消し（キャンセル）
//  ・詠唱中に持ち替える・技アイテムを手放すと詠唱を中断
//  ・詠唱の完了は2tickごとの確認で処理（毎tickの処理はしない）
// =============================================================
import { world, system, EntityComponentTypes } from "@minecraft/server";
import { ctx } from "../core/context.js";
import { subscribe } from "../core/events.js";
import { every } from "../core/scheduler.js";
import { INPUT, ACTION_TYPES } from "../balance/input.js";
import { SKILL_INPUT_ITEMS, TAGS } from "../config.js";
import { resolveAction } from "./inputResolver.js";
import { notifyActionBar } from "../hud/hud.js";
import { skills } from "../content/skills.js";
import { findPlayer } from "../core/players.js";

const SKILL_ITEMS = new Set(SKILL_INPUT_ITEMS);
const ACTION_NAME = Object.fromEntries(ACTION_TYPES.map((a) => [a.id, `${a.name}（${a.tier}）`]));

/** @type {Map<string, number>} playerId → しゃがみ始めたtick */
const sneakSince = new Map();
/** @type {Map<string, number>} playerId → しゃがみ始めた枠（持ち替えで溜めを取り消す） */
const sneakSlot = new Map();
/** @type {Map<string, {tick: number, slot: number, airborne: boolean, sprinting: boolean}>} 押して離す方式の押し始め */
const holds = new Map();
/** @type {Map<string, number>} 同じtickの二重処理防止 */
const lastResolved = new Map();

export function isSkillItem(typeId) {
  return !!typeId && SKILL_ITEMS.has(typeId);
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

function snapshot(player) {
  return {
    tick: system.currentTick,
    slot: player.selectedSlotIndex,
    airborne: !!player.isJumping || !player.isOnGround,
    sprinting: !!player.isSprinting,
  };
}

function sneakTicks(player) {
  const s = sneakSince.get(player.id);
  return player.isSneaking && s !== undefined ? system.currentTick - s : 0;
}

function handle(player, snap, holdTicks) {
  const now = system.currentTick;
  if (lastResolved.get(player.id) === now) return;
  lastResolved.set(player.id, now);
  const r = resolveAction({ holdTicks, sneaking: !!player.isSneaking, sneakTicks: sneakTicks(player), airborne: snap.airborne, sprinting: snap.sprinting });
  // 溜めを使い切ったので、しゃがみ時間をリセット
  if (r.action === "charge" || r.action === "ultimate") sneakSince.set(player.id, now);

  if (player.hasTag(TAGS.inputTest)) {
    notifyActionBar(
      player,
      r.action
        ? `§b操作判定: §f${ACTION_NAME[r.action]}  §7枠${snap.slot + 1} 溜め${r.charge}tick`
        : `§7操作判定: 不発（${r.reason}） 溜め${r.charge}tick`,
      40
    );
    return;
  }
  if (!r.action || !ctx.ready) return;
  const res = ctx.skillBindings.tryActivate(player.id, snap.slot, r.action, player);
  showResult(player, r.action, res);
}

function showResult(player, action, res) {
  const def = res.skillId ? skills.get(res.skillId) : null;
  if (res.casting) notifyActionBar(player, `§e詠唱中… §f${def ? def.name : ""}§7（${(res.casting / 20).toFixed(1)}秒・持ち替えで中断）`, Math.min(60, res.casting));
  else if (res.ok) notifyActionBar(player, `§a発動：§f${def ? def.name : ""}${res.linked ? " §d（連携！）" : ""}${res.hits ? ` §7命中${res.hits}` : ""}`, 20);
  else if (res.reason) notifyActionBar(player, `§7${ACTION_NAME[action] || ""}：§c${def ? `${def.name} ` : ""}${res.reason}`, 30);
}

/** 溜めの状態（HUD 表示用）。技アイテムを持っていなければ null */
export function chargeOf(player) {
  if (!isSkillItem(heldTypeId(player))) return null;
  const h = holds.get(player.id);
  const hold = h ? system.currentTick - h.tick : 0;
  const sneak = sneakTicks(player);
  return { ticks: Math.max(hold, sneak), sneaking: !!player.isSneaking };
}

function pollSneak() {
  for (const p of world.getAllPlayers()) {
    const holding = isSkillItem(heldTypeId(p));
    // 詠唱中に持ち替えた・技アイテムを手放した → 中断
    if (ctx.ready) {
      const c = ctx.skillBindings.casts.get(p.id);
      if (c && (!holding || p.selectedSlotIndex !== c.slot)) ctx.skillBindings.cancelCast(p.id, "持ち替え");
    }
    if (!p.isSneaking || !holding) {
      sneakSince.delete(p.id);
      sneakSlot.delete(p.id);
      continue;
    }
    // しゃがみ中に枠を変えたら溜め直し（キャンセル）
    if (sneakSlot.has(p.id) && sneakSlot.get(p.id) !== p.selectedSlotIndex) sneakSince.delete(p.id);
    if (!sneakSince.has(p.id)) {
      sneakSince.set(p.id, system.currentTick);
      sneakSlot.set(p.id, p.selectedSlotIndex);
    }
  }
  if (ctx.ready && ctx.skillBindings.casts.size > 0) {
    const results = ctx.skillBindings.updateCasts(
      (id) => findPlayer(id),
      (id, slot) => {
        const p = findPlayer(id);
        return !!p && p.selectedSlotIndex === slot && isSkillItem(heldTypeId(p));
      }
    );
    for (const r of results) {
      const p = findPlayer(r.playerId);
      if (p) showResult(p, "", r.res);
    }
  }
}

export function registerInputRuntime() {
  every("input.sneak", INPUT.sneakPollTicks, pollSneak);

  subscribe(world.afterEvents.itemStartUse, "input.start", (ev) => {
    if (!isSkillItem(ev.itemStack && ev.itemStack.typeId)) return;
    holds.set(ev.source.id, snapshot(ev.source));
  });

  const onRelease = (ev) => {
    const h = holds.get(ev.source.id);
    if (!h) return;
    holds.delete(ev.source.id);
    // 押している間に持ち替えた場合はキャンセル
    if (ev.source.selectedSlotIndex !== h.slot) return;
    handle(ev.source, h, system.currentTick - h.tick);
  };
  subscribe(world.afterEvents.itemReleaseUse, "input.release", onRelease);
  subscribe(world.afterEvents.itemStopUse, "input.stop", onRelease);

  subscribe(world.afterEvents.itemUse, "input.use", (ev) => {
    if (!isSkillItem(ev.itemStack && ev.itemStack.typeId)) return;
    const p = ev.source;
    const snap = snapshot(p);
    // 押して離す方式のアイテムなら itemStartUse が同時に来るので、次のtickで確認して二重処理を防ぐ
    system.run(() => {
      if (holds.has(p.id) || !p.isValid) return;
      handle(p, snap, 0);
    });
  });
}

export function forgetInputState(playerId) {
  sneakSince.delete(playerId);
  sneakSlot.delete(playerId);
  holds.delete(playerId);
  lastResolved.delete(playerId);
}
