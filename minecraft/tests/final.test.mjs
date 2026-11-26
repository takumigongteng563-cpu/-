// 最終仕様 Ver.1.0 対応（v0.2.1）の単体テスト
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { boot, join, stripTalents, memoryBackend, fakePlayer } from "./rpgHelpers.mjs";
import { createApp, joinPlayer } from "../packs/BP/scripts/app.js";
import { normalJobs, jobs } from "../packs/BP/scripts/content/jobs.js";
import { JOB_LINES, EXPECTED_PER_TIER } from "../packs/BP/scripts/content/jobTree.js";
import { stages, stageIdOf } from "../packs/BP/scripts/content/stages.js";
import { chapters, chapterOfStage } from "../packs/BP/scripts/content/story.js";
import { residents, buildings } from "../packs/BP/scripts/content/kingdom.js";
import { resolveAction } from "../packs/BP/scripts/input/inputResolver.js";
import { INPUT } from "../packs/BP/scripts/balance/input.js";
import { skills, registerSkillExecutor } from "../packs/BP/scripts/content/skills.js";
import { dropChance, rollRewards } from "../packs/BP/scripts/rewards/rewardRoller.js";
import { rewardTables } from "../packs/BP/scripts/content/rewardTables.js";
import { REWARD_MODIFIERS } from "../packs/BP/scripts/balance/rewards.js";
import { expToNext } from "../packs/BP/scripts/progression/levelMath.js";
import { AllocationDraft, commitAllocation, allocationRoom } from "../packs/BP/scripts/stats/allocation.js";
import { migrateV2toV3 } from "../packs/BP/scripts/player/playerMigrations.js";
import { ADDON_VERSION } from "../packs/BP/scripts/config.js";
import { talents } from "../packs/BP/scripts/content/talents/index.js";

// ---------------- 旧仕様（v0.2.0）データからの移行 ----------------
test("第2弾（v0.2.0）のセーブデータを最終仕様へ移行：成長は維持・削除なし", () => {
  const state = JSON.parse(fs.readFileSync(new URL("./fixtures/v2-state.json", import.meta.url), "utf8"));
  const backend = memoryBackend(new Map(Object.entries(state.world)));
  const app = createApp(backend, () => 0);
  app.worldService.load();
  const ids = Object.keys(state.players);
  const before = {};
  // 移行前の生データ（比較用）
  for (const id of ids) {
    const uid = state.players[id].props["mnq:uid"];
    before[id] = app.store.read(`p.${uid}`).envelope.d;
  }
  const ps = ids.map((id) => {
    const p = fakePlayer(id, id, new Map(Object.entries(state.players[id].props)));
    joinPlayer(app, p);
    return p;
  });
  for (const p of ps) {
    const d = app.playerService.dataFor(p.id);
    const b = before[p.id];
    // 既存の成長は維持
    assert.equal(d.level, b.level);
    assert.equal(d.exp, b.exp);
    assert.equal(d.gold, b.gold);
    assert.deepEqual(d.statAllocated, b.statAllocated);
    assert.deepEqual(d.statGrowth, b.statGrowth);
    assert.equal(d.unspentStatPoints, b.unspentStatPoints);
    for (const k of ["str", "vit", "mag", "mnd", "agi", "dex", "luk", "int"]) assert.equal(d.stats[k], b.stats[k], k);
    // 新しい4能力値は初期値
    for (const k of ["lif", "endr", "foc", "lead"]) assert.equal(d.stats[k], 5, k);
    // 初期才能は1個。残りは削除せず archived に記録
    assert.equal(d.talents.innate.length, 1);
    assert.equal(d.talents.innate[0], b.talents.innate[0]);
    assert.deepEqual(d.talents.innateLegacy, b.talents.innate);
    const extra = b.talents.innate.slice(1);
    for (const x of extra) {
      assert.ok(!d.talents.active.some((a) => (a.lineage?.[0] ?? a.id) === x && a.origin === "innate"));
      assert.ok(d.talents.archived.some((a) => (a.lineage?.[0] ?? a.id) === x));
    }
    // 後天性・管理者付与の才能は残る
    for (const a of b.talents.active.filter((x) => x.origin !== "innate")) assert.ok(d.talents.active.some((y) => y.id === a.id), a.id);
    // 潜在能力：覚醒済みは有効のまま、未覚醒の旧抽選は legacy（記録は残る）
    assert.equal(d.hiddenPotential.entries.length, b.hiddenPotential.entries.length);
    for (const e of d.hiddenPotential.entries) assert.equal(!!e.legacy, !e.awakened);
    assert.deepEqual(Object.keys(d.proficiency).sort(), ["magic", "skill", "weapon"]);
    assert.equal(app.store.read(`p.${d.uid}`).envelope.s, 3);
  }
  // 勇者A（4つの才能・覚醒済み潜在能力を持っていた）
  const a = app.playerService.dataFor(ids[0]);
  assert.ok(a.hiddenPotential.entries.some((e) => e.awakened && !e.legacy));
  const w = app.worldService.world;
  assert.equal(w.story.chapter, 1);
  assert.equal(w.story.legacyChapter, 1);
  assert.ok(w.stages.unlocked.stage001);
  assert.equal(w.kingdom.phase, "ruined");
  assert.ok(w.kingdom.residents.hope);
  assert.ok(w.kingdom.facilities.inn);
  assert.equal(app.store.read("world").envelope.s, 2);
  assert.ok(app.worldService.index.system.versionHistory.some((v) => v.addonVersion === ADDON_VERSION && v.from === "0.2.0"));
});

