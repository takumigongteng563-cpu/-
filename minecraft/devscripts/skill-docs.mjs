// スキル・神々の資料を自動生成し、スキルデータを自動検証する（第4弾）。問題があれば失敗する。
// 出力：docs/skills/{自動検証結果,スキル一覧,進化ツリー,融合一覧,職業別スキル一覧,奥義一覧,神々のデータ}.md
import fs from "node:fs";
console.warn = () => {};
const { validateSkills } = await import("../packs/BP/scripts/content/skills/validateSkills.js");
const { skills, fusionRecipes } = await import("../packs/BP/scripts/content/skills.js");
const { SKILL_CATEGORIES, SKILL_RARITIES, ACTION_NAMES, ELEMENT_NAMES } = await import("../packs/BP/scripts/content/skills/catalog.js");
const { normalJobs } = await import("../packs/BP/scripts/content/jobs.js");
const { gods } = await import("../packs/BP/scripts/content/gods.js");
const { ADDON_VERSION } = await import("../packs/BP/scripts/config.js");

const D = "docs/skills";
const esc = (s) => String(s ?? "").replace(/\|/g, "／");
const rar = Object.fromEntries(SKILL_RARITIES.map((r) => [r.id, r.name]));
const head = (t) => [`# ${t}（v${ADDON_VERSION}）`, "", "`npm run docs:skills` で自動生成（手で編集しない）。", ""];
const cost = (s) => [s.cost.mp ? `MP${s.cost.mp}` : "", s.cost.stamina ? `ST${s.cost.stamina}` : ""].filter(Boolean).join(" ") || "-";
const row = (s) => `| ${s.id} | ${esc(s.name)} | ${SKILL_CATEGORIES[s.category]} | ${(s.elements || []).map((e) => ELEMENT_NAMES[e]).join("・")} | ${rar[s.rarity]} | ${s.effect.type} | ${cost(s)} | ${(s.cooldown / 20).toFixed(1)}s | ${(s.actions || []).join(",") || "パッシブ"} | ${esc(s.description)} |`;
const TH = ["| ID | 名前 | 分類 | 属性 | レア | 効果 | 消費 | CT | 操作 | 説明 |", "|---|---|---|---|---|---|---|---|---|---|"];

const r = validateSkills();
fs.writeFileSync(`${D}/自動検証結果.md`, [...head("スキルデータの自動検証結果"), `**結果：${r.ok ? "合格" : "不合格"}**（${r.checks.filter((c) => c.ok).length}/${r.checks.length}項目）　全${r.stats.total}種・効果に接続済み ${r.stats.connected}種・融合 ${r.stats.fusions}種・神 ${r.stats.gods}柱`, "", "| 結果 | 検証項目 | 詳細 |", "|---|---|---|", ...r.checks.map((c) => `| ${c.ok ? "✅" : "❌"} | ${c.name} | ${esc(c.detail)} |`), "", "## 分類別の数", "", "| 分類 | 数 |", "|---|---:|", ...Object.entries(r.stats.byCategory).map(([k, v]) => `| ${SKILL_CATEGORIES[k]} | ${v} |`), ""].join("\n"));

const nonJob = skills.all().filter((s) => !s.jobs);
const out = [...head("スキル一覧（職業専用以外）"), "職業専用スキル・奥義は「職業別スキル一覧」。", ""];
for (const c of Object.keys(SKILL_CATEGORIES)) {
  const l = nonJob.filter((s) => s.category === c);
  if (l.length) out.push(`## ${SKILL_CATEGORIES[c]}（${l.length}）`, "", ...TH, ...l.map(row), "");
}
fs.writeFileSync(`${D}/スキル一覧.md`, out.join("\n"));

const evo = [...head("進化ツリー"), "分岐は1つだけ選べる。元のスキルは残る。", ""];
for (const s of skills.all()) for (const e of s.evolvesTo || []) evo.push(`- ${s.name}（${s.id}） → **${skills.get(e.to).name}**（${e.style}）`);
fs.writeFileSync(`${D}/進化ツリー.md`, evo.join("\n") + "\n");

fs.writeFileSync(`${D}/融合一覧.md`, [...head("スキル融合一覧"), "定義済みの組み合わせだけ融合できる。融合元は消えない。", "", "| 融合先 | 融合元 | 必要Lv | 追加条件 |", "|---|---|---:|---|", ...fusionRecipes.all().map((f) => `| ${skills.get(f.output).name} | ${f.inputs.map((i) => skills.get(i).name).join(" ＋ ")} | ${f.minLevel} | ${f.extra ? "才能（回復・意志・生命の系統）" : "-"} |`), ""].join("\n"));

const job = [...head("職業別スキル一覧"), "| 職業 | 段階 | 役割 | 専用スキル（操作・効果） | 奥義／秘技 |", "|---|---:|---|---|---|"];
for (const j of normalJobs()) {
  const a = skills.get(`skill.${j.id}.signature`);
  const u = skills.get(`skill.${j.id}.ultimate`);
  job.push(`| ${j.name}（${j.id}） | ${j.tier} | ${j.roleName} | ${a.name}（${a.actions.join("/")}・${a.effect.type}） | ${u.name}（${u.category === "ultimate" ? "奥義" : "秘技"}） |`);
}
fs.writeFileSync(`${D}/職業別スキル一覧.md`, job.join("\n") + "\n");

const ult = skills.all().filter((s) => s.category === "ultimate");
fs.writeFileSync(`${D}/奥義一覧.md`, [...head(`第5次職業の奥義一覧（${ult.length}種）`), "長時間溜め専用・大量消費・クールタイム60秒・レベル50以上。", "", ...TH, ...ult.map(row), ""].join("\n"));

const g = [...head("神々のデータ"), "名前・英語表記・司る力・性別は確定。信仰の上がり方・使徒スキルの効果は【暫定】。", "", "| 神 | 英語 | 司る力 | 性別 | 信仰が上がる行い（暫定） | 加護 | 使徒スキル |", "|---|---|---|---|---|---|---|"];
for (const x of gods.all()) {
  const ap = skills.all().filter((s) => s.category === "apostle" && s.god === x.id);
  g.push(`| ${x.name} | ${x.en} | ${x.domain} | ${x.gender === "male" ? "男" : "女"} | ${[...x.faith.elements.map((e) => `${ELEMENT_NAMES[e]}属性スキル`), ...x.faith.actions].join("・")} | ${skills.get(`blessing.${x.id}`).name} | ${ap.map((s) => `${s.name}(信仰${s.apostleFaith})`).join(" → ")} |`);
}
fs.writeFileSync(`${D}/神々のデータ.md`, g.join("\n") + "\n");

if (!r.ok) {
  console.error("スキルデータの検証エラー:\n - " + r.errors.join("\n - "));
  process.exit(1);
}
console.log(`スキルデータ検証OK（${r.checks.length}項目・${r.stats.total}種）`);
