// =============================================================
// データ構造バージョン管理・移行（マイグレーション）
//
// 使い方：データ構造を変えるときは
//   1. config.js の *_SCHEMA_VERSION を +1 する
//   2. 対応する migrations 表に「旧バージョン → 新バージョン」の関数を追加する
// 既存データの項目は削除せず、新しい項目を追加・変換する方針とする。
// =============================================================

/**
 * @typedef {Object} MigrationResult
 * @property {any} data
 * @property {number} schema   移行後のバージョン
 * @property {boolean} changed
 * @property {boolean} fromFuture  保存データの方が新しい（アドオンが古い）
 * @property {string[]} log
 */

/**
 * @param {any} data
 * @param {number} fromSchema
 * @param {number} targetSchema
 * @param {Record<number, (data: any) => any>} migrations  キー n は「n から n+1 へ」の変換
 * @returns {MigrationResult}
 */
export function migrate(data, fromSchema, targetSchema, migrations) {
  const log = [];
  let schema = Number.isInteger(fromSchema) && fromSchema >= 0 ? fromSchema : 0;
  if (schema > targetSchema) {
    return { data, schema, changed: false, fromFuture: true, log: [`保存データ(v${schema})がアドオン(v${targetSchema})より新しい`] };
  }
  let changed = false;
  let current = data;
  while (schema < targetSchema) {
    const step = migrations[schema];
    if (typeof step !== "function") {
      throw new Error(`v${schema} → v${schema + 1} の移行処理が未定義です`);
    }
    current = step(current);
    log.push(`v${schema} → v${schema + 1}`);
    schema++;
    changed = true;
  }
  return { data: current, schema, changed, fromFuture: false, log };
}
