// =============================================================
// 富里王国の復興（最終仕様 Ver.1.0 第4章）【データ管理の基盤】
// ・ステージの初回クリアで住民が移住 → 建物の建設予約 → 施設の解放
// ・同じステージを何度クリアしても、住民・建物・施設は重複しない（appliedStages・ID単位で管理）
// ・建物の実際の配置（構造物の設置）は第15弾。buildQueue に予約され、
//   setBuilder() で登録した処理が少しずつ配置する（処理の分散）。未登録の間は予約のまま。
// =============================================================
import { stages } from "../content/stages.js";
import { residents, buildings, facilities } from "../content/kingdom.js";
import { emit } from "../core/eventBus.js";

export class KingdomService {
  /** @param {import("../world/worldService.js").WorldService} worldService */
  constructor(worldService) {
    this.worldService = worldService;
    /** @type {((building: any, entry: any) => boolean)|null} 建物を1つ配置する処理（第15弾） */
    this.builder = null;
  }

  get state() {
    return this.worldService.world.kingdom;
  }

  /**
   * ステージ初回クリアの復興処理。何度呼んでも結果は同じ。
   * @returns {{applied: boolean, residents: string[], buildings: string[], facilities: string[], phase?: string}}
   */
  applyStageClear(stageId) {
    const st = stages.get(stageId);
    const out = { applied: false, residents: [], buildings: [], facilities: [] };
    if (!st) return out;
    this.worldService.updateWorld(
      (w) => {
        const k = w.kingdom;
        if (k.appliedStages[stageId]) return; // 既に反映済み（周回による重複を防ぐ）
        const now = Date.now();
        k.appliedStages[stageId] = now;
        out.applied = true;
        for (const rid of st.residents || []) {
          if (!residents.has(rid) || k.residents[rid]) continue;
          k.residents[rid] = { arrivedAt: now, fromStage: stageId };
          out.residents.push(rid);
          for (const bid of residents.get(rid).buildings || []) this._queueBuilding(k, bid, now, out);
        }
        for (const bid of st.buildings || []) this._queueBuilding(k, bid, now, out);
        if (st.kingdomPhaseAfter && k.phase !== st.kingdomPhaseAfter) {
          k.phase = st.kingdomPhaseAfter;
          k.phaseChangedAt = now;
          out.phase = k.phase;
        }
      },
      { important: true }
    );
    if (out.applied) emit("kingdomChanged", { stageId, ...out });
    return out;
  }

  _queueBuilding(k, bid, now, out) {
    if (!buildings.has(bid) || k.buildings[bid]) return;
    k.buildings[bid] = { state: "queued", queuedAt: now, builtAt: 0 };
    k.buildQueue.push(bid);
    out.buildings.push(bid);
    const fac = buildings.get(bid).facility;
    if (fac && facilities.has(fac) && !k.facilities[fac]) {
      k.facilities[fac] = { unlockedAt: now, by: bid };
      out.facilities.push(fac);
    }
  }

  /** 建物を配置する処理を登録する（第15弾） */
  setBuilder(fn) {
    this.builder = typeof fn === "function" ? fn : null;
  }

  /**
   * 予約された建物を最大 budget 件だけ配置する（定期処理から呼ぶ。大規模建築の負荷分散）
   * @returns {number} 配置した数
   */
  processBuildQueue(budget = 1) {
    if (!this.builder) return 0;
    let n = 0;
    while (n < budget && this.state.buildQueue.length > 0) {
      const bid = this.state.buildQueue[0];
      const def = buildings.get(bid);
      const ok = def ? this.builder(def, this.state.buildings[bid]) : true;
      if (!ok) break; // 配置できなかった（周辺が未読込など）→ 次回に再試行
      this.worldService.updateWorld(
        (w) => {
          w.kingdom.buildQueue.shift();
          if (w.kingdom.buildings[bid]) {
            w.kingdom.buildings[bid].state = "built";
            w.kingdom.buildings[bid].builtAt = Date.now();
          }
        },
        { important: true }
      );
      n++;
    }
    return n;
  }
}
