// 職業データの自動検証（第3弾 第19章）。結果を docs/jobs/自動検証結果.md に書き出す。問題があれば失敗する。
import fs from "node:fs";
console.warn = () => {};
const { validateJobs } = await import("../packs/BP/scripts/content/jobs/validateJobs.js");
const { ADDON_VERSION } = await import("../packs/BP/scripts/config.js");
const r = validateJobs();
const out = [
  `# 職業データの自動検証結果（v${ADDON_VERSION}）`,
  "",
  "`npm run validate:jobs`（`npm run check` に含まれる）で自動生成。ゲーム内でも管理者テスト「職業：データの自動検証」または `/scriptevent noguchi:jobcheck` で同じ検証を実行できる。",
  "",
  `**結果：${r.ok ? "合格" : "不合格"}**（${r.checks.filter((c) => c.ok).length} / ${r.checks.length} 項目）　職業 ${r.summary.total}件（通常 ${r.summary.normal}・隠し ${r.summary.hidden}・無職 1）、専用スキル・奥義 ${r.summary.skills}件`,
  "",
  "| 結果 | 検証項目 | 詳細 |",
  "|---|---|---|",
  ...r.checks.map((c) => `| ${c.ok ? "✅" : "❌"} | ${c.name} | ${c.detail.replace(/\|/g, "／")} |`),
  "",
];
fs.writeFileSync("docs/jobs/自動検証結果.md", out.join("\n"));
if (!r.ok) {
  console.error("職業データの検証エラー:\n - " + r.errors.join("\n - "));
  process.exit(1);
}
console.log(`職業データ検証OK（${r.checks.length}項目・通常職業 ${r.summary.normal}）`);
