// =============================================================
// 読み込んだデータを「既定値の形」に合わせて修復する。
// ・型が違う／欠けている項目は既定値で補う（修復内容を記録する）
// ・既定値に無い項目（将来の項目や拡張データ）は削除せずに残す
// =============================================================

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/**
 * @param {any} value     読み込んだ値
 * @param {any} template  既定値（形の見本）
 * @param {string} path
 * @param {string[]} repairs  修復内容の記録先
 */
export function conform(value, template, path = "", repairs = []) {
  if (isPlainObject(template)) {
    if (!isPlainObject(value)) {
      if (value !== undefined) repairs.push(`${path || "(root)"}: オブジェクトでないため初期化`);
      else repairs.push(`${path || "(root)"}: 欠損のため追加`);
      return clone(template);
    }
    const out = { ...value };
    for (const key of Object.keys(template)) {
      out[key] = conform(value[key], template[key], path ? `${path}.${key}` : key, repairs);
    }
    return out;
  }
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) {
      repairs.push(`${path}: ${value === undefined ? "欠損のため追加" : "配列でないため初期化"}`);
      return clone(template);
    }
    return value;
  }
  if (template === null) {
    // null は「未設定」を表す。値の型は自由（文字列ID・オブジェクトなど）
    return value === undefined ? null : value;
  }
  if (typeof template === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      repairs.push(`${path}: ${value === undefined ? "欠損のため追加" : "数値でないため既定値に修復"}`);
      return template;
    }
    return value;
  }
  if (typeof value !== typeof template) {
    repairs.push(`${path}: ${value === undefined ? "欠損のため追加" : "型不一致のため既定値に修復"}`);
    return template;
  }
  return value;
}
