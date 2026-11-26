// =============================================================
// 潜在能力の形成（最終仕様 Ver.1.0 第8章）
// 開始時点では潜在能力は未確定。行動の記録・職業・才能の系統から各潜在能力の
// 「形成スコア」を計算し、閾値を超えたものを形成する（本人には名前も条件も見せない）。
// 何度計算しても同じ結果になる純粋な計算（乱数なし）。
// =============================================================
import { potentials } from "../content/potentials.js";
import { POTENTIAL_FORMATION } from "../balance/talentRoll.js";
import { activeFamilies } from "./conditions.js";
import { jobs } from "../content/jobs.js";

/** 現在形成中・形成済みでない潜在能力ごとのスコア */
export function formationScores(data) {
  const fam = activeFamilies(data);
  const job = jobs.get(data.job.current);
  const line = job && job.line;
  /** @type {Record<string, number>} */
  const out = {};
  for (const def of potentials.all()) {
    const f = def.formation;
    if (!f) continue;
    let score = 0;
    for (const [key, w] of Object.entries(f.actions || {})) {
      const unit = POTENTIAL_FORMATION.units[key] || 100;
      score += ((data.actions[key] || 0) / unit) * w;
    }
    for (const [family, pts] of Object.entries(f.talentFamilies || {})) if (fam.has(family)) score += pts;
    if (line && f.jobLines && f.jobLines[line]) score += f.jobLines[line];
    out[def.id] = Math.round(score * 100) / 100;
  }
  return out;
}

/**
 * 条件を満たしていれば潜在能力を1つ形成する（mutator 内で使う）。
 * @returns {string|null} 形成した潜在能力ID
 */
export function tryFormPotential(data, now = Date.now()) {
  const hp = data.hiddenPotential;
  const formed = hp.entries.filter((e) => e && !e.legacy);
  if (formed.length >= POTENTIAL_FORMATION.maxFormed) return null;
  const scores = formationScores(data);
  hp.formation = { scores, updatedAt: now };
  const taken = new Set(formed.map((e) => e.id)); // 旧仕様（legacy）の記録は形成済みに数えない
  let best = null;
  for (const [id, sc] of Object.entries(scores)) {
    if (taken.has(id)) continue;
    if (!best || sc > best.sc || (sc === best.sc && id < best.id)) best = { id, sc };
  }
  const need = POTENTIAL_FORMATION.threshold * (formed.length + 1);
  if (!best || best.sc < need) return null;
  hp.entries.push({ id: best.id, awakened: false, awakenedAt: 0, formedAt: now, origin: "formed" });
  return best.id;
}
