import { ctx } from "../../core/context.js";
import { EQUIPMENT_SLOTS } from "../../content/index.js";
import { COMING_SOON, heading, lines } from "../format.js";
import { showInfoPage } from "./infoPage.js";

export const equipmentPage = {
  id: "equipment",
  label: "装備",
  icon: "textures/items/diamond_chestplate",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    const d = ctx.playerService.dataFor(player.id);
    const body = lines(
      heading("装備中"),
      EQUIPMENT_SLOTS.map((s) => {
        const e = d.equipment.slots[s.id];
        return `${s.name}: ${e ? (e.name ?? e.id ?? "装備あり") : "§7なし§r"}`;
      }),
      "",
      `装備の変更・強化・RPG装備の入手 ${COMING_SOON}`
    );
    return showInfoPage(player, "装備", body);
  },
};
