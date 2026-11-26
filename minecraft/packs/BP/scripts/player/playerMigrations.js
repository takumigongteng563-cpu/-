// プレイヤーデータの移行処理。
// キー n の関数は「v(n) のデータを v(n+1) に変換」する。
// 項目の追加だけなら playerSchema.js の既定値で自動補完されるため、ここには
// 「既存の値の意味を変える処理」だけを書く。

import { LEGACY_EXTRA_INNATE_POLICY } from "../balance/talentRoll.js";

/** @type {Record<number, (data: any) => any>} */
export const playerMigrations = {
  0: (d) => (d && typeof d === "object" ? d : {}),

  // v1（第1弾）→ v2（第2弾：レベル・ステータス・才能）
  1: (d) => {
    // 第1弾では能力値が7種類。魔力(mag)を初期値で追加（他の値はそのまま引き継ぐ）
    if (d.stats && typeof d.stats === "object" && typeof d.stats.mag !== "number") d.stats.mag = 5;
    // 第1弾のプレイヤーは初期才能の抽選をしていないため、次回参加時に1回だけ抽選する
    if (d.talents && typeof d.talents === "object") {
      d.talents.rolled = false;
      // 第1弾の innate / acquired は常に空だが、万一値があれば有効な才能として引き継ぐ
      d.talents.active = [
        ...(Array.isArray(d.talents.innate) ? d.talents.innate : []).map((id) => ({ id, origin: "innate", since: 0, lineage: [] })),
        ...(Array.isArray(d.talents.acquired) ? d.talents.acquired : []).map((id) => ({ id, origin: "acquired", since: 0, lineage: [] })),
      ];
    }
    // 第1弾の MP 最大値（10）は暫定値だったため、次回の再計算で新しい最大値に合わせる
    if (d.vitals && typeof d.vitals === "object") d.vitals.mpFillOnRecalc = true;
    return d;
  },

  // v2（第2弾）→ v3（最終仕様 Ver.1.0）
  2: (d) => migrateV2toV3(d, LEGACY_EXTRA_INNATE_POLICY),
};

/**
 * v2 → v3 の移行（詳細は docs/データ移行仕様.md）
 *  1. 能力値：12種類へ。生命力・持久力・集中力・統率力を初期値で追加（既存8種の値はそのまま）
 *  2. 初期才能：全員1個へ。2個目以降の初期才能（進化後を含む）は無効化して talents.archived に記録
 *  3. 潜在能力：開始時抽選 → 行動による形成へ。未覚醒の旧潜在能力は legacy として無効化（記録は残す）。
 *     覚醒済みのものはそのまま有効（獲得済みの成長を失わせない）
 *  4. 熟練度：{ weapon, magic, skill } の形へ（旧データの値は weapon へ移す）
 * 削除はしない。旧データは必ずどこかに残す。
 */
export function migrateV2toV3(d, policy = "archive") {
  if (!d || typeof d !== "object") return {};
  if (d.stats && typeof d.stats === "object") {
    for (const k of ["lif", "endr", "foc", "lead"]) if (typeof d.stats[k] !== "number") d.stats[k] = 5;
  }
  const t = d.talents;
  if (t && typeof t === "object" && Array.isArray(t.innate) && t.innate.length > 1 && policy === "archive") {
    const keep = t.innate[0];
    const extra = t.innate.slice(1);
    t.archived = Array.isArray(t.archived) ? t.archived : [];
    const active = Array.isArray(t.active) ? t.active : [];
    const now = Date.now();
    t.active = active.filter((a) => {
      const root = a && Array.isArray(a.lineage) && a.lineage.length > 0 ? a.lineage[0] : a && a.id;
      const fromExtraInnate = a && a.origin === "innate" && extra.includes(root);
      if (fromExtraInnate) t.archived.push({ ...a, archivedAt: now, reason: "最終仕様：初期才能は1個" });
      return !fromExtraInnate;
    });
    t.innateLegacy = [...t.innate];
    t.innate = [keep];
  }
  const hp = d.hiddenPotential;
  if (hp && typeof hp === "object" && Array.isArray(hp.entries)) {
    for (const e of hp.entries) {
      if (!e || typeof e !== "object") continue;
      if (!e.awakened) e.legacy = true; // 旧仕様の抽選結果。形成方式では使わない
      e.origin = e.origin || "legacy_roll";
    }
  }
  if (d.proficiency && typeof d.proficiency === "object" && !("weapon" in d.proficiency)) {
    const old = d.proficiency;
    d.proficiency = { weapon: { ...old }, magic: {}, skill: {} };
  }
  return d;
}
