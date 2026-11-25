// アドオン内部のイベント通知（レベルアップ・才能獲得などを演出やHUDへ伝える）
// 受け取り側の失敗が送信側に影響しないよう、例外は記録して握りつぶす。
import { createLogger } from "./log.js";

const log = createLogger("bus");
/** @type {Map<string, Function[]>} */
const handlers = new Map();

/**
 * イベント名：
 *  "levelUp"           { playerId, from, to, points }
 *  "expGained"         { playerId, amount, source }
 *  "talentAcquired"    { playerId, id, origin }
 *  "talentEvolved"     { playerId, from, to }
 *  "potentialAwakened" { playerId, id }
 *  "limitBreak"        { playerId, from, to }
 *  "statsChanged"      { playerId }
 *  "vitalsChanged"     { playerId }
 */
export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, []);
  handlers.get(name).push(fn);
}

export function emit(name, payload) {
  const list = handlers.get(name);
  if (!list) return;
  for (const fn of list) {
    try {
      fn(payload);
    } catch (e) {
      log.error(`イベント ${name} の処理でエラー:`, e);
    }
  }
}

/** テスト用 */
export function clearAll() {
  handlers.clear();
}
