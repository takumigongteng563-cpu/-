// =============================================================
// 魔神野口と4人の勇者たち — 全体設定値
// ここにある値は「保存キー」に直結するものがあります。
// NAMESPACE / KEY_PREFIX / ITEM_IDS を変更すると既存セーブが
// 読めなくなるため、絶対に変更しないでください。
// =============================================================

/** アドオンのバージョン（表示・診断用） */
export const ADDON_VERSION = "0.2.0";

/** アイテム・タグ等の名前空間（変更禁止） */
export const NAMESPACE = "noguchi";

/** 動的プロパティのキー接頭辞（変更禁止） */
export const KEY_PREFIX = "mnq";

/** 現在のデータ構造バージョン。構造を変えたら +1 し、移行処理を追加する */
export const PLAYER_SCHEMA_VERSION = 2;
export const WORLD_SCHEMA_VERSION = 1;
export const INDEX_SCHEMA_VERSION = 1;

/** アイテムID（変更禁止） */
export const ITEM_IDS = Object.freeze({
  adventurerBook: `${NAMESPACE}:adventurer_book`,
});

/** タグ */
export const TAGS = Object.freeze({
  /** 管理者タグ。/tag @s add noguchi_admin で付与 */
  admin: `${NAMESPACE}_admin`,
});

/** 保存まわりの調整値（Switch の処理性能を考慮した値） */
export const SAVE = Object.freeze({
  /** 自動保存チェックの間隔（tick）。20tick = 1秒 */
  autosaveIntervalTicks: 200,
  /** 1回の自動保存チェックで書き込むレコードの最大数（負荷分散） */
  maxRecordsPerAutosave: 2,
  /**
   * 1つの動的プロパティに書き込む最大文字数。
   * 文字列はASCIIに変換して保存するため 1文字 = 1バイト。
   * 上限 32767 に対して十分な余裕を持たせる。
   */
  chunkSize: 16000,
  /** 1レコードあたりの最大チャンク数（暴走防止） */
  maxChunks: 64,
});

/** マルチプレイ設定 */
export const PARTY = Object.freeze({
  /** 想定する最大人数 */
  maxPlayers: 4,
});

/** メニュー */
export const MENU = Object.freeze({
  /** 連続でメニューを開けない時間（tick）。12tick = 0.6秒 */
  openCooldownTicks: 12,
  /** チャット欄などで画面が使用中のとき再試行する回数 */
  busyRetryCount: 20,
  /** 再試行の間隔（tick） */
  busyRetryIntervalTicks: 5,
});
