// 動的プロパティへの保存前に、非ASCII文字を \uXXXX 形式に変換する。
// これにより (1) 文字数 = バイト数 となり上限計算が正確になる
// (2) チャンク分割でマルチバイト文字やサロゲートペアが壊れない。
// JSON.parse は \uXXXX をそのまま元の文字に戻すため、復元処理は不要。

/** @param {string} json */
export function toAsciiJson(json) {
  return json.replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}
