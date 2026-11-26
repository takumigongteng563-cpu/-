// =============================================================
// 使徒（第4弾）
// ・1柱につき使徒はワールドで1人まで（world.apostles[godId]）。1人のプレイヤーが契約できるのは1柱まで
// ・就任条件：信仰レベル（contract.faithLevel）＋ 神の承認（フラグ god:<id>:approval。神々の試練などで立てる）
// ・使徒専用スキル（data.apostle.skills）は通常スキルとは別に管理し、信仰レベルで進化する（印→御手→神威）
// ・交代：本人の自主的な解除 / 神による資格の剥奪 / 神が新しい使徒を選ぶ（新しい候補が承認を受けて受諾）
//   ※ 長期間ログインしていないことだけを理由に解除しない（この処理にはログイン時間の判定が一切ない）
// ・解除時（理由を問わず）：使徒専用スキル・進化分を削除、ホットバーとプリセットから外す、常時効果を止める、
//   称号を外す。通常スキル・職業能力・迷宮の一般報酬・信仰レベルは残す
// ・再契約時は「現在の信仰レベル」から新しく付与し、以前の使徒スキルの成長は復元しない
// ・整合性：ワールドの登録を先に書き換え、旧使徒のデータは不在でも updateOffline で消す。
//   失敗しても参加時の reconcile() でワールドの登録と照合して必ず消す
// =============================================================
import { gods } from "../content/gods.js";
import { skills } from "../content/skills.js";
import { emit } from "../core/eventBus.js";
import { stripApostleFromData, apostleSkillsFor } from "./apostleRules.js";

export class ApostleService {
  /**
   * @param {import("../player/playerService.js").PlayerService} playerService
   * @param {import("../world/worldService.js").WorldService} worldService
   */
  constructor(playerService, worldService) {
    this.playerService = playerService;
    this.worldService = worldService;
  }

  apostleOf(godId) {
    return this.worldService.world.apostles[godId] || null;
  }

  godOf(playerId) {
    const d = this.playerService.dataFor(playerId);
    return (d && d.apostle.god) || null;
  }

  /** 契約できるか */
  check(playerId, godId, opt = {}) {
    const g = gods.get(godId);
    const d = this.playerService.dataFor(playerId);
    if (!g || !d) return { ok: false, reason: "存在しない神" };
    if (d.apostle.god) return { ok: false, reason: d.apostle.god === godId ? "すでにこの神の使徒" : "すでに別の神の使徒（1人1柱まで）" };
    const cur = this.apostleOf(godId);
    if (cur && cur.uid !== d.uid && !opt.replace) return { ok: false, reason: `この神にはすでに使徒がいる（${cur.name}）` };
    if (opt.force) return { ok: true };
    const f = (d.faith[godId] && d.faith[godId].level) || 0;
    if (f < g.contract.faithLevel) return { ok: false, reason: `信仰レベル${g.contract.faithLevel}以上が必要（現在${f}）` };
    if (!d.flags[g.contract.approvalFlag]) return { ok: false, reason: "神の承認を得ていない（神々の試練などで得る）" };
    return { ok: true };
  }

  /**
   * 使徒契約
   * @param {{force?: boolean, replace?: boolean, reason?: string}} [opt] force = 管理者テスト（条件を無視。ただし1柱1人・1人1柱は守る）
   */
  contract(playerId, godId, opt = {}) {
    const c = this.check(playerId, godId, opt);
    if (!c.ok) return c;
    const s = this.playerService.getSession(playerId);
    const prev = this.apostleOf(godId);
    const now = Date.now();
    if (this.worldService.worldEntry.readOnly) return { ok: false, reason: "ワールドデータが読み取り専用" };
    // 1) ワールドの登録（旧使徒 → 新使徒）を1回の更新で書き換える
    this.worldService.updateWorld((w) => {
      w.apostles[godId] = { uid: s.uid, name: s.name, since: now };
    }, { important: true });
    // 2) 旧使徒のデータから使徒の力を消す（不在でも）
    if (prev && prev.uid !== s.uid) this.purgeUid(prev.uid, godId, opt.reason || "replaced");
    // 3) 新使徒に現在の信仰レベルから新しく付与
    this.playerService.update(playerId, (d) => {
      const f = (d.faith[godId] && d.faith[godId].level) || 0;
      d.apostle.god = godId;
      d.apostle.since = now;
      d.apostle.skills = {};
      for (const def of apostleSkillsFor(godId, f)) d.apostle.skills[def.id] = { level: 1, exp: 0, learnedAt: now, uses: 0, hits: 0 };
      const title = `apostle:${godId}`;
      if (!d.titles.owned.includes(title)) d.titles.owned.push(title);
      d.apostle.history.push({ god: godId, from: now, to: 0, reason: "contract" });
      if (d.apostle.history.length > 50) d.apostle.history.shift();
      delete d.flags[`god:${godId}:offer`];
    }, { important: true });
    emit("apostleContracted", { playerId, god: godId, replaced: prev && prev.uid !== s.uid ? prev.uid : null });
    return { ok: true, replaced: prev && prev.uid !== s.uid ? prev : null };
  }

