// オンラインのプレイヤーを ID から探す
import { world } from "@minecraft/server";

/** @returns {import("@minecraft/server").Player|undefined} */
export function findPlayer(playerId) {
  for (const p of world.getAllPlayers()) if (p.id === playerId) return p;
  return undefined;
}
