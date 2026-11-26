// =============================================================
// スキルデータの自動検証（第4弾）
// devscripts/validate-skills.mjs・テスト・管理者コマンド（skillcheck）から使う。純粋な計算。
// 「名前だけ登録したデータ・未接続のスキル」を実装済みとして数えないため、効果の型が実在する処理に
// 接続されているか・習得方法があるかを確認する。
// =============================================================
import { skills, fusionRecipes, isConnected, EVOLVES_FROM, SKILL_GROUPS } from "./index.js";
import { SKILL_CATEGORIES, SKILL_RARITIES, EFFECT_TYPES, SHAPES, TARGETS, ELEMENT_NAMES, ACTION_NAMES } from "./catalog.js";
import { CONDITION_TYPES } from "../../talents/conditions.js";
import { jobs, normalJobs } from "../jobs.js";
import { talents } from "../talents/index.js";
import { potentials } from "../potentials.js";
import { gods, GOD_COUNT } from "../gods.js";
import { WEAPONS } from "../jobs/catalog.js";
import { uniqueItems } from "../uniqueItems.js";
import { STAT_IDS } from "../stats.js";

function walk(conds, fn) {
  for (const c of conds || []) {
    fn(c);
    if (c && Array.isArray(c.of)) walk(c.of, fn);
  }
}

const TALENT_FAMILIES = new Set(talents.all().map((t) => t.family).filter(Boolean));

function conditionProblems(owner, c) {
  const out = [];
  if (!c || !CONDITION_TYPES.includes(c.type)) return [`${owner}：未知の条件「${c && c.type}」`];
  if ((c.type === "skillLevel" || c.type === "skillLearned") && !skills.has(c.id)) out.push(`${owner}：スキル ${c.id} を参照`);
  if ((c.type === "jobLevel" || c.type === "heldJob") && !jobs.has(c.job)) out.push(`${owner}：職業 ${c.job} を参照`);
  if (c.type === "hasTalent" && !talents.has(c.id)) out.push(`${owner}：才能 ${c.id} を参照`);
  if (c.type === "familyCount" && c.families.some((f) => !TALENT_FAMILIES.has(f))) out.push(`${owner}：存在しない才能の系統 ${c.families.join(",")}`);
  if (c.type === "potential" && c.id && !potentials.has(c.id)) out.push(`${owner}：潜在能力 ${c.id} を参照`);
  if ((c.type === "faithLevel" || c.type === "apostleOf") && !gods.has(c.god)) out.push(`${owner}：神 ${c.god} を参照`);
  if (c.type === "jobWeapon" && !(c.weapon in WEAPONS)) out.push(`${owner}：武器 ${c.weapon}`);
  if (c.type === "mastery" && c.kind === "weapon" && !(c.key in WEAPONS)) out.push(`${owner}：武器熟練度 ${c.key}`);
  if (c.type === "uniqueItem" && !uniqueItems.has(c.id)) out.push(`${owner}：唯一装備 ${c.id} を参照`);
  return out;
}

/**
 * @returns {{ok: boolean, errors: string[], checks: {name: string, ok: boolean, detail: string}[], stats: any}}
 */
