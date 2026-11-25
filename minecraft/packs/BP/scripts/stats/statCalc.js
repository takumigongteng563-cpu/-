// =============================================================
// 能力値の計算（純粋な計算）
//
// 層ごとに別管理し、合計は保存せず毎回ここで計算する。
// 「前回の結果に補正を足す」ことはしないため、何度再計算しても補正は重複しない。
//
// 計算順序：
//   1. 固定値の合計 = 基礎 + 成長 + 振り分け + 才能(潜在含む) + 職業 + 装備 + 一時効果（各固定値）
//   2. 割合補正の合計（全ての層の % を合計）を上下限 STAT_PERCENT_CAP に収める
//   3. 能力値 = floor(固定値の合計 × (1 + 割合/100)) を 0～STAT_HARD_CAP に収める
//   4. 派生能力値 = 計算式（能力値・レベル）
//   5. 派生能力値 += 固定値補正 → × (1 + 割合補正/100) → 計算式ごとの min/max に収める
// =============================================================
import { STAT_IDS } from "../content/stats.js";
import { talents } from "../content/talents/index.js";
import { potentials } from "../content/potentials.js";
import { jobs } from "../content/jobs.js";
import {
  INITIAL_STATS,
  STAT_HARD_CAP,
  STAT_PERCENT_CAP,
  DERIVED_FORMULAS,
  ELEMENTS,
  ELEMENT_RESIST_CAP,
} from "../balance/stats.js";
import { GROWTH_BONUS_CAP } from "../balance/growth.js";

export const LAYERS = Object.freeze([
  { id: "base", name: "基礎" },
  { id: "growth", name: "成長" },
  { id: "allocated", name: "振り分け" },
  { id: "talent", name: "才能" },
  { id: "job", name: "職業" },
  { id: "equip", name: "装備" },
  { id: "temp", name: "一時効果" },
]);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * プレイヤーに掛かっている補正の一覧を集める
 * @returns {{layer: string, id: string, name: string, def: any}[]}
 */
export function collectModifiers(data, nowTick = 0) {
  const mods = [];
  for (const a of data.talents.active) {
    const def = talents.get(a.id);
    if (def) mods.push({ layer: "talent", id: def.id, name: def.name, def });
  }
  for (const e of data.hiddenPotential.entries) {
    if (!e || !e.awakened) continue;
    const def = potentials.get(e.id);
    if (def) mods.push({ layer: "talent", id: def.id, name: def.name, def });
  }
  const job = jobs.get(data.job.current);
  if (job && (job.stats || job.derived || job.growth)) mods.push({ layer: "job", id: job.id, name: job.name, def: job });
  for (const [slot, item] of Object.entries(data.equipment.slots || {})) {
    if (item && typeof item === "object" && (item.stats || item.derived)) {
      mods.push({ layer: "equip", id: `${slot}:${item.id ?? "?"}`, name: item.name ?? slot, def: item });
    }
  }
  for (const b of data.buffs) {
    if (!b || (b.untilTick && b.untilTick <= nowTick)) continue;
    mods.push({ layer: "temp", id: b.id, name: b.name ?? b.id, def: b });
  }
  return mods;
}

/** 成長率倍率（能力値ごと）。補正の合計を上下限に収めてから 1 を足す */
export function growthMultipliers(mods) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const s of STAT_IDS) {
    let sum = 0;
    for (const m of mods) sum += num(m.def.growth && m.def.growth[s]);
    out[s] = 1 + clamp(sum, GROWTH_BONUS_CAP.min, GROWTH_BONUS_CAP.max);
  }
  return out;
}

/**
 * @param {any} data プレイヤーデータ
 * @param {number} [nowTick] 一時効果の期限判定に使う現在tick
 */
export function computeStats(data, nowTick = 0) {
  const mods = collectModifiers(data, nowTick);

  /** @type {Record<string, Record<string, number>>} 層ごとの固定値 */
  const layers = {};
  const pct = {};
  const primary = {};
  for (const s of STAT_IDS) {
    const l = {
      base: num(data.stats[s] ?? INITIAL_STATS[s]),
      growth: num(data.statGrowth[s]),
      allocated: num(data.statAllocated[s]),
      talent: 0,
      job: 0,
      equip: 0,
      temp: 0,
    };
    let p = 0;
    for (const m of mods) {
      const st = m.def.stats;
      if (!st) continue;
      l[m.layer] += num(st.flat && st.flat[s]);
      p += num(st.pct && st.pct[s]);
    }
    p = clamp(p, STAT_PERCENT_CAP.min, STAT_PERCENT_CAP.max);
    const raw = l.base + l.growth + l.allocated + l.talent + l.job + l.equip + l.temp;
    layers[s] = l;
    pct[s] = p;
    primary[s] = clamp(Math.floor(raw * (1 + p / 100)), 0, STAT_HARD_CAP);
  }

  const level = Math.max(1, num(data.level));
  const derived = {};
  for (const [id, f] of Object.entries(DERIVED_FORMULAS)) {
    let v = f.base + f.perLevel * (level - 1);
    for (const [s, c] of Object.entries(f.coef)) v += c * (primary[s] - INITIAL_STATS[s]);
    let flat = 0;
    let p = 0;
    for (const m of mods) {
      const d = m.def.derived;
      if (!d) continue;
      flat += num(d.flat && d.flat[id]);
      p += num(d.pct && d.pct[id]);
    }
    p = clamp(p, STAT_PERCENT_CAP.min, STAT_PERCENT_CAP.max);
    v = (v + flat) * (1 + p / 100);
    v = clamp(v, f.min, f.max);
    // 整数で扱う値は切り捨て、率・倍率は小数第2位まで
    derived[id] = /** @type {any} */ (f).int ? Math.floor(v) : Math.round(v * 100) / 100;
  }

  const elements = {};
  for (const e of ELEMENTS) {
    let v = 0;
    for (const m of mods) v += num(m.def.elements && m.def.elements[e.id]);
    elements[e.id] = clamp(v, ELEMENT_RESIST_CAP.min, ELEMENT_RESIST_CAP.max);
  }

  return { primary, layers, pct, derived, elements, growth: growthMultipliers(mods), modifiers: mods };
}
