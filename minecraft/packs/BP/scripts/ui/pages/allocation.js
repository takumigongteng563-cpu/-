// =============================================================
// 能力ポイント振り分け（Switch のコントローラーで操作しやすいボタン形式）
//  ・能力値を選ぶたびに「増やす量（1/5/10）」だけ追加（確定前の下書き）
//  ・「1つ戻す」「すべて取り消し」で確定前なら取り消せる
//  ・「確定する」で確認画面 → 確定。確定後は自由に戻せない
// 下書きはプレイヤーごとにメモリで管理し、他人のポイントには触れない。
// =============================================================
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import { ctx } from "../../core/context.js";
import { STAT_DEFS } from "../../content/stats.js";
import { AllocationDraft, commitAllocation } from "../../stats/allocation.js";
import { recalcData } from "../../stats/statService.js";
import { emit } from "../../core/eventBus.js";
import { showForm } from "../formUtil.js";
import { heading, lines, num } from "../format.js";

const STEPS = [1, 5, 10];

/** @param {import("@minecraft/server").Player} player */
async function confirm(player, draft) {
  const d = ctx.playerService.dataFor(player.id);
  const t = draft.totals();
  const rows = STAT_DEFS.filter((s) => t[s.id]).map((s) => `${s.name}: ${num(d.computed.primary[s.id])} → §a${num(d.computed.primary[s.id] + t[s.id])}§r（+${t[s.id]}）`);
  const form = new MessageFormData()
    .title("振り分けの確認")
    .body(lines("次の内容で確定します。", "", rows, "", `使用ポイント: ${draft.spent}`, "", "§c確定した振り分けは、後から元に戻せません。§r"))
    .button1("確定する")
    .button2("やめる");
  const res = await showForm(player, form);
  return !!res && res.selection === 0;
}

/** @param {import("@minecraft/server").Player} player */
export async function openAllocation(player) {
  const d0 = ctx.playerService.dataFor(player.id);
  if (!d0) return "close";
  if (d0.unspentStatPoints <= 0) {
    player.sendMessage("§7未使用の能力ポイントがありません。レベルが上がると5ポイント得られます。");
    return "back";
  }
  const draft = new AllocationDraft(d0.unspentStatPoints);
  let stepIdx = 0;
  for (;;) {
    const d = ctx.playerService.dataFor(player.id);
    if (!d) return "close";
    const t = draft.totals();
    const step = STEPS[stepIdx];
    const form = new ActionFormData()
      .title("能力ポイント振り分け")
      .body(
        lines(
          `未使用ポイント: §l${draft.available}§r → 残り §a§l${draft.remaining}§r`,
          `増やす量: §e${step}§r ずつ`,
          "",
          heading("能力値（現在 → 振り分け後）"),
          STAT_DEFS.map((s) => `${s.name}: ${num(d.computed.primary[s.id])}${t[s.id] ? ` §a→ ${num(d.computed.primary[s.id] + t[s.id])}§r` : ""} §7${s.role}§r`)
        )
      );
    for (const s of STAT_DEFS) form.button(`${s.name}  ${num(d.computed.primary[s.id])}${t[s.id] ? ` §2(+${t[s.id]})` : ""}`);
    form.button(`増やす量を変更（今: ${step}）`);
    form.button("1つ戻す");
    form.button("すべて取り消し");
    form.button(draft.isEmpty() ? "§8確定する" : "§2§l確定する");
    form.button("§l戻る");
    const res = await showForm(player, form);
    if (!res || res.selection === undefined) return "close";
    const i = res.selection;
    const n = STAT_DEFS.length;
    if (i < n) {
      if (draft.remaining <= 0) player.sendMessage("§7ポイントが残っていません。");
      else draft.add(STAT_DEFS[i].id, step);
    } else if (i === n) stepIdx = (stepIdx + 1) % STEPS.length;
    else if (i === n + 1) draft.undo();
    else if (i === n + 2) draft.clear();
    else if (i === n + 3) {
      if (draft.isEmpty()) continue;
      if (!(await confirm(player, draft))) continue;
      /** @type {any} */
      let result = { ok: false, reason: "このプレイヤーは参加していません" };
      ctx.playerService.update(
        player.id,
        (pd) => {
          result = commitAllocation(pd, draft);
          if (result.ok) recalcData(pd, ctx.stats.nowTick());
        },
        { important: true }
      );
      if (result.ok) {
        emit("statsChanged", { playerId: player.id });
        player.sendMessage("§a能力ポイントを振り分けた。");
        return "back";
      }
      player.sendMessage(`§c確定できませんでした: ${result.reason}`);
      return "back";
    } else return "back";
  }
}
