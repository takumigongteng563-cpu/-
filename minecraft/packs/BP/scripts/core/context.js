// アドオン全体で共有するサービスの入れ物（起動時に main.js が設定する）
/**
 * @typedef {Object} AppContext
 * @property {import("../storage/chunkedStore.js").ChunkedStore} store
 * @property {import("../world/worldService.js").WorldService} worldService
 * @property {import("../player/playerService.js").PlayerService} playerService
 * @property {import("../party/partyService.js").PartyService} partyService
 * @property {boolean} ready
 */

/** @type {AppContext} */
export const ctx = {
  store: null,
  worldService: null,
  playerService: null,
  partyService: null,
  ready: false,
};
