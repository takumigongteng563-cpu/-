// 定期処理の管理。毎tick処理は使わず、間隔を空けた処理だけを登録する。
// 各処理は safe() で包まれ、1つが失敗してもほかは止まらない。
import { system } from "@minecraft/server";
import { safe } from "./safe.js";

/** @type {number[]} */
const handles = [];

/**
 * @param {string} label
 * @param {number} intervalTicks  1以上。毎tick(1)は原則使わない
 * @param {() => void} fn
 */
export function every(label, intervalTicks, fn) {
  const id = system.runInterval(safe(label, fn), Math.max(1, intervalTicks));
  handles.push(id);
  return id;
}

/** 次のtickで実行（読み取り専用モードのイベント内から書き込みを行う場合など） */
export function nextTick(label, fn) {
  return system.run(safe(label, fn));
}

/** 指定tick後に実行 */
export function after(label, ticks, fn) {
  return system.runTimeout(safe(label, fn), Math.max(0, ticks));
}

export function clearAll() {
  for (const h of handles) {
    try {
      system.clearRun(h);
    } catch {
      // 無視
    }
  }
  handles.length = 0;
}
