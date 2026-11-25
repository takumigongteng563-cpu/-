import { ctx } from "../../core/context.js";
import { adventurerRanks } from "../../content/index.js";
import { PARTY } from "../../config.js";
import { COMING_SOON, countKeys, dateTime, heading, lines, num } from "../format.js";
import { showInfoPage } from "./infoPage.js";

export const adventurerPage = {
  id: "adventurer",
  label: "冒険者情報",
  icon: "textures/items/emerald",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    const d = ctx.playerService.dataFor(player.id);
    const session = ctx.playerService.getSession(player.id);
    const online = ctx.playerService.onlineSessions();
    const body = lines(
      heading("冒険者"),
      `ランク: ${adventurerRanks.get(d.adventurer.rank)?.name ?? d.adventurer.rank}`,
      `ギルドポイント: ${num(d.adventurer.points)}`,
      `金貨: ${num(d.gold)} G`,
      `NPCとの交流: ${countKeys(d.npcAffinity)} 人`,
      "",
      heading("記録"),
      `初参加: ${dateTime(d.sessionLog.firstJoinAt)}`,
      `参加回数: ${num(d.sessionLog.joinCount)} 回`,
      `識別ID: §7${session ? session.uid : "-"}§r`,
      "",
      heading(`この世界の冒険者（${online.length} / ${PARTY.maxPlayers}人）`),
      online.map((s) => `・${s.name}${s.playerId === player.id ? " §a(あなた)§r" : ""}`),
      online.length > PARTY.maxPlayers ? `§e想定人数（${PARTY.maxPlayers}人）を超えています§r` : null,
      "",
      `冒険者ギルド登録・ランク昇格・NPC好感度 ${COMING_SOON}`
    );
    return showInfoPage(player, "冒険者情報", body);
  },
};
