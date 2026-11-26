import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { boot, join, stripTalents, memoryBackend, fakePlayer } from "./rpgHelpers.mjs";
import { expToNext, addExp, totalExpToReach } from "../packs/BP/scripts/progression/levelMath.js";
import { createApp, joinPlayer } from "../packs/BP/scripts/app.js";
import { computeStats } from "../packs/BP/scripts/stats/statCalc.js";
import { AllocationDraft, commitAllocation, respec } from "../packs/BP/scripts/stats/allocation.js";
import { createRng } from "../packs/BP/scripts/core/rng.js";
import { rollInitialTalents } from "../packs/BP/scripts/talents/talentRoller.js";
import { innateTalents, talents } from "../packs/BP/scripts/content/talents/index.js";
import { potentials } from "../packs/BP/scripts/content/potentials.js";
import { GRADE_WEIGHTS, INITIAL_TALENT_SLOTS } from "../packs/BP/scripts/balance/talentRoll.js";
import { STAT_IDS } from "../packs/BP/scripts/content/stats.js";
import { on, clearAll } from "../packs/BP/scripts/core/eventBus.js";
import { ADDON_VERSION } from "../packs/BP/scripts/config.js";

// ---------------- レベル計算 ----------------
test("必要経験値は徐々に増える", () => {
  assert.equal(expToNext(1), 100);
  for (let l = 1; l < 999; l++) assert.ok(expToNext(l + 1) > expToNext(l), `Lv${l}`);
});

test("余剰経験値の繰り越しと複数レベル上昇", () => {
  const need = expToNext(1) + expToNext(2) + expToNext(3);
  const r = addExp({ level: 1, exp: 0, overflow: 0 }, need + 7, { cap: 50, policy: "store" });
  assert.equal(r.level, 4);
  assert.equal(r.exp, 7);
  assert.equal(r.levelsGained, 3);
});

test("レベル上限：store なら保留（上限あり）、discard なら捨てる", () => {
  const big = totalExpToReach(50) + 1000;
  const s = addExp({ level: 1, exp: 0, overflow: 0 }, big, { cap: 50, policy: "store" });
  assert.equal(s.level, 50);
  assert.equal(s.exp, 0);
  assert.equal(s.overflow, 1000);
  const d = addExp({ level: 1, exp: 0, overflow: 0 }, big, { cap: 50, policy: "discard" });
  assert.equal(d.overflow, 0);
  assert.equal(d.discarded, 1000);
  const huge = addExp({ level: 50, exp: 0, overflow: 0 }, 1e9, { cap: 50, policy: "store" });
  assert.equal(huge.overflow, expToNext(50) * 3);
});

// ---------------- 経験値付与 ----------------
test("経験値でレベルアップし、1レベルにつき能力ポイント5", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  const r = app.progression.grantExp(p.id, expToNext(1) + expToNext(2) + 10, { source: "monster" });
  assert.equal(r.ok, true);
  assert.equal(r.levelsGained, 2);
  const d = app.playerService.dataFor(p.id);
  assert.equal(d.level, 3);
  assert.equal(d.exp, 10);
  assert.equal(d.unspentStatPoints, 10);
});

test("同じ報酬キーは二重に付与されない／once は永久に1回", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  assert.equal(app.progression.grantExp(p.id, 50, { source: "monster", key: "kill:123" }).ok, true);
  assert.equal(app.progression.grantExp(p.id, 50, { source: "monster", key: "kill:123" }).ok, false);
  assert.equal(app.progression.grantExp(p.id, 30, { source: "quest", key: "quest:first", once: true }).ok, true);
  assert.equal(app.progression.grantExp(p.id, 30, { source: "quest", key: "quest:first", once: true }).ok, false);
  assert.equal(app.playerService.dataFor(p.id).exp, 80);
});

