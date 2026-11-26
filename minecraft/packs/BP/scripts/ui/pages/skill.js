// スキル（最終仕様：熟練度は武器・魔法・スキル別、ホットバー9枠×5操作の割り当て）
import { ctx } from "../../core/context.js";
import { ACTION_TYPES, HOTBAR_SLOTS } from "../../balance/input.js";
import { COMING_SOON, heading, lines, num } from "../format.js";
import { showInfoPage } from "./infoPage.js";

const PROF = [
  { id: "weapon", name: "武器熟練度" },
  { id: "magic", name: "魔法熟練度" },
  { id: "skill", name: "スキル熟練度" },
];

export const skillPage = {
  id: "skill",
  label: "スキル",
  icon: "textures/items/book_enchanted",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    const d = ctx.playerService.dataFor(player.id);
    const learned = Object.entries(d.skills.learned);
    const bound = d.skillBindings.slots.reduce((t, s) => t + Object.values(s).filter(Boolean).length, 0);
    const body = lines(
      heading("習得済みスキル"),
      learned.length === 0 ? "まだスキルを習得していません。" : learned.map(([id, s]) => `・${id} Lv ${num(s && s.level)}`),
      "",
      heading("熟練度"),
      PROF.map((p) => {
        const list = Object.entries(d.proficiency[p.id] || {});
        return `${p.name}: ${list.length === 0 ? "なし" : list.map(([id, v]) => `${id} Lv${num(v && v.level)}`).join(" / ")}`;
      }),
      "",
      heading(`技の割り当て（${bound} / ${HOTBAR_SLOTS * ACTION_TYPES.length}）`),
      "ホットバーの1枠に、使い方の違う5つの技を割り当てられます。",
      ACTION_TYPES.map((a) => `・${a.name} → ${a.tier}`),
      "",
      `スキルの習得・強化・進化・融合・割り当て ${COMING_SOON}`,
      `熟練度の上昇 ${COMING_SOON}`,
      "§7※ スキル本体は第4弾で実装します§r"
    );
    return showInfoPage(player, "スキル", body);
  },
};