export function validateSkills() {
  const errors = [];
  const checks = [];
  const check = (name, problems, detail) => {
    checks.push({ name, ok: problems.length === 0, detail: problems.length ? problems.slice(0, 10).join(" / ") : detail });
    errors.push(...problems.map((p) => `${name}：${p}`));
  };
  const all = skills.all();
  const raw = Object.values(SKILL_GROUPS).flat();

  // 1. ID の重複（登録前のデータで確認。レジストリは重複を無視するため）
  const ids = raw.map((s) => s.id);
  check("スキルIDの重複なし", [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))], `${ids.length}件すべて固有`);
  // 2. 名前の重複（職業専用スキル・奥義は職業データの名前を維持するため、同名は「職業が異なる」場合のみ許容）
  const byName = new Map();
  for (const s of all) (byName.get(s.name) || byName.set(s.name, []).get(s.name)).push(s);
  const nameDup = [];
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    if (list.every((s) => s.jobs)) continue;
    nameDup.push(`${name}（${list.map((s) => s.id).join(",")}）`);
  }
  check("スキル名の重複なし（職業専用スキル同士は除く）", nameDup, "OK");

  // 3. 必須の項目
  const fieldProblems = [];
  for (const s of all) {
    if (!s.name || !s.description) fieldProblems.push(`${s.id}：名前・説明がない`);
    if (!(s.category in SKILL_CATEGORIES)) fieldProblems.push(`${s.id}：分類 ${s.category}`);
    if (!SKILL_RARITIES.some((r) => r.id === s.rarity)) fieldProblems.push(`${s.id}：レアリティ ${s.rarity}`);
    if (!(s.shape in SHAPES)) fieldProblems.push(`${s.id}：範囲の形 ${s.shape}`);
    if (!(s.target in TARGETS)) fieldProblems.push(`${s.id}：対象 ${s.target}`);
    for (const e of s.elements || []) if (!(e in ELEMENT_NAMES)) fieldProblems.push(`${s.id}：属性 ${e}`);
    for (const a of s.actions || []) if (!(a in ACTION_NAMES)) fieldProblems.push(`${s.id}：操作 ${a}`);
    if (!(s.maxLevel >= 1)) fieldProblems.push(`${s.id}：最大レベル`);
    if (s.power) for (const k of Object.keys(s.power.stats || {})) if (!STAT_IDS.includes(k)) fieldProblems.push(`${s.id}：威力式の能力値 ${k}`);
    if (s.weapons) for (const w of s.weapons) if (!(w in WEAPONS)) fieldProblems.push(`${s.id}：武器 ${w}`);
  }
  check("必須の項目（名前・説明・分類・レアリティ・範囲・対象・属性・操作・威力式）", fieldProblems, "OK");

  // 4. 実在する効果の処理に接続されている
  const connProblems = [];
  for (const s of all) {
    if (!isConnected(s)) connProblems.push(`${s.id}：効果が未接続`);
    else if (!(s.effect.type in EFFECT_TYPES)) connProblems.push(`${s.id}：効果の型 ${s.effect.type}`);
    if (s.effect && s.effect.type !== "passive" && (!s.actions || s.actions.length === 0)) connProblems.push(`${s.id}：割り当てられる操作がない`);
    if (s.effect && ["projectile", "area", "melee"].includes(s.effect.type) && !s.power) connProblems.push(`${s.id}：攻撃なのに威力式がない`);
    if (s.effect && s.effect.type === "heal" && !s.power) connProblems.push(`${s.id}：回復量の式がない`);
    if (s.effect && ["buff", "passive"].includes(s.effect.type) && !s.effect.buff && !s.effect.proficiencyBonus && !s.effect.statusEffects) connProblems.push(`${s.id}：強化の内容がない`);
    if (s.effect && s.effect.type === "summon" && !s.effect.entity) connProblems.push(`${s.id}：召喚するものがない`);
  }
  check("すべてのスキルが効果の処理に接続されている", connProblems, `${all.length}種すべて接続`);

  // 5. 習得方法がある（進化先・融合先・使徒専用は別の経路）
  const fusionOutputs = new Set(fusionRecipes.all().map((r) => r.output));
  const learnProblems = [];
  for (const s of all) {
    const viaEvo = !!EVOLVES_FROM[s.id];
    if (s.category === "apostle") continue;
    if ((!s.learn || s.learn.length === 0) && !viaEvo && !fusionOutputs.has(s.id)) learnProblems.push(`${s.id}：習得方法がない`);
    for (const l of s.learn || []) {
      if (l.method === "skillPoint" && !(l.sp > 0)) learnProblems.push(`${s.id}：必要スキルポイント`);
      if (!Array.isArray(l.conditions) || l.conditions.length === 0) learnProblems.push(`${s.id}：習得条件が空（${l.method}）`);
    }
  }
  check("習得方法がある（進化・融合・使徒契約を含む）", learnProblems, "OK");

  // 6. 条件の種類と参照先
  const condProblems = [];
  for (const s of all) {
    for (const l of s.learn || []) walk(l.conditions, (c) => condProblems.push(...conditionProblems(`${s.id} 習得`, c)));
    for (const e of s.evolvesTo || []) walk(e.conditions, (c) => condProblems.push(...conditionProblems(`${s.id} 進化`, c)));
  }
  for (const r of fusionRecipes.all()) walk(r.extra, (c) => condProblems.push(...conditionProblems(`${r.id}`, c)));
  check("条件の種類・参照先が正しい", condProblems, "OK");

  // 7. 進化先が存在し、分岐が単純な上位互換ではない
  const evoProblems = [];
  for (const s of all) {
    const tos = (s.evolvesTo || []).map((e) => e.to);
    for (const to of tos) if (!skills.has(to)) evoProblems.push(`${s.id} → ${to}（存在しない）`);
    if (new Set(tos).size !== tos.length) evoProblems.push(`${s.id}：進化先の重複`);
    for (const e of s.evolvesTo || []) if (!e.style) evoProblems.push(`${s.id} → ${e.to}：進化の方向性（style）がない`);
    if (tos.length >= 2) {
      const styles = (s.evolvesTo || []).map((e) => e.style);
      if (new Set(styles).size !== styles.length) evoProblems.push(`${s.id}：分岐の方向性が同じ`);
    }
    for (const to of tos) {
      const t = skills.get(to);
      if (!t) continue;
      const allBetter = t.power && s.power && t.power.base >= s.power.base && (t.cost.mp || 0) <= (s.cost.mp || 0) && (t.cost.stamina || 0) <= (s.cost.stamina || 0) && t.cooldown <= s.cooldown && (t.range || 0) >= (s.range || 0);
      if (allBetter && s.category !== "apostle") evoProblems.push(`${s.id} → ${to}：威力・消費・クールタイム・範囲がすべて上回る（単純な上位互換）`);
    }
  }
  check("進化先が存在し、単純な上位互換ではない", evoProblems, "OK");

  // 8. 融合レシピ
  const fusProblems = [];
  const pairs = new Set();
  for (const r of fusionRecipes.all()) {
    for (const i of r.inputs) if (!skills.has(i)) fusProblems.push(`${r.id}：融合元 ${i} がない`);
    if (!skills.has(r.output)) fusProblems.push(`${r.id}：融合先 ${r.output} がない`);
    if (r.inputs.length !== 2 || r.inputs[0] === r.inputs[1]) fusProblems.push(`${r.id}：融合元は異なる2つ`);
    const key = [...r.inputs].sort().join("+");
    if (pairs.has(key)) fusProblems.push(`${r.id}：同じ組み合わせが重複`);
    pairs.add(key);
  }
  check("融合レシピ（定義済みの組み合わせのみ・参照先が存在）", fusProblems, `${fusionRecipes.size}種`);

  // 9. 職業との接続（484職業すべてに専用スキルと奥義）
  const jobProblems = [];
  const normal = normalJobs();
  for (const j of normal) {
    const sig = skills.get(`skill.${j.id}.signature`);
    const ult = skills.get(`skill.${j.id}.ultimate`);
    if (!sig) jobProblems.push(`${j.id}：専用スキルがない`);
    if (!ult) jobProblems.push(`${j.id}：奥義・秘技がない`);
    if (sig && sig.name !== j.skills[0].name) jobProblems.push(`${j.id}：専用スキル名が職業データと違う`);
    if (ult && ult.name !== j.ultimate.name) jobProblems.push(`${j.id}：奥義名が職業データと違う`);
    if (j.tier === 5 && ult && ult.category !== "ultimate") jobProblems.push(`${j.id}：第5次職業の奥義の分類`);
  }
  for (const s of all) for (const jid of s.jobs || []) if (!jobs.has(jid)) jobProblems.push(`${s.id}：職業 ${jid} がない`);
  const ultimates = all.filter((s) => s.category === "ultimate" && s.jobs);
  check("全484職業に専用スキル・奥義（第5次324種は固有の奥義）", jobProblems, `専用スキル${normal.length}・奥義/秘技${normal.length}（第5次の奥義${ultimates.length}）`);

  // 10. 奥義の条件（長い溜め・大量消費・長いクールタイム）
  const ultProblems = [];
  for (const s of ultimates) {
    if (!(s.actions.length === 1 && s.actions[0] === "ultimate")) ultProblems.push(`${s.id}：長時間溜め専用でない`);
    if (s.cooldown < 600) ultProblems.push(`${s.id}：クールタイムが短い`);
    if ((s.cost.mp || 0) + (s.cost.stamina || 0) < 40) ultProblems.push(`${s.id}：消費が少ない`);
  }
  const ultNames = ultimates.map((s) => s.name);
  if (new Set(ultNames).size !== ultNames.length) ultProblems.push("第5次職業の奥義名に重複がある");
  check("奥義：長時間溜め・大量消費・長いクールタイム・名前が固有", ultProblems, "OK");

  // 11. 神々（24柱）と使徒スキル
  const godProblems = [];
  if (gods.size !== GOD_COUNT) godProblems.push(`${gods.size}柱`);
  const male = gods.all().filter((g) => g.gender === "male").length;
  if (male !== 13 || gods.size - male !== 11) godProblems.push(`男性${male}・女性${gods.size - male}（正：13・11）`);
  for (const g of gods.all()) {
    const ap = all.filter((s) => s.category === "apostle" && s.god === g.id);
    if (ap.length !== 5) godProblems.push(`${g.name}：使徒スキル${ap.length}種`);
    if (!skills.has(`blessing.${g.id}`)) godProblems.push(`${g.name}：加護スキルがない`);
  }
  check("神々24柱（男13・女11）・それぞれに加護1種と使徒スキル5段階（合計120）", godProblems, "OK");

  // 12. 才能・潜在能力との接続
  const talProblems = [];
  for (const s of all) {
    for (const f of s.talentFamilies || []) if (!TALENT_FAMILIES.has(f)) talProblems.push(`${s.id}：才能の系統 ${f}`);
    if (s.potential && !potentials.has(s.potential)) talProblems.push(`${s.id}：潜在能力 ${s.potential}`);
  }
  for (const p of potentials.all()) if (!all.some((s) => s.potential === p.id)) talProblems.push(`潜在能力 ${p.id} の専用スキルがない`);
  check("才能・潜在能力の専用スキルの参照先", talProblems, "OK");

  // 13. 21分類すべてにスキルがある
  const cat = {};
  for (const s of all) cat[s.category] = (cat[s.category] || 0) + 1;
  check("21分類すべてにスキルがある", Object.keys(SKILL_CATEGORIES).filter((c) => !cat[c]).map((c) => `${SKILL_CATEGORIES[c]}が0種`), "OK");

  const connected = all.filter(isConnected).length;
  check("実装済み（接続済み）のスキルが1,000種類以上", connected >= 1000 ? [] : [`${connected}種`], `${connected}種`);

  return { ok: errors.length === 0, errors, checks, stats: { total: all.length, connected, byCategory: cat, fusions: fusionRecipes.size, gods: gods.size } };
}
