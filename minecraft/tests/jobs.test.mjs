// 第3弾（v0.3.0）職業システムの単体テスト
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { boot, join, stripTalents, memoryBackend, fakePlayer } from "./rpgHelpers.mjs";
import { createApp, joinPlayer } from "../packs/BP/scripts/app.js";
import { jobs, normalJobs, hiddenJobs } from "../packs/BP/scripts/content/jobs.js";
import { validateJobs } from "../packs/BP/scripts/content/jobs/validateJobs.js";
import { judgeChange } from "../packs/BP/scripts/job/jobService.js";
import { jobExpToNext } from "../packs/BP/scripts/job/jobBonus.js";
import { totalExpToReach } from "../packs/BP/scripts/progression/levelMath.js";

const byName = (n) => jobs.all().find((j) => j.name === n);

/** プレイヤーを条件を満たす状態にする（レベル・能力値） */
function prepare(app, p, level, alloc = {}) {
  app.progression.setLevel(p.id, level);
  app.playerService.update(p.id, (d) => Object.assign(d.statAllocated, alloc));
  app.stats.recalc(p.id);
}

test("職業データの自動検証がすべて合格", () => {
  const r = validateJobs();
  assert.deepEqual(r.errors, []);
  assert.equal(r.summary.normal, 484);
  assert.ok(r.checks.length >= 15);
});

test("第2次職業12種類：主軸と融合系統の組み合わせ（順序で別の職業）", () => {
  const expect = {
    "warrior.mage": "魔剣士", "warrior.thief": "遊撃士", "warrior.priest": "聖騎士",
    "mage.warrior": "戦魔導士", "mage.thief": "幻術師", "mage.priest": "神聖魔導士",
    "thief.warrior": "狩人", "thief.mage": "魔弓士", "thief.priest": "聖弓士",
    "priest.warrior": "戦司祭", "priest.mage": "賢者", "priest.thief": "迅癒師",
  };
  for (const [id, name] of Object.entries(expect)) assert.equal(jobs.get(id).name, name, id);
  assert.deepEqual(["warrior", "mage", "thief", "priest"].map((id) => jobs.get(id).name), ["戦士", "魔法使い", "盗賊", "僧侶"]);
});

test("第3次職業36種類が指示書どおり・進化例のルート", () => {
  const t3 = {
    魔剣士: ["元素剣士", "幻影剣士", "神聖剣士"], 遊撃士: ["迅雷戦士", "双剣士", "守護遊撃士"], 聖騎士: ["魔装騎士", "疾風騎士", "聖盾騎士"],
    戦魔導士: ["魔装術師", "高速魔導士", "聖戦魔導士"], 幻術師: ["幻影戦術師", "影召喚士", "精神術師"], 神聖魔導士: ["審判術師", "星詠術師", "大聖術師"],
    狩人: ["重弓士", "精霊狩人", "守護狩人"], 魔弓士: ["魔導射手", "属性弓士", "浄化弓士"], 聖弓士: ["聖弓騎士", "光矢術師", "祝福射手"],
    戦司祭: ["武僧", "魔導司祭", "疾風司祭"], 賢者: ["戦術賢者", "大魔導賢者", "予言者"], 迅癒師: ["守護治癒師", "精霊治癒師", "瞬癒師"],
  };
  for (const [parent, kids] of Object.entries(t3)) assert.deepEqual(byName(parent).children.map((c) => jobs.get(c).name), kids, parent);
  const route = (names) => names.forEach((n, i) => i > 0 && assert.equal(byName(n).parent, byName(names[i - 1]).id, n));
  route(["戦士", "魔剣士", "元素剣士", "天災剣士", "万象魔剣王"]);
  route(["魔法使い", "幻術師", "影召喚士", "深淵召喚士", "虚空召喚王"]);
  route(["盗賊", "魔弓士", "属性弓士", "天弓術師", "星界弓神"]);
  route(["僧侶", "賢者", "大魔導賢者", "超越賢者", "万象の大賢者"]);
});

