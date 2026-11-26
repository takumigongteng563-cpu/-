// =============================================================
// 世界唯一の装備の管理（最終仕様 Ver.1.0 第14章）【基盤】
// ・ワールドに1つだけ。state: "unissued"（未配布）| "held"（誰かが所持）| "lost"（紛失）
// ・配布・譲渡のたびに instanceId（通し番号）を更新し、アイテム側に記録した番号と照合して複製を検出する
// ・最初の入手者に固定しない（譲渡・紛失からの回復で所有者が変わる）
// ・装備が所有者を選ぶ：ownerConditions を満たさないプレイヤーには配布・譲渡できない
// アイテム実体の作成・照合（ItemStack の動的プロパティ）は第6弾で実装する。
// =============================================================
import { uniqueItems } from "../content/uniqueItems.js";
import { checkAll } from "../talents/conditions.js";

const HISTORY_MAX = 50;

export class UniqueItemService {
  /**
   * @param {import("../world/worldService.js").WorldService} worldService
   * @param {import("../player/playerService.js").PlayerService} playerService
   */
  constructor(worldService, playerService) {
    this.worldService = worldService;
    this.playerService = playerService;
  }

  entry(itemId) {
    return this.worldService.world.uniqueItems.registry[itemId];
  }

  state(itemId) {
    const e = this.entry(itemId);
    return e ? e.state : "unissued";
  }

  /** 装備が所有者として認めるか */
  accepts(itemId, playerData) {
    const def = uniqueItems.get(itemId);
    if (!def) return false;
    if (!Array.isArray(def.ownerConditions) || def.ownerConditions.length === 0) return true;
    return checkAll(def.ownerConditions, playerData);
  }

  _write(itemId, mut) {
    let res;
    this.worldService.updateWorld((w) => {
      const reg = w.uniqueItems.registry;
      const e = reg[itemId] || { state: "unissued", holderUid: null, instanceId: 0, growth: {}, history: [] };
      res = mut(e);
      if (res && res.ok) {
        reg[itemId] = e;
        if (e.history.length > HISTORY_MAX) e.history.splice(0, e.history.length - HISTORY_MAX);
      }
    }, { important: true });
    return res;
  }

  /** 初めて配布する（報酬など）。誰かが所持・紛失中なら失敗（同時配布の防止） */
  issue(itemId, uid, reason = "reward") {
    if (!uniqueItems.has(itemId)) return { ok: false, reason: "存在しない唯一装備" };
    const d = this.dataOfUid(uid);
    if (d && !this.accepts(itemId, d)) return { ok: false, reason: "装備に認められていない" };
    return this._write(itemId, (e) => {
      if (e.state !== "unissued") return { ok: false, reason: "すでに世界に存在する" };
      e.state = "held";
      e.holderUid = uid;
      e.instanceId += 1;
      e.history.push({ type: "issue", to: uid, at: Date.now(), reason });
      return { ok: true, instanceId: e.instanceId };
    });
  }

  /** 仲間へ譲渡する */
  transfer(itemId, fromUid, toUid) {
    const d = this.dataOfUid(toUid);
    if (d && !this.accepts(itemId, d)) return { ok: false, reason: "装備が新しい所有者を認めない" };
    return this._write(itemId, (e) => {
      if (e.state !== "held" || e.holderUid !== fromUid) return { ok: false, reason: "所持していない" };
      e.holderUid = toUid;
      e.instanceId += 1; // 旧所有者の手元に残った複製を無効化
      e.history.push({ type: "transfer", from: fromUid, to: toUid, at: Date.now() });
      return { ok: true, instanceId: e.instanceId };
    });
  }

  /** 紛失を記録する */
  markLost(itemId, reason = "lost") {
    return this._write(itemId, (e) => {
      if (e.state !== "held") return { ok: false, reason: "所持されていない" };
      e.history.push({ type: "lost", from: e.holderUid, at: Date.now(), reason });
      e.state = "lost";
      return { ok: true };
    });
  }

  /** 紛失した装備を特殊な方法で取り戻す（取り戻す人は元の所有者でなくてもよい） */
  recover(itemId, uid, method = "special") {
    const d = this.dataOfUid(uid);
    if (d && !this.accepts(itemId, d)) return { ok: false, reason: "装備に認められていない" };
    return this._write(itemId, (e) => {
      if (e.state !== "lost") return { ok: false, reason: "紛失していない" };
      e.state = "held";
      e.holderUid = uid;
      e.instanceId += 1;
      e.history.push({ type: "recover", to: uid, at: Date.now(), method });
      return { ok: true, instanceId: e.instanceId };
    });
  }

  /** アイテム実体に記録された番号が正しいか（複製の検出） */
  verify(itemId, uid, instanceId) {
    const e = this.entry(itemId);
    return !!e && e.state === "held" && e.holderUid === uid && e.instanceId === instanceId;
  }

  /** 使用による固有能力の成長（第6弾で効果を定義） */
  addGrowth(itemId, key, amount) {
    return this._write(itemId, (e) => {
      if (e.state !== "held") return { ok: false };
      e.growth[key] = (e.growth[key] || 0) + amount;
      return { ok: true };
    });
  }

  dataOfUid(uid) {
    const s = this.playerService.onlineSessions().find((x) => x.uid === uid);
    if (s) return this.playerService.dataFor(s.playerId);
    return this.playerService.peekOffline(uid);
  }
}