  /**
   * 解除（理由を問わず同じ処理）
   * @param {string} godId
   * @param {"self"|"revoked"|"replaced"|"admin"} reason
   */
  release(godId, reason) {
    const cur = this.apostleOf(godId);
    if (!cur) return { ok: false, reason: "この神に使徒はいない" };
    this.worldService.updateWorld((w) => {
      delete w.apostles[godId];
    }, { important: true });
    const purged = this.purgeUid(cur.uid, godId, reason);
    emit("apostleReleased", { uid: cur.uid, god: godId, reason });
    return { ok: true, uid: cur.uid, purged };
  }

  /** 本人による自主的な解除 */
  resign(playerId) {
    const god = this.godOf(playerId);
    if (!god) return { ok: false, reason: "使徒ではない" };
    const cur = this.apostleOf(god);
    const s = this.playerService.getSession(playerId);
    if (!cur || cur.uid !== s.uid) {
      // 登録が無い（不整合）ときも本人の使徒の力は必ず消す
      this.purgeUid(s.uid, god, "self");
      return { ok: true };
    }
    return this.release(god, "self");
  }

  /** 神による資格の剥奪（神ごとの評価基準は content/gods.js。試練・行動の評価は後続で接続） */
  revoke(godId) {
    return this.release(godId, "revoked");
  }

  /**
   * 神が新しい使徒を選ぶ：候補の信仰レベルが現使徒より replaceRule.faithMargin 以上高く、承認を得ているとき
   * 「神からの打診」（フラグ god:<id>:offer）を出す。候補が受諾すると contract(..., {replace:true}) で交代する。
   * 判断にログイン時間は使わない。
   */
  considerSuccession(playerId, godId) {
    const g = gods.get(godId);
    const d = this.playerService.dataFor(playerId);
    const cur = this.apostleOf(godId);
    if (!g || !d || !cur || cur.uid === d.uid || d.apostle.god) return false;
    if (!d.flags[g.contract.approvalFlag]) return false;
    const mine = (d.faith[godId] && d.faith[godId].level) || 0;
    if (mine < g.contract.faithLevel) return false;
    const other = this.playerService.peekOffline(cur.uid);
    const theirs = (other && other.faith && other.faith[godId] && other.faith[godId].level) || 0;
    if (mine < theirs + g.replaceRule.faithMargin) return false;
    if (d.flags[`god:${godId}:offer`]) return false;
    this.playerService.update(playerId, (x) => (x.flags[`god:${godId}:offer`] = Date.now()), { important: true });
    emit("apostleOffer", { playerId, god: godId });
    return true;
  }

  /** 打診を受けている神 */
  offers(playerId) {
    const d = this.playerService.dataFor(playerId);
    if (!d) return [];
    return gods.all().filter((g) => d.flags[`god:${g.id}:offer`]).map((g) => g.id);
  }

  acceptOffer(playerId, godId) {
    const d = this.playerService.dataFor(playerId);
    if (!d || !d.flags[`god:${godId}:offer`]) return { ok: false, reason: "打診を受けていない" };
    return this.contract(playerId, godId, { replace: true, reason: "replaced" });
  }

  /** 信仰レベルが上がったとき：使徒スキルの進化（新しい段階を付与） */
  onFaithLevel(playerId, godId, level) {
    const d = this.playerService.dataFor(playerId);
    if (!d) return [];
    if (d.apostle.god !== godId) {
      this.considerSuccession(playerId, godId);
      return [];
    }
    const add = apostleSkillsFor(godId, level).filter((def) => !d.apostle.skills[def.id]);
    if (add.length === 0) return [];
    const now = Date.now();
    this.playerService.update(playerId, (x) => {
      for (const def of add) x.apostle.skills[def.id] = { level: 1, exp: 0, learnedAt: now, uses: 0, hits: 0 };
    }, { important: true });
    for (const def of add) emit("apostleSkillEvolved", { playerId, god: godId, id: def.id });
    return add.map((d) => d.id);
  }

  /** 指定の uid から使徒の力を消す（オンライン・不在どちらでも） */
  purgeUid(uid, godId, reason) {
    return this.playerService.updateOffline(uid, (d) => {
      if (d.apostle && d.apostle.god === godId) stripApostleFromData(d, reason);
    });
  }

  /**
   * 参加時の整合チェック：ワールドの登録と一致しない使徒契約は解除する
   * （不在中に交代・剥奪された場合や、保存に失敗した場合の修復）
   */
  reconcile(playerId) {
    const d = this.playerService.dataFor(playerId);
    if (!d || !d.apostle.god) {
      // 使徒でないのに使徒スキルが残っている・割り当てに残っている場合も消す
      if (d && (Object.keys(d.apostle.skills).length || hasApostleBinding(d))) this.playerService.update(playerId, (x) => stripApostleFromData(x, "repair"), { important: true });
      return false;
    }
    const reg = this.apostleOf(d.apostle.god);
    if (reg && reg.uid === d.uid) return false;
    this.playerService.update(playerId, (x) => stripApostleFromData(x, reg ? "replaced" : "revoked"), { important: true });
    return true;
  }
}

function hasApostleBinding(d) {
  return d.skillBindings.slots.some((s) => Object.values(s || {}).some((id) => id && skills.get(id)?.category === "apostle"));
}