test("不正な入力・不在プレイヤーには付与しない", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  assert.equal(app.progression.grantExp(p.id, -5, { source: "monster" }).ok, false);
  assert.equal(app.progression.grantExp(p.id, NaN, { source: "monster" }).ok, false);
  assert.equal(app.progression.grantExp(p.id, 5, { source: "cheat" }).ok, false);
  app.playerService.leave(p.id);
  assert.equal(app.progression.grantExp(p.id, 5, { source: "monster" }).ok, false);
});

test("追いつき補正：パーティ内で大きく遅れている人は経験値が増える", () => {
  const { app } = boot();
  const a = join(app, "-1", "A");
  const b = join(app, "-2", "B");
  app.progression.setLevel(a.id, 20);
  assert.ok(app.progression.catchUpMultiplier(b.id) > 1.5);
  assert.equal(app.progression.catchUpMultiplier(a.id), 1);
});

test("同時レベルアップ：複数人が同時に上がってもデータは独立", () => {
  const { app } = boot();
  const ps = ["A", "B", "C", "D"].map((n, i) => join(app, String(-1 - i), n));
  const events = [];
  clearAll();
  on("levelUp", (e) => events.push(e.playerId));
  ps.forEach((p, i) => app.progression.grantExp(p.id, totalExpToReach(i + 2), { source: "monster", noBonus: true }));
  clearAll();
  assert.deepEqual(ps.map((p) => app.playerService.dataFor(p.id).level), [2, 3, 4, 5]);
  assert.deepEqual(ps.map((p) => app.playerService.dataFor(p.id).unspentStatPoints), [5, 10, 15, 20]);
  assert.equal(events.length, 4);
});

// ---------------- 能力値 ----------------
test("初期ステータス：HP100 / MP50 / スタミナ100 / 全12能力値5（才能なしの場合）", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  const d = app.playerService.dataFor(p.id);
  assert.deepEqual(d.computed.primary, { str: 5, vit: 5, mag: 5, mnd: 5, agi: 5, dex: 5, luk: 5, int: 5, lif: 5, endr: 5, foc: 5, lead: 5 });
  assert.equal(d.computed.derived.maxHp, 100);
  assert.equal(d.computed.derived.maxMp, 50);
  assert.equal(d.computed.derived.maxStamina, 100);
  assert.equal(d.vitals.hpMax, 100);
  assert.equal(d.vitals.mp, 50);
});

test("再計算を何度しても補正が重複加算されない", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  app.talents.grant(p.id, "hero_vessel");
  app.stats.addBuff(p.id, { id: "test", stats: { flat: { str: 10 } }, durationTicks: 100 });
  const first = JSON.stringify(app.playerService.dataFor(p.id).computed);
  for (let i = 0; i < 20; i++) app.stats.recalc(p.id);
  app.stats.addBuff(p.id, { id: "test", stats: { flat: { str: 10 } }, durationTicks: 100 }); // 同じ効果の重ねがけ
  assert.equal(JSON.stringify(app.playerService.dataFor(p.id).computed), first);
});

test("層ごとの内訳：基礎・成長・振り分け・才能・一時効果が別々に計算される", () => {
  const { app, tickRef } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  app.progression.setLevel(p.id, 3);
  const draft = new AllocationDraft(10);
  draft.add("str", 4);
  app.playerService.update(p.id, (d) => commitAllocation(d, draft));
  app.talents.grant(p.id, "axe_aptitude"); // 筋力+2
  app.stats.addBuff(p.id, { id: "potion", stats: { flat: { str: 3 } }, durationTicks: 20 });
  const r = app.stats.inspect(p.id);
  assert.deepEqual(r.layers.str, { base: 5, growth: 1, allocated: 4, talent: 2, job: 0, equip: 0, temp: 3, skill: 0 });
  assert.equal(r.primary.str, 15);
  tickRef.t = 30; // 一時効果の期限切れ
  app.stats.recalc(p.id);
  assert.equal(app.playerService.dataFor(p.id).computed.primary.str, 12);
});

test("割合補正は上限で止まる", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  for (let i = 0; i < 10; i++) app.stats.addBuff(p.id, { id: `b${i}`, stats: { pct: { str: 100 } }, durationTicks: 100 });
  const r = app.stats.inspect(p.id);
  assert.equal(r.pct.str, 200);
});

