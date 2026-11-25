// プレイヤーデータの移行処理。
// キー n の関数は「v(n) のデータを v(n+1) に変換」する。
// 項目の追加だけなら playerSchema.js の既定値で自動補完されるため、ここには
// 「既存の値の意味を変える処理」だけを書く。

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
};
