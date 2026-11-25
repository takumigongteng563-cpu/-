// プレイヤー識別ID（アドオン独自）の生成。
// Script API の実行環境には crypto が無いため Math.random と時刻を組み合わせる。

/** @returns {string} 例: "p-lx3k9a2f-8f3a1c2d9e" */
export function generateUid(prefix = "p") {
  const time = Date.now().toString(36);
  let rand = "";
  for (let i = 0; i < 10; i++) rand += Math.floor(Math.random() * 36).toString(36);
  return `${prefix}-${time}-${rand}`;
}

/** 保存キーとして安全なIDかどうか */
export function isValidUid(uid) {
  return typeof uid === "string" && /^[a-z]-[0-9a-z]{4,16}-[0-9a-z]{6,16}$/.test(uid);
}

/** 32bit の乱数シード（隠された潜在能力などの将来の決定に使う） */
export function randomSeed() {
  return Math.floor(Math.random() * 0x7fffffff);
}