// ---------------- 振り分け ----------------
test("振り分け：1/5/10ずつ・取り消し・確定・ポイント不足", () => {
  const draft = new AllocationDraft(12);
  assert.equal(draft.add("str", 1), 1);
  assert.equal(draft.add("vit", 5), 5);
  assert.equal(draft.add("mag", 10), 6); // 残り6まで
  assert.equal(draft.remaining, 0);
  draft.undo();
  assert.equal(draft.remaining, 6);
  assert.deepEqual(draft.totals(), { str: 1, vit: 5 });
  const data = { unspentStatPoints: 12, statAllocated: {} };
  assert.equal(commitAllocation(data, draft).ok, true);
  assert.equal(data.unspentStatPoints, 6);
  const tooMuch = new AllocationDraft(20);
  tooMuch.add("str", 10);
  assert.equal(commitAllocation(data, tooMuch).ok, false); // 実際の残り6を超える
  assert.equal(data.unspentStatPoints, 6);
});

test("確定済みの振り分けは権利がなければ戻せない", () => {
  const data = { unspentStatPoints: 0, statAllocated: { str: 5 }, respecTokens: 0 };
  assert.equal(respec(data).ok, false);
  data.respecTokens = 1;
  assert.equal(respec(data).ok, true);
  assert.equal(data.unspentStatPoints, 5);
});

// ---------------- 成長率 ----------------
test("成長率：才能によって同じレベルでも能力の伸び方が違う", () => {
  const { app } = boot();
  const a = join(app, "-1", "A");
  const b = join(app, "-2", "B");
  stripTalents(app, a.id);
  stripTalents(app, b.id);
  app.talents.grant(a.id, "axe_aptitude"); // 筋力成長 +10%
  app.talents.grant(b.id, "magic_prodigy"); // 魔力成長 +20%
  app.progression.setLevel(a.id, 41);
  app.progression.setLevel(b.id, 41);
  const da = app.playerService.dataFor(a.id);
  const db = app.playerService.dataFor(b.id);
  assert.ok(da.statGrowth.str > db.statGrowth.str);
  assert.ok(db.statGrowth.mag > da.statGrowth.mag);
  assert.equal(da.statGrowth.str, 22); // 0.5 × 1.1 × 40
  assert.equal(da.unspentStatPoints, 200); // 振り分けポイントとは別
});

// ---------------- 初期才能 ----------------
test("初期才能は30種類以上・各定義に必要な項目がある", () => {
  const list = innateTalents();
  assert.ok(list.length >= 30, `${list.length}種`);
  for (const t of talents.all()) {
    assert.ok(t.id && t.name && t.description && t.grade, t.id);
    for (const br of t.evolvesTo || []) assert.ok(talents.has(br.to), `${t.id} → ${br.to}`);
  }
  assert.ok(potentials.size >= 9);
});

test("初期才能の抽選：同じシードなら同じ結果・全員1個（最終仕様）", () => {
  const defs = innateTalents();
  for (let seed = 1; seed < 300; seed++) {
    const a = rollInitialTalents(createRng(seed), defs, GRADE_WEIGHTS, INITIAL_TALENT_SLOTS);
    const b = rollInitialTalents(createRng(seed), defs, GRADE_WEIGHTS, INITIAL_TALENT_SLOTS);
    assert.deepEqual(a, b);
    assert.equal(a.length, 1);
  }
});

test("初期才能の抽選確率：等級の出現率が設定値に近い", () => {
  const defs = innateTalents();
  const counts = {};
  let total = 0;
  for (let seed = 1; seed <= 20000; seed++) {
    for (const id of rollInitialTalents(createRng(seed * 7919), defs, GRADE_WEIGHTS, INITIAL_TALENT_SLOTS)) {
      const g = talents.get(id).grade;
      counts[g] = (counts[g] || 0) + 1;
      total++;
    }
  }
  for (const g of ["F", "E", "D", "C"]) {
    const rate = (counts[g] / total) * 100;
    assert.ok(Math.abs(rate - GRADE_WEIGHTS[g]) < 2.5, `${g}: ${rate.toFixed(1)}%`);
  }
});

