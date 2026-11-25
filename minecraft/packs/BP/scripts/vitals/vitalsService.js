// =============================================================
// HP・MP・スタミナの共通処理
//
// HP  : バニラの体力を唯一の基準とし、RPGのHP = 最大HP × (体力 / 体力の最大値) で表す。
//       ダメージはバニラ側で1回だけ処理されるため二重に適用されず、死亡処理もバニラのまま。
// MP  : 消費は trySpend / consumeMp を使う。足りなければ何も消費せず false を返す。
// スタミナ：ダッシュで消費、休息で回復。0 になると「疲労」状態（制限はワールド設定）。
// =============================================================
import { emit } from "../core/eventBus.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class VitalsService {
  /** @param {import("../player/playerService.js").PlayerService} playerService */
  constructor(playerService) {
    this.playerService = playerService;
  }

  get(playerId) {
    const d = this.playerService.dataFor(playerId);
    return d ? d.vitals : undefined;
  }

  canUseMp(playerId, cost) {
    const v = this.get(playerId);
    return !!v && cost >= 0 && v.mp >= cost;
  }

  canUseStamina(playerId, cost) {
    const v = this.get(playerId);
    return !!v && cost >= 0 && v.stamina >= cost && !v.exhausted;
  }

  /**
   * MP とスタミナをまとめて消費する（スキル使用の共通処理）。
   * どちらかが足りなければ何も消費せず false。
   * @param {{mp?: number, stamina?: number}} cost
   */
  trySpend(playerId, cost) {
    const mp = Math.max(0, cost.mp || 0);
    const st = Math.max(0, cost.stamina || 0);
    let ok = false;
    this.playerService.update(playerId, (d) => {
      const v = d.vitals;
      if (v.mp < mp || v.stamina < st || (st > 0 && v.exhausted)) return;
      v.mp -= mp;
      v.stamina -= st;
      if (v.stamina <= 0) v.exhausted = true;
      ok = true;
    });
    if (ok) emit("vitalsChanged", { playerId });
    return ok;
  }

  consumeMp(playerId, cost) {
    return this.trySpend(playerId, { mp: cost });
  }

  consumeStamina(playerId, cost) {
    return this.trySpend(playerId, { stamina: cost });
  }

  /** MP・スタミナを回復する（最大値を超えない） */
  restore(playerId, { mp = 0, stamina = 0 } = {}) {
    const ok = this.playerService.update(playerId, (d) => {
      const v = d.vitals;
      v.mp = clamp(Math.round((v.mp + mp) * 100) / 100, 0, v.mpMax);
      v.stamina = clamp(Math.round((v.stamina + stamina) * 100) / 100, 0, v.staminaMax);
    });
    if (ok) emit("vitalsChanged", { playerId });
    return ok;
  }

  /**
   * バニラの体力から RPG の HP を更新する
   * @param {number} current バニラの現在体力
   * @param {number} max バニラの最大体力
   */
  syncHpFromHealth(playerId, current, max) {
    const d = this.playerService.dataFor(playerId);
    if (!d || !(max > 0)) return false;
    const hp = current <= 0 ? 0 : Math.max(1, Math.round((d.vitals.hpMax * current) / max));
    if (hp === d.vitals.hp) return false;
    this.playerService.update(playerId, (pd) => {
      pd.vitals.hp = clamp(hp, 0, pd.vitals.hpMax);
    });
    emit("vitalsChanged", { playerId });
    return true;
  }

  /**
   * スタミナの増減（定期処理から）。疲労状態の出入りも判定する。
   * @param {number} delta
   * @param {number} recoverRatio 疲労から回復する割合（最大値に対する）
   * @returns {{stamina: number, exhausted: boolean, changed: boolean}}
   */
  tickStamina(playerId, delta, recoverRatio = 0.25) {
    let out = { stamina: 0, exhausted: false, changed: false };
    this.playerService.update(playerId, (d) => {
      const v = d.vitals;
      const before = v.stamina;
      v.stamina = clamp(Math.round((v.stamina + delta) * 10) / 10, 0, v.staminaMax);
      if (v.stamina <= 0) v.exhausted = true;
      else if (v.exhausted && v.stamina >= v.staminaMax * recoverRatio) v.exhausted = false;
      out = { stamina: v.stamina, exhausted: !!v.exhausted, changed: before !== v.stamina };
    });
    if (out.changed) emit("vitalsChanged", { playerId });
    return out;
  }

  /** 死亡時：HP 0。リスポーン時：全回復（バニラの仕様と合わせる） */
  onDeath(playerId) {
    this.playerService.update(playerId, (d) => {
      d.vitals.hp = 0;
    });
  }

  onRespawn(playerId) {
    this.playerService.update(playerId, (d) => {
      const v = d.vitals;
      v.hp = v.hpMax;
      v.mp = v.mpMax;
      v.stamina = v.staminaMax;
      v.exhausted = false;
    });
    emit("vitalsChanged", { playerId });
  }

  /** 管理者テスト：値を直接設定（HP はバニラ側の反映が必要なので healRequest を立てる） */
  setValue(playerId, kind, value) {
    const ok = this.playerService.update(playerId, (d) => {
      const v = d.vitals;
      if (kind === "hp") {
        v.hp = clamp(Math.floor(value), 1, v.hpMax);
        v.hpSetRequest = v.hp;
      } else if (kind === "mp") v.mp = clamp(Math.floor(value), 0, v.mpMax);
      else if (kind === "stamina") {
        v.stamina = clamp(Math.floor(value), 0, v.staminaMax);
        v.exhausted = v.stamina <= 0;
      }
    });
    if (ok) emit("vitalsChanged", { playerId });
    return ok;
  }
}
