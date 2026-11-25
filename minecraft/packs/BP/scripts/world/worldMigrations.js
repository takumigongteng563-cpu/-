// ワールドデータの移行処理（playerMigrations.js と同じ書き方）
/** @type {Record<number, (data: any) => any>} */
export const worldMigrations = {
  0: (d) => (d && typeof d === "object" ? d : {}),
};