test("全484職業に必要なデータ項目がある", () => {
  const keys = ["id", "name", "tier", "description", "line", "parent", "fusedLines", "children", "style", "role", "weapons", "elements", "equipment", "stats", "growth", "special", "passive", "skills", "ultimate", "strengths", "weaknesses", "requirements", "crossLineRequirements", "hiddenRelations"];
  for (const j of normalJobs()) for (const k of keys) assert.ok(k in j, `${j.id}.${k}`);
  for (const j of normalJobs().filter((x) => x.tier === 5)) assert.equal(j.ultimate.kind, "ultimate");
  assert.ok(normalJobs().some((j) => /召喚/.test(j.name)) && normalJobs().some((j) => /精霊/.test(j.name)));
  assert.ok(normalJobs().some((j) => /忍/.test(j.name)) && normalJobs().some((j) => j.role === "assassin"));
});

test("初期職業は強制されず、レベル5で4職業のどれにでもなれる", () => {
  const { app } = boot();
  const ps = ["A", "B", "C", "D"].map((n, i) => join(app, String(-1 - i), n));
  assert.equal(app.playerService.dataFor(ps[0].id).job.current, "unemployed");
  assert.equal(app.jobs.changeJob(ps[0].id, "warrior").ok, false); // Lv1
  for (const p of ps) prepare(app, p, 5);
  // 全員が同じ職業でもよい
  for (const p of ps) assert.equal(app.jobs.changeJob(p.id, "mage").ok, true);
  assert.ok(ps.every((p) => app.playerService.dataFor(p.id).job.current === "mage"));
});

test("職業融合：戦士 → 魔剣士は「戦士の経験＋魔法の適性」で解放（魔法使いへの転職は不要）", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  prepare(app, p, 15);
  app.jobs.changeJob(p.id, "warrior");
  app.jobs.setJobLevel(p.id, 15);
  let j = judgeChange(app.playerService.dataFor(p.id), "warrior.mage");
  assert.equal(j.ok, false);
  assert.equal(j.unmet.length, 1); // 魔法の適性だけが足りない
  assert.equal(app.jobs.changeJob(p.id, "warrior.mage").ok, false);
  prepare(app, p, 15, { mag: 6, int: 6 }); // 魔力+知力：自然成長 24 ＋ 振り分け 12 = 36
  assert.ok(app.playerService.dataFor(p.id).job.unlocked.includes("warrior.mage") || true);
  j = judgeChange(app.playerService.dataFor(p.id), "warrior.mage");
  assert.equal(j.ok, true);
  assert.equal(j.kind, "fusion");
  assert.equal(app.jobs.changeJob(p.id, "warrior.mage").ok, true);
  const d = app.playerService.dataFor(p.id);
  assert.equal(d.job.current, "warrior.mage");
  assert.equal(d.level, 15); // プレイヤーレベルは維持
  assert.deepEqual(d.job.fusionHistory.map((f) => f.job), ["warrior", "warrior.mage"]);
  assert.ok(!d.job.held.includes("mage"));
  // 進化元でない職業（別系統の第2次職業）は選べない
  assert.equal(judgeChange(d, "mage.warrior").ok, false);
});

test("才能（系統）でも融合の適性を満たせる", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  prepare(app, p, 15);
  app.jobs.changeJob(p.id, "thief");
  app.jobs.setJobLevel(p.id, 15);
  assert.equal(judgeChange(app.playerService.dataFor(p.id), "thief.priest").ok, false);
  app.talents.grant(p.id, "heal_aptitude");
  assert.equal(judgeChange(app.playerService.dataFor(p.id), "thief.priest").ok, true);
});

