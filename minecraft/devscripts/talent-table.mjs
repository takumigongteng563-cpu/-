// 才能の一覧と抽選確率の表を docs/才能一覧.md に出力する
// 実行: node devscripts/talent-table.mjs
import fs from "node:fs";
import { talents, innateTalents } from "../packs/BP/scripts/content/talents/index.js";
import { potentials } from "../packs/BP/scripts/content/potentials.js";
import { GRADES } from "../packs/BP/scripts/content/grades.js";
import { GRADE_WEIGHTS, INITIAL_TALENT_SLOTS, POTENTIAL_FORMATION } from "../packs/BP/scripts/balance/talentRoll.js";
import { rollInitialTalents } from "../packs/BP/scripts/talents/talentRoller.js";
import { createRng } from "../packs/BP/scripts/core/rng.js";
import { describeCondition } from "../packs/BP/scripts/talents/conditions.js";

console.warn = () => {};
const strip = (t) => t.replace(/§./g, "");
const fx = async () => (await import("../packs/BP/scripts/ui/describe.js")).describeEffects;
const describeEffects = await fx();

const innate = innateTalents();
const N = 200000;
const has = {};
for (let seed = 1; seed <= N; seed++) {
  for (const id of rollInitialTalents(createRng(seed * 2654435761), innate, GRADE_WEIGHTS, INITIAL_TALENT_SLOTS)) has[id] = (has[id] || 0) + 1;
}

const out = [];
out.push("# 才能一覧（自動生成）", "");
out.push("`node devscripts/talent-table.mjs` で生成。手で編集しないこと（定義は `packs/BP/scripts/content/talents/` と `content/potentials.js`）。", "");
out.push("## 初期才能の抽選方法", "");
out.push(`1. 才能の数：全員 ${INITIAL_TALENT_SLOTS.base} 個（最終仕様 Ver.1.0）`);
out.push("2. 等級を抽選（下表の確率）。その等級に候補がなければ近い等級から選ぶ");
out.push("3. その等級の初期才能から、才能ごとの重み（weight）で 1 つ選ぶ");
out.push("4. 乱数はプレイヤーごとのシード（初回参加時に決定・保存）から作るため、何度やり直しても結果は同じ。抽選は初回参加時の 1 回のみ", "");
out.push("| 等級 | 名称 | 確率 | 初期才能の数 |", "|---|---|---:|---:|");
for (const g of GRADES) out.push(`| ${g.id} | ${g.name} | ${GRADE_WEIGHTS[g.id]}% | ${innate.filter((t) => t.grade === g.id).length} |`);
out.push("");
out.push(`## 初期才能（${innate.length}種）`, "");
out.push(`「確率」＝ 等級の確率 × その等級内での重みの割合。「実測」＝ ${N.toLocaleString()} 人分の模擬抽選で、その才能を持って始まった人の割合。`, "");
out.push("| 等級 | ID | 名前 | 確率 | 実測 | 効果 | 進化先 |", "|---|---|---|---:|---:|---|---|");
for (const g of GRADES) {
  const pool = innate.filter((t) => t.grade === g.id);
  const sum = pool.reduce((a, t) => a + (t.weight ?? 1), 0);
  for (const t of pool) {
    const p = (GRADE_WEIGHTS[g.id] * (t.weight ?? 1)) / sum;
    const evo = (t.evolvesTo || []).map((b) => talents.get(b.to)?.name).join(" / ") || "-";
    out.push(`| ${g.id} | \`${t.id}\` | ${t.name} | ${p.toFixed(3)}% | ${(((has[t.id] || 0) / N) * 100).toFixed(3)}% | ${describeEffects(t).map(strip).join("<br>")} | ${evo} |`);
  }
}
const section = (title, list, condKey) => {
  out.push("", `## ${title}（${list.length}種）`, "");
  out.push("| 等級 | ID | 名前 | 条件 | 効果 | 進化先 |", "|---|---|---|---|---|---|");
  for (const t of list) {
    const cond = condKey(t);
    const evo = (t.evolvesTo || []).map((b) => talents.get(b.to)?.name).join(" / ") || "-";
    out.push(`| ${t.grade} | \`${t.id}\` | ${t.name} | ${cond} | ${describeEffects(t).map(strip).join("<br>")} | ${evo} |`);
  }
};
section("後天性才能", talents.all().filter((t) => t.kind === "acquired"), (t) => (t.awaken || []).map(describeCondition).join("、") + (t.exclusiveFamily ? "（同系統の才能を持っていない場合のみ）" : ""));
const evolved = talents.all().filter((t) => t.kind === "evolved");
section("進化で得る才能", evolved, (t) => {
  const from = talents.all().flatMap((x) => (x.evolvesTo || []).filter((b) => b.to === t.id).map((b) => `${x.name} から：${b.conditions.map(describeCondition).join("、")}`));
  return from.join("<br>");
});
out.push("", "## 進化の系統図（第2弾で実動作するもの）", "", "```");
out.push("剣術適性(F) ─┬─(剣攻撃500・Lv10)──────────────→ 剣術の才(D) ─(剣3000・Lv30)→ 剣術の天才(B) ─(剣10000・Lv60・限界突破1)→ 剣聖の資質(S)");
out.push("              └─(剣攻撃300・魔力親和性 or 魔法100)→ 魔剣適性(D) ─(剣2000・魔法500・Lv30)→ 魔力剣術(B) ─(剣8000・魔法3000・Lv60・限界突破1)→ 魔剣の極致(S)");
out.push("剣の心得(後天F) ─(剣600・Lv10)→ 剣術の才(D) → …（剣術適性と同じ道）");
out.push("弓術適性(F) / 弓の心得 → 弓術の才(D)　　槍術適性(F) / 槍の心得 → 槍術の才(D)");
out.push("```", "※ 魔法の使用回数は魔法システム（後続）が加算するまで増えないため、魔剣の2段目以降は現時点では管理者テストでのみ確認できます。", "");
out.push(`## 隠された潜在能力（${potentials.size}種）`, "");
out.push("**開発者向け資料。ゲーム内では覚醒するまで名前・条件を表示しない。**", "");
out.push(`最終仕様 Ver.1.0：開始時点では未確定。行動の記録・職業の系統・所持才能の系統から形成スコアを計算し、最も高いものがしきい値（${POTENTIAL_FORMATION.threshold} × (形成済みの数+1)）を超えると形成される（最大 ${POTENTIAL_FORMATION.maxFormed} つ）。形成後、覚醒条件を満たすと覚醒する。`, "");
out.push("| ID | 名前 | 形成スコアの元 | 覚醒条件 | 効果 |", "|---|---|---|---|---|");
const fdesc = (f) => [
  ...Object.entries(f.actions || {}).map(([k, w]) => `${k}÷${POTENTIAL_FORMATION.units[k] ?? 100}×${w}`),
  ...Object.entries(f.talentFamilies || {}).map(([k, w]) => `才能系統${k}:+${w}`),
  ...Object.entries(f.jobLines || {}).map(([k, w]) => `職業系統${k}:+${w}`),
].join("<br>");
for (const p of potentials.all()) out.push(`| \`${p.id}\` | ${p.name} | ${fdesc(p.formation || {})} | ${p.awaken.map(describeCondition).join("、")} | ${describeEffects(p).map(strip).join("<br>")} |`);
fs.writeFileSync("docs/才能一覧.md", out.join("\n") + "\n");
console.log(`docs/才能一覧.md を出力（初期${innate.length}・全${talents.size}・潜在${potentials.size}）`);