test("初回参加で抽選・再参加や再起動では変化しない", () => {
  const backend = memoryBackend();
  let { app } = boot(backend);
  const p = join(app, "-1", "A");
  const first = JSON.stringify(app.playerService.dataFor(p.id).talents.innate);
  const pot = JSON.stringify(app.playerService.dataFor(p.id).hiddenPotential.entries);
  assert.equal(JSON.parse(first).length, 1);
  app.playerService.leave(p.id);
  joinPlayer(app, p);
  assert.equal(JSON.stringify(app.playerService.dataFor(p.id).talents.innate), first);
  app.playerService.leave(p.id);
  ({ app } = boot(backend));
  joinPlayer(app, p);
  assert.equal(JSON.stringify(app.playerService.dataFor(p.id).talents.innate), first);
  assert.equal(JSON.stringify(app.playerService.dataFor(p.id).hiddenPotential.entries), pot);
  assert.equal(app.talents.ensureRolled(p.id), null);
});

test("プレイヤーごとに異なる才能が抽選される", () => {
  const { app } = boot();
  const sets = new Set();
  for (let i = 0; i < 8; i++) {
    const p = join(app, String(-100 - i), `P${i}`);
    sets.add(JSON.stringify(app.playerService.dataFor(p.id).talents.innate));
  }
  assert.ok(sets.size >= 6);
});

// ---------------- 後天性才能・進化・潜在能力 ----------------
test("後天性才能：条件を満たしたときだけ1回獲得し、二度と獲得しない", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  app.actions.record(p.id, "kill.hostile", 99);
  app.actions.flushPending();
  assert.ok(!app.playerService.dataFor(p.id).talents.acquired.includes("hunter_instinct"));
  app.actions.record(p.id, "kill.hostile", 1);
  app.actions.flushPending();
  const d = app.playerService.dataFor(p.id);
  assert.ok(d.talents.acquired.includes("hunter_instinct"));
  app.actions.record(p.id, "kill.hostile", 500);
  app.actions.flushPending();
  assert.equal(d.talents.active.filter((a) => a.id === "hunter_instinct").length, 1);
});

test("後天性才能：同系統の才能を持っていれば重複して目覚めない", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  app.talents.grant(p.id, "sword_aptitude");
  app.actions.record(p.id, "hit.melee.sword", 250);
  app.actions.flushPending();
  assert.ok(!app.playerService.dataFor(p.id).talents.acquired.includes("sword_awakening"));
});

test("才能の枝分かれ進化：王道（剣術の才）と魔剣の分岐", () => {
  const { app } = boot();
  const a = join(app, "-1", "A");
  const b = join(app, "-2", "B");
  for (const p of [a, b]) {
    stripTalents(app, p.id);
    app.talents.grant(p.id, "sword_aptitude");
    app.progression.setLevel(p.id, 10);
  }
  app.talents.grant(b.id, "mana_affinity");
  for (const p of [a, b]) app.actions.record(p.id, "hit.melee.sword", 500);
  app.actions.flushPending();
  const ia = app.playerService.dataFor(a.id).talents.active.map((x) => x.id);
  const ib = app.playerService.dataFor(b.id).talents.active.map((x) => x.id);
  assert.ok(ia.includes("sword_talent") && !ia.includes("sword_aptitude"));
  assert.ok(ib.includes("magic_sword_aptitude") && !ib.includes("sword_aptitude"));
  const entry = app.playerService.dataFor(a.id).talents.active.find((x) => x.id === "sword_talent");
  assert.deepEqual(entry.lineage, ["sword_aptitude"]);
  // さらに進化（剣術の天才）
  app.progression.setLevel(a.id, 30);
  app.actions.record(a.id, "hit.melee.sword", 2500);
  app.actions.flushPending();
  assert.ok(app.playerService.dataFor(a.id).talents.active.some((x) => x.id === "sword_genius"));
  // 剣聖の資質は限界突破が必要（未実装の条件を無視して進化しない）
  app.progression.setLevel(a.id, 50);
  app.actions.record(a.id, "hit.melee.sword", 20000);
  app.actions.flushPending();
  assert.ok(!app.playerService.dataFor(a.id).talents.active.some((x) => x.id === "sword_saint_seed"));
});

