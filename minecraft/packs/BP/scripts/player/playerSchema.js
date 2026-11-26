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
import { emptyBindings } from "../input/skillBindingService.js";
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
    exp: 0, // 現在のレベル内での経験値（次のレベルまでの進捗）
    // --- 第2弾：経験値の記録 ---
    totalExp: 0, // 累計獲得経験値
    expOverflow: 0, // レベル上限で保留中の余剰経験値（限界突破時に加算）
    rewardLog: {
      recent: [], // 最近受け取った報酬キー（二重付与防止）
      once: {}, // 一度きりの報酬 { [key]: 受け取った時刻 }
    },

    // --- 職業 ---
    job: {
      current: DEFAULT_JOB_ID,
      // 職業ごとの職業レベル。{ [jobId]: { level, exp } }
      levels: { [DEFAULT_JOB_ID]: { level: 1, exp: 0 } },
      unlocked: [DEFAULT_JOB_ID],
      history: [], // 転職履歴 [{ from, to, at, kind, by }]（過去の職業の習得記録として残す）
      // --- 第3弾 ---
      held: [], // 経験した職業（同じ職業に戻ると職業レベルを引き継ぐ）
      fusionHistory: [], // 職業融合の履歴 [{ job, fusedLine, at }]
      inheritedPassives: [], // 引き継いでいる固有パッシブ（職業ID）
      discoveredHidden: {}, // 発見した隠し職業 { [jobId]: 時刻 }
      tokens: { crossLine: 0 }, // 特殊アイテム「転職の証」（別系統への転職に使う）
      expFrac: 0, // 職業経験値の端数
    },
    // --- 最終仕様：職業系統の専用能力値（基盤） { [id]: { base, unlocked, unlockedAt } } ---
    specialStats: {},

    // --- HP・MP・スタミナ ---
    // hp はバニラの体力の割合から算出（第2弾）。最大値は派生能力値から再計算される
    vitals: {
      hp: INITIAL_VITALS.hp,
      hpMax: INITIAL_VITALS.hp,
      mp: INITIAL_VITALS.mp,
      mpMax: INITIAL_VITALS.mp,
      stamina: INITIAL_VITALS.stamina,
      staminaMax: INITIAL_VITALS.stamina,
    },

    // --- 能力値（第2弾で層ごとに分離。合計値はここに保存せず毎回計算する） ---
    stats: initialBaseStats(), // 基礎値（第1弾からの項目）
    statGrowth: {}, // 成長率によるレベルアップ時の上昇分 { [statId]: 整数 }
    statGrowthFrac: {}, // 成長の端数（1未満の貯まり）
    statAllocated: {}, // 自由振り分けで確定した分
    unspentStatPoints: 0,
    statPointsEarned: 0, // これまでに得た能力ポイントの合計
    respecTokens: 0, // 再振り分けの権利（将来の特殊アイテム・試練用）
    buffs: [], // 一時的な効果 [{ id, source, stats, derived, untilTick }]（同じ id は1つだけ）
    // 計算結果の保存（他システム・不在時の参照用。いつでも再計算できる）
    computed: {
      primary: {},
      derived: {},
      elements: {},
      at: 0,
    },

    // --- 才能 ---
    talents: {
      innate: [], // 先天的才能のID一覧（初回抽選の結果。進化しても記録として残す）
      acquired: [], // 後天的才能のID一覧（獲得した記録）
      // --- 第2弾 ---
      rolled: false, // 初期才能を抽選済みか（true になったら二度と抽選しない）
      rolledAt: 0,
      active: [], // 現在有効な才能 [{ id, origin: "innate"|"acquired"|"admin", since, lineage: [進化前のID...] }]
      history: [], // 獲得・進化の履歴 [{ type, id, from, at }]
      // --- 最終仕様 ---
      archived: [], // 旧仕様で得た2個目以降の初期才能（無効化して記録として保存。削除はしない）
    },
    // 隠された潜在能力。本人にも内容は見えない。seed は将来の抽選用
    hiddenPotential: {
      seed: 0,
      revealed: [], // 開花済みの潜在能力ID
      entries: [], // 形成済みの潜在能力（未公開） [{ id, awakened, awakenedAt, formedAt, origin, legacy? }]
      // --- 最終仕様：行動による形成 ---
      formation: { scores: {}, updatedAt: 0 }, // 形成スコア（本人には非公開）
    },
    // --- 第2弾：行動の記録（後天性才能・潜在能力の条件に使う） ---
    actions: {}, // { [行動キー]: 回数・量 }
    flags: {}, // 特殊イベント・試練などのフラグ { [flagId]: 時刻 }

    // --- スキル・熟練度 ---
    skills: {
      learned: {}, // { [skillId]: { level, exp, learnedAt } }
      equipped: [], // セット中のスキルID
    },
    // 熟練度（最終仕様：武器・魔法・スキル） { [id]: { level, exp } }
    proficiency: {
      weapon: {},
      magic: {},
      skill: {},
    },
    // ホットバー9枠 × 5操作の技の割り当て（最終仕様 第11章）
    skillBindings: {
      slots: emptyBindings(),
    },
    // 個人のステージ攻略記録（周回数＝報酬の周回補正に使う） { [stageId]: { clears, firstClearAt, bestTimeSec } }
    stageRecords: {},

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
      stage: 0, // 限界突破回数 = 存在階級の段階（0 = 一般級）
      unlocked: [],
      history: [], // [{ from, to, at, by }]
    },

    // --- 個人設定 ---
    settings: {
      saveNotice: false, // 保存時にアクションバーへ通知するか
      hud: true, // HUD（アクションバーのステータス表示）
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
