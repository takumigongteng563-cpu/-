// =============================================================
// 100固定ステージの進行管理（最終仕様 Ver.1.0 第3章）【管理基盤】
// ・メインステージは順番に解放（初回クリアで次のステージを解放）
// ・クリア記録：ワールド（初回クリア日時・回数・最短時間）と個人（周回数）
// ・章の進行はステージの進行から決まる（10ステージ＝1章）
// ・初回クリア時に富里王国の復興処理（kingdomService）を呼ぶ
// テレポート・マップ配置・敵配置・攻略判定は第8弾で実装し、この recordClear を呼ぶ。
// =============================================================
import { stages, stageIdOf, FIRST_STAGE_ID } from "../content/stages.js";
import { chapterOfStage, CHAPTER_COUNT, MAIN_STAGES, TOTAL_STAGES } from "../content/story.js";
import { emit } from "../core/eventBus.js";

export class StageService {
  /**
   * @param {import("../world/worldService.js").WorldService} worldService
   * @param {import("../player/playerService.js").PlayerService} playerService
   * @param {import("../kingdom/kingdomService.js").KingdomService} kingdomService
   */
  constructor(worldService, playerService, kingdomService) {
    this.worldService = worldService;
    this.playerService = playerService;
    this.kingdomService = kingdomService;
  }

  isUnlocked(stageId) {
    return !!this.worldService.world.stages.unlocked[stageId];
  }

  isCleared(stageId) {
    const r = this.worldService.world.stages.records[stageId];
    return !!(r && r.firstClearAt);
  }

  /** 挑戦できるか（解放済み、かつクリア済みなら再挑戦可能なステージ） */
  canEnter(stageId) {
    const st = stages.get(stageId);
    if (!st || !this.isUnlocked(stageId)) return false;
    if (this.isCleared(stageId) && !st.repeatable) return false;
    return true;
  }

  /** 進行状況の要約 */
  summary() {
    const w = this.worldService.world;
    const cleared = Object.values(w.stages.records).filter((r) => r && r.firstClearAt).length;
    const unlocked = Object.keys(w.stages.unlocked).length;
    return { cleared, unlocked, chapter: w.story.chapter, total: stages.size };
  }

  /**
   * ステージのクリアを記録する。
   * @param {string} stageId
   * @param {string[]} participantIds 参加プレイヤーの player.id（オンラインの人のみ記録）
   * @param {{timeSec?: number}} [opt]
   */
  recordClear(stageId, participantIds, opt = {}) {
    const st = stages.get(stageId);
    if (!st) return { ok: false, reason: "存在しないステージ" };
    if (!this.isUnlocked(stageId)) return { ok: false, reason: "未解放のステージ" };
    const uids = participantIds.map((id) => this.playerService.getSession(id)).filter(Boolean).map((s) => s.uid);
    let first = false;
    let unlockedNext = null;
    const now = Date.now();
    this.worldService.updateWorld(
      (w) => {
        const r = w.stages.records[stageId] || { firstClearAt: 0, firstClearBy: [], clears: 0, bestTimeSec: 0 };
        if (!r.firstClearAt) {
          first = true;
          r.firstClearAt = now;
          r.firstClearBy = uids;
        }
        r.clears++;
        if (opt.timeSec > 0 && (!r.bestTimeSec || opt.timeSec < r.bestTimeSec)) r.bestTimeSec = Math.floor(opt.timeSec);
        w.stages.records[stageId] = r;
        if (first) {
          const next = stageIdOf(st.number + 1);
          if (st.number < TOTAL_STAGES && !w.stages.unlocked[next]) {
            w.stages.unlocked[next] = now;
            unlockedNext = next;
          }
          const ch = Math.min(CHAPTER_COUNT, chapterOfStage(Math.min(MAIN_STAGES, st.number + 1)));
          if (ch > w.story.chapter) w.story.chapter = ch;
          if (st.unlocksLabyrinth && !w.labyrinths.unlocked) {
            w.labyrinths.unlocked = true;
            w.labyrinths.unlockedAt = now;
          }
          if (st.number % 10 === 0 && !w.story.cleared.includes(st.chapter)) w.story.cleared.push(st.chapter);
          if (st.number === MAIN_STAGES) {
            w.postgame.unlocked = true;
            w.postgame.finalBossDefeatedAt = now;
          }
        }
      },
      { important: true }
    );
    for (const id of participantIds) {
      this.playerService.update(id, (d) => {
        const pr = d.stageRecords[stageId] || { clears: 0, firstClearAt: 0, bestTimeSec: 0 };
        pr.clears++;
        if (!pr.firstClearAt) pr.firstClearAt = now;
        if (opt.timeSec > 0 && (!pr.bestTimeSec || opt.timeSec < pr.bestTimeSec)) pr.bestTimeSec = Math.floor(opt.timeSec);
        d.stageRecords[stageId] = pr;
      }, { important: true });
    }
    const kingdom = first ? this.kingdomService.applyStageClear(stageId) : null;
    emit("stageCleared", { stageId, first, unlockedNext, participants: participantIds });
    return { ok: true, first, unlockedNext, kingdom };
  }

  /** 個人の周回数（報酬の周回補正に使う） */
  personalClears(playerId, stageId) {
    const d = this.playerService.dataFor(playerId);
    const r = d && d.stageRecords[stageId];
    return r ? r.clears : 0;
  }
}

export { FIRST_STAGE_ID };
