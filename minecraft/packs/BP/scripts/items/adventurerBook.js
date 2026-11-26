// 「冒険者の書」— RPG専用メニューを開くアイテム
import { ItemStack, ItemLockMode, EntityComponentTypes } from "@minecraft/server";
import { ITEM_IDS } from "../config.js";
import { createLogger } from "../core/log.js";

const log = createLogger("book");

export function isAdventurerBook(itemStack) {
  return !!itemStack && itemStack.typeId === ITEM_IDS.adventurerBook;
}

/** @param {import("@minecraft/server").Player} player */
function getContainer(player) {
  const inv = player.getComponent(EntityComponentTypes.Inventory);
  return inv && inv.container ? inv.container : undefined;
}

/** プレイヤーが冒険者の書を持っているか */
export function hasAdventurerBook(player) {
  const c = getContainer(player);
  if (!c) return false;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (isAdventurerBook(it)) return true;
  }
  return false;
}

export function createAdventurerBook() {
  const item = new ItemStack(ITEM_IDS.adventurerBook, 1);
  // インベントリから出せない（捨てて紛失しない）・死亡しても失わない
  item.lockMode = ItemLockMode.inventory;
  item.keepOnDeath = true;
  item.setLore(["§7使用するとRPGメニューを開く", "§8（ZL / 右クリック / 長押し）"]);
  return item;
}

/** 操作判定の確認用アイテム「修練の触媒」を渡す（管理者テスト用） */
export function giveSkillFocus(player) {
  try {
    const c = getContainer(player);
    if (!c) return false;
    const it = new ItemStack(ITEM_IDS.skillFocus, 1);
    it.setLore(["§7操作判定の確認用（管理者テスト）", "§8通常／ジャンプ中／ダッシュ中／しゃがみ溜め／長時間溜め"]);
    return c.addItem(it) === undefined;
  } catch (e) {
    log.error("修練の触媒の付与に失敗:", e);
    return false;
  }
}

/**
 * 持っていなければ渡す。
 * @returns {"has"|"given"|"full"|"error"}
 */
export function ensureAdventurerBook(player) {
  try {
    if (hasAdventurerBook(player)) return "has";
    const c = getContainer(player);
    if (!c) return "error";
    const left = c.addItem(createAdventurerBook());
    if (left) {
      player.sendMessage("§cインベントリがいっぱいのため「冒険者の書」を渡せませんでした。空きを作ってから再参加するか、管理者に /scriptevent noguchi:give_book を依頼してください。");
      return "full";
    }
    return "given";
  } catch (e) {
    log.error("冒険者の書の付与に失敗:", e);
    return "error";
  }
}
