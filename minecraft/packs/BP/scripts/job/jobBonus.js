// =============================================================
// 職業による補正の計算（純粋な計算）
// ・能力値補正・成長率・専用能力値・固有パッシブは「現在の職業」だけから計算する
//   （過去の職業の補正を保存データに足し込まないため、転職を繰り返しても重複しない）
// ・職業レベルが上がるほど補正が大きくなる（Lv1 で基本値、上限で JOB_LEVEL_BONUS_AT_MAX 倍）
// ・引き継ぎパッシブ：職業レベルを上限まで上げた過去の職業の固有パッシブを、枠の数だけ有効にする
//   （同じパッシブは1つだけ。現在の職業のパッシブとも重複しない）
// =============================================================
import { jobs } from "../content/jobs.js";
import { TIER_RULES } from "../content/jobs/catalog.js";
import { JOB_EXP_CURVE, JOB_LEVEL_BONUS_AT_MAX, INHERIT_SLOTS } from "../balance/jobs.js";

/** 職業レベル L → L+1 の必要職業経験値 */
export function jobExpToNext(level, tier) {
  const mult = (TIER_RULES[tier] || TIER_RULES[1]).expMultiplier;
  return Math.max(1, Math.round(JOB_EXP_CURVE.base * Math.pow(Math.max(1, level), JOB_EXP_CURVE.p) * mult));
}

export function jobLevelOf(data, jobId) {
  const l = data.job.levels[jobId];
  return l ? l.level : 0;
}

/** 職業レベルに応じた倍率 */
export function levelScale(def, level) {
  const cap = def.levelCap || 1;
  if (cap <= 1) return 1;
  const t = Math.max(0, Math.min(1, (Math.max(1, level) - 1) / (cap - 1)));
  return 1 + (JOB_LEVEL_BONUS_AT_MAX - 1) * t;
}

/** 職業の補正（職業レベル込み）を修正子の定義にする */
export function jobModifierDef(def, level) {
  const k = levelScale(def, level);
  const flat = {};
  for (const [s, v] of Object.entries((def.stats && def.stats.flat) || {})) flat[s] = Math.floor(v * k);
  const special = {};
  for (const [s, v] of Object.entries((def.special && def.special.flat) || {})) special[s] = Math.floor(v * k);
  return {
    stats: { flat },
    growth: def.growth || {},
    special: { flat: special },
    derived: def.passive ? def.passive.now.derived : undefined,
    expBonus: def.expBonus,
  };
}

export function inheritSlots(data) {
  const cur = jobs.get(data.job.current);
  return INHERIT_SLOTS[cur ? cur.tier : 0] ?? 0;
}

/** 引き継ぎ可能な職業（経験済み・職業レベル上限・パッシブあり・現在の職業以外） */
export function inheritableJobs(data) {
  return (data.job.held || [])
    .filter((id) => id !== data.job.current)
    .map((id) => jobs.get(id))
    .filter((d) => d && d.passive && jobLevelOf(data, d.id) >= d.levelCap);
}

/**
 * 職業の修正子一覧（stats/statCalc.js の collectModifiers から使う）
 * @returns {{layer: string, id: string, name: string, def: any}[]}
 */
export function jobModifiers(data) {
  const out = [];
  const cur = jobs.get(data.job.current);
  if (cur && cur.category !== "none") {
    out.push({ layer: "job", id: cur.id, name: cur.name, def: jobModifierDef(cur, jobLevelOf(data, cur.id)) });
  }
  const used = new Set(cur && cur.passive ? [cur.passive.id] : []);
  const allowed = new Set(inheritableJobs(data).map((d) => d.id));
  const slots = inheritSlots(data);
  for (const id of data.job.inheritedPassives || []) {
    if (out.length - (cur && cur.category !== "none" ? 1 : 0) >= slots) break;
    const d = jobs.get(id);
    if (!d || !d.passive || !allowed.has(id) || used.has(d.passive.id)) continue;
    used.add(d.passive.id);
    out.push({ layer: "job", id: `inherit:${id}`, name: `引き継ぎ：${d.passive.name}`, def: { derived: d.passive.now.derived } });
  }
  return out;
}
