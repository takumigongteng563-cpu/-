// =============================================================
// 魔神野口と4人の勇者たち — エントリーポイント
//
// 起動の流れ：
//   1. 読み込み直後（早期実行モード）：イベントの購読のみ行う
//   2. worldLoad：保存領域を開き、ワールドデータを読み込む → ready
//      すでにワールドにいるプレイヤー（/reload 時など）の参加処理も行う
//   3. playerSpawn(initialSpawn)：参加処理（初回なら初期データ作成）
//   4. playerLeave：保存してキャッシュから外す
//   5. 自動保存：一定間隔で変更分のみ保存
// =============================================================
import { world, system } from "@minecraft/server";
import { ADDON_VERSION, KEY_PREFIX, SAVE, TAGS, PARTY } from "./config.js";
import { ctx } from "./core/context.js";
import { createLogger, setErrorListener } from "./core/log.js";
import { subscribe } from "./core/events.js";
import { attempt } from "./core/safe.js";
import { every } from "./core/scheduler.js";
import { ChunkedStore } from "./storage/chunkedStore.js";
import { worldBackend } from "./storage/worldBackend.js";
import { autosaveTick, flushAll, installSaveNotice } from "./storage/saveManager.js";
import { WorldService } from "./world/worldService.js";
import { PlayerService } from "./player/playerService.js";
import { PartyService } from "./party/partyService.js";
import { ensureAdventurerBook, isAdventurerBook } from "./items/adventurerBook.js";
import { registerActionGuard } from "./rules/actionGuard.js";
import { openMainMenu, clearMenuState } from "./ui/menu.js";
import { releaseMenuLock } from "./ui/formUtil.js";
import { registerScriptEvents } from "./admin/scriptEvents.js";

const log = createLogger("main");

// ---------------------------------------------------------------
// 参加処理
// ---------------------------------------------------------------
/** @param {import("@minecraft/server").Player} player */
function handleJoin(player) {
  if (!ctx.ready || !player.isValid) return;
  const r = ctx.playerService.join(player);
  if (r.alreadyJoined) return;

  for (const n of r.notices) player.sendMessage(n);

  if (r.isNew) {
    player.sendMessage("§6§l『魔神野口と4人の勇者たち』§r");
    player.sendMessage("§fようこそ、異世界へ。あなたは §e種族：人間 / Lv1 / 無職§f として冒険を始めます。");
  } else {
    player.sendMessage(`§7おかえりなさい、${player.name}。冒険の記録を読み込みました。`);
  }
  const book = ensureAdventurerBook(player);
  if (book === "given") player.sendMessage("§a「冒険者の書」を受け取った。§7使用するとRPGメニューが開きます。");

  if (ctx.partyService.isOverCapacity()) {
    world.sendMessage(`§eこの冒険は最大${PARTY.maxPlayers}人を想定しています（現在 ${ctx.partyService.onlineCount()}人）。`);
  }
}

/** @param {import("@minecraft/server").Player} player */
function openMenu(player) {
  openMainMenu(player, handleJoin);
}

// ---------------------------------------------------------------
// 初期化（worldLoad 後）
// ---------------------------------------------------------------
function initialize() {
  if (ctx.ready) return;
  const store = new ChunkedStore(worldBackend, {
    prefix: KEY_PREFIX,
    chunkSize: SAVE.chunkSize,
    maxChunks: SAVE.maxChunks,
  });
  const worldService = new WorldService(store);
  const playerService = new PlayerService(store, worldService);
  const partyService = new PartyService(playerService);
  ctx.store = store;
  ctx.worldService = worldService;
  ctx.playerService = playerService;
  ctx.partyService = partyService;

  const loaded = worldService.load();
  ctx.ready = true;
  installSaveNotice();
  log.warn(`v${ADDON_VERSION} 起動 world=${loaded.world.status} index=${loaded.index.status}`);

  // 自動保存（変更分のみ・少数ずつ）
  every("autosave", SAVE.autosaveIntervalTicks, autosaveTick);

  // すでにいるプレイヤー（/reload 等）
  for (const p of world.getAllPlayers()) attempt("join(existing)", () => handleJoin(p));
}

// ---------------------------------------------------------------
// エラー通知（管理者タグを持つプレイヤーにチャットで知らせる。連続通知は抑制）
// ---------------------------------------------------------------
let lastErrorNotice = 0;
setErrorListener(() => {
  const now = Date.now();
  if (now - lastErrorNotice < 10000) return;
  lastErrorNotice = now;
  system.run(() => {
    for (const p of world.getAllPlayers()) {
      if (p.hasTag(TAGS.admin)) p.sendMessage("§c[魔神野口] エラーが発生しました。設定 → 最近のエラー で確認できます。");
    }
  });
});

// ---------------------------------------------------------------
// イベント購読（早期実行モードでも購読は可能）
// ---------------------------------------------------------------
subscribe(world.afterEvents.worldLoad, "worldLoad", () => initialize());

// 予備：何らかの理由で worldLoad を受け取れなかった場合に備え、
// 一定時間後に初期化を再試行する（初期化済みなら何もしない）
let initRetries = 0;
function initFallback() {
  if (ctx.ready) return;
  try {
    initialize();
    if (ctx.ready) log.warn("worldLoad 以外の経路で初期化しました");
  } catch (e) {
    log.warn("初期化の再試行に失敗:", e);
  }
  if (!ctx.ready && ++initRetries < 10) system.runTimeout(initFallback, 40);
}
system.runTimeout(initFallback, 100);

subscribe(world.afterEvents.playerSpawn, "playerSpawn", (ev) => {
  if (!ctx.ready) return; // initialize() で getAllPlayers() から処理される
  if (ev.initialSpawn) {
    handleJoin(ev.player);
  } else {
    // リスポーン時：念のため冒険者の書を確認
    ensureAdventurerBook(ev.player);
  }
});

subscribe(world.afterEvents.playerLeave, "playerLeave", (ev) => {
  releaseMenuLock(ev.playerId);
  clearMenuState(ev.playerId);
  if (!ctx.ready) return;
  ctx.playerService.leave(ev.playerId);
});

subscribe(world.afterEvents.itemUse, "itemUse", (ev) => {
  if (isAdventurerBook(ev.itemStack)) openMenu(ev.source);
});

// ワールド終了直前：保存できるものはすべて保存する
subscribe(system.beforeEvents.shutdown, "shutdown", () => {
  if (ctx.ready) flushAll("shutdown");
});

registerActionGuard(openMenu);
registerScriptEvents({ openMenu });
