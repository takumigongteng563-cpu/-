// 職業の一覧資料（第3弾 納品物）を docs/jobs/ に自動生成する。手で編集しないこと。
import fs from "node:fs";
console.warn = () => {};
const { jobs, normalJobs, hiddenJobs } = await import("../packs/BP/scripts/content/jobs.js");
const { JOB_LINES, ROLES, WEAPONS, ARMORS, ELEMENT_NAMES, TIER_RULES } = await import("../packs/BP/scripts/content/jobs/catalog.js");
const { specialStats } = await import("../packs/BP/scripts/content/specialStats.js");
const { STAT_DEFS, DERIVED_DEFS } = await import("../packs/BP/scripts/content/stats.js");
const { describeCondition } = await import("../packs/BP/scripts/talents/conditions.js");
const { REQUIREMENT_TIERS } = await import("../packs/BP/scripts/content/jobs/jobRequirements.js");
const { ADDON_VERSION } = await import("../packs/BP/scripts/config.js");

const N = normalJobs();
const SN = Object.fromEntries(STAT_DEFS.map((s) => [s.id, s.name]));
const DN = Object.fromEntries(DERIVED_DEFS.map((s) => [s.id, s.name]));
const jn = (id) => jobs.get(id)?.name ?? id;
const el = (a) => a.map((e) => ELEMENT_NAMES[e] ?? e).join("・");
const wp = (a) => a.map((w) => WEAPONS[w] ?? w).join("・");
const st = (o) => Object.entries(o || {}).map(([k, v]) => `${SN[k] ?? k}+${v}`).join(" ");
const gr = (o) => Object.entries(o || {}).map(([k, v]) => `${SN[k] ?? k}+${Math.round(v * 100)}%`).join(" ");
const sp = (o) => Object.entries(o || {}).map(([k, v]) => `${specialStats.get(k)?.name ?? k} ${v}`).join(" ");
const pv = (p) => [...Object.entries(p.flat || {}).map(([k, v]) => `${DN[k] ?? k}+${v}`), ...Object.entries(p.pct || {}).map(([k, v]) => `${DN[k] ?? k}+${v}%`)].join(" ");
const head = (t, note) => [`# ${t}（v${ADDON_VERSION}）`, "", `\`node devscripts/job-docs.mjs\` で自動生成（定義：\`packs/BP/scripts/content/jobs/\`）。${note ?? ""}`, ""];
const write = (name, rows) => fs.writeFileSync(`docs/jobs/${name}`, rows.join("\n") + "\n");

// 1. 全484職業の名称一覧
{
  const rows = head("全484職業の名称一覧", "職業ID はツリー上の位置（主軸の系統 → 融合した系統）で決まる。");
  for (let t = 1; t <= 5; t++) {
    const list = N.filter((j) => j.tier === t);
    rows.push(`## ${TIER_RULES[t].name}（${list.length}種類）`, "");
    for (const l of JOB_LINES) {
      const ll = list.filter((j) => j.line === l.id);
      rows.push(`- **${l.name}系統（${ll.length}）**：${ll.map((j) => j.name).join("、")}`);
    }
    rows.push("");
  }
  rows.push("## 隠し職業（484に含めない・検証用）", "", ...hiddenJobs().map((h) => `- ${h.name}（\`${h.id}\`）`), "");
  rows.push("## その他", "", "- 無職（`unemployed`・484に含めない）", "");
  write("職業一覧.md", rows);
}

// 2. 融合ツリー
{
  const rows = head("全484職業の融合ツリー", "「＋系統」は、その職業になるときに融合した系統。同じ組み合わせでも主軸が違えば別の職業になる（例：戦士＋魔法使い＝魔剣士、魔法使い＋戦士＝戦魔導士）。");
  rows.push("```");
  const walk = (id, depth) => {
    const j = jobs.get(id);
    const fl = j.fusionLine ? `＋${JOB_LINES.find((l) => l.id === j.fusionLine).name}` : "";
    rows.push(`${"    ".repeat(depth)}${depth ? "└ " : ""}${j.name}${fl ? ` (${fl})` : ""}  [${j.roleName}]`);
    for (const c of j.children) walk(c, depth + 1);
  };
  for (const l of JOB_LINES) walk(l.id, 0);
  rows.push("```");
  write("融合ツリー.md", rows);
}

// 3. 職業別能力値一覧
{
  const rows = head("職業別能力値一覧", "能力値補正は職業レベル1の値（職業レベル上限で1.8倍）。補正の合計は段階ごとに同じ（第1次6・第2次12・第3次20・第4次30・第5次42）で、配分が職業ごとに異なる。成長率はその職業でいる間のレベルアップ時の自動成長への補正。");
  rows.push("| ID | 職業 | 段階 | 系統構成（戦/魔/盗/僧） | 役割 | 能力値補正 | 成長率 | 専用能力値 | 職業Lv上限 |", "|---|---|---|---|---|---|---|---|---|");
  for (const j of N) {
    const c = j.composition;
    rows.push(`| \`${j.id}\` | ${j.name} | ${j.tier} | ${[c.warrior, c.mage, c.thief, c.priest].map((v) => Math.round(v * 100)).join("/")} | ${j.roleName} | ${st(j.stats.flat)} | ${gr(j.growth)} | ${sp(j.special.flat)} | ${j.levelCap} |`);
  }
  rows.push("", "## 専用能力値（12種）", "", "| ID | 名前 | 成長条件 | 実装済みの効果（1ポイントあたり） | 第4弾以降の効果 |", "|---|---|---|---|---|");
  for (const s of specialStats.all()) rows.push(`| \`${s.id}\` | ${s.name} | ${s.growth} | ${Object.entries(s.links).map(([k, v]) => `${DN[k] ?? k}+${v}`).join(" ")} | ${s.planned} |`);
  write("能力値一覧.md", rows);
}

