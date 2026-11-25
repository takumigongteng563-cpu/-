// =============================================================
// プレイヤー個人データの管理（識別・参加・退出・保存）
//
// データの持ち主はアドオン独自の「プレイヤー識別ID(uid)」で管理する。
//   ・uid はプレイヤー本人（エンティティ）の動的プロパティにも記録する
//   ・個人データ本体はワールドの動的プロパティに uid 単位で保存する
//     → 不在プレイヤーのデータも参照でき、プレイヤー同士で混ざらない
//   ・エンティティ側の uid が失われた場合は索引（エンティティID→uid）から復旧する
//
// @minecraft/server に依存しない（player は id/name/get/setDynamicProperty を持つ物）。
// =============================================================
import { RecordManager } from "../storage/recordManager.js";
import { PLAYER_SCHEMA_VERSION, KEY_PREFIX } from "../config.js";
import { generateUid, isValidUid } from "../core/ids.js";
import { createInitialPlayerData, conformPlayerData } from "./playerSchema.js";
import { playerMigrations } from "./playerMigrations.js";
import { createLogger } from "../core/log.js";

const log = createLogger("player");

/** プレイヤー本人に記録する識別IDのキー（変更禁止） */
export const PLAYER_UID_PROPERTY = `${KEY_PREFIX}:uid`;

export function recordNameForUid(uid) {
  return `p.${uid}`;
}

/**
 * @typedef {Object} Session
 * @property {string} uid
 * @property {string} playerId
 * @property {string} name
 * @property {number} joinedAt
 */

/**
 * @typedef {Object} JoinResult
 * @property {string} uid
 * @property {boolean} isNew       初回参加（データ新規作成）
 * @property {boolean} alreadyJoined すでに参加処理済み（再読込など）
 * @property {string} status       RecordEntry.status
 * @property {string[]} notices    本人に伝えるべきこと
 */

export class PlayerService {
  /**
   * @param {import("../storage/chunkedStore.js").ChunkedStore} store
   * @param {import("../world/worldService.js").WorldService} worldService
   */
  constructor(store, worldService) {
    this.worldService = worldService;
    this.records = new RecordManager(store, {
      kind: "player",
      schema: PLAYER_SCHEMA_VERSION,
      migrations: playerMigrations,
      conform: conformPlayerData,
    });
    /** @type {Map<string, Session>} Minecraft の player.id → セッション */
    this.sessions = new Map();
  }

  /** オンラインの uid → playerId */
  onlineUidOwner(uid) {
    for (const s of this.sessions.values()) if (s.uid === uid) return s.playerId;
    return null;
  }

  /**
   * プレイヤーの識別IDを決定する。
   * @returns {{uid: string, source: "entity"|"index"|"new"}}
   */
  resolveUid(player) {
    let fromEntity;
    try {
      fromEntity = player.getDynamicProperty(PLAYER_UID_PROPERTY);
    } catch (e) {
      fromEntity = undefined;
    }
    const index = this.worldService.index;

    if (isValidUid(fromEntity)) {
      const owner = this.onlineUidOwner(fromEntity);
      if (owner && owner !== player.id) {
        // 同じ uid を持つ別人が既にオンライン → データ混同を防ぐため新しい uid を発行
        log.error(`識別ID ${fromEntity} が重複しています（${player.name}）。新しいIDを発行します`);
      } else {
        return { uid: fromEntity, source: "entity" };
      }
    } else {
      const byId = index.byPlayerId[player.id];
      if (isValidUid(byId) && !this.onlineUidOwner(byId)) {
        log.warn(`${player.name} の識別IDを索引から復旧しました: ${byId}`);
        return { uid: byId, source: "index" };
      }
    }
    let uid = generateUid("p");
    while (index.players[uid]) uid = generateUid("p");
    return { uid, source: "new" };
  }

