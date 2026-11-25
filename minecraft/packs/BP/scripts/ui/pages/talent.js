import { ctx } from "../../core/context.js";
import { COMING_SOON, heading, lines } from "../format.js";
import { showInfoPage } from "./infoPage.js";

export const talentPage = {
  id: "talent",
  label: "才能",
  icon: "textures/items/nether_star",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    const d = ctx.playerService.dataFor(player.id);
    const body = lines(
      heading("先天的才能"),
      d.talents.innate.length === 0 ? "なし" : d.talents.innate.map((t) => `・${t}`),
      "",
      heading("後天的才能"),
      d.talents.acquired.length === 0 ? "なし" : d.talents.acquired.map((t) => `・${t}`),
      "",
      heading("隠された潜在能力"),
      d.hiddenPotential.revealed.length === 0 ? "§k???§r §7（まだ目覚めていない）§r" : d.hiddenPotential.revealed.map((t) => `・${t}`),
      "",
      `才能の獲得・潜在能力の開花 ${COMING_SOON}`
    );
    return showInfoPage(player, "才能", body);
  },
};
