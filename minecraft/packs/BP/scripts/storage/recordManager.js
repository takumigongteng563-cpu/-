// =============================================================
// レコード管理（キャッシュ・変更検知・保存・移行・修復の共通処理）
//
// ・読み込んだデータはメモリにキャッシュし、毎tickの読み書きをしない
// ・変更があったレコードだけ「dirty」として記録し、まとめて保存する
// ・重要な更新は save() で即時保存する
// ・読み込み時に「破損検知 → バックアップから復旧 → バージョン移行 → 欠損補完」を行う
// ・保存データがアドオンより新しい場合は読み取り専用にし、上書きで壊さない
//
// @minecraft/server に依存しない。
// =============================================================
import { migrate } from "./migration.js";
import { createLogger } from "../core/log.js";

const log = createLogger("record");

/**
 * @typedef {Object} RecordSpec
 * @property {string} kind
 * @property {number} schema
 * @property {Record<number, (d: any) => any>} migrations
 * @property {(raw: any) => {data: any, repairs: string[]}} conform
 */

/**
 * @typedef {Object} RecordEntry
 * @property {string} name
 * @property {any} data
 * @property {boolean} dirty
 * @property {number} dirtySince
 * @property {boolean} readOnly
 * @property {"created"|"loaded"|"recovered"|"reset"|"protected"} status
 * @property {string[]} notes
 * @property {number} lastSavedAt
 * @property {number} saveFailures
 */

export class RecordManager {
  /**
   * @param {import("./chunkedStore.js").ChunkedStore} store
   * @param {RecordSpec} spec
   */
  constructor(store, spec) {
    this.store = store;
    this.spec = spec;
    /** @type {Map<string, RecordEntry>} */
    this.entries = new Map();
    /** 保存完了時に呼ばれる（通知用） */
    this.onSaved = null;
  }

  /** @returns {RecordEntry|undefined} */
  peek(name) {
    return this.entries.get(name);
  }

  /** ストアにデータが存在するか（キャッシュ外も含む） */
  existsInStore(name) {
    return this.store.exists(name);
  }

  /**
   * レコードを開く（キャッシュになければ読み込み、無ければ作成）。
   * @param {string} name
   * @param {() => any} createFn  新規作成時の初期データ
   * @returns {RecordEntry}
   */
  open(name, createFn) {
    const cached = this.entries.get(name);
    if (cached) return cached;

    const now = Date.now();
    /** @type {RecordEntry} */
    const entry = {
      name,
      data: null,
      dirty: false,
      dirtySince: 0,
      readOnly: false,
      status: "loaded",
      notes: [],
      lastSavedAt: 0,
      saveFailures: 0,
    };

    const res = this.store.read(name);
    if (res.status === "missing") {
      entry.data = createFn();
      entry.status = "created";
      entry.dirty = true;
      entry.dirtySince = now;
    } else if (res.status === "corrupt") {
      // 復旧不能。上書き前に生データを退避してから初期化する
      const q = this.store.quarantine(name);
      entry.data = createFn();
      entry.status = "reset";
      entry.dirty = true;
      entry.dirtySince = now;
      entry.notes.push(...res.errors, q ? `破損データを ${q} に退避` : "破損データの退避に失敗");
      log.error(`${this.spec.kind}「${name}」が破損しており復旧できませんでした:`, res.errors.join(" / "));
    } else {
      const env = res.envelope;
      if (res.status === "recovered") {
        entry.status = "recovered";
        entry.notes.push(...res.errors);
        entry.dirty = true;
        entry.dirtySince = now;
        log.warn(`${this.spec.kind}「${name}」をバックアップから復旧:`, res.errors.join(" / "));
      }
      let migrated;
      try {
        migrated = migrate(env.d, env.s, this.spec.schema, this.spec.migrations);
      } catch (e) {
        migrated = null;
        entry.readOnly = true;
        entry.status = "protected";
        entry.notes.push(`移行処理に失敗したため読み取り専用: ${e && e.message}`);
        log.error(`${this.spec.kind}「${name}」の移行に失敗:`, e);
      }
      if (migrated && migrated.fromFuture) {
        entry.readOnly = true;
        entry.status = "protected";
        entry.notes.push(...migrated.log, "上書き防止のため読み取り専用");
        log.warn(`${this.spec.kind}「${name}」は新しいバージョンのデータのため保存しません`);
      }
      const source = migrated && !migrated.fromFuture ? migrated.data : env.d;
      const { data, repairs } = this.spec.conform(source);
      entry.data = data;
      if (migrated && migrated.changed) {
        entry.notes.push(...migrated.log.map((l) => `移行 ${l}`));
      }
      if (repairs.length > 0) entry.notes.push(...repairs.map((r) => `修復 ${r}`));
      if (!entry.readOnly && ((migrated && migrated.changed) || repairs.length > 0)) {
        entry.dirty = true;
        entry.dirtySince = entry.dirtySince || now;
      }
    }
    this.entries.set(name, entry);
    return entry;
  }

  markDirty(name) {
    const e = this.entries.get(name);
    if (!e || e.readOnly) return;
    if (!e.dirty) {
      e.dirty = true;
      e.dirtySince = Date.now();
    }
  }

  /**
   * 即時保存する。
   * @returns {boolean} 保存できたか
   */
  save(name) {
    const e = this.entries.get(name);
    if (!e) return false;
    if (e.readOnly) return false;
    const res = this.store.write(name, this.spec.kind, this.spec.schema, e.data);
    if (!res.ok) {
      e.saveFailures++;
      log.error(`${this.spec.kind}「${name}」の保存に失敗:`, res.error);
      return false;
    }
    e.dirty = false;
    e.dirtySince = 0;
    e.lastSavedAt = Date.now();
    e.saveFailures = 0;
    if (this.onSaved) {
      try {
        this.onSaved(e);
      } catch {
        // 通知失敗は無視
      }
    }
    return true;
  }

  /** 変更のあるレコードを古い順に最大 max 件保存する */
  flushDirty(max = Infinity) {
    const dirty = [...this.entries.values()].filter((e) => e.dirty && !e.readOnly);
    dirty.sort((a, b) => a.dirtySince - b.dirtySince);
    let n = 0;
    for (const e of dirty) {
      if (n >= max) break;
      this.save(e.name);
      n++;
    }
    return n;
  }

  /** すべての変更を保存する */
  flushAll() {
    return this.flushDirty(Infinity);
  }

  dirtyCount() {
    let n = 0;
    for (const e of this.entries.values()) if (e.dirty && !e.readOnly) n++;
    return n;
  }

  /** キャッシュから外す（必要なら保存してから） */
  close(name) {
    const e = this.entries.get(name);
    if (!e) return true;
    if (e.dirty && !e.readOnly && !this.save(name)) {
      // 保存に失敗した場合はキャッシュに残し、自動保存で再試行する
      return false;
    }
    this.entries.delete(name);
    return true;
  }
}