test("移行処理 v2→v3：keep 方針なら初期才能をすべて残す", () => {
  const d = { stats: {}, talents: { innate: ["a", "b"], active: [{ id: "a", origin: "innate" }, { id: "b", origin: "innate" }] }, hiddenPotential: { entries: [] }, proficiency: {} };
  migrateV2toV3(d, "keep");
  assert.equal(d.talents.active.length, 2);
});

// ---------------- 12能力値・上限・専用能力値 ----------------
test("能力値の成長上限：一般級は100まで、振り分け・成長が止まり、限界突破で解放", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  app.playerService.update(p.id, (d) => (d.statAllocated.str = 93));
  assert.equal(allocationRoom(app.playerService.dataFor(p.id)).str, 2);
  const draft = new AllocationDraft(10, allocationRoom(app.playerService.dataFor(p.id)));
  assert.equal(draft.add("str", 10), 2);
  const big = new AllocationDraft(10);
  big.add("str", 5);
  const data = app.playerService.dataFor(p.id);
  data.unspentStatPoints = 10;
  assert.equal(commitAllocation(data, big).ok, false);
  app.progression.limitBreak(p.id, { force: true });
  assert.equal(allocationRoom(app.playerService.dataFor(p.id)).str, 152);
});

test("専用能力値：補正を持つ才能があるときだけ表示・計算される（基盤）", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  assert.deepEqual(app.stats.inspect(p.id).special, {});
  app.stats.addBuff(p.id, { id: "test_aura", special: { flat: { sword_aura: 7 } }, durationTicks: 100 });
  assert.deepEqual(app.stats.inspect(p.id).special, { sword_aura: 7 });
  assert.deepEqual(app.playerService.dataFor(p.id).computed.special, { sword_aura: 7 });
  // 解放済み（base あり）の専用能力値は補正なしでも計算される
  app.playerService.update(p.id, (d) => (d.specialStats.faith = { base: 3, unlocked: true }));
  assert.deepEqual(app.stats.inspect(p.id).special, { sword_aura: 7, faith: 3 });
});

// ---------------- 経験値 ----------------
test("経験値：格上は増加・格下は減少（上下限あり）、限界突破ごとに必要経験値が増える", () => {
  const { app } = boot();
  const pr = app.progression;
  assert.ok(pr.levelDiffMultiplier(10, 20) > 1);
  assert.ok(pr.levelDiffMultiplier(30, 5) < 1);
  assert.equal(pr.levelDiffMultiplier(1, 999), 2);
  assert.equal(pr.levelDiffMultiplier(999, 1), 0.1);
  assert.equal(pr.levelDiffMultiplier(5, undefined), 1);
  assert.ok(expToNext(50, 1) > expToNext(50, 0));
  assert.ok(expToNext(50, 2) > expToNext(50, 1));
});

