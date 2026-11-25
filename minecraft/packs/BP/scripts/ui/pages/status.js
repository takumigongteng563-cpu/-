// ステータス（第2弾で拡張：概要・能力値の内訳・派生能力値・能力ポイント振り分け）
import { ActionFormData } from "@minecraft/server-ui";
import { ctx } from "../../core/context.js";
import { races, jobs, adventurerRanks, STAT_DEFS, DERIVED_DEFS } from "../../content/index.js";
import { ELEMENTS } from "../../balance/stats.js";
import { LAYERS } from "../../stats/statCalc.js";
import { showForm } from "../formUtil.js";
import { heading, lines, num } from "../format.js";
import { showInfoPage } from "./infoPage.js";
import { openAllocation } from "./allocation.js";

function bar(cur, max, len = 10, color = "§a") {
  const r = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  const n = Math.round(r * len);
  return `${color}${"|".repeat(n)}§8${"|".repeat(len - n)}§r`;
}

function fmtDerived(def, v) {
  if (def.unit === "%") return `${v}%`;
  if (def.unit === "x") return `x${v}`;
  return num(v);
}

/** @param {import("@minecraft/server").Player} player */
function summary(player) {
  const d = ctx.playerService.dataFor(player.id);
  const info = ctx.progression.info(player.id);
  const job = d.job.levels[d.job.current] || { level: 1 };
  const v = d.vitals;
  const p = d.computed.primary;
  return lines(
    heading("基本"),
    `${d.name}  §7種族: ${races.get(d.race)?.name ?? d.race}§r`,
    `§lレベル ${num(d.level)}§r §7/ 上限 ${info.cap}§r`,
    info.atCap ? `経験値: §6上限に到達§r${d.expOverflow > 0 ? ` §7（保留 ${num(d.expOverflow)}）§r` : ""}` : `経験値: ${num(d.exp)} / ${num(info.need)}  ${bar(d.exp, info.need, 12, "§b")}`,
    `存在階級: §e${info.tier.name}§r §7（限界突破 ${d.limitBreak.stage}回）§r`,
    `職業: ${jobs.get(d.job.current)?.name ?? d.job.current} §7職業Lv ${num(job.level)}§r`,
    `称号: ${d.titles.equipped ?? "なし"}  冒険者ランク: ${adventurerRanks.get(d.adventurer.rank)?.name ?? d.adventurer.rank}`,
    `金貨: ${num(d.gold)} G`,
    "",
    heading("HP・MP・スタミナ"),
    `§cHP§r ${num(v.hp)} / ${num(v.hpMax)}  ${bar(v.hp, v.hpMax, 12, "§c")}`,
    `§9MP§r ${num(v.mp)} / ${num(v.mpMax)}  ${bar(v.mp, v.mpMax, 12, "§9")}`,
    `§eスタミナ§r ${num(v.stamina)} / ${num(v.staminaMax)}  ${bar(v.stamina, v.staminaMax, 12, "§e")}${v.exhausted ? " §c疲労§r" : ""}`,
    "",
    heading("基礎能力値"),
    STAT_DEFS.map((s) => `${s.name}: §l${num(p[s.id])}§r`).join("  "),
    d.unspentStatPoints > 0 ? `§a未使用能力ポイント: ${num(d.unspentStatPoints)}§r` : `未使用能力ポイント: 0`
  );
}

/** @param {import("@minecraft/server").Player} player */
async function breakdown(player) {
  const r = ctx.stats.inspect(player.id);
  const rows = [];
  for (const s of STAT_DEFS) {
    const l = r.layers[s.id];
    const parts = LAYERS.filter((x) => x.id === "base" || l[x.id] !== 0).map((x) => `${x.name}${x.id === "base" ? "" : "+"}${l[x.id]}`);
    rows.push(`§l${s.name} ${num(r.primary[s.id])}§r §7${s.role}§r`);
    rows.push(`  ${parts.join(" / ")}${r.pct[s.id] ? ` / 補正${r.pct[s.id] > 0 ? "+" : ""}${r.pct[s.id]}%` : ""}`);
  }
  const growth = STAT_DEFS.map((s) => `${s.short}x${r.growth[s.id].toFixed(2)}`).join(" ");
  const mods = r.modifiers.map((m) => `・${m.name} §7(${LAYERS.find((x) => x.id === m.layer)?.name})§r`);
  const body = lines(
    heading("能力値の内訳"),
    rows,
    "",
    heading("成長率（レベルアップ時の自動上昇の倍率）"),
    growth,
    "",
    heading("掛かっている補正"),
    mods.length ? mods : "なし",
    "",
    "§7※ 職業補正は第3弾、装備補正は装備システムの実装後に反映されます§r"
  );
  return showInfoPage(player, "能力値の内訳", body);
}

/** @param {import("@minecraft/server").Player} player */
async function derivedPage(player) {
  const d = ctx.playerService.dataFor(player.id);
  const dv = d.computed.derived;
  const el = d.computed.elements;
  const body = lines(
    heading("派生能力値"),
    DERIVED_DEFS.map((x) => `${x.name}: §l${fmtDerived(x, dv[x.id])}§r`),
    "",
    heading("属性耐性"),
    ELEMENTS.map((e) => `${e.name} ${el[e.id] ?? 0}%`).join("  "),
    "",
    "§7※ 攻撃力・防御力・命中・回避などの戦闘への反映は戦闘システム（後続）で行います§r",
    "§7※ 移動速度・積載重量は計算のみ（反映は後続）§r"
  );
  return showInfoPage(player, "派生能力値", body);
}

export const statusPage = {
  id: "status",
  label: "ステータス",
  icon: "textures/items/book_normal",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    for (;;) {
      const d = ctx.playerService.dataFor(player.id);
      const form = new ActionFormData()
        .title("ステータス")
        .body(summary(player))
        .button("能力値の内訳")
        .button("派生能力値")
        .button(d.unspentStatPoints > 0 ? `§2能力ポイント振り分け（${d.unspentStatPoints}）` : "能力ポイント振り分け")
        .button("§l戻る")
        .button("閉じる");
      const res = await showForm(player, form);
      if (!res || res.selection === undefined || res.selection === 4) return "close";
      if (res.selection === 3) return "back";
      let r;
      if (res.selection === 0) r = await breakdown(player);
      else if (res.selection === 1) r = await derivedPage(player);
      else r = await openAllocation(player);
      if (r === "close") return "close";
    }
  },
};
