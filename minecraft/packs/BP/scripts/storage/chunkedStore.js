// =============================================================
// チャンク分割・二重化（A/Bスロット）保存ストア
//
// ・1レコードを複数の動的プロパティに分割して保存する（大量データ対応）
// ・保存は「使っていない方のスロット」に書き込み、最後にメタ情報を
//   書き換えることで切り替える。メタの書き込みが確定点となるため、
//   保存途中で中断しても前回のデータが残る。
// ・前回のスロットはそのままバックアップとして残る（1世代）。
// ・チェックサムと長さで破損を検知し、破損時はもう一方のスロットから復旧する。
//
// このモジュールは @minecraft/server に依存しない（テスト可能にするため）。
// 実際の保存先は backend（get/set を持つオブジェクト）で差し替える。
// =============================================================
import { fnv1a } from "../core/hash.js";
import { toAsciiJson } from "../core/ascii.js";

/**
 * @typedef {Object} StorageBackend
 * @property {(key: string) => (string|number|boolean|undefined|object)} get
 * @property {(key: string, value: string|undefined) => void} set
 */

/**
 * @typedef {Object} Envelope
 * @property {string} k  レコード種別（"player" / "world" / "index" など）
 * @property {number} s  データ構造バージョン
 * @property {number} g  保存世代（保存のたびに +1）
 * @property {number} t  保存時刻（ms）
 * @property {any} d     本体データ
 */

/**
 * @typedef {Object} ReadResult
 * @property {"ok"|"recovered"|"missing"|"corrupt"} status
 *   ok: 正常 / recovered: バックアップや予備手段で復旧 / missing: 存在しない / corrupt: 復旧不能
 * @property {Envelope|null} envelope
 * @property {string[]} errors
 * @property {string|null} slot
 */

const SLOTS = ["a", "b"];

export class ChunkedStore {
  /**
   * @param {StorageBackend} backend
   * @param {{prefix: string, chunkSize: number, maxChunks: number}} options
   */
  constructor(backend, options) {
    this.backend = backend;
    this.prefix = options.prefix;
    this.chunkSize = options.chunkSize;
    this.maxChunks = options.maxChunks;
  }

  metaKey(name) {
    return `${this.prefix}:${name}:m`;
  }

  chunkKey(name, slot, i) {
    return `${this.prefix}:${name}:${slot}${i}`;
  }

  /** メタ情報を読む。壊れていれば null */
  readMeta(name) {
    const raw = this.backend.get(this.metaKey(name));
    if (typeof raw !== "string") return null;
    try {
      const m = JSON.parse(raw);
      if (!m || typeof m !== "object" || !m.slots || typeof m.slots !== "object") return null;
      return m;
    } catch {
      return null;
    }
  }

  /** レコードが（メタ or チャンクとして）存在するか */
  exists(name) {
    if (this.backend.get(this.metaKey(name)) !== undefined) return true;
    return SLOTS.some((s) => this.backend.get(this.chunkKey(name, s, 0)) !== undefined);
  }

  /** スロットの生文字列を読む。sm が無い場合は空きキーが出るまで読む */
  readSlotRaw(name, slot, sm) {
    const count = sm && Number.isInteger(sm.n) ? sm.n : this.maxChunks;
    let text = "";
    let found = 0;
    for (let i = 0; i < count; i++) {
      const part = this.backend.get(this.chunkKey(name, slot, i));
      if (typeof part !== "string") {
        if (sm) return { text: null, error: `チャンク${i}が欠損` };
        break;
      }
      text += part;
      found++;
    }
    if (found === 0) return { text: null, error: "データなし" };
    return { text, error: null };
  }

  /** スロットを検証付きで読む */
  readSlot(name, slot, sm) {
    const { text, error } = this.readSlotRaw(name, slot, sm);
    if (text === null) return { envelope: null, error };
    if (sm) {
      if (typeof sm.len === "number" && text.length !== sm.len) return { envelope: null, error: "長さ不一致" };
      if (typeof sm.h === "string" && fnv1a(text) !== sm.h) return { envelope: null, error: "チェックサム不一致" };
    }
    try {
      const env = JSON.parse(text);
      if (!env || typeof env !== "object" || !("d" in env)) return { envelope: null, error: "形式不正" };
      return { envelope: env, error: null };
    } catch (e) {
      return { envelope: null, error: "JSON解析失敗" };
    }
  }

