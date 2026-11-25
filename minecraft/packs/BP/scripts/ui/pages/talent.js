// 才能（第2弾：所持才能・等級・効果・覚醒済み潜在能力）
import { ActionFormData } from "@minecraft/server-ui";
import { ctx } from "../../core/context.js";
import { talents } from "../../content/talents/index.js";
import { potentials } from "../../content/potentials.js";
import { gradeLabel, gradeInfo } from "../../content/grades.js";
import { showForm } from "../formUtil.js";
import { heading, lines } from "../format.js";
import { showInfoPage } from "./infoPage.js";
import { describeEffects } from "../describe.js";

const ORIGIN = { innate: "先天", acquired: "後天", admin: "付与" };

function originLabel(entry) {
  if (entry.lineage && entry.lineage.length > 0) return "進化";
  return ORIGIN[entry.origin] ?? entry.origin;
}

/** @param {import("@minecraft/server").Player} player */
async function talentDetail(player, entry) {
  const t = talents.get(entry.id);
  if (!t) return "back";
  const g = gradeInfo(t.grade);
  const body = lines(
    `${gradeLabel(t.grade)} §l${t.name}§r  §7${g.name} / ${originLabel(entry)}§r`,
    `§7${t.description}§r`,
    "",
    heading("効果"),
    describeEffects(t),
    entry.lineage && entry.lineage.length > 0 ? ["", `§7進化の軌跡: ${[...entry.lineage, entry.id].map((id) => talents.get(id)?.name ?? id).join(" → ")}§r`] : null,
    "",
    Array.isArray(t.evolvesTo) && t.evolvesTo.length > 0 ? "§dこの才能には、まだ先がありそうだ……§r" : "§7この才能は完成している。§r"
  );
  return showInfoPage(player, t.name, body);
}

export const talentPage = {
  id: "talent",
  label: "才能",
  icon: "textures/items/nether_star",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    for (;;) {
      const d = ctx.playerService.dataFor(player.id);
      const active = d.talents.active.filter((a) => talents.has(a.id));
      const awakened = d.hiddenPotential.entries.filter((e) => e.awakened && potentials.has(e.id));
      const sleeping = d.hiddenPotential.entries.filter((e) => !e.awakened).length;
      const body = lines(
        heading("所持している才能"),
        active.length === 0 ? "まだ才能は目覚めていない。" : active.map((a) => {
          const t = talents.get(a.id);
          return `${gradeLabel(t.grade)} ${t.name} §7(${originLabel(a)})§r`;
        }),
        "",
        heading("潜在能力"),
        awakened.map((e) => {
          const p = potentials.get(e.id);
          return lines(`§d§l${p.name}§r §7${p.description}§r`, describeEffects(p).map((x) => `  ${x}`));
        }),
        sleeping > 0 ? "§8§k??????§r §7……何かが眠っている気がする§r" : null,
        awakened.length === 0 && sleeping === 0 ? "なし" : null,
        "",
        "§7才能はボタンから詳しく見られます。行動や実績によって新しい才能が目覚めたり、才能が進化したりします。§r"
      );
      const form = new ActionFormData().title("才能").body(body);
      for (const a of active) {
        const t = talents.get(a.id);
        form.button(`${gradeLabel(t.grade)} ${t.name}`);
      }
      form.button("§l戻る");
      form.button("閉じる");
      const res = await showForm(player, form);
      if (!res || res.selection === undefined) return "close";
      if (res.selection === active.length) return "back";
      if (res.selection > active.length) return "close";
      const r = await talentDetail(player, active[res.selection]);
      if (r === "close") return "close";
    }
  },
};
