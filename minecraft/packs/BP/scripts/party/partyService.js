// =============================================================
// マルチプレイ（1～4人）基盤
// ・オンライン人数の把握
// ・人数別難易度調整の「倍率表」（実際の敵ステータスへの適用は後続で実装）
// ・NPCによる人数補完の差し込み口（後続で実装）
// @minecraft/server に依存しない。
// =============================================================
import { PARTY } from "../config.js";

/**
 * 人数別の難易度倍率（暫定値）。敵の強さ・報酬に掛ける想定。
 * 第1弾では値を保持するだけで、どこにも適用していない。
 */
export const PARTY_SCALING_TABLE = Object.freeze({
  1: { enemyHp: 1.0, enemyAtk: 1.0, reward: 1.0 },
  2: { enemyHp: 1.6, enemyAtk: 1.15, reward: 1.0 },
  3: { enemyHp: 2.2, enemyAtk: 1.3, reward: 1.0 },
  4: { enemyHp: 2.8, enemyAtk: 1.45, reward: 1.0 },
});

/**
 * @typedef {Object} CompanionProvider
 * NPC仲間で不足人数を補う処理（後続で実装）。
 * @property {string} id
 * @property {(missing: number, ctx: any) => any[]} provide
 */

export class PartyService {
  /** @param {import("../player/playerService.js").PlayerService} playerService */
  constructor(playerService) {
    this.playerService = playerService;
    /** @type {CompanionProvider[]} */
    this.companionProviders = [];
  }

  /** オンラインのプレイヤー人数 */
  onlineCount() {
    return this.playerService.onlineSessions().length;
  }

  /** 想定人数を超えているか */
  isOverCapacity() {
    return this.onlineCount() > PARTY.maxPlayers;
  }

  /**
   * 人数に応じた倍率を返す（1～4に丸める）
   * @param {number} [count] 省略時はオンライン人数
   */
  scalingFor(count) {
    const n = Math.min(PARTY.maxPlayers, Math.max(1, Math.floor(count ?? this.onlineCount())));
    return PARTY_SCALING_TABLE[n];
  }

  /** NPC仲間の提供元を登録する（後続の開発用） */
  registerCompanionProvider(provider) {
    if (provider && typeof provider.provide === "function") this.companionProviders.push(provider);
  }
}
