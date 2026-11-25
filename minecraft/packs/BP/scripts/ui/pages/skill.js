import { ctx } from "../../core/context.js";
import { COMING_SOON, heading, lines, num } from "../format.js";
import { showInfoPage } from "./infoPage.js";

export const skillPage = {
  id: "skill",
  label: "スキル",
  icon: "textures/items/book_enchanted",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    const d = ctx.playerService.dataFor(player.id);
    const learned = Object.entries(d.skills.learned);
    const prof = Object.entries(d.proficiency);
    const body = lines(
      heading("習得済みスキル"),
      learned.length === 0 ? "まだスキルを習得していません。" : learned.map(([id, s]) => `・${id} Lv ${num(s && s.level)}`),
      "",
      heading("熟練度"),
      prof.length === 0 ? "まだ熟練度はありません。" : prof.map(([id, p]) => `・${id} Lv ${num(p && p.level)}`),
      "",
      `スキルの習得・強化・セット ${COMING_SOON}`,
      `熟練度の上昇 ${COMING_SOON}`
    );
    return showInfoPage(player, "スキル", body);
  },
};
