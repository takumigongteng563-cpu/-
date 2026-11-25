// 才能の覚醒・進化、潜在能力の覚醒の条件判定（純粋な計算）
import { talents } from "../content/talents/index.js";

/** プレイヤーが持っている有効な才能の系統一覧 */
export function activeFamilies(data) {
  const out = new Set();
  for (const a of data.talents.active) {
    const def = talents.get(a.id);
    if (def && def.family) out.add(def.family);
  }
  return out;
}

export function hasActiveTalent(data, id) {
  return data.talents.active.some((a) => a.id === id);
}

/**
 * @param {any} cond
 * @param {any} data プレイヤーデータ
 * @returns {boolean}
 */
export function checkCondition(cond, data) {
  if (!cond || typeof cond !== "object") return false;
  switch (cond.type) {
    case "counter":
      return (data.actions[cond.key] || 0) >= cond.min;
    case "level":
      return data.level >= cond.min;
    case "stage":
      return (data.limitBreak.stage || 0) >= cond.min;
    case "hasTalent":
      return hasActiveTalent(data, cond.id);
    case "familyCount": {
      const fam = activeFamilies(data);
      return cond.families.filter((f) => fam.has(f)).length >= cond.min;
    }
    case "flag":
      return !!data.flags[cond.id];
    case "any":
      return Array.isArray(cond.of) && cond.of.some((c) => checkCondition(c, data));
    default:
      return false; // 未知の条件は満たさない（誤って解放しない）
  }
}

/** 条件の配列をすべて満たすか。空配列は「条件なし」ではなく不成立とする（誤解放の防止） */
export function checkAll(conds, data) {
  return Array.isArray(conds) && conds.length > 0 && conds.every((c) => checkCondition(c, data));
}

/** 条件の説明文（管理者画面・ヒント用） */
export function describeCondition(cond) {
  switch (cond.type) {
    case "counter":
      return `行動「${cond.key}」${cond.min}以上`;
    case "level":
      return `レベル${cond.min}以上`;
    case "stage":
      return `限界突破${cond.min}回以上`;
    case "hasTalent":
      return `才能「${talents.get(cond.id)?.name ?? cond.id}」所持`;
    case "familyCount":
      return `指定系統の才能${cond.min}個以上`;
    case "flag":
      return `特別な出来事「${cond.id}」`;
    case "any":
      return `いずれか（${cond.of.map(describeCondition).join(" / ")}）`;
    default:
      return "不明な条件";
  }
}
