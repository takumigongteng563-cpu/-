// =============================================================
// 職業データの組み立て（第3弾）
// tree/*.js の作者データ（名前・役割・属性・武器・説明・スキル名・奥義名）と、
// catalog.js の規則から、484職業すべての完全な定義を作る。
// ・職業ごとの数値は「主軸と融合した系統の構成」と「役割」から決まるため、
//   同じ名前違い・単純な倍率違いにならない（自動検証で確認）
// ・個別の上書きは OVERRIDES に書く（転職条件・能力値補正など）
// =============================================================
import { JOB_LINES, LINE_BY_LETTER, ROLES, WEAPONS, ARMORS, ELEMENT_NAMES, TIER_RULES } from "./catalog.js";
import { WARRIOR_TREE } from "./tree/warrior.js";
import { MAGE_TREE } from "./tree/mage.js";
import { THIEF_TREE } from "./tree/thief.js";
import { PRIEST_TREE } from "./tree/priest.js";
import { jobRequirements, crossLineRequirements } from "./jobRequirements.js";

export const AUTHORED = Object.freeze({ ...WARRIOR_TREE, ...MAGE_TREE, ...THIEF_TREE, ...PRIEST_TREE });

/** 職業ごとの個別の上書き（キー = 職業コード） */
export const OVERRIDES = Object.freeze({});

const STAT_KEYS = ["str", "vit", "mag", "mnd", "agi", "dex", "luk", "int", "lif", "endr", "foc", "lead"];

/** 職業コード → 職業ID（例：WMT → warrior.mage.thief） */
export function codeToId(code) {
  return code
    .split("")
    .map((c) => LINE_BY_LETTER[c].id)
    .join(".");
}

/** 主軸以外の融合先（主軸の系統以外の3系統） */
export function fusionLettersFor(mainLetter) {
  return JOB_LINES.map((l) => l.letter).filter((l) => l !== mainLetter);
}

function parseAuthored(code) {
  const raw = AUTHORED[code];
  if (!raw) return null;
  const [name, role, elements, weapons, concept, skill, ultimate] = raw.split("|");
  return {
    name,
    role,
    elements: elements.split(",").filter(Boolean),
    weapons: weapons.split(",").filter(Boolean),
    concept,
    skill,
    ultimate,
  };
}

/** 系統の構成（主軸 2、融合した系統 1 ずつ）を正規化 */
function composition(code) {
  const w = { warrior: 0, mage: 0, thief: 0, priest: 0 };
  w[LINE_BY_LETTER[code[0]].id] += 2;
  for (const c of code.slice(1)) w[LINE_BY_LETTER[c].id] += 1;
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(w)) w[k] = Math.round((w[k] / total) * 1000) / 1000;
  return w;
}

/** 予算を重みに比例して整数に配分（最大剰余法） */
/**
 * @param {Record<string, number>} weights
 * @param {number} budget
 */
function allocate(weights, budget) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  /** @type {[string, number][]} */
  const raw = Object.entries(weights).map(([k, v]) => [k, (v / sum) * budget]);
  const out = {};
  let used = 0;
  for (const [k, v] of raw) {
    out[k] = Math.floor(v);
    used += out[k];
  }
  raw.sort((a, b) => (b[1] % 1) - (a[1] % 1) || (a[0] < b[0] ? -1 : 1));
  for (let i = 0; used < budget && i < raw.length; i++, used++) out[raw[i][0]]++;
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k];
  return out;
}

function statWeights(comp, role) {
  /** @type {Record<string, number>} */
  const w = {};
  for (const k of STAT_KEYS) w[k] = 0;
  for (const l of JOB_LINES) for (const [s, v] of Object.entries(l.stats)) w[s] += 0.7 * comp[l.id] * v;
  for (const [s, v] of Object.entries(ROLES[role].stats)) w[s] += 0.3 * v;
  for (const k of Object.keys(w)) if (w[k] < 0.01) delete w[k];
  return w;
}