test("経験値：才能の経験値ボーナス（成長加速）", () => {
  const { app } = boot();
  const a = join(app, "-1", "A");
  const b = join(app, "-2", "B");
  stripTalents(app, a.id);
  stripTalents(app, b.id);
  app.talents.grant(b.id, "growth_acceleration");
  app.progression.grantExp(a.id, 50, { source: "quest" });
  app.progression.grantExp(b.id, 50, { source: "quest" });
  assert.equal(app.playerService.dataFor(a.id).exp, 50);
  assert.equal(app.playerService.dataFor(b.id).exp, 55);
});

test("初期才能は新規プレイヤーも1個", () => {
  const { app } = boot();
  for (let i = 0; i < 10; i++) {
    const p = join(app, String(-10 - i), `P${i}`);
    assert.equal(app.playerService.dataFor(p.id).talents.innate.length, 1);
    assert.equal(app.playerService.dataFor(p.id).talents.active.length, 1);
  }
  assert.ok(talents.all().filter((t) => t.kind === "innate").length >= 30);
});

// ---------------- 484職業 ----------------
test("通常職業：4系統×3分岐×5段階 = 484。無職は含めない", () => {
  const n = normalJobs();
  assert.equal(n.length, 484);
  assert.deepEqual([1, 2, 3, 4, 5].map((t) => n.filter((j) => j.tier === t).length), [...EXPECTED_PER_TIER]);
  for (const j of n) {
    if (j.tier < 5) assert.equal(j.children.length, 3, j.id);
    else assert.equal(j.children.length, 0);
    for (const c of j.children) assert.equal(jobs.get(c).parent, j.id);
  }
  assert.deepEqual(JOB_LINES.map((l) => jobs.get(l.id).name), ["戦士", "魔法使い", "斥候", "僧侶"]);
  assert.ok(!n.some((j) => j.id === "unemployed"));
  assert.equal(n.filter((j) => j.defined).length, 4); // 中身は第3弾
});

// ---------------- 100ステージ・10章・王国 ----------------
test("100固定ステージ・全10章の構造", () => {
  assert.equal(stages.size, 100);
  assert.equal(chapters.size, 10);
  for (let n = 1; n <= 100; n++) {
    const s = stages.get(stageIdOf(n));
    assert.equal(s.chapter, chapterOfStage(n));
    assert.equal(!!s.boss, n % 10 === 0);
    assert.equal(s.exit, "kingdom");
  }
  assert.equal(stages.get("stage100").boss.id, "majin_noguchi");
  assert.equal(stages.get("stage001").type, "monster_hunt");
  assert.equal(stages.get("stage001").defined, true);
});

test("ステージ進行：順番に解放・初回クリアで王国が変化・周回しても重複しない", () => {
  const { app } = boot();
  const a = join(app, "-1", "A");
  const b = join(app, "-2", "B");
  assert.equal(app.stages.recordClear("stage002", [a.id]).ok, false); // 未解放
  const r1 = app.stages.recordClear("stage001", [a.id, b.id], { timeSec: 600 });
  assert.equal(r1.first, true);
  assert.equal(r1.unlockedNext, "stage002");
  const w = app.worldService.world;
  assert.equal(w.kingdom.phase, "restoring");
  assert.equal(w.kingdom.buildings.castle.state, "queued");
  assert.ok(w.kingdom.facilities.castle);
  const snapshot = JSON.stringify(w.kingdom);
  const r2 = app.stages.recordClear("stage001", [a.id], { timeSec: 300 });
  assert.equal(r2.first, false);
  assert.equal(JSON.stringify(w.kingdom), snapshot); // 周回で住民・建物が増えない
  assert.equal(w.stages.records.stage001.clears, 2);
  assert.equal(w.stages.records.stage001.bestTimeSec, 300);
  assert.equal(app.stages.personalClears(a.id, "stage001"), 2);
  assert.equal(app.stages.personalClears(b.id, "stage001"), 1);
  // 第1章のボス（ステージ10）を倒すと第2章へ
  for (let n = 2; n <= 10; n++) app.stages.recordClear(stageIdOf(n), [a.id]);
  assert.equal(w.story.chapter, 2);
  assert.deepEqual(w.story.cleared, [1]);
});

