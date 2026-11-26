// =============================================================
// 条件判定（才能の覚醒・進化、潜在能力、転職・職業融合、隠し職業の発見に共通）
// 純粋な計算。ワールドの情報が必要な条件は env（{ world }）を渡す。
// =============================================================
import { talents } from "../content/talents/index.js";
import { JOB_LINES } from "../content/jobs/catalog.js";

/** 使える条件の種類（自動検証で使う） */
export const CONDITION_TYPES = Object.freeze([
  "counter", // 行動回数 { key, min }
  "counterSum", // 複数の行動回数の合計 { keys, min }
  "level", // プレイヤーレベル { min }
  "stage", // 限界突破回数 { min }
  "hasTalent", // 才能を所持 { id }
  "familyCount", // 指定系統の才能の所持数 { families, min }
  "flag", // 特殊イベント・試練などのフラグ { id }
  "any", // いずれか { of }
  "all", // すべて { of }
  "stat", // 能力値の合計（計算後の値） { stats, min }
  "jobLevel", // 職業レベル { job, min }
  "heldJob", // その職業を経験済み { job }
  "linesHeld", // 経験した職業の系統の数（職業融合履歴） { lines, min }
  "bossKill", // ボス・強敵の討伐数 { min }
  "stageClear", // ステージ攻略実績 { stage?, count? }
  "item", // 特殊アイテム { id }（第3弾：転職の証など。アイテム実体は第6弾・第10弾）
  "trial", // 専用試練の達成 { id }（試練は第13弾）
  "title", // 称号 { id }（称号は第13弾）
  "potential", // 潜在能力の覚醒 { id? }
  "uniqueItem", // 世界唯一の装備を所持 { id }（env.world が必要）
  "proficiency", // 熟練度 { kind: weapon|magic|skill, key, min }（熟練度の上昇は第4弾）
]);

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

function heldJobs(data) {
  const set = new Set(data.job.held || []);
  set.add(data.job.current);
  return set;
}

/**
 * @param {any} cond
 * @param {any} data プレイヤーデータ
 * @param {{world?: any}} [env]
 * @returns {boolean}
 */
export function checkCondition(cond, data, env = {}) {
  if (!cond || typeof cond !== "object") return false;
  switch (cond.type) {
    case "counter":
      return (data.actions[cond.key] || 0) >= cond.min;
    case "counterSum":
      return (cond.keys || []).reduce((t, k) => t + (data.actions[k] || 0), 0) >= cond.min;
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
      return Array.isArray(cond.of) && cond.of.some((c) => checkCondition(c, data, env));
    case "all":
      return Array.isArray(cond.of) && cond.of.length > 0 && cond.of.every((c) => checkCondition(c, data, env));
    case "stat": {
      const p = (data.computed && data.computed.primary) || {};
      return (cond.stats || []).reduce((t, s) => t + (p[s] ?? data.stats[s] ?? 0), 0) >= cond.min;
    }
    case "jobLevel": {
      const l = data.job.levels[cond.job];
      return !!l && l.level >= cond.min;
    }
    case "heldJob":
      return heldJobs(data).has(cond.job);
    case "linesHeld": {
      const lines = new Set();
      for (const id of heldJobs(data)) {
        const root = id.split(".")[0];
        if (JOB_LINES.some((l) => l.id === root)) lines.add(root);
      }
      return (cond.lines || []).filter((l) => lines.has(l)).length >= cond.min;
    }
    case "bossKill":
      return (data.actions["kill.strong"] || 0) + (data.actions["boss.kill"] || 0) >= cond.min;
    case "stageClear": {
      const recs = data.stageRecords || {};
      if (cond.stage) return !!(recs[cond.stage] && recs[cond.stage].clears > 0);
      return Object.values(recs).filter((r) => r && r.clears > 0).length >= (cond.count || 1);
    }
    case "item":
      if (cond.id === "cross_line_token") return (data.job.tokens && data.job.tokens.crossLine > 0) || false;
      return !!data.flags[`item:${cond.id}`];
    case "trial":
      return !!data.flags[`trial:${cond.id}`];
    case "title":
      return Array.isArray(data.titles.owned) && data.titles.owned.includes(cond.id);
    case "potential":
      return data.hiddenPotential.entries.some((e) => e && e.awakened && !e.legacy && (!cond.id || e.id === cond.id));
    case "uniqueItem": {
      const reg = env.world && env.world.uniqueItems && env.world.uniqueItems.registry;
      const e = reg && reg[cond.id];
      return !!e && e.state === "held" && e.holderUid === data.uid;
    }
    case "proficiency": {
      const p = data.proficiency && data.proficiency[cond.kind] && data.proficiency[cond.kind][cond.key];
      return !!p && (p.level || 0) >= cond.min;
    }
    default:
      return false; // 未知の条件は満たさない（誤って解放しない）
  }
}