/** 専用能力値の候補の点数 */
function specialScores(a, comp, role) {
  const has = (list) => a.weapons.some((x) => list.includes(x));
  const el = (x) => a.elements.includes(x);
  return {
    sword_aura: has(["sword", "greatsword", "katana", "dual"]) ? 3 : 0,
    battle_aura: (has(["fist", "mace", "axe", "greatsword", "spear", "lance"]) ? 2 : 0) + (role === "striker" ? 1 : 0),
    guard_power: (has(["shield"]) ? 2 : 0) + (role === "guardian" ? 3 : role === "warden" ? 2 : 0),
    mana_control: comp.mage * 4 + (role === "caster" ? 2 : 0),
    spirit_affinity: (a.name.includes("精霊") ? 5 : 0) + (el("plant") ? 1 : 0),
    summon_power: role === "summoner" ? 5 : 0,
    bow_control: has(["bow", "crossbow"]) ? 4 : 0,
    stealth: (role === "assassin" ? 4 : 0) + (has(["dagger", "shuriken"]) ? 2 : 0),
    illusion_control: (el("mind") ? 3 : 0) + (a.name.includes("幻") ? 3 : 0),
    faith: comp.priest * 4,
    healing_power: (role === "healer" ? 4 : role === "warden" ? 2 : 0) + (el("life") ? 2 : 0),
    holy_power: (el("holy") ? 3 : 0) + (el("light") ? 1 : 0),
  };
}

const PASSIVE_SUFFIX = {
  guardian: "守りの構え",
  striker: "闘法",
  duelist: "技法",
  marksman: "射法",
  caster: "術理",
  healer: "癒しの心得",
  buffer: "鼓舞の心得",
  summoner: "契約",
  assassin: "隠形",
  controller: "支配術",
  skirmisher: "機動術",
  warden: "守護の誓い",
};

const FUSION_TRIGGER = {
  warrior: "近接攻撃を当てたとき",
  mage: "魔法を使ったとき",
  thief: "回避・移動したとき",
  priest: "回復・支援をしたとき",
};

const FUSION_STRENGTH = {
  warrior: "前線で耐える力も持つ",
  mage: "属性攻撃を扱える",
  thief: "機動力が高い",
  priest: "自己回復・支援ができる",
};

const MISSING_WEAKNESS = {
  warrior: "接近戦で押し負けやすい",
  mage: "魔法攻撃・魔法防御が手薄",
  thief: "素早い敵に追いつけない",
  priest: "回復手段が乏しい",
};

const ACTION_NAME = { tap: "通常使用（小技）", jump: "ジャンプ中に使用（中技）", sprint: "ダッシュ中に使用（移動技）", charge: "しゃがみ溜め（大技）", ultimate: "長時間溜め（奥義）" };

function elementText(els) {
  return els.map((e) => ELEMENT_NAMES[e] ?? e).join("・");
}

