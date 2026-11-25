// =============================================================
// 完全RPG型のための行動制限（ブロック破壊・設置・使用）
// ・制限の ON/OFF はワールド設定（world.settings.restrictions）に保存
// ・第1弾では既定ですべて OFF（通常どおり遊べる）
// ・クリエイティブモードと管理者タグ所持者は制限の対象外
// ・将来、拠点エリアだけ建築可能にする等の例外判定を isExempt に追加できる
// =============================================================
import { world, system, BlockTypes, GameMode, EntityComponentTypes } from "@minecraft/server";
import { ctx } from "../core/context.js";
import { subscribe } from "../core/events.js";
import { TAGS } from "../config.js";
import { isAdventurerBook } from "../items/adventurerBook.js";

const WARN_COOLDOWN_MS = 2000;
/** @type {Map<string, number>} */
const lastWarn = new Map();

/** 制限設定（キャッシュ済みのワールドデータから読む。保存領域へのアクセスは発生しない） */
function restrictions() {
  if (!ctx.ready) return null;
  return ctx.worldService.world.settings.restrictions;
}

/** 制限の対象外か（読み取り専用モードでも呼べる処理のみ使う） */
export function isExempt(player) {
  try {
    if (player.hasTag(TAGS.admin)) return true;
    if (player.getGameMode() === GameMode.Creative) return true;
  } catch {
    // 判定できない場合は制限対象とする
  }
  return false;
}

/** @param {import("@minecraft/server").Player} player */
function warn(player, text) {
  const now = Date.now();
  const last = lastWarn.get(player.id) || 0;
  if (now - last < WARN_COOLDOWN_MS) return;
  lastWarn.set(player.id, now);
  // before イベント中は書き込み系APIが使えないため次のtickで送る
  system.run(() => {
    try {
      if (player.isValid) player.onScreenDisplay.setActionBar(text);
    } catch {
      // 無視
    }
  });
}

/** @param {import("@minecraft/server").Player} player */
function heldItem(player) {
  try {
    const inv = player.getComponent(EntityComponentTypes.Inventory);
    return inv && inv.container ? inv.container.getItem(player.selectedSlotIndex) : undefined;
  } catch {
    return undefined;
  }
}

/** 持っているアイテムがブロックとして設置できるものか（簡易判定） */
function isPlaceableBlockItem(item) {
  if (!item) return false;
  try {
    return BlockTypes.get(item.typeId) !== undefined;
  } catch {
    return false;
  }
}

/**
 * @param {(player: any) => void} openMenu 冒険者の書をブロックに向けて使ったときに呼ぶ
 */
export function registerActionGuard(openMenu) {
  subscribe(world.beforeEvents.playerBreakBlock, "guard.break", (ev) => {
    const r = restrictions();
    if (!r || !r.blockBreak) return;
    if (isExempt(ev.player)) return;
    ev.cancel = true;
    warn(ev.player, "§cこの世界ではブロックを壊せません");
  });

  subscribe(world.beforeEvents.playerInteractWithBlock, "guard.interact", (ev) => {
    const item = ev.itemStack ?? heldItem(ev.player);
    // 冒険者の書をブロックに向けて使った場合もメニューを開く
    if (isAdventurerBook(item)) {
      ev.cancel = true;
      if (ev.isFirstEvent) {
        const p = ev.player;
        system.run(() => openMenu(p));
      }
      return;
    }
    const r = restrictions();
    if (!r || isExempt(ev.player)) return;
    if (r.blockPlace && isPlaceableBlockItem(item)) {
      ev.cancel = true;
      warn(ev.player, "§cこの世界ではブロックを置けません");
      return;
    }
    if (r.blockInteract) {
      ev.cancel = true;
      warn(ev.player, "§cこのブロックは使用できません");
    }
  });
}
