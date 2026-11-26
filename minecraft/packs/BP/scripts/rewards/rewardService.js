// =============================================================
// ステージ報酬（最終仕様 Ver.1.0 第15章）【基盤】
// ・プレイヤーごとに個別抽選（幸運・才能・周回数・難易度で確率が変わる。周回補正は上限あり）
// ・世界唯一の装備は uniqueItemService.issue に成功した1人にだけ渡る（複数人への同時配布を防ぐ）
// ・抽選結果を返すだけで、実際のアイテム付与・金貨加算は第8弾（ステージ攻略）・第10弾（経済）で行う
// =============================================================
import { rewardTables } from "../content/rewardTables.js";
import { stages } from "../content/stages.js";
import { rollRewards } from "./rewardRoller.js";
import { collectModifiers } from "../stats/statCalc.js";

export class RewardService {
  /**
   * @param {import("../player/playerService.js").PlayerService} playerService
   * @param {import("../stages/stageService.js").StageService} stageService
   * @param {import("../unique/uniqueItemService.js").UniqueItemService} uniqueItems
   * @param {() => number} [rng]
   */
  constructor(playerService, stageService, uniqueItems, rng = Math.random) {
    this.playerService = playerService;
    this.stageService = stageService;
    this.uniqueItems = uniqueItems;
    this.rng = rng;
  }

  /** 才能・潜在能力などの報酬ボーナス（rewardBonus）の合計 */
  rewardBonus(d) {
    let sum = 0;
    for (const m of collectModifiers(d)) sum += typeof m.def.rewardBonus === "number" ? m.def.rewardBonus : 0;
    return Math.max(0, Math.min(0.5, sum));
  }

  /**
   * 1人分の報酬を抽選する
   * @param {string} playerId
   * @param {string} tableId
   * @param {{stageId?: string, difficulty?: number}} [opt]
   */
  rollFor(playerId, tableId, opt = {}) {
    const table = rewardTables.get(tableId);
    const d = this.playerService.dataFor(playerId);
    const s = this.playerService.getSession(playerId);
    if (!table || !d || !s) return { ok: false, reason: "報酬表またはプレイヤーが見つからない" };
    const st = opt.stageId ? stages.get(opt.stageId) : undefined;
    const r = rollRewards(
      table,
      {
        luck: d.computed.primary.luk ?? 5,
        talentBonus: this.rewardBonus(d),
        clears: opt.stageId ? this.stageService.personalClears(playerId, opt.stageId) : 0,
        difficulty: opt.difficulty ?? (st ? st.difficulty : 1),
      },
      this.rng
    );
    // 世界唯一の装備：先に予約できた1人だけが受け取る
    r.items = r.items.filter((it) => !it.unique || this.uniqueItems.issue(it.id, s.uid, `stage:${opt.stageId ?? "?"}`).ok);
    return { ok: true, ...r };
  }
}
