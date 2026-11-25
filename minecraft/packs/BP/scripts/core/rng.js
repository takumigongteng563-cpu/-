// 再現性のある乱数（mulberry32）。同じシードからは必ず同じ結果になる。
// 初期才能・潜在能力の抽選に使い、再ログインや死亡で結果が変わらないようにする。

/** @param {number} seed @returns {() => number} 0以上1未満 */
export function createRng(seed) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 重み付き抽選
 * @template T
 * @param {() => number} rng
 * @param {T[]} items
 * @param {(item: T) => number} weightOf
 * @returns {T|undefined}
 */
export function weightedPick(rng, items, weightOf) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it));
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const it of items) {
    r -= Math.max(0, weightOf(it));
    if (r < 0) return it;
  }
  return items[items.length - 1];
}