// 4. 職業別固有能力一覧
{
  const rows = head("職業別固有能力一覧", "固有パッシブは「実装済みの効果（派生能力値の補正）」と「第4弾以降で実装する仕組み」を分けて記載。");
  rows.push("| 職業 | 戦闘スタイル | 得意武器 | 防具 | 得意属性 | 固有パッシブ | 実装済みの効果 | 第4弾以降の仕組み | 強み | 弱点 | 得意な場面 |", "|---|---|---|---|---|---|---|---|---|---|---|");
  for (const j of N) {
    rows.push(`| ${j.name} | ${j.style} | ${wp(j.weapons)} | ${j.equipment.armor.map((a) => ARMORS[a]).join("・")} | ${el(j.elements)} | ${j.passive.name} | ${pv(j.passive.now.derived)} | ${j.passive.planned} | ${j.strengths.join("、")} | ${j.weaknesses.join("、")} | ${j.situations} |`);
  }
  rows.push("", "## 役割（12種）", "", "| ID | 役割 | 強み | 弱点 |", "|---|---|---|---|");
  for (const [id, r] of Object.entries(ROLES)) rows.push(`| \`${id}\` | ${r.name} | ${r.strengths.join("、")} | ${r.weaknesses.join("、")} |`);
  write("固有能力一覧.md", rows);
}

// 5. 職業別スキル・奥義予定一覧
{
  const rows = head("職業別スキル・奥義予定一覧", "**すべて第4弾で効果を実装する予定（未実装）。** 名称・固有ID・効果案・習得条件・引き継ぎ条件を決めてある。第5次職業の奥義はそれぞれ固有。第1～4次職業は「秘技」。");
  rows.push("| 職業 | 種類 | 固有ID | 名称 | 操作 | 効果案 | 習得条件 | 引き継ぎ条件 |", "|---|---|---|---|---|---|---|---|");
  const ACT = { tap: "通常使用", jump: "ジャンプ中", sprint: "ダッシュ中", charge: "しゃがみ溜め", ultimate: "長時間溜め" };
  for (const j of N) {
    for (const s of [...j.skills, j.ultimate]) {
      const kind = s.kind === "ultimate" ? "奥義" : s.kind === "secret" ? "秘技" : "専用スキル";
      const inh = s.inherit ? `職業Lv${s.inherit.jobLevel}以上・武器（${wp(s.inherit.weapons)}）が転職先と共通` : "引き継ぎ不可（この職業専用）";
      rows.push(`| ${j.name} | ${kind} | \`${s.id}\` | ${s.name} | ${ACT[s.action]} | ${s.effect} | 職業Lv${s.learn.jobLevel} | ${inh} |`);
    }
  }
  write("スキル奥義予定一覧.md", rows);
}

// 6. 転職条件一覧
{
  const rows = head("転職条件一覧", "条件は職業ごとのデータに保存されている（`requirements`）。段階ごとの基準値は `content/jobs/jobRequirements.js` の `REQUIREMENT_TIERS` で変更でき、個別の職業は `jobFactory.js` の `OVERRIDES` で上書きできる。");
  rows.push("## 段階ごとの基準", "", "| 段階 | プレイヤーLv | 進化元の職業Lv | 融合する系統の適性（いずれか） | その他 |", "|---|---|---|---|---|");
  for (let t = 1; t <= 5; t++) {
    const r = REQUIREMENT_TIERS[t];
    const apt = t === 1 ? "-" : `能力値2種の合計${r.statSum}以上 ／ 行動実績${r.counter}以上 ／ その系統の才能`;
    const other = [r.kills ? `魔物討伐${r.kills}体` : "", r.bossKills ? `ボス・強敵討伐${r.bossKills}回` : "", r.mainStatSum ? `主軸系統の能力値合計${r.mainStatSum}以上` : ""].filter(Boolean).join("・") || "-";
    rows.push(`| 第${t}次 | ${r.level} | ${r.parentJobLevel ?? "-"} | ${apt} | ${other} |`);
  }
  rows.push("", "系統の適性に使う能力値：戦士＝筋力+耐久、魔法使い＝魔力+知力、盗賊＝敏捷+器用、僧侶＝精神+生命力。", "", "別系統への転職（別の系統の第1次職業など）：上記に加えて特殊アイテム「転職の証」を1つ消費。以前に経験した職業へ戻るときは条件不要。", "");
  rows.push("## 全職業の転職条件", "", "| 職業 | 条件 |", "|---|---|");
  for (const j of N) rows.push(`| ${j.name} | ${j.requirements.map((c) => describeCondition(c, jn)).join("<br>")} |`);
  rows.push("", "## 隠し職業", "", "| 職業 | 発見の条件 | 転職条件 |", "|---|---|---|");
  for (const h of hiddenJobs()) rows.push(`| ${h.name} | ${h.discover.map((c) => describeCondition(c, jn)).join("<br>")} | ${h.requirements.map((c) => describeCondition(c, jn)).join("<br>")} |`);
  write("転職条件一覧.md", rows);
}
console.log("docs/jobs/ に職業資料を出力しました");
