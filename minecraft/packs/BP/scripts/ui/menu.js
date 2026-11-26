// =============================================================
// RPG専用メニュー（冒険者の書を使うと開く）
// ページを追加するときは PAGES に追加する（順番 = 表示順）。
// =============================================================
import { system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { ctx } from "../core/context.js";
import { MENU } from "../config.js";
import { createLogger } from "../core/log.js";
import { showForm, withMenuLock, isMenuOpen } from "./formUtil.js";
import { jobs } from "../content/index.js";
import { num } from "./format.js";
import { statusPage } from "./pages/status.js";
import { jobPage } from "./pages/job.js";
import { skillPage } from "./pages/skill.js";
import { talentPage } from "./pages/talent.js";
import { equipmentPage } from "./pages/equipment.js";
import { titlePage } from "./pages/title.js";
import { questPage } from "./pages/quest.js";
import { adventurerPage } from "./pages/adventurer.js";
import { dungeonPage } from "./pages/dungeon.js";
import { storagePage } from "./pages/storage.js";
import { settingsPage } from "./pages/settings.js";
import { godsPage } from "./pages/gods.js";

const log = createLogger("menu");

export const PAGES = [
  statusPage,
  jobPage,
  skillPage,
  talentPage,
  equipmentPage,
  titlePage,
  questPage,
  adventurerPage,
  dungeonPage,
  storagePage,
  settingsPage,
  godsPage, // 第4弾（既存の項目の順番を変えないよう末尾に追加）
];

/** @type {Map<string, number>} */
const lastOpen = new Map();

/**
 * メニューを開く。
 * @param {import("@minecraft/server").Player} player
 * @param {(player: any) => void} ensureJoined 参加処理が未完了の場合に呼ぶ
 */
export function openMainMenu(player, ensureJoined) {
  if (!ctx.ready) {
    player.sendMessage("§eデータを準備中です。少し待ってからもう一度お試しください。");
    return;
  }
  if (isMenuOpen(player)) return;
  const now = system.currentTick;
  const last = lastOpen.get(player.id);
  if (last !== undefined && now - last < MENU.openCooldownTicks) return;
  lastOpen.set(player.id, now);

  if (!ctx.playerService.getSession(player.id)) ensureJoined(player);
  if (!ctx.playerService.getSession(player.id)) {
    player.sendMessage("§cプレイヤーデータを読み込めませんでした。");
    return;
  }

  withMenuLock(player, async () => {
    for (;;) {
      const d = ctx.playerService.dataFor(player.id);
      const form = new ActionFormData()
        .title("§l冒険者の書")
        .body(`§l${d.name}§r  Lv ${num(d.level)}  ${jobs.get(d.job.current)?.name ?? d.job.current}\n金貨 ${num(d.gold)} G`);
      for (const p of PAGES) form.button(p.label, p.icon);
      const res = await showForm(player, form);
      if (!res || res.selection === undefined) return;
      const page = PAGES[res.selection];
      if (!page) return;
      let result;
      try {
        result = await page.open(player);
      } catch (e) {
        log.error(`ページ「${page.label}」でエラー:`, e);
        player.sendMessage("§cメニューの表示中にエラーが発生しました。");
        return;
      }
      if (result !== "back") return;
      if (!player.isValid || !ctx.playerService.getSession(player.id)) return;
    }
  }).catch((e) => log.error("メニューでエラー:", e));
}

export function clearMenuState(playerId) {
  lastOpen.delete(playerId);
}
