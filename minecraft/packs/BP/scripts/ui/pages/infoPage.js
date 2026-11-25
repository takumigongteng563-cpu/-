// 情報表示ページの共通部品（本文 + 戻る/閉じる）
import { ActionFormData } from "@minecraft/server-ui";
import { showForm } from "../formUtil.js";

/**
 * @param {import("@minecraft/server").Player} player
 * @param {string} title
 * @param {string} body
 * @param {{label: string, run: () => Promise<any>|any}[]} [extraButtons]
 * @returns {Promise<"back"|"close">}
 */
export async function showInfoPage(player, title, body, extraButtons = []) {
  const form = new ActionFormData().title(title).body(body);
  for (const b of extraButtons) form.button(b.label);
  form.button("§l戻る");
  form.button("閉じる");
  const res = await showForm(player, form);
  if (!res || res.selection === undefined) return "close";
  const i = res.selection;
  if (i < extraButtons.length) {
    await extraButtons[i].run();
    return "back";
  }
  if (i === extraButtons.length) return "back";
  return "close";
}
