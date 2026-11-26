// =============================================================
// 能力値の計算（純粋な計算）
//
// 層ごとに別管理し、合計は保存せず毎回ここで計算する。
// 「前回の結果に補正を足す」ことはしないため、何度再計算しても補正は重複しない。
//
// 計算順序：
//   0. 素の値 = 基礎 + 成長 + 振り分け を、存在階級の能力値上限（statCap）までに制限
//   1. 固定値の合計 = 素の値 + 才能(潜在含む) + 職業 + 装備 + 一時効果（各固定値）
//   2. 割合補正の合計（全ての層の % を合計）を上下限 STAT_PERCENT_CAP に収める
//   3. 能力値 = floor(固定値の合計 × (1 + 割合/100)) を 0～STAT_HARD_CAP に収める
//   4. 派生能力値 = 計算式（能力値・レベル）
//   5. 派生能力値 += 固定値補正 → × (1 + 割合補正/100) → 計算式ごとの min/max に収める
// =============================================================
import { STAT_IDS } from "../content/stats.js";
import { talents } from "../content/talents/index.js";
import { potentials } from "../content/potentials.js";
import { jobModifiers } from "../job/jobBonus.js";
import {
  INITIAL_STATS,
  STAT_HARD_CAP,
  STAT_PERCENT_CAP,
  DERIVED_FORMULAS,
  ELEMENTS,
  ELEMENT_RESIST_CAP,
} from "../balance/stats.js";
import { GROWTH_BONUS_CAP } from "../balance/growth.js";
import { statCapForStage } from "../content/tiers.js";
import { specialStats, SPECIAL_STAT_CAPS } from "../content/specialStats.js";

/** 素の値（基礎＋成長＋振り分け。上限を掛ける前） */
export function naturalStat(data, s) {
  return num(data.stats[s] ?? INITIAL_STATS[s]) + num(data.statGrowth[s]) + num(data.statAllocated[s]);
}

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
    if (!e || !e.awakened || e.legacy) continue;
    const def = potentials.get(e.id);
    if (def) mods.push({ layer: "talent", id: def.id, name: def.name, def });
  }
  // 職業：現在の職業（職業レベル込み）と引き継ぎパッシブだけ（第3弾）
  mods.push(...jobModifiers(data));
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
  const statCap = statCapForStage(data.limitBreak.stage);
  /** @type {Record<string, number>} 上限で切り捨てられた量 */
  const cappedBy = {};
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
    const naturalRaw = l.base + l.growth + l.allocated;
    const natural = Math.min(naturalRaw, statCap);
    if (natural < naturalRaw) cappedBy[s] = naturalRaw - natural;
    const raw = natural + l.talent + l.job + l.equip + l.temp;
    layers[s] = l;
    pct[s] = p;
    primary[s] = clamp(Math.floor(raw * (1 + p / 100)), 0, STAT_HARD_CAP);
  }

  // 職業専用能力値（現在の職業・特殊な入手分・補正から計算。存在階級ごとの上限あり）
  /** @type {Record<string, number>} */
  const special = {};
  const sp = data.specialStats || {};
  const specialCap = SPECIAL_STAT_CAPS[Math.min(SPECIAL_STAT_CAPS.length - 1, data.limitBreak.stage || 0)];
  for (const def of specialStats.all()) {
    let v = num(sp[def.id] && sp[def.id].base);
    let p = 0;
    let touched = !!(sp[def.id] && sp[def.id].unlocked);
    for (const m of mods) {
      const x = m.def.special;
      if (!x) continue;
      if (x.flat && def.id in x.flat) touched = true;
      v += num(x.flat && x.flat[def.id]);
      p += num(x.pct && x.pct[def.id]);
    }
    if (!touched) continue;
    p = clamp(p, STAT_PERCENT_CAP.min, STAT_PERCENT_CAP.max);
    special[def.id] = clamp(Math.floor(v * (1 + p / 100)), 0, specialCap);
  }

  const level = Math.max(1, num(data.level));
  const derived = {};
  for (const [id, f] of Object.entries(DERIVED_FORMULAS)) {
    let v = f.base + f.perLevel * (level - 1);
    for (const [s, c] of Object.entries(f.coef)) v += c * (primary[s] - INITIAL_STATS[s]);
    let flat = 0;
    let p = 0;
    // 専用能力値から派生能力値への効果（例：治癒力 → 回復効果）
    for (const [sid, sv] of Object.entries(special)) flat += num(specialStats.get(sid)?.links?.[id]) * sv;
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

  return { primary, layers, pct, derived, elements, special, statCap, cappedBy, growth: growthMultipliers(mods), modifiers: mods };
}
