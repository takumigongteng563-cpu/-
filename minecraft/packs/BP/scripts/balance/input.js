// =============================================================
// 【設定ファイル】ホットバー複数操作（最終仕様 Ver.1.0 第11章）
// 20tick = 1秒
// =============================================================
export const INPUT = Object.freeze({
  /** これ以下の押し時間（tick）なら「短く使った」とみなす（通常・ジャンプ中・ダッシュ中） */
  tapMaxTicks: 8,
  /** しゃがみ溜め：この時間以上溜めると大技（溜めは「押し続けた時間」と「しゃがみ続けた時間」の長い方） */
  chargeTicks: 15,
  /** 長時間溜め：この時間以上溜めると奥義 */
  ultimateTicks: 40,
  /** 全技共通の再使用待ち（連打・二重発動の防止） */
  globalCooldownTicks: 6,
  /** しゃがみ時間を測る間隔（技を割り当てたアイテムを持っている人だけ） */
  sneakPollTicks: 2,
});

/** 操作の種類（優先順位の高い順） */
export const ACTION_TYPES = Object.freeze([
  { id: "ultimate", name: "長時間溜めて使用", tier: "奥義・超大魔法" },
  { id: "charge", name: "しゃがみながら溜めて使用", tier: "大技・大魔法" },
  { id: "sprint", name: "ダッシュ中に使用", tier: "移動技" },
  { id: "jump", name: "ジャンプ中に使用", tier: "中技・中魔法" },
  { id: "tap", name: "通常使用", tier: "小技・小魔法" },
]);

export const HOTBAR_SLOTS = 9;
