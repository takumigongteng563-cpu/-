// =============================================================
// 操作の判定（純粋な計算）
//
// 入力：使用した瞬間の状態と、押していた時間・しゃがんでいた時間
// 出力：5種類の操作のどれか、または null（不発）
//
// 優先順位（競合した場合）：
//   1. 奥義      溜め ≥ ultimateTicks（しゃがみの有無に関係なく）
//   2. 大技      しゃがみ中 かつ 溜め ≥ chargeTicks
//   3. 移動技    短く使った かつ 使った瞬間ダッシュ中
//   4. 中技      短く使った かつ 使った瞬間ジャンプ中（空中）
//   5. 小技      短く使った
//   それ以外（しゃがまずに中途半端に長押しして離した等）は不発＝誤発動防止のキャンセル
// =============================================================
import { INPUT } from "../balance/input.js";

/**
 * s.holdTicks  : 押し続けた時間（押して離す方式のアイテム。使えない場合は 0）
 * s.sneaking   : 使用時にしゃがんでいたか
 * s.sneakTicks : 使用時点で、しゃがみ続けていた時間
 * s.airborne   : 使用開始時に空中（ジャンプ中）だったか
 * s.sprinting  : 使用開始時にダッシュ中だったか
 * @param {{holdTicks: number, sneaking: boolean, sneakTicks: number, airborne: boolean, sprinting: boolean}} s
 * @param {typeof INPUT} [cfg]
 * @returns {{action: "ultimate"|"charge"|"sprint"|"jump"|"tap"|null, charge: number, reason: string}}
 */
export function resolveAction(s, cfg = INPUT) {
  const hold = Math.max(0, s.holdTicks || 0);
  const charge = Math.max(hold, s.sneaking ? Math.max(0, s.sneakTicks || 0) : 0);
  if (charge >= cfg.ultimateTicks) return { action: "ultimate", charge, reason: "長時間溜め" };
  if (s.sneaking && charge >= cfg.chargeTicks) return { action: "charge", charge, reason: "しゃがみ溜め" };
  if (hold <= cfg.tapMaxTicks) {
    if (s.sprinting) return { action: "sprint", charge, reason: "ダッシュ中" };
    if (s.airborne) return { action: "jump", charge, reason: "ジャンプ中" };
    return { action: "tap", charge, reason: "通常" };
  }
  return { action: null, charge, reason: "溜め不足（キャンセル）" };
}
