// プレイヤーデータの移行処理。
// キー n の関数は「v(n) のデータを v(n+1) に変換」する。
// 例）v1 → v2 で項目 foo を追加する場合：
//   1: (d) => ({ ...d, foo: 0 }),
// v0 は「バージョン情報が無いデータ」（通常は存在しない）。

/** @type {Record<number, (data: any) => any>} */
export const playerMigrations = {
  0: (d) => (d && typeof d === "object" ? d : {}),
};
