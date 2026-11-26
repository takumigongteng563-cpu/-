// 使徒の規則（純粋な処理）
import { skills } from "../content/skills.js";

/** その神の使徒専用スキルのうち、信仰レベルで得られるもの */
export function apostleSkillsFor(godId, faithLevel) {
  return skills.all().filter((s) => s.category === "apostle" && s.god === godId && faithLevel >= (s.apostleFaith || 0));
}

const isApostleId = (id) => !!id && skills.get(id)?.category === "apostle";

/**
 * プレイヤーデータから使徒の力を完全に消す（理由を問わず同じ処理）
 * 消すもの：使徒専用スキル（進化分を含む）・割り当て・プリセット内の割り当て・使徒による一時効果・使徒の称号
 * 残すもの：通常スキル・職業・迷宮の一般報酬・信仰レベル
 */
export function stripApostleFromData(d, reason) {
  const god = d.apostle.god;
  const now = Date.now();
  d.apostle.skills = {};
  if (god) {
    const h = d.apostle.history.length ? d.apostle.history[d.apostle.history.length - 1] : null;
    if (h && h.god === god && !h.to) {
      h.to = now;
      h.reason = reason;
    } else d.apostle.history.push({ god, from: d.apostle.since || 0, to: now, reason });
  }
  d.apostle.god = null;
  d.apostle.since = 0;
  for (const s of d.skillBindings.slots) for (const k of Object.keys(s)) if (isApostleId(s[k])) s[k] = null;
  for (const p of d.skills.presets || []) if (p && p.slots) for (const s of p.slots) for (const k of Object.keys(s || {})) if (isApostleId(s[k])) s[k] = null;
  d.buffs = (d.buffs || []).filter((b) => !(b && typeof b.source === "string" && b.source.startsWith("apostle")));
  // 使徒による習得記録が通常スキル側に紛れ込んでいても消す
  for (const id of Object.keys(d.skills.learned)) if (isApostleId(id)) delete d.skills.learned[id];
  d.titles.owned = d.titles.owned.filter((t) => !String(t).startsWith("apostle:"));
  if (d.titles.equipped && String(d.titles.equipped).startsWith("apostle:")) d.titles.equipped = null;
  return d;
}