test("才能なしでも後天性才能から上位才能へ進化できる", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  app.actions.record(p.id, "hit.melee.sword", 200);
  app.actions.flushPending();
  assert.ok(app.playerService.dataFor(p.id).talents.active.some((x) => x.id === "sword_awakening"));
  app.progression.setLevel(p.id, 10);
  app.actions.record(p.id, "hit.melee.sword", 400);
  app.actions.flushPending();
  assert.ok(app.playerService.dataFor(p.id).talents.active.some((x) => x.id === "sword_talent"));
});

test("潜在能力：開始時は未確定・行動で形成（非公開）・条件達成で覚醒", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  assert.deepEqual(app.playerService.dataFor(p.id).hiddenPotential.entries, []); // 開始時点では未確定
  // 歩き回る冒険者 → 「無限の探究心」が形成される（スコア = 距離/5000 × 1.5 が閾値30以上）
  app.actions.record(p.id, "move.distance", 90000);
  app.actions.flushPending();
  assert.deepEqual(app.playerService.dataFor(p.id).hiddenPotential.entries, []);
  app.actions.record(p.id, "move.distance", 10000);
  app.actions.flushPending();
  const e = app.playerService.dataFor(p.id).hiddenPotential.entries;
  assert.equal(e.length, 1);
  assert.equal(e[0].id, "endless_curiosity");
  assert.equal(e[0].awakened, false);
  assert.deepEqual(app.playerService.dataFor(p.id).hiddenPotential.revealed, []);
  // 覚醒条件（距離100000・Lv20）
  app.progression.setLevel(p.id, 20);
  app.talents.evaluate(p.id);
  assert.equal(app.playerService.dataFor(p.id).hiddenPotential.entries[0].awakened, true);
  assert.deepEqual(app.playerService.dataFor(p.id).hiddenPotential.revealed, ["endless_curiosity"]);
});

test("潜在能力：戦い方が違えば形成される潜在能力も違う", () => {
  const { app } = boot();
  const a = join(app, "-1", "A");
  const b = join(app, "-2", "B");
  stripTalents(app, a.id);
  stripTalents(app, b.id);
  app.actions.record(a.id, "hit.melee.sword", 2000);
  app.actions.record(b.id, "kill.hostile", 1000); // 1000/40 = 25点
  app.actions.record(b.id, "survive.lowhp", 30); // 30/5 = 6点 → 合計31点（閾値30）
  app.actions.flushPending();
  assert.equal(app.playerService.dataFor(a.id).hiddenPotential.entries[0].id, "sword_limit");
  assert.equal(app.playerService.dataFor(b.id).hiddenPotential.entries[0].id, "combat_learning");
});

test("潜在能力：特殊イベントのフラグで覚醒", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  // 形成済み（精霊との共鳴）の状態から、特殊イベントのフラグで覚醒
  app.playerService.update(p.id, (pd) => (pd.hiddenPotential.entries = [{ id: "spirit_resonance", awakened: false, awakenedAt: 0, origin: "formed" }]));
  app.actions.setFlag(p.id, "spirit_resonance");
  assert.equal(app.playerService.dataFor(p.id).hiddenPotential.entries[0].awakened, true);
});

