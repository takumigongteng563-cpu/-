// 才能・潜在能力の効果を文章にする
import { STAT_DEFS, DERIVED_DEFS } from "../content/stats.js";
import { ELEMENTS } from "../balance/stats.js";

const STAT_NAME = Object.fromEntries(STAT_DEFS.map((s) => [s.id, s.name]));
const DERIVED_NAME = Object.fromEntries(DERIVED_DEFS.map((s) => [s.id, s.name]));
const ELEM_NAME = Object.fromEntries(ELEMENTS.map((e) => [e.id, e.name]));
const sign = (v) => (v >= 0 ? `+${v}` : `${v}`);
const pct = (v) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;

/** @returns {string[]} */
export function describeEffects(def) {
  const out = [];
  const st = def.stats || {};
  const flat = Object.entries(st.flat || {}).map(([k, v]) => `${STAT_NAME[k] ?? k}${sign(v)}`);
  const p = Object.entries(st.pct || {}).map(([k, v]) => `${STAT_NAME[k] ?? k}${sign(v)}%`);
  if (flat.length || p.length) out.push(`能力値: ${[...flat, ...p].join(" ")}`);
  const dv = def.derived || {};
  const df = Object.entries(dv.flat || {}).map(([k, v]) => `${DERIVED_NAME[k] ?? k}${sign(v)}`);
  const dp = Object.entries(dv.pct || {}).map(([k, v]) => `${DERIVED_NAME[k] ?? k}${sign(v)}%`);
  if (df.length || dp.length) out.push(`派生: ${[...df, ...dp].join(" ")}`);
  const el = Object.entries(def.elements || {}).map(([k, v]) => `${ELEM_NAME[k] ?? k}${sign(v)}%`);
  if (el.length) out.push(`属性耐性: ${el.length === 8 && new Set(Object.values(def.elements)).size === 1 ? `全属性${sign(Object.values(def.elements)[0])}%` : el.join(" ")}`);
  const g = Object.entries(def.growth || {});
  if (g.length) {
    const vals = new Set(g.map(([, v]) => v));
    out.push(g.length === 8 && vals.size === 1 ? `成長率: 全能力${pct(g[0][1])}` : `成長率: ${g.map(([k, v]) => `${STAT_NAME[k] ?? k}${pct(v)}`).join(" ")}`);
  }
  const ja = Object.keys(def.jobAptitude || {});
  if (ja.length) out.push(`§7職業適性: ${ja.join(", ")}（第3弾で反映）§r`);
  const sa = Object.keys(def.skillAffinity || {});
  if (sa.length) out.push(`§7スキル習得: ${sa.join(", ")}（スキル実装後に反映）§r`);
  return out;
}
