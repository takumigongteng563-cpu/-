// 「冒険者の書」— RPG専用メニューを開くアイテム
import { ItemStack, ItemLockMode, EntityComponentTypes } from "@minecraft/server";
import { ITEM_IDS } from "../config.js";
import { createLogger } from "../core/log.js";
import { MAX_SKILL_FOCUS } from "../balance/skills.js";

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

/** 持っている「技の触媒」の数 */
export function countSkillFocus(player) {
  try {
    const c = getContainer(player);
    if (!c) return 0;
    let n = 0;
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it && it.typeId === ITEM_IDS.skillFocus) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

/**
 * 「技の触媒」を渡す（第4弾：一般プレイヤーも最大 MAX_SKILL_FOCUS 個まで。ホットバーの好きな枠に置いて使う）
 * @param {number} [want] 受け取る数（合計が上限を超えない範囲）
 * @returns {number} 渡した数
 */
export function giveSkillFocus(player, want = 1) {
  try {
    const c = getContainer(player);
    if (!c) return 0;
    const n = Math.max(0, Math.min(want, MAX_SKILL_FOCUS - countSkillFocus(player)));
    let given = 0;
    for (let i = 0; i < n; i++) {
      const it = new ItemStack(ITEM_IDS.skillFocus, 1);
      it.keepOnDeath = true;
      it.setLore(["§7ホットバーに置いて使う。置いた枠に割り当てた技が発動する", "§8通常／ジャンプ中／ダッシュ中／しゃがみ溜め／長時間溜め"]);
      if (c.addItem(it) !== undefined) break;
      given++;
    }
    return given;
  } catch (e) {
    log.error("技の触媒の付与に失敗:", e);
    return 0;
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
