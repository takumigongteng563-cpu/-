// エラー隔離。イベント処理やタイマー処理で例外が起きても、
// ほかの処理やゲーム全体が止まらないようにする。
import { createLogger } from "./log.js";

const log = createLogger("safe");

/**
 * 関数を try/catch で包む。例外はログに記録して握りつぶす。
 * @template {(...args: any[]) => any} F
 * @param {string} label
 * @param {F} fn
 * @returns {F}
 */
export function safe(label, fn) {
  // @ts-ignore 型の都合
  return (...args) => {
    try {
      const r = fn(...args);
      if (r && typeof r.then === "function") {
        return r.catch((e) => {
          log.error(`${label} で非同期エラー:`, e);
          return undefined;
        });
      }
      return r;
    } catch (e) {
      log.error(`${label} でエラー:`, e);
      return undefined;
    }
  };
}

/** 即時実行版。失敗したら fallback を返す */
export function attempt(label, fn, fallback = undefined) {
  try {
    return fn();
  } catch (e) {
    log.error(`${label} でエラー:`, e);
    return fallback;
  }
}
