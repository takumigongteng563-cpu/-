// =============================================================
// ワールド共有データ・プレイヤー索引の管理
// @minecraft/server に依存しない。
// =============================================================
import { RecordManager } from "../storage/recordManager.js";
import { WORLD_SCHEMA_VERSION, INDEX_SCHEMA_VERSION, PLAYER_SCHEMA_VERSION, ADDON_VERSION } from "../config.js";
import { createInitialWorldData, conformWorldData } from "./worldSchema.js";
import { worldMigrations } from "./worldMigrations.js";
import { indexTemplate, conformIndexData, indexMigrations } from "../player/indexSchema.js";
import { createLogger } from "../core/log.js";

const log = createLogger("world");

export const WORLD_RECORD = "world";
export const INDEX_RECORD = "index";

export class WorldService {
  /** @param {import("../storage/chunkedStore.js").ChunkedStore} store */
  constructor(store) {
    this.store = store;
    this.worldRecords = new RecordManager(store, {
      kind: "world",
      schema: WORLD_SCHEMA_VERSION,
      migrations: worldMigrations,
      conform: conformWorldData,
    });
    this.indexRecords = new RecordManager(store, {
      kind: "index",
      schema: INDEX_SCHEMA_VERSION,
      migrations: indexMigrations,
      conform: conformIndexData,
    });
    this.loaded = false;
  }

  /** ワールド起動時に1回呼ぶ。データを読み込み、バージョン情報を更新する */
  load() {
    const w = this.worldRecords.open(WORLD_RECORD, createInitialWorldData);
    const i = this.indexRecords.open(INDEX_RECORD, () => {
      const d = indexTemplate();
      d.system.createdAt = Date.now();
      return d;
    });
    const sys = i.data.system;
    if (sys.addonVersion !== ADDON_VERSION) {
      sys.versionHistory.push({ addonVersion: ADDON_VERSION, from: sys.addonVersion || null, at: Date.now() });
      if (sys.versionHistory.length > 50) sys.versionHistory.splice(0, sys.versionHistory.length - 50);
      sys.addonVersion = ADDON_VERSION;
      this.indexRecords.markDirty(INDEX_RECORD);
      log.info(`アドオンのバージョンを記録: ${ADDON_VERSION}`);
    }
    sys.schemas = { player: PLAYER_SCHEMA_VERSION, world: WORLD_SCHEMA_VERSION, index: INDEX_SCHEMA_VERSION };
    for (const e of [w, i]) {
      if (e.status === "recovered" || e.status === "reset" || e.status === "protected") {
        this.addRecovery(e.name, `${e.status}: ${e.notes.join(" / ")}`);
      }
    }
    // 起動直後の状態を確定させる（重要な更新）
    if (w.dirty) this.worldRecords.save(WORLD_RECORD);
    if (this.indexRecords.peek(INDEX_RECORD).dirty) this.indexRecords.save(INDEX_RECORD);
    this.loaded = true;
    return { world: w, index: i };
  }

  /** @returns {ReturnType<typeof createInitialWorldData>} */
  get world() {
    return this.worldRecords.open(WORLD_RECORD, createInitialWorldData).data;
  }

  get worldEntry() {
    return this.worldRecords.open(WORLD_RECORD, createInitialWorldData);
  }

  /** @returns {ReturnType<typeof indexTemplate>} */
  get index() {
    return this.indexRecords.open(INDEX_RECORD, indexTemplate).data;
  }

  /**
   * ワールドデータを変更する。
   * @param {(w: any) => void} mutator
   * @param {{important?: boolean}} [opt] important = 即時保存
   */
  updateWorld(mutator, opt = {}) {
    const e = this.worldEntry;
    if (e.readOnly) {
      log.warn("ワールドデータは読み取り専用のため変更できません");
      return false;
    }
    mutator(e.data);
    this.worldRecords.markDirty(WORLD_RECORD);
    if (opt.important) return this.worldRecords.save(WORLD_RECORD);
    return true;
  }

  updateIndex(mutator, opt = {}) {
    const e = this.indexRecords.open(INDEX_RECORD, indexTemplate);
    if (e.readOnly) return false;
    mutator(e.data);
    this.indexRecords.markDirty(INDEX_RECORD);
    if (opt.important) return this.indexRecords.save(INDEX_RECORD);
    return true;
  }

  addRecovery(target, detail) {
    this.updateIndex((d) => {
      d.system.recoveries.push({ at: Date.now(), target, detail: String(detail).slice(0, 300) });
      if (d.system.recoveries.length > 30) d.system.recoveries.splice(0, d.system.recoveries.length - 30);
    });
  }

  flushDirty(max) {
    let n = this.indexRecords.flushDirty(max);
    if (n < max) n += this.worldRecords.flushDirty(max - n);
    return n;
  }

  flushAll() {
    return this.indexRecords.flushAll() + this.worldRecords.flushAll();
  }

  dirtyCount() {
    return this.indexRecords.dirtyCount() + this.worldRecords.dirtyCount();
  }
}