/** 条件の配列をすべて満たすか。空配列は「条件なし」ではなく不成立とする（誤解放の防止） */
export function checkAll(conds, data, env) {
  return Array.isArray(conds) && conds.length > 0 && conds.every((c) => checkCondition(c, data, env));
}

/** 条件の進み具合（表示用）。現在値と必要値 */
export function conditionProgress(cond, data) {
  switch (cond.type) {
    case "counter":
      return { now: data.actions[cond.key] || 0, need: cond.min };
    case "counterSum":
      return { now: (cond.keys || []).reduce((t, k) => t + (data.actions[k] || 0), 0), need: cond.min };
    case "level":
      return { now: data.level, need: cond.min };
    case "stat": {
      const p = (data.computed && data.computed.primary) || {};
      return { now: (cond.stats || []).reduce((t, s) => t + (p[s] ?? 0), 0), need: cond.min };
    }
    case "jobLevel":
      return { now: (data.job.levels[cond.job] || { level: 0 }).level, need: cond.min };
    case "bossKill":
      return { now: (data.actions["kill.strong"] || 0) + (data.actions["boss.kill"] || 0), need: cond.min };
    default:
      return null;
  }
}

const STAT_JA = { str: "筋力", vit: "耐久", mag: "魔力", mnd: "精神", agi: "敏捷", dex: "器用", luk: "幸運", int: "知力", lif: "生命力", endr: "持久力", foc: "集中力", lead: "統率力" };
const LINE_JA = { warrior: "戦士", mage: "魔法使い", thief: "盗賊", priest: "僧侶" };

/** 条件の説明文（メニュー・一覧表用） */
export function describeCondition(cond, jobName = (id) => id) {
  switch (cond.type) {
    case "counter":
      return `行動「${cond.key}」${cond.min}以上`;
    case "counterSum":
      return `行動（${cond.keys.join("+")}）合計${cond.min}以上`;
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
      return `いずれか（${cond.of.map((c) => describeCondition(c, jobName)).join(" / ")}）`;
    case "all":
      return `すべて（${cond.of.map((c) => describeCondition(c, jobName)).join(" / ")}）`;
    case "stat":
      return `${cond.stats.map((s) => STAT_JA[s] ?? s).join("+")} ${cond.min}以上`;
    case "jobLevel":
      return `「${jobName(cond.job)}」職業Lv${cond.min}以上`;
    case "heldJob":
      return `「${jobName(cond.job)}」を経験`;
    case "linesHeld":
      return `${cond.lines.map((l) => LINE_JA[l] ?? l).join("・")}のうち${cond.min}系統の職業を経験`;
    case "bossKill":
      return `ボス・強敵の討伐${cond.min}回以上`;
    case "stageClear":
      return cond.stage ? `${cond.stage}をクリア` : `ステージを${cond.count || 1}個クリア`;
    case "item":
      return `特殊アイテム「${cond.label ?? cond.id}」`;
    case "trial":
      return `試練「${cond.id}」を達成`;
    case "title":
      return `称号「${cond.id}」`;
    case "potential":
      return cond.id ? `潜在能力「${cond.id}」の覚醒` : "潜在能力の覚醒";
    case "uniqueItem":
      return `唯一装備「${cond.id}」を所持`;
    case "proficiency":
      return `熟練度（${cond.kind}:${cond.key}）${cond.min}以上`;
    default:
      return "不明な条件";
  }
}