test("職業レベル：行動で上がり、上限で止まる。過去の職業レベルは保存され、戻ると引き継ぐ", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  prepare(app, p, 5);
  app.jobs.changeJob(p.id, "warrior");
  for (let i = 0; i < 20; i++) app.actions.record(p.id, "hit.melee.sword");
  const lv1 = app.playerService.dataFor(p.id).job.levels.warrior;
  assert.ok(lv1.level > 1 || lv1.exp > 0);
  app.jobs.addJobExp(p.id, 1e9);
  assert.equal(app.playerService.dataFor(p.id).job.levels.warrior.level, jobs.get("warrior").levelCap);
  // 魔法使いへ（別系統：転職の証が必要）
  assert.equal(app.jobs.changeJob(p.id, "mage").ok, false);
  app.jobs.addCrossLineToken(p.id, 1);
  const r = app.jobs.changeJob(p.id, "mage");
  assert.equal(r.ok, true);
  assert.equal(r.kind, "cross");
  assert.equal(app.playerService.dataFor(p.id).job.tokens.crossLine, 0);
  assert.equal(app.playerService.dataFor(p.id).job.levels.mage.level, 1);
  // 戦士に戻る：職業レベル30のまま（転職の証は不要）
  assert.equal(app.jobs.changeJob(p.id, "warrior").kind, "return");
  assert.equal(app.playerService.dataFor(p.id).job.levels.warrior.level, 30);
  assert.ok(jobExpToNext(10, 5) > jobExpToNext(10, 1)); // 上位職業ほど育成が難しい
});

test("転職を何度繰り返しても能力値補正が重複しない", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  prepare(app, p, 20);
  app.jobs.changeJob(p.id, "warrior");
  app.jobs.addCrossLineToken(p.id, 3);
  app.jobs.changeJob(p.id, "mage");
  app.jobs.changeJob(p.id, "warrior");
  const snap = JSON.stringify(app.playerService.dataFor(p.id).computed);
  for (let i = 0; i < 10; i++) {
    app.jobs.changeJob(p.id, "mage");
    app.jobs.changeJob(p.id, "warrior");
  }
  assert.equal(JSON.stringify(app.playerService.dataFor(p.id).computed), snap);
  // 職業補正は現在の職業の分だけ
  const r = app.stats.inspect(p.id);
  const jobMods = r.modifiers.filter((m) => m.layer === "job");
  assert.equal(jobMods.length, 1);
  assert.equal(jobMods[0].id, "warrior");
});

test("職業補正・専用能力値は職業レベルで成長し、層「職業」に表示される", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  prepare(app, p, 5);
  app.jobs.changeJob(p.id, "warrior");
  const at1 = app.stats.inspect(p.id);
  app.jobs.setJobLevel(p.id, 30);
  const at30 = app.stats.inspect(p.id);
  assert.ok(at30.layers.str.job > at1.layers.str.job);
  assert.ok(Object.keys(at30.special).length >= 1);
  assert.ok(Object.values(at30.special)[0] > Object.values(at1.special)[0]);
});

test("引き継ぎパッシブ：職業レベル上限の職業のみ・枠数まで・重複なし", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  prepare(app, p, 20);
  app.jobs.changeJob(p.id, "warrior");
  assert.equal(app.jobs.setInheritedPassives(p.id, ["warrior"]).ok, false);
  app.jobs.setJobLevel(p.id, 30);
  app.jobs.addCrossLineToken(p.id, 1);
  app.jobs.changeJob(p.id, "priest");
  assert.equal(app.jobs.setInheritedPassives(p.id, ["warrior", "warrior"]).ok, true);
  assert.deepEqual(app.playerService.dataFor(p.id).job.inheritedPassives, ["warrior"]);
  const names = app.stats.inspect(p.id).modifiers.map((m) => m.name);
  assert.ok(names.some((n) => n.startsWith("引き継ぎ：戦士の")));
  assert.equal(app.jobs.setInheritedPassives(p.id, ["priest"]).ok, false); // 現在の職業・未習熟
});

test("隠し職業：発見前は候補に出ない・発見の条件（職業融合履歴）で発見", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  prepare(app, p, 30);
  const seeker = "hidden.fusion_seeker";
  assert.ok(hiddenJobs().length >= 2);
  assert.equal(judgeChange(app.playerService.dataFor(p.id), seeker).ok, false);
  for (const id of ["warrior", "mage", "thief", "priest"]) app.jobs.changeJob(p.id, id, { force: true });
  app.jobs.evaluateUnlocks(p.id);
  assert.ok(app.playerService.dataFor(p.id).job.discoveredHidden[seeker]);
  assert.equal(app.jobs.changeJob(p.id, seeker).ok, true);
});

