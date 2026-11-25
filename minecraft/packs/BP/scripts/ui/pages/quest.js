import { ctx } from "../../core/context.js";
import { COMING_SOON, countKeys, heading, lines } from "../format.js";
import { showInfoPage } from "./infoPage.js";

export const questPage = {
  id: "quest",
  label: "クエスト",
  icon: "textures/items/paper",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    const d = ctx.playerService.dataFor(player.id);
    const w = ctx.worldService.world;
    const body = lines(
      heading("メインストーリー（ワールド共通）"),
      w.story.chapter === 0 ? "物語はまだ始まっていない……" : `第${w.story.chapter}章 / 全20章`,
      "",
      heading("個人のクエスト"),
      `進行中: ${countKeys(d.quests.active)} 件`,
      `達成済み: ${countKeys(d.quests.completed)} 件`,
      "",
      `メインストーリー・クエストの受注 ${COMING_SOON}`
    );
    return showInfoPage(player, "クエスト", body);
  },
};