/** 1職業の定義を作る */
export function buildJob(code) {
  const a = parseAuthored(code);
  if (!a) throw new Error(`職業 ${code} のデータがありません`);
  const tier = code.length;
  const rules = TIER_RULES[tier];
  const id = codeToId(code);
  const main = LINE_BY_LETTER[code[0]];
  const fusedLines = code.slice(1).split("").map((c) => LINE_BY_LETTER[c].id);
  const comp = composition(code);
  const role = ROLES[a.role];
  if (!role) throw new Error(`職業 ${code}：不明な役割 ${a.role}`);
  const children = tier < 5 ? fusionLettersFor(code[0]).map((l) => codeToId(code + l)) : [];

  // 能力値補正・成長率
  const sw = statWeights(comp, a.role);
  const flat = allocate(sw, rules.statBudget);
  const swSum = Object.values(sw).reduce((x, y) => x + y, 0);
  const growth = {};
  for (const [s, v] of Object.entries(sw)) {
    const g = Math.round(Math.min(0.3, (v / swSum) * 0.12 * tier) * 100) / 100;
    if (g >= 0.01) growth[s] = g;
  }

  // 専用能力値
  const scores = Object.entries(specialScores(a, comp, a.role))
    .filter(([, v]) => v > 0)
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
    .slice(0, rules.specialCount);
  const special = {};
  scores.forEach(([sid], i) => (special[sid] = Math.max(1, Math.round(rules.specialBase * (1 - i * 0.25)))));

  // 固有パッシブ（今すぐ効く派生能力値の補正 ＋ 後続で実装する仕組み）
  const scale = 0.5 + tier * 0.5;
  const pd = role.passive.derived;
  const now = { derived: { flat: {}, pct: {} } };
  for (const [k, v] of Object.entries(pd.flat || {})) now.derived.flat[k] = Math.round(v * scale * 10) / 10;
  for (const [k, v] of Object.entries(pd.pct || {})) now.derived.pct[k] = Math.round(v * scale * 10) / 10;
  const latest = fusedLines.length ? fusedLines[fusedLines.length - 1] : main.id;
  const passive = {
    id: `passive.${id}`,
    name: `${a.name}の${PASSIVE_SUFFIX[a.role]}`,
    now,
    implemented: "派生能力値の補正のみ（第3弾）",
    planned: `${role.mechanic}。さらに${FUSION_TRIGGER[latest]}、${elementText(a.elements)}の力が追加で発動する`,
  };

  // 専用スキル・専用奥義（第4弾で効果を実装。名称・効果案・ID・習得条件をここで決める）
  const skillAction = role.skillAction;
  const skills = [
    {
      id: `skill.${id}.signature`,
      name: a.skill,
      kind: "signature",
      action: skillAction,
      effect: `${elementText(a.elements)}の力を使う${ACTION_NAME[skillAction]}。${a.concept}`,
      learn: { jobLevel: 5 },
      inherit: { jobLevel: Math.ceil(rules.levelCap / 2), weapons: a.weapons },
      status: "planned",
    },
  ];
  const ultimate = {
    id: `skill.${id}.ultimate`,
    name: a.ultimate,
    kind: tier === 5 ? "ultimate" : "secret",
    action: "ultimate",
    effect: `${tier === 5 ? "第5次職業の奥義" : "秘技"}：${elementText(a.elements)}の力を極限まで高めて放つ（${role.name}の切り札）`,
    learn: { jobLevel: rules.levelCap },
    inherit: null, // 奥義・秘技はその職業でのみ使える
    status: "planned",
  };

  // 強み・弱点
  const strengths = [...role.strengths];
  for (const l of new Set(fusedLines)) if (l !== main.id) strengths.push(FUSION_STRENGTH[l]);
  const weaknesses = [...role.weaknesses];
  for (const l of JOB_LINES) if (comp[l.id] === 0 && weaknesses.length < 3) weaknesses.push(MISSING_WEAKNESS[l.id]);

  const fusedNames = fusedLines.map((l) => JOB_LINES.find((x) => x.id === l).name);
  const def = {
    id,
    code,
    category: "normal",
    tier,
    tierName: rules.name,
    line: main.id,
    lineName: main.name,
    parent: tier > 1 ? codeToId(code.slice(0, -1)) : null,
    children,
    fusedLines,
    fusionLine: tier > 1 ? latest : null,
    composition: comp,
    name: a.name,
    description: a.concept,
    fusionText: tier === 1 ? `${main.name}系統の基本職業` : `${main.name}を主軸に、${fusedNames.join("→")}の特徴を融合`,
    role: a.role,
    roleName: role.name,
    style: `${role.name}。${a.weapons.map((w) => WEAPONS[w]).join("・")}で${elementText(a.elements)}を扱う`,
    weapons: a.weapons,
    elements: a.elements,
    equipment: { weapons: a.weapons, armor: role.armor },
    stats: { flat },
    growth,
    special: { flat: special },
    passive,
    skills,
    ultimate,
    strengths,
    weaknesses,
    situations: role.situations,
    levelCap: rules.levelCap,
    requirements: jobRequirements(code),
    crossLineRequirements: crossLineRequirements(),
    hiddenRelations: [],
    defined: true,
    ...(OVERRIDES[code] || {}),
  };
  return def;
}

/** 484職業の職業コード（深さ優先） */
export function allJobCodes() {
  const out = [];
  const walk = (code) => {
    out.push(code);
    if (code.length < 5) for (const l of fusionLettersFor(code[0])) walk(code + l);
  };
  for (const l of JOB_LINES) walk(l.letter);
  return out;
}

export function buildAllJobs() {
  return allJobCodes().map(buildJob);
}

export { WEAPONS, ARMORS, ELEMENT_NAMES, ROLES, JOB_LINES };
