// フォーム表示の共通処理
// ・チャット欄などが開いていて表示できない場合（UserBusy）は少し待って再試行する
// ・同じプレイヤーにメニューを多重に開かない
import { system } from "@minecraft/server";
import { FormCancelationReason } from "@minecraft/server-ui";
import { MENU } from "../config.js";
import { createLogger } from "../core/log.js";

const log = createLogger("ui");

/** 表示中のプレイヤーID */
const openFor = new Set();

/** @param {import("@minecraft/server").Player} player */
export function isMenuOpen(player) {
  return openFor.has(player.id);
}

function wait(ticks) {
  return new Promise((resolve) => system.runTimeout(() => resolve(undefined), ticks));
}

/**
 * フォームを表示し、結果を返す。閉じられた・表示できなかった場合は undefined。
 * @template R
 * @param {import("@minecraft/server").Player} player
 * @param {{show: (p: any) => Promise<R>}} form
 * @returns {Promise<R|undefined>}
 */
export async function showForm(player, form) {
  for (let attempt = 0; attempt <= MENU.busyRetryCount; attempt++) {
    if (!player.isValid) return undefined;
    let res;
    try {
      res = await form.show(player);
    } catch (e) {
      log.warn("フォーム表示に失敗:", e);
      return undefined;
    }
    // @ts-ignore 応答の型はフォームごとに異なる
    if (res && res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      await wait(MENU.busyRetryIntervalTicks);
      continue;
    }
    // @ts-ignore
    if (res && res.canceled) return undefined;
    return res;
  }
  return undefined;
}

/**
 * 多重表示を防いで処理を実行する
 * @param {import("@minecraft/server").Player} player
 * @param {() => Promise<void>} fn
 */
export async function withMenuLock(player, fn) {
  if (openFor.has(player.id)) return;
  openFor.add(player.id);
  try {
    await fn();
  } finally {
    openFor.delete(player.id);
  }
}

/** 退出時の後始末 */
export function releaseMenuLock(playerId) {
  openFor.delete(playerId);
}
