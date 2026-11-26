import { ctx } from "../../core/context.js";
import { jobs, normalJobs, JOB_LINES } from "../../content/index.js";
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
      heading("職業の系統（第1次職・暫定名）"),
      JOB_LINES.map((l) => `・${l.name}`).join("  "),
      `§7通常職業 ${normalJobs().length}枠（5段階の分岐ツリー）のうち、内容を設定済み ${normalJobs().filter((j) => j.defined).length}§r`,
      "",
      `転職・職業の解放・職業レベル ${COMING_SOON}`,
      "§7※ 職業・転職システムは第3弾で実装します§r"
    );
    return showInfoPage(player, "職業", body);
  },
};
