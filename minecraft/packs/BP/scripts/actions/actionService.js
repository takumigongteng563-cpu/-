// =============================================================
// 行動の記録（後天性才能・潜在能力・才能進化の条件に使う）
//
// 行動キーの一覧（第2弾時点）：
//   hit.melee.sword / axe / spear / mace / unarmed / other  … モンスターへの近接攻撃が命中した回数
//   hit.ranged.bow / crossbow / trident                       … モンスターへの射撃が命中した回数
//   kill.hostile / kill.night / kill.strong                   … モンスター討伐数（夜間・強敵）
//   damage.taken.mob     … モンスターから受けたダメージ量（バニラの体力単位）
//   survive.lowhp        … 体力2割以下まで追い込まれて生き延びた回数
//   move.distance        … 移動距離（ブロック）
//   【後続機能が加算】 magic.cast / heal.amount / protect.ally / dungeon.clear / boss.kill
//
// 不正な稼ぎを防ぐため、加算は「実際のモンスターへの命中・討伐」などの有効な行動のみ
// （判定は actions/combatHooks.js）。空振りや放置では増えない。
// =============================================================
import { emit } from "../core/eventBus.js";

/** 1つの行動キーの上限（桁あふれ防止） */
const COUNTER_MAX = 1e12;

export class ActionService {
  /**
   * @param {import("../player/playerService.js").PlayerService} playerService
   * @param {import("../talents/talentService.js").TalentService} talentService
   */
  constructor(playerService, talentService) {
    this.playerService = playerService;
    this.talentService = talentService;
    /** 才能の条件判定が必要なプレイヤー（まとめて判定して負荷を抑える） */
    this.pending = new Set();
    /** 行動が記録されたときに呼ばれる（職業経験値。app.js が設定） @type {((playerId: string, key: string, amount: number) => void)|null} */
    this.onRecorded = null;
    /** まとめて判定するときに呼ばれる（職業の解放判定。app.js が設定） @type {((playerId: string) => void)|null} */
    this.onFlush = null;
  }

  /**
   * 行動を記録する。
   * @param {string} playerId
   * @param {string} key
   * @param {number} [amount]
   */
  record(playerId, key, amount = 1) {
    if (typeof key !== "string" || !key || !(amount > 0) || !Number.isFinite(amount)) return false;
    const ok = this.playerService.update(playerId, (d) => {
      d.actions[key] = Math.min(COUNTER_MAX, (d.actions[key] || 0) + amount);
    });
    if (ok) {
      this.pending.add(playerId);
      if (this.onRecorded) this.onRecorded(playerId, key, amount);
    }
    return ok;
  }

  /** 特殊イベント・試練などのフラグを立てる（すぐに条件判定する） */
  setFlag(playerId, flagId) {
    const ok = this.playerService.update(
      playerId,
      (d) => {
        if (!d.flags[flagId]) d.flags[flagId] = Date.now();
      },
      { important: true }
    );
    if (ok) this.talentService.evaluate(playerId);
    return ok;
  }

  /** 保留中の条件判定を実行する（定期処理から呼ぶ） */
  flushPending() {
    if (this.pending.size === 0) return 0;
    const ids = [...this.pending];
    this.pending.clear();
    let n = 0;
    for (const id of ids) {
      if (!this.playerService.getSession(id)) continue;
      n += this.talentService.evaluate(id).length;
      if (this.onFlush) this.onFlush(id);
    }
    if (n > 0) emit("statsChanged", {});
    return n;
  }
}
