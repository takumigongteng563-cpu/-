// =============================================================
// ワールド共有データの構造（スキーマ v1）
// 全プレイヤーで共有する進行状況。プレイヤー個人の成長は含めない。
// 既存の項目を削除・改名しないこと。
// =============================================================
import { conform } from "../storage/sanitize.js";

export function worldTemplate() {
  return {
    createdAt: 0,

    // メインストーリー（全20章を予定）
    story: {
      chapter: 0, // 0 = プロローグ前
      cleared: [], // クリア済み章番号
      flags: {}, // { [flagId]: 値 }
    },

    // 地域解放状況 { [regionId]: { unlockedAt } }
    regions: {
      unlocked: {},
    },

    // ダンジョン攻略状況（ワールド全体） { [dungeonId]: { firstClearAt, clearCount, deepestFloor } }
    dungeons: {
      records: {},
    },

    // ボス討伐状況 { [bossId]: { defeatedAt, count } }
    bosses: {
      defeated: {},
    },

    // 世界唯一の装備の所有状況 { [itemId]: { ownerUid, obtainedAt } }
    uniqueItems: {
      owners: {},
    },

    // 世界唯一の称号の獲得状況 { [titleId]: { ownerUid, obtainedAt } }
    uniqueTitles: {
      owners: {},
    },

    // 特殊イベント
    events: {
      active: {}, // { [eventId]: 状態 }
      completed: {}, // { [eventId]: 完了時刻 }
    },

    // ダンジョンの途中再開情報 { [runId]: { dungeonId, floor, members: uid[], savedAt } }
    dungeonResume: {},

    // ワールド設定
    settings: {
      // 完全RPG型のための行動制限（第1弾では既定ですべて無効）
      restrictions: {
        blockBreak: false, // ブロック破壊（採掘を含む）
        blockPlace: false, // ブロック設置（建築）
        blockInteract: false, // ブロックの使用（作業台・かまど等。クラフトの制限に利用）
      },
      // 人数別難易度調整（第1弾では倍率の器のみ。実際の適用は後続で実装）
      partyScaling: true,
      // NPCによる人数補完（後続で実装）
      npcCompanions: false,
    },
  };
}

export function createInitialWorldData() {
  const d = worldTemplate();
  d.createdAt = Date.now();
  return d;
}

export function conformWorldData(raw) {
  const repairs = [];
  const data = conform(raw, worldTemplate(), "", repairs);
  return { data, repairs };
}