// ---------------- 限界突破 ----------------
test("限界突破：未実装の条件は通常操作では突破できない／管理者テストでのみ突破し保留経験値を加算", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  app.progression.grantExp(p.id, totalExpToReach(50) + 500, { source: "admin", noBonus: true });
  const d = app.playerService.dataFor(p.id);
  assert.equal(d.level, 50);
  assert.equal(d.expOverflow, 500);
  assert.equal(app.progression.limitBreak(p.id).ok, false);
  const r = app.progression.limitBreak(p.id, { force: true, by: "admin" });
  assert.equal(r.ok, true);
  assert.equal(d.limitBreak.stage, 1);
  assert.equal(d.exp, 500);
  assert.equal(d.expOverflow, 0);
  assert.equal(app.progression.info(p.id).cap, 100);
  assert.equal(app.progression.info(p.id).tier.name, "超人級");
});

// ---------------- MP・スタミナ ----------------
test("MP不足ではスキル使用の共通処理が失敗し、何も消費しない", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  assert.equal(app.vitals.trySpend(p.id, { mp: 30, stamina: 10 }), true);
  assert.equal(app.vitals.trySpend(p.id, { mp: 30, stamina: 10 }), false);
  const v = app.vitals.get(p.id);
  assert.equal(v.mp, 20);
  assert.equal(v.stamina, 90);
  app.vitals.restore(p.id, { mp: 999 });
  assert.equal(v.mp, 50); // 最大値を超えない
});

test("スタミナ：0で疲労、一定量回復で解除", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  assert.equal(app.vitals.tickStamina(p.id, -200).exhausted, true);
  assert.equal(app.vitals.canUseStamina(p.id, 1), false);
  assert.equal(app.vitals.tickStamina(p.id, 10).exhausted, true);
  assert.equal(app.vitals.tickStamina(p.id, 20).exhausted, false);
});

test("HP：バニラの体力の割合から算出し、最大値を超えない", () => {
  const { app } = boot();
  const p = join(app, "-1", "A");
  stripTalents(app, p.id);
  app.vitals.syncHpFromHealth(p.id, 10, 20);
  assert.equal(app.vitals.get(p.id).hp, 50);
  app.vitals.syncHpFromHealth(p.id, 40, 20);
  assert.equal(app.vitals.get(p.id).hp, 100);
});

// ---------------- 第1弾データからの更新 ----------------
test("第1弾のセーブデータを読み込んでも消えずに移行される", () => {
  const state = JSON.parse(fs.readFileSync(new URL("./fixtures/v1-state.json", import.meta.url), "utf8"));
  const backend = memoryBackend(new Map(Object.entries(state.world)));
  const app = createApp(backend, () => 0);
  app.worldService.load();
  assert.equal(app.worldService.world.story.chapter, 1);
  const ids = Object.keys(state.players);
  const ps = ids.map((id, i) => {
    const p = fakePlayer(id, `勇者${"ABC"[i]}`, new Map(Object.entries(state.players[id].props)));
    joinPlayer(app, p);
    return p;
  });
  const [a, b, c] = ps.map((p) => app.playerService.dataFor(p.id));
  assert.equal(a.gold, 500);
  assert.equal(a.settings.saveNotice, true);
  assert.equal(b.exp, 7);
  assert.equal(c.gold, 3);
  assert.equal(a.sessionLog.joinCount, 3);
  for (const d of [a, b, c]) {
    assert.equal(d.level, 1);
    assert.equal(d.stats.mag, 5);
    assert.equal(d.talents.rolled, true);
    assert.equal(d.talents.innate.length, 1);
    assert.equal(d.vitals.mp, d.vitals.mpMax); // 旧MP(10)は新しい最大値で満タンに
    assert.ok(d.vitals.mpMax >= 50);
  }
  const env = app.store.read(`p.${a.uid}`).envelope;
  assert.equal(env.s, 3);
  assert.ok(app.worldService.index.system.versionHistory.some((v) => v.addonVersion === ADDON_VERSION && v.from === "0.1.0"));
});

test("能力値IDの一覧（12種）", () => {
  assert.deepEqual(STAT_IDS, ["str", "vit", "mag", "mnd", "agi", "dex", "luk", "int", "lif", "endr", "foc", "lead"]);
  void computeStats;
});