  /**
   * 参加処理。初回参加ならデータを作成し、再参加なら保存済みデータを読み込む。
   * 何度呼んでも安全（2回目以降は alreadyJoined）。
   * @returns {JoinResult}
   */
  join(player) {
    const existing = this.sessions.get(player.id);
    if (existing) {
      return { uid: existing.uid, isNew: false, alreadyJoined: true, status: "loaded", notices: [] };
    }
    const { uid, source } = this.resolveUid(player);
    const name = recordNameForUid(uid);
    const notices = [];

    const entry = this.records.open(name, () => createInitialPlayerData(uid, player.id, player.name));
    const isNew = entry.status === "created";

    // 持ち主の照合（別人のデータを読み込まない）
    if (entry.data.uid && entry.data.uid !== uid) {
      log.error(`データの持ち主が一致しません: 記録=${entry.data.uid} 要求=${uid}`);
      entry.readOnly = true;
      entry.status = "protected";
      notices.push("§cデータの整合性に問題があるため、保護モードで読み込みました。管理者に連絡してください。");
    } else if (!entry.data.uid) {
      entry.data.uid = uid;
    }

    if (entry.status === "recovered") notices.push("§eセーブデータの一部に問題があったため、バックアップから復旧しました。");
    if (entry.status === "reset")
      notices.push("§cセーブデータが破損しており復旧できませんでした。破損データは退避済みです。管理者に連絡してください。");
    if (entry.status === "protected" && notices.length === 0)
      notices.push("§eこのセーブデータは新しいバージョンのアドオンで保存されています。上書き防止のため保存は行いません。");
    if (source === "index") notices.push("§e識別情報を復旧しました。");

    // 本人に uid を記録
    try {
      if (player.getDynamicProperty(PLAYER_UID_PROPERTY) !== uid) player.setDynamicProperty(PLAYER_UID_PROPERTY, uid);
    } catch (e) {
      log.error("識別IDの記録に失敗:", e);
    }

    const now = Date.now();
    if (!entry.readOnly) {
      entry.data.lastPlayerId = player.id;
      entry.data.name = player.name;
      entry.data.sessionLog.joinCount++;
      entry.data.sessionLog.lastLoginAt = now;
      if (!entry.data.sessionLog.firstJoinAt) entry.data.sessionLog.firstJoinAt = now;
      this.records.markDirty(name);
    }

    this.sessions.set(player.id, { uid, playerId: player.id, name: player.name, joinedAt: now });

    this.worldService.updateIndex((d) => {
      const prev = d.players[uid];
      d.players[uid] = {
        name: player.name,
        playerId: player.id,
        firstJoinAt: prev ? prev.firstJoinAt : now,
        lastSeenAt: now,
      };
      d.byPlayerId[player.id] = uid;
    });
    if (entry.status === "recovered" || entry.status === "reset" || entry.status === "protected") {
      this.worldService.addRecovery(name, `${entry.status}: ${entry.notes.join(" / ")}`);
    }

    // 参加・初回作成は重要な更新として即時保存
    this.records.save(name);
    this.worldService.indexRecords.save("index");

    log.info(`${player.name} 参加 uid=${uid} ${isNew ? "(初回)" : "(再参加)"} status=${entry.status}`);
    return { uid, isNew, alreadyJoined: false, status: entry.status, notices };
  }

  /**
   * 退出処理。保存してキャッシュから外す。
   * プレイヤーのエンティティにはアクセスしない（退出後は存在しないため）。
   */
  leave(playerId) {
    const s = this.sessions.get(playerId);
    if (!s) return false;
    const name = recordNameForUid(s.uid);
    const e = this.records.peek(name);
    const now = Date.now();
    if (e && !e.readOnly) {
      e.data.sessionLog.lastLogoutAt = now;
      this.records.markDirty(name);
    }
    this.records.close(name);
    this.sessions.delete(playerId);
    this.worldService.updateIndex((d) => {
      if (d.players[s.uid]) d.players[s.uid].lastSeenAt = now;
    });
    log.info(`${s.name} 退出 uid=${s.uid}`);
    return true;
  }

  getSession(playerId) {
    return this.sessions.get(playerId);
  }

  /** オンライン中のセッション一覧 */
  onlineSessions() {
    return [...this.sessions.values()];
  }

  /** @returns {import("../storage/recordManager.js").RecordEntry|undefined} */
  entryFor(playerId) {
    const s = this.sessions.get(playerId);
    if (!s) return undefined;
    return this.records.open(recordNameForUid(s.uid), () => {
      throw new Error("セッション中のデータが見つかりません");
    });
  }

  /** プレイヤーのデータ（読み取り用） */
  dataFor(playerId) {
    const e = this.entryFor(playerId);
    return e ? e.data : undefined;
  }

  /**
   * プレイヤーのデータを変更する。
   * @param {string} playerId
   * @param {(d: any) => void} mutator
   * @param {{important?: boolean}} [opt] important = 即時保存
   */
  update(playerId, mutator, opt = {}) {
    const e = this.entryFor(playerId);
    if (!e || e.readOnly) return false;
    mutator(e.data);
    this.records.markDirty(e.name);
    if (opt.important) return this.records.save(e.name);
    return true;
  }

  /** 不在プレイヤーを含むデータの参照（読み取り専用コピー） */
  peekOffline(uid) {
    const cached = this.records.peek(recordNameForUid(uid));
    if (cached) return JSON.parse(JSON.stringify(cached.data));
    const res = this.records.store.read(recordNameForUid(uid));
    return res.envelope ? res.envelope.d : undefined;
  }

  flushDirty(max) {
    return this.records.flushDirty(max);
  }

  flushAll() {
    return this.records.flushAll();
  }

  dirtyCount() {
    return this.records.dirtyCount();
  }
}
