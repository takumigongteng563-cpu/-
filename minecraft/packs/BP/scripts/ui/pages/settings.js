import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { ctx } from "../../core/context.js";
import { getRecentErrors } from "../../core/log.js";
import { ADDON_VERSION, KEY_PREFIX, TAGS, PLAYER_SCHEMA_VERSION, WORLD_SCHEMA_VERSION } from "../../config.js";
import { flushAll, pendingCount, saveStats } from "../../storage/saveManager.js";
import { worldStorageBytes, countKeys } from "../../storage/worldBackend.js";
import { recordNameForUid } from "../../player/playerService.js";
import { showForm } from "../formUtil.js";
import { showInfoPage } from "./infoPage.js";
import { dateTime, heading, lines, num } from "../format.js";

const STATUS_JA = {
  created: "新規作成",
  loaded: "正常",
  recovered: "バックアップから復旧",
  reset: "破損のため初期化（退避済み）",
  protected: "保護モード（読み取り専用）",
};

/** @param {import("@minecraft/server").Player} player */
function isAdmin(player) {
  try {
    return player.hasTag(TAGS.admin);
  } catch {
    return false;
  }
}

/** @param {import("@minecraft/server").Player} player */
async function personalSettings(player) {
  const d = ctx.playerService.dataFor(player.id);
  const form = new ModalFormData()
    .title("個人設定")
    .toggle("保存したときに通知を表示する", { defaultValue: !!d.settings.saveNotice })
    .submitButton("決定");
  const res = await showForm(player, form);
  if (!res || !res.formValues) return;
  const saveNotice = !!res.formValues[0];
  ctx.playerService.update(player.id, (pd) => {
    pd.settings.saveNotice = saveNotice;
  }, { important: true });
  player.sendMessage("§a設定を保存しました。");
}

/** @param {import("@minecraft/server").Player} player */
function manualSave(player) {
  const n = flushAll(`手動保存 by ${player.name}`);
  player.sendMessage(`§a保存しました（${n}件のデータを書き込み）。`);
}

/** @param {import("@minecraft/server").Player} player */
async function diagnostics(player) {
  const session = ctx.playerService.getSession(player.id);
  const entry = session ? ctx.playerService.records.peek(recordNameForUid(session.uid)) : undefined;
  const we = ctx.worldService.worldEntry;
  const sys = ctx.worldService.index.system;
  const body = lines(
    heading("あなたのデータ"),
    `状態: ${entry ? STATUS_JA[entry.status] ?? entry.status : "-"}`,
    `未保存の変更: ${entry && entry.dirty ? "あり" : "なし"}`,
    `最終保存: ${entry ? dateTime(entry.lastSavedAt) : "-"}`,
    entry && entry.notes.length > 0 ? `§7記録: ${entry.notes.slice(0, 5).join(" / ")}§r` : null,
    "",
    heading("ワールドデータ"),
    `状態: ${STATUS_JA[we.status] ?? we.status}`,
    `データ構造: プレイヤー v${PLAYER_SCHEMA_VERSION} / ワールド v${WORLD_SCHEMA_VERSION}`,
    `アドオン: v${ADDON_VERSION}（記録 v${sys.addonVersion}）`,
    `登録プレイヤー数: ${num(Object.keys(ctx.worldService.index.players).length)}`,
    `保存待ち: ${num(pendingCount())} 件`,
    `保存領域: ${num(worldStorageBytes())} バイト / キー ${num(countKeys(KEY_PREFIX))} 個`,
    `自動保存: ${num(saveStats.autosaveRuns)} 回実行 / 最終 ${dateTime(saveStats.lastAutosaveAt)}`,
    `復旧記録: ${num(sys.recoveries.length)} 件`
  );
  return showInfoPage(player, "データ状態の確認", body);
}

/** @param {import("@minecraft/server").Player} player */
async function restrictionSettings(player) {
  const r = ctx.worldService.world.settings.restrictions;
  const form = new ModalFormData()
    .title("行動制限の設定（管理者）")
    .label("完全RPG型にするための制限です。クリエイティブモードと管理者タグの所持者は対象外です。")
    .toggle("ブロック破壊・採掘を禁止", { defaultValue: !!r.blockBreak })
    .toggle("ブロック設置・建築を禁止", { defaultValue: !!r.blockPlace })
    .toggle("ブロックの使用（作業台・かまど・チェスト等）を禁止", { defaultValue: !!r.blockInteract })
    .submitButton("決定");
  const res = await showForm(player, form);
  if (!res || !res.formValues) return;
  // label は formValues に undefined として含まれるため、真偽値だけを取り出す
  const vals = res.formValues.filter((v) => typeof v === "boolean");
  if (vals.length !== 3) return;
  ctx.worldService.updateWorld((w) => {
    w.settings.restrictions.blockBreak = !!vals[0];
    w.settings.restrictions.blockPlace = !!vals[1];
    w.settings.restrictions.blockInteract = !!vals[2];
  }, { important: true });
  player.sendMessage("§a行動制限の設定を保存しました。");
}

/** @param {import("@minecraft/server").Player} player */
async function recentErrors(player) {
  const errs = getRecentErrors();
  const body = errs.length === 0 ? "記録されたエラーはありません。" : errs.map((e) => `§7${dateTime(e.at)}§r\n${e.text}`).join("\n\n");
  return showInfoPage(player, "最近のエラー", body);
}

export const settingsPage = {
  id: "settings",
  label: "設定",
  icon: "textures/items/redstone_dust",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    for (;;) {
      const admin = isAdmin(player);
      /** @type {{label: string, run: () => any}[]} */
      const items = [
        { label: "個人設定", run: () => personalSettings(player) },
        { label: "今すぐ保存", run: () => manualSave(player) },
        { label: "データ状態の確認", run: () => diagnostics(player) },
      ];
      if (admin) {
        items.push({ label: "§1[管理者]§r 行動制限の設定", run: () => restrictionSettings(player) });
        items.push({ label: "§1[管理者]§r 最近のエラー", run: () => recentErrors(player) });
      }
      const form = new ActionFormData().title("設定").body(admin ? "§7管理者として表示しています§r" : "");
      for (const it of items) form.button(it.label);
      form.button("§l戻る");
      form.button("閉じる");
      const res = await showForm(player, form);
      if (!res || res.selection === undefined) return "close";
      if (res.selection === items.length) return "back";
      if (res.selection > items.length) return "close";
      const r = await items[res.selection].run();
      if (r === "close") return "close";
    }
  },
};
