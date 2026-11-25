import { ctx } from "../../core/context.js";
import { jobs } from "../../content/index.js";
import { COMING_SOON, heading, lines, num } from "../format.js";
import { showInfoPage } from "./infoPage.js";

export const jobPage = {
  id: "job",
  label: "職業",
  icon: "textures/items/iron_sword",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    const d = ctx.playerService.dataFor(player.id);
    const cur = jobs.get(d.job.current);
    const lv = d.job.levels[d.job.current] || { level: 1, exp: 0 };
    const body = lines(
      heading("現在の職業"),
      `${cur?.name ?? d.job.current}  §7職業Lv ${num(lv.level)} / 経験値 ${num(lv.exp)}§r`,
      cur?.description ? `§7${cur.description}§r` : null,
      "",
      heading("解放済みの職業"),
      d.job.unlocked.map((id) => {
        const j = jobs.get(id);
        const l = d.job.levels[id];
        return `・${j?.name ?? id}${l ? ` (Lv ${num(l.level)})` : ""}`;
      }),
      "",
      `転職・職業の解放 ${COMING_SOON}`,
      `§7登録済み職業数: ${jobs.size}§r`
    );
    return showInfoPage(player, "職業", body);
  },
};
