// 管理者判定（管理者タグ noguchi_admin を持つプレイヤーのみ）
import { TAGS } from "../config.js";

/** @param {any} player */
export function isAdmin(player) {
  try {
    return !!player && typeof player.hasTag === "function" && player.hasTag(TAGS.admin);
  } catch {
    return false;
  }
}