  /**
   * レコードを読み込む。破損時は自動的にバックアップスロットを試す。
   * @param {string} name
   * @returns {ReadResult}
   */
  read(name) {
    const errors = [];
    const meta = this.readMeta(name);
    if (meta) {
      const active = SLOTS.includes(meta.active) ? meta.active : "a";
      const order = [active, active === "a" ? "b" : "a"];
      for (let idx = 0; idx < order.length; idx++) {
        const slot = order[idx];
        const sm = meta.slots[slot];
        if (!sm) continue;
        const r = this.readSlot(name, slot, sm);
        if (r.envelope) {
          return { status: idx === 0 ? "ok" : "recovered", envelope: r.envelope, errors, slot };
        }
        errors.push(`スロット${slot}: ${r.error}`);
      }
    } else if (this.backend.get(this.metaKey(name)) !== undefined) {
      errors.push("メタ情報が破損");
    }

    // メタが無い／全スロット失敗：検証なしで両スロットを読み、新しい方を採用する
    let best = null;
    let bestSlot = null;
    for (const slot of SLOTS) {
      const r = this.readSlot(name, slot, null);
      if (r.envelope && (!best || (r.envelope.g || 0) > (best.g || 0))) {
        best = r.envelope;
        bestSlot = slot;
      }
    }
    if (best) {
      errors.push(`検証なしでスロット${bestSlot}から復旧`);
      return { status: "recovered", envelope: best, errors, slot: bestSlot };
    }
    if (errors.length === 0) return { status: "missing", envelope: null, errors, slot: null };
    return { status: "corrupt", envelope: null, errors, slot: null };
  }

  /**
   * レコードを書き込む（非アクティブ側スロットへ書いてからメタを切り替える）。
   * @param {string} name
   * @param {string} kind
   * @param {number} schema
   * @param {any} data
   * @returns {{ok: boolean, error?: string, bytes?: number, gen?: number}}
   */
  write(name, kind, schema, data) {
    const meta = this.readMeta(name);
    const metaLost = !meta;
    const slots = meta ? meta.slots : {};
    let active = meta && SLOTS.includes(meta.active) ? meta.active : null;
    if (metaLost) {
      // メタが失われている場合、まだ読めるスロットを上書きしないようにする
      for (const slot of SLOTS) {
        if (this.readSlot(name, slot, null).envelope) {
          active = slot;
          break;
        }
      }
    }
    const target = active === "a" ? "b" : "a";
    const prevGen = Math.max(slots.a?.g || 0, slots.b?.g || 0);
    const gen = prevGen + 1;
    const now = Date.now();

    /** @type {Envelope} */
    const env = { k: kind, s: schema, g: gen, t: now, d: data };
    let text;
    try {
      text = toAsciiJson(JSON.stringify(env));
    } catch (e) {
      return { ok: false, error: "シリアライズ失敗: " + (e && e.message) };
    }
    const n = Math.ceil(text.length / this.chunkSize) || 1;
    if (n > this.maxChunks) return { ok: false, error: `データが大きすぎます（${text.length}文字）` };

    try {
      for (let i = 0; i < n; i++) {
        this.backend.set(this.chunkKey(name, target, i), text.slice(i * this.chunkSize, (i + 1) * this.chunkSize));
      }
      // 以前このスロットにあった余分なチャンクを消す
      const prevN = slots[target] && Number.isInteger(slots[target].n) ? slots[target].n : metaLost ? this.maxChunks : 0;
      for (let i = n; i < prevN; i++) {
        if (this.backend.get(this.chunkKey(name, target, i)) !== undefined) {
          this.backend.set(this.chunkKey(name, target, i), undefined);
        }
      }
      const newMeta = {
        v: 1,
        active: target,
        slots: { ...slots, [target]: { n, len: text.length, h: fnv1a(text), g: gen, t: now } },
      };
      // ここが確定点
      this.backend.set(this.metaKey(name), JSON.stringify(newMeta));
    } catch (e) {
      return { ok: false, error: "書き込み失敗: " + (e && e.message) };
    }
    return { ok: true, bytes: text.length, gen };
  }

  /** 破損データを退避する（復旧不能時、上書き前に呼ぶ）。退避先の名前を返す */
  quarantine(name) {
    const parts = {};
    const metaRaw = this.backend.get(this.metaKey(name));
    if (metaRaw !== undefined) parts.meta = String(metaRaw);
    for (const slot of SLOTS) {
      const r = this.readSlotRaw(name, slot, null);
      if (r.text !== null) parts[slot] = r.text;
    }
    const qName = `q:${name}:${Date.now().toString(36)}`;
    const res = this.write(qName, "quarantine", 1, { from: name, at: Date.now(), raw: parts });
    return res.ok ? qName : null;
  }

  /** レコードを完全に削除する（管理者操作用） */
  remove(name) {
    const meta = this.readMeta(name);
    for (const slot of SLOTS) {
      const n = meta && meta.slots[slot] && Number.isInteger(meta.slots[slot].n) ? meta.slots[slot].n : this.maxChunks;
      for (let i = 0; i < n; i++) {
        if (this.backend.get(this.chunkKey(name, slot, i)) !== undefined) this.backend.set(this.chunkKey(name, slot, i), undefined);
      }
    }
    this.backend.set(this.metaKey(name), undefined);
  }
}
