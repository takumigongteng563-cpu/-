import { ctx } from "../../core/context.js";
import { COMING_SOON, heading, lines, num } from "../format.js";
import { showInfoPage } from "./infoPage.js";

export const storagePage = {
  id: "storage",
  label: "倉庫",
  icon: "textures/items/ender_pearl",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    const d = ctx.playerService.dataFor(player.id);
    const body = lines(
      heading("個人倉庫"),
      `使用中: ${num(d.storage.items.length)} / ${num(d.storage.capacity)} 枠`,
      "",
      `アイテムの預け入れ・引き出し・倉庫の拡張 ${COMING_SOON}`
    );
    return showInfoPage(player, "倉庫", body);
  },
};
