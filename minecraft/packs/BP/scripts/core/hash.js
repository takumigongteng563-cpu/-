// データ破損検知用のチェックサム（FNV-1a 32bit）。
// 暗号学的な強度は不要。保存途中の欠損・書き換わりを検知するためのもの。

/**
 * @param {string} text
 * @returns {string} 8桁の16進文字列
 */
export function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