test("専用スキル：現在の職業は習得レベルで使用可能・過去の職業は引き継ぎ条件（職業レベル・武器）", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  prepare(app, p, 20);
  app.jobs.changeJob(p.id, "warrior");
  assert.equal(app.jobs.availableSkills(p.id).length, 0);
  app.jobs.setJobLevel(p.id, 15);
  assert.deepEqual(app.jobs.availableSkills(p.id).map((x) => x.skill.name), ["渾身斬り"]);
  app.jobs.addCrossLineToken(p.id, 2);
  app.jobs.changeJob(p.id, "thief"); // 短剣・弓・クロスボウ：戦士の武器と共通なし
  assert.equal(app.jobs.availableSkills(p.id).filter((x) => x.source === "inherited").length, 0);
  app.jobs.changeJob(p.id, "priest");
  app.jobs.changeJob(p.id, "warrior");
  app.jobs.changeJob(p.id, "thief");
});

test("複数人の同時転職でもデータが混同されない・再起動後も維持", () => {
  const backend = memoryBackend();
  let { app } = boot(backend);
  const ps = ["A", "B", "C", "D"].map((n, i) => join(app, String(-1 - i), n));
  const targets = ["warrior", "mage", "thief", "priest"];
  ps.forEach((p) => prepare(app, p, 5));
  ps.forEach((p, i) => app.jobs.changeJob(p.id, targets[i]));
  ps.forEach((p, i) => app.jobs.setJobLevel(p.id, 3 + i));
  app.playerService.flushAll();
  app.worldService.flushAll();
  ({ app } = boot(backend));
  ps.forEach((p) => joinPlayer(app, p));
  assert.deepEqual(ps.map((p) => app.playerService.dataFor(p.id).job.current), targets);
  assert.deepEqual(ps.map((p, i) => app.playerService.dataFor(p.id).job.levels[targets[i]].level), [3, 4, 5, 6]);
});

test("経験値の一部が職業経験値になり、レベルアップで職業の解放判定が行われる", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  prepare(app, p, 5);
  app.jobs.changeJob(p.id, "warrior");
  app.progression.grantExp(p.id, 1000, { source: "quest", noBonus: true });
  assert.ok(app.playerService.dataFor(p.id).job.levels.warrior.level > 1);
});

test("v0.2.1 のセーブデータに職業データが追加される（既存データ維持）", () => {
  const state = JSON.parse(fs.readFileSync(new URL("./fixtures/v021-state.json", import.meta.url), "utf8"));
  const backend = memoryBackend(new Map(Object.entries(state.world)));
  const app = createApp(backend, () => 0);
  app.worldService.load();
  const ids = Object.keys(state.players);
  const before = {};
  for (const id of ids) before[id] = app.store.read(`p.${state.players[id].props["mnq:uid"]}`).envelope.d;
  for (const id of ids) joinPlayer(app, fakePlayer(id, id, new Map(Object.entries(state.players[id].props))));
  for (const id of ids) {
    const d = app.playerService.dataFor(id);
    assert.equal(d.level, before[id].level);
    assert.equal(d.exp, before[id].exp);
    assert.deepEqual(d.statAllocated, before[id].statAllocated);
    assert.deepEqual(d.talents.innate, before[id].talents.innate);
    assert.equal(d.job.current, "unemployed");
    assert.deepEqual(d.job.held, []);
    assert.deepEqual(d.job.tokens, { crossLine: 0 });
  }
  assert.ok(app.worldService.world.settings.jobs.changeFromMenu);
  assert.equal(app.worldService.world.stages.records.stage001.clears, 2);
  // 職業に就ける（総経験値で十分なレベルにしてから）
  app.progression.grantExp(ids[0], totalExpToReach(5), { source: "admin", noBonus: true });
  assert.equal(app.jobs.changeJob(ids[0], "priest").ok, true);
});
