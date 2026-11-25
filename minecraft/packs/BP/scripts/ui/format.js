// 表示用の整形
export const COMING_SOON = "§7（今後実装予定）§r";

export function num(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "-";
  return Math.floor(n).toLocaleString("en-US");
}

/** ms → "2026/11/25 12:34 (UTC)" */
export function dateTime(ms) {
  if (!ms) return "-";
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} (UTC)`;
}

export function heading(text) {
  return `§l§6■ ${text}§r`;
}

/** 行の配列を本文に */
export function lines(...rows) {
  return rows.flat().filter((r) => r !== null && r !== undefined).join("\n");
}

export function countKeys(obj) {
  return obj && typeof obj === "object" ? Object.keys(obj).length : 0;
}
