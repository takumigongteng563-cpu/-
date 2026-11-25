// =============================================================
// サービスの組み立て（@minecraft/server に依存しない）
// main.js とテストの両方から使う。
// =============================================================
import { ChunkedStore } from "./storage/chunkedStore.js";
import { WorldService } from "./world/worldService.js";
import { PlayerService } from "./player/playerService.js";
import { PartyService } from "./party/partyService.js";
import { StatService, recalcData } from "./stats/statService.js";
import { TalentService } from "./talents/talentService.js";
import { ProgressionService } from "./progression/progressionService.js";
import { ActionService } from "./actions/actionService.js";
import { VitalsService } from "./vitals/vitalsService.js";
import { KEY_PREFIX, SAVE } from "./config.js";

/**
 * @param {import("./storage/chunkedStore.js").StorageBackend} backend
 * @param {() => number} nowTick
 */
export function createApp(backend, nowTick) {
  const store = new ChunkedStore(backend, { prefix: KEY_PREFIX, chunkSize: SAVE.chunkSize, maxChunks: SAVE.maxChunks });
  const worldService = new WorldService(store);
  const playerService = new PlayerService(store, worldService);
  const partyService = new PartyService(playerService);
  const stats = new StatService(playerService, nowTick);
  const talents = new TalentService(playerService, worldService, nowTick);
  const progression = new ProgressionService(playerService, worldService, nowTick);
  const actions = new ActionService(playerService, talents);
  const vitals = new VitalsService(playerService);
  return { store, worldService, playerService, partyService, stats, talents, progression, actions, vitals, nowTick };
}

/**
 * 参加時の RPG 処理：参加 → 初期才能の抽選（初回のみ）→ 再計算 → 条件判定
 * @returns {{join: import("./player/playerService.js").JoinResult, rolled: string[]|null}}
 */
export function joinPlayer(app, player) {
  const join = app.playerService.join(player);
  if (join.alreadyJoined) return { join, rolled: null };
  const rolled = app.talents.ensureRolled(player.id);
  app.playerService.update(player.id, (d) => recalcData(d, app.nowTick()));
  app.talents.evaluate(player.id);
  return { join, rolled };
}