test("王国：住民の移住と建物の解放は重複しない・配置は少しずつ", () => {
  const { app } = boot();
  residents.register({ id: "test_smith", name: "鍛冶屋", buildings: ["test_smithy", "test_house"] });
  buildings.register({ id: "test_smithy", name: "鍛冶場", facility: "smithy" });
  buildings.register({ id: "test_house", name: "民家", facility: "house" });
  stages.register({ id: "test_stage", number: 999, chapter: 1, residents: ["test_smith", "hope"], buildings: ["test_house"] });
  const r = app.kingdom.applyStageClear("test_stage");
  assert.deepEqual(r.residents, ["test_smith"]); // ホープは最初からいるので増えない
  assert.deepEqual(r.buildings, ["test_smithy", "test_house"]);
  assert.deepEqual(r.facilities, ["smithy", "house"]);
  assert.equal(app.kingdom.applyStageClear("test_stage").applied, false);
  assert.equal(app.kingdom.processBuildQueue(5), 0); // 配置処理が未登録（第15弾）
  const placed = [];
  app.kingdom.setBuilder((def) => (placed.push(def.id), true));
  assert.equal(app.kingdom.processBuildQueue(1), 1);
  assert.equal(app.kingdom.processBuildQueue(1), 1);
  assert.deepEqual(placed, ["test_smithy", "test_house"]);
  assert.equal(app.worldService.world.kingdom.buildings.test_house.state, "built");
});

// ---------------- 報酬・唯一装備 ----------------
test("報酬：幸運・周回で確率が上がり、周回補正には上限がある", () => {
  const e = { chance: 0.1, rarity: "common" };
  const base = dropChance(e, { luck: 5, clears: 0, difficulty: 1 });
  assert.ok(dropChance(e, { luck: 30, clears: 0, difficulty: 1 }) > base);
  assert.ok(dropChance(e, { luck: 5, clears: 5, difficulty: 1 }) > base);
  assert.equal(dropChance(e, { luck: 5, clears: 1000, difficulty: 1 }), dropChance(e, { luck: 5, clears: REWARD_MODIFIERS.repeatMax / REWARD_MODIFIERS.repeatPerClear, difficulty: 1 }));
  assert.ok(dropChance({ chance: 1, rarity: "common" }, { luck: 999, clears: 999, difficulty: 99 }) <= REWARD_MODIFIERS.maxChance);
  assert.ok(dropChance({ chance: 0.1, rarity: "mythic" }, { luck: 5, clears: 0, difficulty: 1 }) < base);
});

test("報酬：プレイヤーごとに個別抽選・世界唯一の装備は1人にだけ配布", () => {
  const { app } = boot();
  app.rewards.rng = () => 0; // 全項目当選させる
  const ps = ["A", "B", "C", "D"].map((n, i) => join(app, String(-1 - i), n));
  const got = ps.map((p) => app.rewards.rollFor(p.id, "sample").items.filter((x) => x.unique).length);
  assert.deepEqual(got, [1, 0, 0, 0]);
  assert.equal(app.uniqueItems.state("sample:unique_blade"), "held");
  const r = rollRewards(rewardTables.get("sample"), { luck: 5, clears: 0, difficulty: 1 }, () => 0.99);
  assert.equal(r.items.length, 0);
});

test("世界唯一の装備：譲渡・紛失・回復・複製検出・所有者の選択", () => {
  const { app } = boot();
  const a = join(app, "-1", "A");
  const b = join(app, "-2", "B");
  const ua = app.playerService.getSession(a.id).uid;
  const ub = app.playerService.getSession(b.id).uid;
  const u = app.uniqueItems;
  const i1 = u.issue("sample:unique_blade", ua).instanceId;
  assert.equal(u.issue("sample:unique_blade", ub).ok, false); // 二重配布しない
  assert.equal(u.verify("sample:unique_blade", ua, i1), true);
  const i2 = u.transfer("sample:unique_blade", ua, ub).instanceId;
  assert.equal(u.verify("sample:unique_blade", ua, i1), false); // 旧所有者の手元の物は複製扱い
  assert.equal(u.verify("sample:unique_blade", ub, i2), true);
  assert.equal(u.markLost("sample:unique_blade").ok, true);
  assert.equal(u.recover("sample:unique_blade", ua).ok, true); // 最初の入手者に固定されない
  assert.equal(u.entry("sample:unique_blade").holderUid, ua);
  // 所有者を選ぶ装備
  const { uniqueItems } = await_import_unique();
  uniqueItems.register({ id: "test:picky", name: "選ぶ剣", ownerConditions: [{ type: "level", min: 30 }] });
  assert.equal(u.issue("test:picky", ua).ok, false);
  app.progression.setLevel(a.id, 30);
  assert.equal(u.issue("test:picky", ua).ok, true);
});
import * as uniqueContent from "../packs/BP/scripts/content/uniqueItems.js";
function await_import_unique() {
  return uniqueContent;
}

