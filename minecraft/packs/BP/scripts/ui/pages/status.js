import { ctx } from "../../core/context.js";
import { races, jobs, adventurerRanks, STAT_DEFS } from "../../content/index.js";
import { COMING_SOON, heading, lines, num } from "../format.js";
import { showInfoPage } from "./infoPage.js";

export const statusPage = {
  id: "status",
  label: "ステータス",
  icon: "textures/items/book_normal",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    const d = ctx.playerService.dataFor(player.id);
    const job = d.job.levels[d.job.current] || { level: 1, exp: 0 };
    const v = d.vitals;
    const body = lines(
      heading("基本"),
      `名前: ${d.name}`,
      `種族: ${races.get(d.race)?.name ?? d.race}`,
      `レベル: ${num(d.level)}  §7経験値: ${num(d.exp)}§r`,
      `職業: ${jobs.get(d.job.current)?.name ?? d.job.current}  §7職業Lv: ${num(job.level)}§r`,
      `称号: ${d.titles.equipped ?? "なし"}`,
      `冒険者ランク: ${adventurerRanks.get(d.adventurer.rank)?.name ?? d.adventurer.rank}`,
      `金貨: ${num(d.gold)} G`,
      "",
      heading("HP・MP・スタミナ"),
      `HP: ${num(v.hp)} / ${num(v.hpMax)}`,
      `MP: ${num(v.mp)} / ${num(v.mpMax)}`,
      `スタミナ: ${num(v.stamina)} / ${num(v.staminaMax)}`,
      "",
      heading("基礎能力値"),
      STAT_DEFS.map((s) => `${s.name}: ${num(d.stats[s.id])}`),
      `未使用能力ポイント: ${num(d.unspentStatPoints)}`,
      "",
      `限界突破: ${d.limitBreak.stage > 0 ? `第${d.limitBreak.stage}段階` : "なし"}`,
      "",
      `§7※ HP・MP・スタミナは現在RPG内部の値です。戦闘への反映 ${COMING_SOON}`,
      `§7※ 能力ポイントの割り振り・レベルアップ ${COMING_SOON}`
    );
    return showInfoPage(player, "ステータス", body);
  },
};
