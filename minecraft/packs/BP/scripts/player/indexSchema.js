// =============================================================
// プレイヤー索引（ワールド単位で1つ）とデータバージョン情報
// ・どのプレイヤー識別IDが存在するか（不在プレイヤーを含む）
// ・Minecraft のエンティティID → 識別ID の対応（識別IDの復旧用）
// ・アドオンのバージョン履歴（アップデート時の移行記録）
// =============================================================
import { conform } from "../storage/sanitize.js";

export function indexTemplate() {
  return {
    players: {}, // { [uid]: { name, playerId, firstJoinAt, lastSeenAt } }
    byPlayerId: {}, // { [playerId]: uid }
    system: {
      createdAt: 0,
      addonVersion: "",
      schemas: { player: 0, world: 0, index: 0 },
      versionHistory: [], // [{ addonVersion, at }]
      recoveries: [], // 復旧・退避の記録 [{ at, target, detail }]
    },
  };
}

export function conformIndexData(raw) {
  const repairs = [];
  const data = conform(raw, indexTemplate(), "", repairs);
  return { data, repairs };
}

/** @type {Record<number, (d: any) => any>} */
export const indexMigrations = {
  0: (d) => (d && typeof d === "object" ? d : {}),
};
