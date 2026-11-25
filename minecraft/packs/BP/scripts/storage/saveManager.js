// =============================================================
// セーブ管理
// ・自動保存：一定間隔で「変更のあるレコード」だけを少数ずつ保存（負荷分散）
// ・重要な更新：各サービスの update(..., {important:true}) で即時保存
// ・手動保存／終了時：flushAll()
// =============================================================
import { world } from "@minecraft/server";
import { ctx } from "../core/context.js";
import { SAVE } from "../config.js";
import { createLogger } from "../core/log.js";
import { recordNameForUid } from "../player/playerService.js";

const log = createLogger("save");

export const saveStats = {
  autosaveRuns: 0,
  recordsSaved: 0,
  lastAutosaveAt: 0,
  lastFullSaveAt: 0,
};

/** 自動保存（scheduler から一定間隔で呼ばれる） */
export function autosaveTick() {
  if (!ctx.ready) return;
  const max = SAVE.maxRecordsPerAutosave;
  let n = ctx.worldService.flushDirty(max);
  if (n < max) n += ctx.playerService.flushDirty(max - n);
  saveStats.autosaveRuns++;
  if (n > 0) {
    saveStats.recordsSaved += n;
    saveStats.lastAutosaveAt = Date.now();
  }
}

/** すべての変更を即時保存する */
export function flushAll(reason) {
  if (!ctx.ready) return 0;
  const n = ctx.worldService.flushAll() + ctx.playerService.flushAll();
  saveStats.recordsSaved += n;
  saveStats.lastFullSaveAt = Date.now();
  log.info(`全保存 (${reason}) ${n}件`);
  return n;
}

export function pendingCount() {
  if (!ctx.ready) return 0;
  return ctx.worldService.dirtyCount() + ctx.playerService.dirtyCount();
}

/** プレイヤーの保存通知設定が ON なら、保存時にアクションバーへ表示する */
export function installSaveNotice() {
  ctx.playerService.records.onSaved = (entry) => {
    const uid = entry.data && entry.data.uid;
    if (!uid || !entry.data.settings || !entry.data.settings.saveNotice) return;
    const session = ctx.playerService.onlineSessions().find((s) => s.uid === uid);
    if (!session) return;
    const p = world.getAllPlayers().find((pl) => pl.id === session.playerId);
    if (p) p.onScreenDisplay.setActionBar("§7冒険の記録を保存しました");
  };
}

export { recordNameForUid };