// ---------------- 操作判定・技の割り当て ----------------
test("操作判定：5種類と優先順位・誤発動防止", () => {
  const base = { holdTicks: 0, sneaking: false, sneakTicks: 0, airborne: false, sprinting: false };
  assert.equal(resolveAction(base).action, "tap");
  assert.equal(resolveAction({ ...base, airborne: true }).action, "jump");
  assert.equal(resolveAction({ ...base, sprinting: true }).action, "sprint");
  assert.equal(resolveAction({ ...base, sprinting: true, airborne: true }).action, "sprint"); // 移動技を優先
  assert.equal(resolveAction({ ...base, sneaking: true, sneakTicks: INPUT.chargeTicks }).action, "charge");
  assert.equal(resolveAction({ ...base, sneaking: true, sneakTicks: INPUT.ultimateTicks }).action, "ultimate");
  assert.equal(resolveAction({ ...base, holdTicks: INPUT.ultimateTicks }).action, "ultimate");
  assert.equal(resolveAction({ ...base, sneaking: true, holdTicks: INPUT.chargeTicks }).action, "charge");
  assert.equal(resolveAction({ ...base, sneaking: true, sneakTicks: 3 }).action, "tap"); // 溜め不足のしゃがみは通常
  assert.equal(resolveAction({ ...base, holdTicks: INPUT.tapMaxTicks + 1 }).action, null); // 中途半端な長押しは不発
  assert.equal(resolveAction({ ...base, sneaking: false, sneakTicks: 999 }).action, "tap"); // しゃがみを解いたら溜めは無効
});

test("技の割り当て：未習得は割り当て不可・MP不足は不発・クールタイム", () => {
  const { app, tickRef } = boot();
  const p = join(app, "-1", "A");
  const sb = app.skillBindings;
  assert.equal(sb.tryActivate(p.id, 0, "tap").reason, "技が割り当てられていない");
  skills.register({ id: "test_slash", name: "試し斬り", actions: ["tap", "jump"], cost: { mp: 20 }, cooldownTicks: 40 });
  assert.equal(sb.bind(p.id, 0, "tap", "test_slash").reason, "未習得のスキル");
  app.playerService.update(p.id, (d) => (d.skills.learned.test_slash = { level: 1 }));
  assert.equal(sb.bind(p.id, 0, "ultimate", "test_slash").ok, false); // その操作には割り当てられない
  assert.equal(sb.bind(p.id, 0, "tap", "test_slash").ok, true);
  assert.equal(sb.tryActivate(p.id, 0, "tap").reason, "技の効果が未実装（第4弾）");
  let fired = 0;
  registerSkillExecutor("test_slash", () => (fired++, true));
  stripTalents(app, p.id);
  assert.equal(sb.tryActivate(p.id, 0, "tap").ok, true);
  assert.equal(sb.tryActivate(p.id, 0, "tap").reason, "連続使用不可");
  tickRef.t += INPUT.globalCooldownTicks;
  assert.equal(sb.tryActivate(p.id, 0, "tap").reason, "クールタイム中");
  tickRef.t += 40;
  assert.equal(sb.tryActivate(p.id, 0, "tap").ok, true);
  tickRef.t += 100;
  assert.equal(sb.tryActivate(p.id, 0, "tap").reason, "MPまたはスタミナが足りない"); // 50 → 30 → 10
  assert.equal(fired, 2);
  assert.equal(app.playerService.dataFor(p.id).skillBindings.slots.length, 9);
});
