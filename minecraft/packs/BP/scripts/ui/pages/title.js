import { ctx } from "../../core/context.js";
import { COMING_SOON, heading, lines } from "../format.js";
import { showInfoPage } from "./infoPage.js";

export const titlePage = {
  id: "title",
  label: "称号",
  icon: "textures/items/gold_ingot",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    const d = ctx.playerService.dataFor(player.id);
    const body = lines(
      heading("表示中の称号"),
      d.titles.equipped ?? "なし",
      "",
      heading("獲得済みの称号"),
      d.titles.owned.length === 0 ? "まだ称号を獲得していません。" : d.titles.owned.map((t) => `・${t}`),
      "",
      `称号の獲得・付け替え・世界唯一の称号 ${COMING_SOON}`
    );
    return showInfoPage(player, "称号", body);
  },
};
