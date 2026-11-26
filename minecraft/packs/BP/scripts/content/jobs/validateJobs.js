// =============================================================
// 職業データの自動検証（第3弾 第19章）
// devscripts/validate-jobs.mjs・テスト・管理者メニューから使う。純粋な計算。
// =============================================================
import { jobs, normalJobs } from "../jobs.js";
import { JOB_LINES, ROLES, WEAPONS, ELEMENT_NAMES, TIER_RULES } from "./catalog.js";
import { CONDITION_TYPES } from "../../talents/conditions.js";
import { specialStats } from "../specialStats.js";
import { STAT_IDS } from "../stats.js";

const EXPECTED = { 1: 4, 2: 12, 3: 36, 4: 108, 5: 324 };

function walkConditions(conds, fn) {
  for (const c of conds || []) {
    fn(c);
    if (c && Array.isArray(c.of)) walkConditions(c.of, fn);
  }
}

/**
 * @returns {{ok: boolean, errors: string[], checks: {name: string, ok: boolean, detail: string}[], summary: any}}
 */
export function validateJobs() {
  const errors = [];
  const checks = [];
  const check = (name, problems, detail) => {
    checks.push({ name, ok: problems.length === 0, detail: problems.length ? problems.slice(0, 10).join(" / ") : detail });
    errors.push(...problems.map((p) => `${name}：${p}`));
  };
  const normal = normalJobs();
  const all = jobs.all();
  const byId = new Map(all.map((j) => [j.id, j]));

  check("通常職業が484種類", normal.length === 484 ? [] : [`${normal.length}種類`], "484種類");
  const tierProblems = [];
  for (const [t, n] of Object.entries(EXPECTED)) {
    const c = normal.filter((j) => j.tier === Number(t)).length;
    if (c !== n) tierProblems.push(`第${t}次職業が${c}種類（正：${n}）`);
  }
  check("各段階の職業数", tierProblems, "4 / 12 / 36 / 108 / 324");

  const ids = all.map((j) => j.id);
  check("職業IDの重複なし", ids.filter((x, i) => ids.indexOf(x) !== i), `${ids.length}件すべて固有`);
  const names = all.map((j) => j.name);
  check("職業名の重複なし", [...new Set(names.filter((x, i) => names.indexOf(x) !== i))], `${names.length}件すべて固有`);

  const childProblems = [];
  for (const j of normal) {
    if (j.tier < 5 && j.children.length !== 3) childProblems.push(`${j.name}の進化先が${j.children.length}種類`);
    if (j.tier === 5 && j.children.length !== 0) childProblems.push(`${j.name}（第5次）に進化先がある`);
  }
  check("第1～4次職業は進化先3種類・第5次職業は進化先なし", childProblems, "OK");

  const refProblems = [];
  for (const j of all) {
    for (const c of j.children || []) if (j.category !== "none" && !byId.has(c)) refProblems.push(`${j.id} → ${c}`);
    if (j.parent && !byId.has(j.parent)) refProblems.push(`${j.id} の進化元 ${j.parent}`);
    if (j.parent && byId.has(j.parent) && !byId.get(j.parent).children.includes(j.id)) refProblems.push(`${j.id} が進化元の進化先にない`);
    walkConditions([...(j.requirements || []), ...(j.discover || [])], (c) => {
      if ((c.type === "jobLevel" || c.type === "heldJob") && !byId.has(c.job)) refProblems.push(`${j.id} の条件が ${c.job} を参照`);
    });
  }
  check("存在しない職業IDを参照していない", refProblems, "OK");

  const reached = new Set();
  const stack = JOB_LINES.map((l) => l.id);
  const seen = new Set();
  let cycle = false;
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) {
      cycle = true;
      continue;
    }
    seen.add(id);
    reached.add(id);
    for (const c of byId.get(id)?.children || []) stack.push(c);
  }
  check("初期4職業からすべての通常職業へ到達可能", normal.filter((j) => !reached.has(j.id)).map((j) => j.id), "484/484 到達可能");
  const cycleProblems = [];
  if (cycle) cycleProblems.push("同じ職業に二度到達する経路がある");
  for (const j of normal) {
    let cur = j;
    let steps = 0;
    while (cur && cur.parent && steps < 10) {
      cur = byId.get(cur.parent);
      steps++;
    }
    if (steps >= 10) cycleProblems.push(`${j.id} の進化元をたどると循環`);
    if (steps !== j.tier - 1) cycleProblems.push(`${j.id} の段階と進化元の数が一致しない`);
  }
  check("進化ツリーに循環がない", cycleProblems, "OK");

  const reqProblems = [];
  for (const j of all) {
    if (j.category !== "none" && (!Array.isArray(j.requirements) || j.requirements.length === 0)) reqProblems.push(`${j.id} に転職条件がない`);
    walkConditions([...(j.requirements || []), ...(j.discover || []), ...(j.crossLineRequirements || [])], (c) => {
      if (!c || !CONDITION_TYPES.includes(c.type)) reqProblems.push(`${j.id}：不明な条件 ${c && c.type}`);
      if (c && "min" in c && !(Number.isFinite(c.min) && c.min >= 0 && c.min <= 1e7)) reqProblems.push(`${j.id}：不正な値 ${c.type}=${c.min}`);
      if (c && c.type === "stat" && !c.stats.every((s) => STAT_IDS.includes(s))) reqProblems.push(`${j.id}：不明な能力値`);
    });
  }
  check("必要条件に不正な値がない", reqProblems, "OK");

  const statProblems = [];
  for (const j of all) {
    const flat = (j.stats && j.stats.flat) || {};
    const rule = TIER_RULES[j.tier] || TIER_RULES[3];
    let sum = 0;
    for (const [s, v] of Object.entries(flat)) {
      if (!STAT_IDS.includes(s)) statProblems.push(`${j.id}：不明な能力値 ${s}`);
      if (!Number.isInteger(v) || v < 0 || v > 60) statProblems.push(`${j.id}：${s}=${v}`);
      sum += v;
    }
    if (j.category === "normal" && sum !== rule.statBudget) statProblems.push(`${j.id}：補正合計 ${sum}（基準 ${rule.statBudget}）`);
    for (const [s, v] of Object.entries(j.growth || {})) if (!(v >= 0 && v <= 0.3)) statProblems.push(`${j.id}：成長率 ${s}=${v}`);
    for (const [s, v] of Object.entries((j.special && j.special.flat) || {})) {
      if (!specialStats.has(s)) statProblems.push(`${j.id}：不明な専用能力値 ${s}`);
      if (!(v >= 0 && v <= 40)) statProblems.push(`${j.id}：専用能力値 ${s}=${v}`);
    }
    const p = j.passive && j.passive.now && j.passive.now.derived;
    for (const [k, v] of Object.entries({ ...(p && p.flat), ...(p && p.pct) })) if (!(v >= 0 && v <= 20)) statProblems.push(`${j.id}：パッシブ ${k}=${v}`);
  }
  check("能力値補正に異常な数値がない", statProblems, "OK（段階ごとの補正合計は同じ＝特定ルートだけが強くならない）");

  const catProblems = [];
  for (const j of normal) {
    if (!ROLES[j.role]) catProblems.push(`${j.id}：役割 ${j.role}`);
    for (const w of j.weapons) if (!WEAPONS[w]) catProblems.push(`${j.id}：武器 ${w}`);
    for (const e of j.elements) if (!ELEMENT_NAMES[e]) catProblems.push(`${j.id}：属性 ${e}`);
  }
  check("役割・武器・属性のIDが正しい", catProblems, "OK");

  const fp = new Map();
  const dupFp = [];
  for (const j of normal) {
    const key = [j.role, [...j.elements].sort().join(","), [...j.weapons].sort().join(","), JSON.stringify(j.composition), j.line].join("|");
    if (fp.has(key)) dupFp.push(`${fp.get(key)} と ${j.name}`);
    fp.set(key, j.name);
  }
  check("能力・特徴がまったく同じ職業がない", dupFp, "484職業すべて異なる組み合わせ");

  const skillNames = [];
  const skillIds = [];
  for (const j of normal) {
    for (const s of [...(j.skills || []), j.ultimate]) {
      skillNames.push(s.name);
      skillIds.push(s.id);
    }
  }
  check("専用スキル・奥義のIDの重複なし", skillIds.filter((x, i) => skillIds.indexOf(x) !== i), `${skillIds.length}件`);
  check("専用スキル・奥義の名前の重複なし", [...new Set(skillNames.filter((x, i) => skillNames.indexOf(x) !== i))], `${skillNames.length}件すべて固有`);

  const balanceProblems = [];
  for (const l of JOB_LINES) {
    const t5 = normal.filter((j) => j.tier === 5 && j.line === l.id);
    for (const r of ["healer", "guardian"]) {
      if (!t5.some((j) => j.role === r || (r === "healer" && j.role === "warden"))) balanceProblems.push(`${l.name}系統の第5次職業に${ROLES[r].name}がいない`);
    }
  }
  check("回復職・盾役が最上位まで存在する", balanceProblems, "各系統の第5次職業に回復・守護の職業あり");

  return {
    ok: errors.length === 0,
    errors,
    checks,
    summary: { total: all.length, normal: normal.length, hidden: all.filter((j) => j.category === "hidden").length, skills: skillIds.length },
  };
}
