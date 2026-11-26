// ワールドデータの移行処理（playerMigrations.js と同じ書き方）
/** @type {Record<number, (data: any) => any>} */
export const worldMigrations = {
  0: (d) => (d && typeof d === "object" ? d : {}),

  // v1（第1弾・第2弾）→ v2（最終仕様 Ver.1.0）
  1: (d) => {
    if (!d || typeof d !== "object") return {};
    // ストーリー：全20章 → 全10章。旧値は legacyChapter に残し、新しい章は 1～10 に収める
    if (d.story && typeof d.story === "object") {
      const old = typeof d.story.chapter === "number" ? d.story.chapter : 0;
      d.story.legacyChapter = old;
      d.story.chapter = Math.min(10, Math.max(1, old));
    }
    // 唯一装備：旧形式 owners を registry に写す（owners はそのまま残す）
    if (d.uniqueItems && typeof d.uniqueItems === "object" && d.uniqueItems.owners) {
      d.uniqueItems.registry = d.uniqueItems.registry || {};
      for (const [id, o] of Object.entries(d.uniqueItems.owners)) {
        if (d.uniqueItems.registry[id] || !o) continue;
        d.uniqueItems.registry[id] = { state: "held", holderUid: o.ownerUid ?? null, instanceId: 1, growth: {}, history: [{ type: "migrate", at: Date.now() }] };
      }
    }
    return d;
  },
};
