// =============================================================
// コンテンツ登録の共通クラス
// 職業・スキル・装備・モンスター等を大量に追加するための入れ物。
// ・ID の重複登録を拒否する（後から追加した定義で既存定義を壊さない）
// ・ID は保存データに書き込まれるため、一度公開したIDは変更・削除しない
// =============================================================
import { createLogger } from "../core/log.js";

const log = createLogger("registry");

/**
 * @template T
 */
export class Registry {
  /** @param {string} name 表示・ログ用の名前 */
  constructor(name) {
    this.name = name;
    /** @type {Map<string, T>} */
    this.map = new Map();
  }

  /**
   * @param {T & {id: string}} def
   * @returns {boolean}
   */
  register(def) {
    if (!def || typeof def.id !== "string" || def.id.length === 0) {
      log.error(`${this.name}: IDが不正な定義を無視しました`);
      return false;
    }
    if (this.map.has(def.id)) {
      log.error(`${this.name}: ID「${def.id}」が重複しています（後の定義を無視）`);
      return false;
    }
    this.map.set(def.id, Object.freeze({ ...def }));
    return true;
  }

  /** @param {(T & {id: string})[]} defs */
  registerAll(defs) {
    for (const d of defs) this.register(d);
    return this;
  }

  /** @returns {T|undefined} */
  get(id) {
    return this.map.get(id);
  }

  has(id) {
    return this.map.has(id);
  }

  /** @returns {T[]} */
  all() {
    return [...this.map.values()];
  }

  get size() {
    return this.map.size;
  }
}
