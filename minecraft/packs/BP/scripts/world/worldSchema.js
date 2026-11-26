// =============================================================
// ワールド共有データの構造（スキーマ v1）
// 全プレイヤーで共有する進行状況。プレイヤー個人の成長は含めない。
// 既存の項目を削除・改名しないこと。
// =============================================================
import { conform } from "../storage/sanitize.js";
import { DEFAULT_OVERFLOW_POLICY } from "../balance/progression.js";
import { DEFAULT_EXHAUSTION_POLICY } from "../balance/vitals.js";
import { DEFAULT_JOB_CHANGE_FROM_MENU } from "../balance/jobs.js";

export function worldTemplate() {
  return {
    createdAt: 0,

    // メインストーリー（最終仕様：一本道・全10章）
    story: {
      chapter: 1, // 現在の章（1～10）。ステージの進行から決まる
      cleared: [], // クリア済み章番号
      flags: {}, // { [flagId]: 値 }
    },

    // --- 最終仕様：100固定ステージ ---
    stages: {
      unlocked: { stage001: 1 }, // { [stageId]: 解放時刻 }（ステージ1は最初から解放）
      records: {}, // { [stageId]: { firstClearAt, firstClearBy: uid[], clears, bestTimeSec } }
      resume: {}, // 長時間ステージの途中再開 { [runId]: { stageId, checkpoint, members, savedAt } }
    },

    // --- 最終仕様：富里王国の復興 ---
    kingdom: {
      phase: "ruined", // ruined（滅亡寸前）→ restoring（復興中）→ capital（王都）
      phaseChangedAt: 0,
      residents: { hope: { arrivedAt: 0, fromStage: null } }, // 開始時はホープのみ
      buildings: {}, // { [buildingId]: { state: "queued"|"built", queuedAt, builtAt } }
      facilities: { inn: { unlockedAt: 0, by: null } }, // 開始時は宿屋のみ
      buildQueue: [], // 配置待ちの建物ID（少しずつ配置して負荷を分散）
      appliedStages: {}, // 復興処理を反映済みのステージ（周回で重複させない）
    },

    // --- 最終仕様：クリア後 ---
    postgame: {
      unlocked: false,
      finalBossDefeatedAt: 0,
      trueEndingAt: 0,
    },

    // 地域解放状況 { [regionId]: { unlockedAt } }
    regions: {
      unlocked: {},
    },

    // 【旧仕様・未使用】ダンジョン攻略状況（ランダムダンジョンは最終仕様で廃止。記録として残す）
    dungeons: {
      records: {},
    },

    // ボス討伐状況 { [bossId]: { defeatedAt, count } }
    bosses: {
      defeated: {},
    },

    // 世界唯一の装備
    uniqueItems: {
      owners: {}, // 【旧形式】{ [itemId]: { ownerUid, obtainedAt } }（v2 移行時に registry へ写す）
      // { [itemId]: { state: "unissued"|"held"|"lost", holderUid, instanceId, growth, history } }
      registry: {},
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

    // 【旧仕様・未使用】ダンジョンの途中再開情報（最終仕様では stages.resume を使う）
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
      // --- 第2弾 ---
      progression: {
        overflowPolicy: DEFAULT_OVERFLOW_POLICY, // レベル上限時の余剰経験値 "store" | "discard"
        vanillaMobExp: true, // 【暫定】バニラのモンスター討伐で経験値を得る
      },
      vitals: {
        exhaustion: DEFAULT_EXHAUSTION_POLICY, // スタミナ切れの制限 "slow" | "none"
      },
      // --- 第3弾 ---
      jobs: {
        // 転職神殿（第15弾）の完成までは冒険者の書から条件付きの転職を行える
        changeFromMenu: DEFAULT_JOB_CHANGE_FROM_MENU,
      },
    },

    // --- 第2弾：才能の統計（潜在能力がパーティ内で偏らないように使う） ---
    talentStats: {
      potentialAssigned: {}, // 【旧仕様・未使用】第2弾の潜在能力抽選で使用。記録として残す
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
