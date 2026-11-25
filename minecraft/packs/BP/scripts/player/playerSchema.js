// =============================================================
// プレイヤー個人データの構造（スキーマ v1）
//
// ここで定義した形が「保存構造」になる。
// 項目を追加するときは：
//   ・ここに既定値を追加する（既存データには読込時に自動で補われる）
//   ・意味や型を変える場合は PLAYER_SCHEMA_VERSION を上げて移行処理を書く
// 既存の項目を削除・改名しないこと（セーブデータが失われるため）。
// =============================================================
import { PLAYER_SCHEMA_VERSION } from "../config.js";
import { randomSeed } from "../core/ids.js";
import { conform } from "../storage/sanitize.js";
import {
  DEFAULT_RACE_ID,
  DEFAULT_JOB_ID,
  DEFAULT_RANK_ID,
  INITIAL_VITALS,
  initialBaseStats,
  emptyEquipmentSlots,
} from "../content/index.js";

/**
 * 既定値（形の見本）。conform() の基準としても使う。
 * 関数にしているのは、毎回新しいオブジェクトを作るため。
 */
export function playerTemplate() {
  return {
    // --- 識別 ---
    uid: "", // アドオン独自のプレイヤー識別ID（データの持ち主）
    lastPlayerId: "", // 最後に確認した Minecraft 側のエンティティID
    name: "", // 最後に確認したプレイヤー名（表示用。識別には使わない）
    createdAt: 0,

    // --- 基本 ---
    race: DEFAULT_RACE_ID,
    level: 1,
    exp: 0,

    // --- 職業 ---
    job: {
      current: DEFAULT_JOB_ID,
      // 職業ごとの職業レベル。{ [jobId]: { level, exp } }
      levels: { [DEFAULT_JOB_ID]: { level: 1, exp: 0 } },
      unlocked: [DEFAULT_JOB_ID],
      history: [], // 転職履歴 [{ from, to, at }]
    },

    // --- HP・MP・スタミナ（RPG内部値。バニラの体力とは第1弾では連動しない） ---
    vitals: {
      hp: INITIAL_VITALS.hp,
      hpMax: INITIAL_VITALS.hp,
      mp: INITIAL_VITALS.mp,
      mpMax: INITIAL_VITALS.mp,
      stamina: INITIAL_VITALS.stamina,
      staminaMax: INITIAL_VITALS.stamina,
    },

    // --- 能力値 ---
    stats: initialBaseStats(),
    unspentStatPoints: 0,

    // --- 才能 ---
    talents: {
      innate: [], // 先天的才能のID一覧
      acquired: [], // 後天的才能のID一覧
    },
    // 隠された潜在能力。本人にも内容は見えない。seed は将来の抽選用
    hiddenPotential: {
      seed: 0,
      revealed: [], // 開花済みの潜在能力ID
      entries: [], // 内部的に決定済みの潜在能力（未公開）
    },

    // --- スキル・熟練度 ---
    skills: {
      learned: {}, // { [skillId]: { level, exp, learnedAt } }
      equipped: [], // セット中のスキルID
    },
    proficiency: {}, // 武器種・魔法系統などの熟練度 { [id]: { level, exp } }

    // --- 装備 ---
    equipment: {
      slots: emptyEquipmentSlots(), // { [slotId]: 装備データ or null }
      loadouts: [], // 装備セット（将来用）
    },

    // --- 所持金・称号・冒険者 ---
    gold: 0,
    titles: {
      owned: [], // 獲得済み称号ID
      equipped: null, // 表示中の称号ID
    },
    adventurer: {
      rank: DEFAULT_RANK_ID,
      points: 0,
      registeredAt: 0,
    },

    // --- クエスト・好感度 ---
    quests: {
      active: {}, // { [questId]: 進行データ }
      completed: {}, // { [questId]: 完了時刻 }
    },
    npcAffinity: {}, // { [npcId]: 好感度 }

    // --- 個人倉庫 ---
    storage: {
      capacity: 0, // 解放済みの枠数
      items: [], // 保管アイテム
    },

    // --- ダンジョン攻略実績（個人） ---
    dungeonRecords: {}, // { [dungeonId]: { clears, bestFloor, firstClearAt } }

    // --- 限界突破 ---
    limitBreak: {
      stage: 0,
      unlocked: [],
    },

    // --- 個人設定 ---
    settings: {
      saveNotice: false, // 保存時にアクションバーへ通知するか
    },

    // --- 記録 ---
    sessionLog: {
      joinCount: 0,
      firstJoinAt: 0,
      lastLoginAt: 0,
      lastLogoutAt: 0,
    },
  };
}

/**
 * 初回参加時の初期データを作る。
 * 種族：人間 / レベル1 / 無職 / 能力：一般人相当 / 金貨0
 */
export function createInitialPlayerData(uid, playerId, name) {
  const d = playerTemplate();
  const now = Date.now();
  d.uid = uid;
  d.lastPlayerId = playerId;
  d.name = name;
  d.createdAt = now;
  d.hiddenPotential.seed = randomSeed();
  d.sessionLog.firstJoinAt = now;
  return d;
}

/**
 * 読み込んだデータを現在の形に合わせる（欠損補完・型修復）。
 * @returns {{data: any, repairs: string[]}}
 */
export function conformPlayerData(raw) {
  const repairs = [];
  const data = conform(raw, playerTemplate(), "", repairs);
  return { data, repairs };
}

export { PLAYER_SCHEMA_VERSION };
