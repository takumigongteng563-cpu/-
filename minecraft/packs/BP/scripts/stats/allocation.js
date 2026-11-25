// =============================================================
// 自由能力振り分け（確定前の下書き）
// ・下書きはメモリ上だけで管理し、確定するまで保存データは変わらない
// ・確定時に「未使用ポイントが足りるか」を改めて確認してから反映する
// ・確定済みの振り分けは通常は戻せない（respecTokens による再振り分けは将来用）
// =============================================================
import { STAT_IDS } from "../content/stats.js";

export class AllocationDraft {
  /** @param {number} available 確定前の未使用ポイント */
  constructor(available) {
    this.available = Math.max(0, Math.floor(available));
    /** @type {{stat: string, n: number}[]} 操作の履歴（1つ戻す用） */
    this.steps = [];
  }

  get spent() {
    return this.steps.reduce((t, s) => t + s.n, 0);
  }

  get remaining() {
    return this.available - this.spent;
  }

  /** 能力値ごとの追加予定 */
  totals() {
    const out = {};
    for (const s of this.steps) out[s.stat] = (out[s.stat] || 0) + s.n;
    return out;
  }

  /** @returns {number} 実際に追加できた数（残りが足りなければ残り全部） */
  add(stat, n) {
    if (!STAT_IDS.includes(stat)) return 0;
    const k = Math.min(Math.max(0, Math.floor(n)), this.remaining);
    if (k <= 0) return 0;
    this.steps.push({ stat, n: k });
    return k;
  }

  /** 直前の操作を取り消す */
  undo() {
    return this.steps.pop();
  }

  clear() {
    this.steps = [];
  }

  isEmpty() {
    return this.steps.length === 0;
  }
}

/**
 * 下書きをプレイヤーデータに反映する。
 * @returns {{ok: boolean, reason?: string, applied?: Record<string, number>}}
 */
export function commitAllocation(data, draft) {
  const totals = draft.totals();
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  if (sum <= 0) return { ok: false, reason: "振り分けがありません" };
  if (sum > data.unspentStatPoints) return { ok: false, reason: "能力ポイントが足りません" };
  for (const [s, n] of Object.entries(totals)) {
    if (!STAT_IDS.includes(s) || !Number.isInteger(n) || n <= 0) return { ok: false, reason: "不正な振り分け" };
  }
  for (const [s, n] of Object.entries(totals)) data.statAllocated[s] = (data.statAllocated[s] || 0) + n;
  data.unspentStatPoints -= sum;
  return { ok: true, applied: totals };
}

/**
 * 再振り分け（確定済みの振り分けをポイントに戻す）。
 * 通常の操作からは呼べない。特殊アイテム・試練（将来）や管理者テストから、
 * respecTokens を1消費して実行する。
 */
export function respec(data, { useToken = true } = {}) {
  if (useToken) {
    if (!(data.respecTokens > 0)) return { ok: false, reason: "再振り分けの権利がありません" };
    data.respecTokens--;
  }
  let refund = 0;
  for (const s of Object.keys(data.statAllocated)) {
    refund += Math.max(0, Math.floor(data.statAllocated[s] || 0));
    data.statAllocated[s] = 0;
  }
  data.unspentStatPoints += refund;
  return { ok: true, refund };
}
