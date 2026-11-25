// イベント購読ヘルパー。
// ・すべての処理を safe() で包み、例外がほかに波及しないようにする
// ・イベントが存在しない環境（API差異）でも起動を止めない
import { safe } from "./safe.js";
import { createLogger } from "./log.js";

const log = createLogger("events");

/**
 * @param {any} signal  例: world.afterEvents.playerSpawn
 * @param {string} label
 * @param {(ev: any) => void} handler
 * @returns {boolean} 購読できたか
 */
export function subscribe(signal, label, handler) {
  if (!signal || typeof signal.subscribe !== "function") {
    log.warn(`イベント ${label} はこの環境で利用できません（スキップ）`);
    return false;
  }
  try {
    signal.subscribe(safe(label, handler));
    return true;
  } catch (e) {
    log.error(`イベント ${label} の購読に失敗:`, e);
    return false;
  }
}
