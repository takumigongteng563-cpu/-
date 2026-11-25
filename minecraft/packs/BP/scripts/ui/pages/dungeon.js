import { ctx } from "../../core/context.js";
import { COMING_SOON, countKeys, heading, lines } from "../format.js";
import { showInfoPage } from "./infoPage.js";

export const dungeonPage = {
  id: "dungeon",
  label: "ダンジョン情報",
  icon: "textures/items/map_empty",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    const d = ctx.playerService.dataFor(player.id);
    const w = ctx.worldService.world;
    const body = lines(
      heading("あなたの攻略実績"),
      `攻略記録のあるダンジョン: ${countKeys(d.dungeonRecords)} 箇所`,
      "",
      heading("ワールドの攻略状況"),
      `攻略済みダンジョン: ${countKeys(w.dungeons.records)} 箇所`,
      `討伐済みボス: ${countKeys(w.bosses.defeated)} 体`,
      `中断中の攻略: ${countKeys(w.dungeonResume)} 件`,
      "",
      `ダンジョン・巨大迷宮・途中再開 ${COMING_SOON}`
    );
    return showInfoPage(player, "ダンジョン情報", body);
  },
};
