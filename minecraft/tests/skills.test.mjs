// 第4弾（v0.4.0）スキル・魔法・必殺技・熟練度・神々・信仰・使徒の単体テスト（第28章のテスト項目）
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { boot, join, stripTalents, memoryBackend, fakePlayer } from "./rpgHelpers.mjs";
import { createApp, joinPlayer } from "../packs/BP/scripts/app.js";
import { skills, fusionRecipes, isConnected } from "../packs/BP/scripts/content/skills.js";
import { validateSkills } from "../packs/BP/scripts/content/skills/validateSkills.js";
import { gods } from "../packs/BP/scripts/content/gods.js";
import { normalJobs } from "../packs/BP/scripts/content/jobs.js";
import { resolveAction } from "../packs/BP/scripts/input/inputResolver.js";
import { INPUT } from "../packs/BP/scripts/balance/input.js";
import { PROFICIENCY_GAIN } from "../packs/BP/scripts/balance/skills.js";
import { skillStats, proficiencyToNext, usability } from "../packs/BP/scripts/skills/skillRules.js";
import { ADDON_VERSION } from "../packs/BP/scripts/config.js";

/** 効果の型の共通処理の代わり（ゲーム側の処理はモックエンジンの統合テストで確認） */
function fakeRunner(hits = 1) {
  const calls = [];
  const fn = (player, def, stats, info) => {
    calls.push({ id: def.id, power: stats.power, linked: info.linked, player: info.playerId });
    return { hits };
  };
  fn.calls = calls;
  return fn;
}

function setup(n = 1) {
  const ctx = boot();
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(join(ctx.app, String(-1 - i), `勇者${"ABCD"[i]}`));
  for (const p of ps) stripTalents(ctx.app, p.id);
  ctx.app.skillBindings.runner = fakeRunner();
  return { ...ctx, ps };
}

const learn = (app, p, id) => app.skillService.grant(p.id, id);
const fullMp = (app, p) => app.playerService.update(p.id, (d) => ((d.vitals.mp = d.vitals.mpMax), (d.vitals.stamina = d.vitals.staminaMax), (d.vitals.exhausted = false)));

test("v0.4.0：バージョン", () => {
  assert.match(ADDON_VERSION, /^0\.[4-9]\./); // 第4弾以降
});

// ---------------- データ ----------------
test("スキルデータの自動検証：1,000種類以上が効果に接続済み・全項目合格", () => {
  const r = validateSkills();
  assert.equal(r.ok, true, r.errors.slice(0, 5).join("\n"));
  assert.ok(r.stats.connected >= 1000);
  assert.equal(skills.all().filter(isConnected).length, skills.size);
  for (const c of r.checks) assert.ok(c.ok, c.name);
});

test("全484職業：専用スキルと奥義（第5次324種は固有の奥義・IDは第3弾のまま）", () => {
  const n = normalJobs();
  assert.equal(n.length, 484);
  for (const j of n) {
    assert.ok(skills.get(j.skills[0].id), j.id);
    assert.equal(skills.get(j.ultimate.id).name, j.ultimate.name);
  }
  const ult = n.filter((j) => j.tier === 5).map((j) => skills.get(j.ultimate.id));
  assert.equal(ult.length, 324);
  assert.ok(ult.every((s) => s.category === "ultimate" && s.actions.join() === "ultimate"));
});

test("神々24柱（名前・英語・司る力・性別は指示書のとおり。男13・女11）", () => {
  assert.equal(gods.size, 24);
  const t = gods.get("takaphides");
  assert.deepEqual([t.name, t.en, t.domain, t.gender], ["タカフィデス", "Takaphides", "太陽", "male"]);
  const g = gods.get("gokitalis");
  assert.deepEqual([g.name, g.en, g.domain, g.gender], ["ゴキタリス", "Gokitalis", "夢", "male"]);
  assert.equal(gods.all().filter((x) => x.gender === "female").length, 11);
});

// ---------------- 習得 ----------------
test("習得：レベル・スキルポイント・隠し条件（行動でひらめく）", () => {
  const { app, ps: [a] } = setup();
  assert.ok(!app.skillService.isLearned(a.id, "fire_ball"));
  app.progression.setLevel(a.id, 2);
  app.skillService.evaluate(a.id);
  assert.ok(app.skillService.isLearned(a.id, "fire_ball")); // レベル2で習得
  const d = app.playerService.dataFor(a.id);
  assert.ok(d.skills.points >= 1); // プレイヤーLv2 → 1ポイント
  // スキルポイントで習得
  const sp = skills.all().find((s) => s.learn.length === 1 && s.learn[0].method === "skillPoint");
  app.progression.setLevel(a.id, 50);
  app.playerService.update(a.id, (x) => (x.skills.points = 10));
  assert.equal(app.skillService.learnWithSp(a.id, sp.id).ok, true);
  assert.equal(app.skillService.learnWithSp(a.id, sp.id).reason, "習得済み");
  // 隠し：夜に魔物を150体倒すと「夜目」
  app.actions.record(a.id, "kill.night", 150);
  app.actions.flushPending();
  assert.ok(app.skillService.isLearned(a.id, "night_eye"));
  assert.ok(app.playerService.dataFor(a.id).skills.discovered.includes("night_eye"));
});

test("スキルポイント：既存プレイヤーにはこれまでのレベル分を1回だけ付与", () => {
  const { app, ps: [a] } = setup();
  app.progression.setLevel(a.id, 20);
  app.skillService.evaluate(a.id);
  const d = app.playerService.dataFor(a.id);
  const got = d.skills.pointsEarned;
  assert.equal(got, 19);
  app.skillService.evaluate(a.id);
  assert.equal(app.playerService.dataFor(a.id).skills.pointsEarned, got); // 二重に付与しない
});

// ---------------- 割り当て・操作・消費・クールタイム ----------------
test("割り当て：未習得・操作の不一致・パッシブは不可。操作ごとに別の技が出る", () => {
  const { app, tickRef, ps: [a] } = setup();
  const sb = app.skillBindings;
  assert.equal(sb.bind(a.id, 0, "tap", "fire_ball").reason, "未習得のスキル");
  for (const id of ["fire_ball", "big_fire_ball", "dash", "vitality_up"]) learn(app, a, id);
  assert.equal(sb.bind(a.id, 0, "ultimate", "fire_ball").reason, "その操作には割り当てられない");
  assert.equal(sb.bind(a.id, 0, "tap", "vitality_up").ok, false); // パッシブ
  assert.equal(sb.bind(a.id, 0, "tap", "fire_ball").ok, true);
  assert.equal(sb.bind(a.id, 0, "charge", "big_fire_ball").ok, true);
  assert.equal(sb.bind(a.id, 0, "sprint", "dash").ok, true);
  const base = { holdTicks: 0, sneaking: false, sneakTicks: 0, airborne: false, sprinting: false };
  const used = [];
  for (const input of [base, { ...base, sprinting: true }, { ...base, sneaking: true, sneakTicks: INPUT.chargeTicks }]) {
    fullMp(app, a);
    tickRef.t += 200;
    const r = resolveAction(input);
    const res = sb.tryActivate(a.id, 0, r.action, a);
    if (res.casting) {
      tickRef.t += res.casting;
      sb.updateCasts(() => a);
    }
    used.push(sb.lastResult.get(a.id).ok ? r.action : `×${r.action}`);
  }
  assert.deepEqual(used, ["tap", "sprint", "charge"]);
  assert.deepEqual(sb.runner.calls.map((c) => c.id), ["fire_ball", "dash", "big_fire_ball"]);
});

test("消費・クールタイム・MP不足・連続使用の防止（不発のときは消費しない）", () => {
  const { app, tickRef, ps: [a] } = setup();
  const sb = app.skillBindings;
  learn(app, a, "fire_ball");
  sb.bind(a.id, 0, "tap", "fire_ball");
  fullMp(app, a);
  const mp0 = app.playerService.dataFor(a.id).vitals.mp;
  assert.equal(sb.tryActivate(a.id, 0, "tap", a).ok, true);
  assert.equal(app.playerService.dataFor(a.id).vitals.mp, mp0 - 6);
  assert.equal(sb.tryActivate(a.id, 0, "tap", a).reason, "連続使用不可");
  tickRef.t += INPUT.globalCooldownTicks;
  assert.equal(sb.tryActivate(a.id, 0, "tap", a).reason, "クールタイム中");
  assert.equal(app.playerService.dataFor(a.id).vitals.mp, mp0 - 6);
  tickRef.t += 30;
  app.playerService.update(a.id, (d) => (d.vitals.mp = 3));
  assert.equal(sb.tryActivate(a.id, 0, "tap", a).reason, "MPまたはスタミナが足りない");
  assert.equal(app.playerService.dataFor(a.id).vitals.mp, 3);
});

test("詠唱：完了時に発動・持ち替えで中断（消費なし）", () => {
  const { app, tickRef, ps: [a] } = setup();
  const sb = app.skillBindings;
  learn(app, a, "lightning_strike"); // 詠唱10tick
  sb.bind(a.id, 1, "charge", "lightning_strike");
  fullMp(app, a);
  const mp0 = app.playerService.dataFor(a.id).vitals.mp;
  const r = sb.tryActivate(a.id, 1, "charge", a);
  assert.ok(r.casting > 0);
  assert.equal(sb.tryActivate(a.id, 1, "charge", a).reason !== undefined, true);
  tickRef.t += r.casting;
  sb.updateCasts(() => a, () => false); // 持ち替えた
  assert.equal(app.playerService.dataFor(a.id).vitals.mp, mp0);
  assert.equal(sb.runner.calls.length, 0);
  tickRef.t += 10;
  const r2 = sb.tryActivate(a.id, 1, "charge", a);
  tickRef.t += r2.casting;
  sb.updateCasts(() => a, () => true);
  assert.equal(sb.runner.calls.length, 1);
  assert.ok(app.playerService.dataFor(a.id).vitals.mp < mp0);
});

// ---------------- 熟練度・成長 ----------------
test("熟練度：命中で上がりレベルアップ。連打・範囲・放置で無限に稼げない", () => {
  const { app, tickRef, ps: [a] } = setup();
  const ss = app.skillService;
  learn(app, a, "fire_ball");
  const r1 = ss.gainProficiency(a.id, "fire_ball", { hits: 50 });
  assert.equal(r1.gained, PROFICIENCY_GAIN.maxHitsCounted * PROFICIENCY_GAIN.perHit); // 1回で数える命中は5体まで
  assert.equal(ss.gainProficiency(a.id, "fire_ball", { hits: 1 }).reason, "間隔が短すぎる");
  // 訓練：訓練場が無いと得られない
  tickRef.t += 100;
  assert.equal(ss.gainProficiency(a.id, "fire_ball", { practice: true }).reason, "訓練場が未解放");
  app.worldService.updateWorld((w) => (w.kingdom.facilities.training = { unlockedAt: 1 }));
  let got = 0;
  for (let i = 0; i < 100; i++) {
    tickRef.t += PROFICIENCY_GAIN.minIntervalTicks;
    got += ss.gainProficiency(a.id, "fire_ball", { practice: true }).gained;
    if (tickRef.t % 24000 < PROFICIENCY_GAIN.minIntervalTicks) break;
  }
  assert.ok(got <= PROFICIENCY_GAIN.practicePerDay * PROFICIENCY_GAIN.practice, `訓練 ${got}`);
  // レベルアップ：必要量をためると上がり、性能が変わる
  const before = skillStats(skills.get("fire_ball"), { level: 1 }, app.playerService.dataFor(a.id));
  for (let i = 0; i < 40; i++) {
    tickRef.t += PROFICIENCY_GAIN.minIntervalTicks;
    ss.gainProficiency(a.id, "fire_ball", { hits: 5 });
  }
  const rec = app.playerService.dataFor(a.id).skills.learned.fire_ball;
  assert.ok(rec.level > 1);
  const after = skillStats(skills.get("fire_ball"), rec, app.playerService.dataFor(a.id));
  assert.ok(after.power > before.power && after.cooldown <= before.cooldown && after.mp <= before.mp);
  assert.ok(proficiencyToNext(2) > proficiencyToNext(1));
});

// ---------------- 進化・融合 ----------------
test("進化：分岐は1つだけ選べ、元のスキルは残る", () => {
  const { app, ps: [a] } = setup();
  const ss = app.skillService;
  learn(app, a, "fire_ball");
  assert.equal(ss.evolve(a.id, "fire_ball", "big_fire_ball").reason, "進化の条件を満たしていない");
  ss.setLevel(a.id, "fire_ball", 10);
  app.actions.record(a.id, "skill.hit", 300);
  const opts = ss.evolutionOptions(a.id, "fire_ball");
  assert.deepEqual(opts.map((o) => o.to), ["big_fire_ball", "homing_fire_ball"]);
  assert.ok(opts.every((o) => o.can));
  assert.equal(ss.evolve(a.id, "fire_ball", "homing_fire_ball").ok, true);
  assert.equal(ss.evolve(a.id, "fire_ball", "big_fire_ball").ok, false); // 別の分岐は選べない
  const d = app.playerService.dataFor(a.id);
  assert.ok(d.skills.learned.fire_ball && d.skills.learned.homing_fire_ball && !d.skills.learned.big_fire_ball);
  assert.equal(d.skills.evolutions.length, 1);
});

test("融合：定義済みの組み合わせだけ・融合元は残る・才能が必要な組み合わせ", () => {
  const { app, ps: [a] } = setup();
  const ss = app.skillService;
  for (const id of ["fire_ball", "wind_blade", "healing_circle", "focus_prayer"]) learn(app, a, id);
  assert.equal(ss.fuse(a.id, "fusion.flame_tornado").reason, "融合の条件を満たしていない");
  ss.setLevel(a.id, "fire_ball", 5);
  ss.setLevel(a.id, "wind_blade", 5);
  assert.equal(ss.fuse(a.id, "fusion.flame_tornado").ok, true);
  assert.equal(ss.fuse(a.id, "fusion.flame_tornado").reason, "融合済み");
  assert.equal(ss.fuse(a.id, "fusion.unknown").reason, "その組み合わせでは融合できない");
  const d = app.playerService.dataFor(a.id);
  assert.ok(d.skills.learned.fire_ball && d.skills.learned.wind_blade && d.skills.learned.flame_tornado);
  ss.setLevel(a.id, "healing_circle", 8);
  ss.setLevel(a.id, "focus_prayer", 8);
  assert.equal(ss.fuse(a.id, "fusion.life_link").ok, false); // 才能（回復・意志・生命の系統）がない
  assert.ok(fusionRecipes.size >= 12);
});

// ---------------- 職業 ----------------
test("職業による制限・転職後も記録は残る・引き継ぎは条件と上限つき・奥義は引き継げない", () => {
  const { app, ps: [a] } = setup();
  const ss = app.skillService;
  app.progression.setLevel(a.id, 30);
  app.jobs.changeJob(a.id, "warrior", { force: true });
  app.jobs.setJobLevel(a.id, 999); // 職業レベル上限
  const sig = "skill.warrior.signature";
  const ult = "skill.warrior.ultimate";
  assert.ok(ss.isLearned(a.id, sig));
  assert.ok(ss.isLearned(a.id, ult)); // 職業レベル上限で秘技
  assert.equal(app.skillBindings.bind(a.id, 0, "charge", sig).ok, true);
  assert.equal(app.skillBindings.bind(a.id, 0, "ultimate", ult).ok, true);
  assert.equal(ss.canUse(a.id, sig).ok, true);
  // 魔法使いに転職：戦士の秘技は使えない。専用技は「剣」を扱わない職業では使えない
  app.jobs.changeJob(a.id, "mage", { force: true });
  assert.equal(ss.canUse(a.id, ult).ok, false);
  assert.equal(ss.isLearned(a.id, sig), true); // 習得記録は残る
  const d = app.playerService.dataFor(a.id);
  assert.equal(usability(skills.get(ult), d).ok, false);
  // 戦士に戻ると使える
  app.jobs.changeJob(a.id, "warrior", { force: true });
  assert.equal(ss.canUse(a.id, ult).ok, true);
});

// ---------------- 信仰・使徒 ----------------
test("信仰：行動・属性スキルで自然に上がる（神ごとに条件が違う）。複数の神を同時に育てられる", () => {
  const { app, tickRef, ps: [a] } = setup();
  for (let i = 0; i < 200; i++) {
    tickRef.t += 50;
    app.actions.record(a.id, "move.distance", 10); // 空気（コムーロア）・自然（カナスティア）
    app.faith.onSkillUsed(a.id, skills.get("fire_ball")); // 炎（タケリウス）・太陽（タカフィデス）
  }
  const d = app.playerService.dataFor(a.id);
  for (const g of ["komuroa", "kanastia", "takerius", "takaphides"]) assert.ok(d.faith[g].level >= 1, g);
  assert.equal(d.faith.hagerion, undefined);
  // 信仰レベル3で加護（通常スキル）を習得
  app.faith.setLevel(a.id, "takerius", 3);
  assert.ok(app.skillService.isLearned(a.id, "blessing.takerius"));
});

test("使徒：条件・1柱1人・1人1柱・交代・解除で使徒の力が完全に消え、通常スキルと信仰は残る・再契約は成長を戻さない", () => {
  const { app, ps: [a, b] } = setup(2);
  const ap = app.apostles;
  const god = "takerius";
  assert.match(ap.contract(a.id, god).reason, /信仰レベル/);
  app.faith.setLevel(a.id, god, 12);
  assert.match(ap.contract(a.id, god).reason, /承認/);
  app.actions.setFlag(a.id, `god:${god}:approval`);
  assert.equal(ap.contract(a.id, god).ok, true);
  let da = app.playerService.dataFor(a.id);
  assert.deepEqual(Object.keys(da.apostle.skills).sort(), ["apostle.takerius.1", "apostle.takerius.2"]); // 信仰12：印・御手
  assert.ok(da.titles.owned.includes(`apostle:${god}`));
  assert.equal(ap.contract(a.id, "kotarion", { force: true }).reason, "すでに別の神の使徒（1人1柱まで）");
  // B は同じ神の使徒になれない
  app.faith.setLevel(b.id, god, 12);
  app.actions.setFlag(b.id, `god:${god}:approval`);
  assert.match(ap.contract(b.id, god).reason, /すでに使徒がいる/);
  // A：使徒スキルを割り当て・プリセット・レベルアップ
  learn(app, a, "fire_ball");
  app.skillBindings.bind(a.id, 0, "charge", "apostle.takerius.1");
  app.skillBindings.bind(a.id, 0, "tap", "fire_ball");
  app.skillService.savePreset(a.id, 0, "使徒");
  app.skillService.setLevel(a.id, "apostle.takerius.1", 7);
  app.stats.addBuff(a.id, { id: "skill:apostle.takerius.2", source: "apostle:takerius", derived: { pct: { physAtk: 10 } }, durationTicks: 9999 });
  // 信仰が上がると第3段階へ進化
  app.faith.setLevel(a.id, god, 20);
  assert.ok(app.playerService.dataFor(a.id).apostle.skills["apostle.takerius.3"]);
  // 自主的な解除
  assert.equal(ap.resign(a.id).ok, true);
  da = app.playerService.dataFor(a.id);
  assert.equal(da.apostle.god, null);
  assert.deepEqual(da.apostle.skills, {});
  assert.equal(da.skillBindings.slots[0].charge, null);
  assert.equal(da.skillBindings.slots[0].tap, "fire_ball"); // 通常スキルは残る
  assert.equal(da.skills.presets[0].slots[0].charge, null);
  assert.equal(da.skills.presets[0].slots[0].tap, "fire_ball");
  assert.ok(!da.titles.owned.includes(`apostle:${god}`));
  assert.ok(!da.buffs.some((x) => x.source === "apostle:takerius"));
  assert.equal(da.faith[god].level, 20); // 信仰レベルは残る
  assert.ok(da.skills.learned.fire_ball);
  assert.equal(app.skillBindings.bind(a.id, 0, "charge", "apostle.takerius.1").reason, "未習得のスキル"); // 解除後は使えない
  assert.equal(app.skillService.canUse(a.id, "apostle.takerius.1").ok, false);
  assert.equal(app.ctxWorld?.apostles?.[god], undefined);
  assert.equal(app.worldService.world.apostles[god], undefined);
  // 再契約：現在の信仰レベルから新しく付与（以前のレベル7は戻らない）
  assert.equal(ap.contract(a.id, god).ok, true);
  da = app.playerService.dataFor(a.id);
  assert.equal(Object.keys(da.apostle.skills).length, 3);
  assert.equal(da.apostle.skills["apostle.takerius.1"].level, 1);
  // 神が新しい使徒を選ぶ：B の信仰が十分に高い → 打診 → 受諾で交代（A の力は消える）
  app.faith.setLevel(a.id, god, 10);
  app.faith.setLevel(b.id, god, 15);
  assert.deepEqual(ap.offers(b.id), [god]);
  assert.equal(ap.acceptOffer(b.id, god).ok, true);
  assert.equal(app.worldService.world.apostles[god].name, "勇者B");
  assert.equal(app.playerService.dataFor(a.id).apostle.god, null);
  assert.deepEqual(app.playerService.dataFor(a.id).apostle.skills, {});
  assert.equal(Object.values(app.worldService.world.apostles).filter((x) => x.name === "勇者B").length, 1);
});

test("使徒：不在中に交代・剥奪されても、参加時の整合チェックで使徒の力が消える（長期間の不在だけでは解除しない）", () => {
  const backend = memoryBackend();
  const tick = { t: 0 };
  let { app } = boot(backend, tick);
  const pa = fakePlayer("-1", "勇者A");
  const pb = fakePlayer("-2", "勇者B");
  joinPlayer(app, pa);
  joinPlayer(app, pb);
  app.apostles.contract(pa.id, "ojaria", { force: true });
  app.skillBindings.bind(pa.id, 2, "tap", "apostle.ojaria.1");
  app.playerService.leave(pa.id); // A は退出（長期間不在）
  // 時間がたっても A の契約は残る
  tick.t += 10_000_000;
  assert.equal(app.worldService.world.apostles.ojaria.name, "勇者A");
  // B が交代で使徒になる → 不在の A のデータからも即時に消す
  app.apostles.contract(pb.id, "ojaria", { force: true, replace: true });
  app.flushAll?.();
  app.playerService.flushAll();
  app.worldService.flushAll();
  // 再起動して A が参加
  ({ app } = boot(backend, tick));
  joinPlayer(app, fakePlayer("-1", "勇者A", pa.props));
  const d = app.playerService.dataFor("-1");
  assert.equal(d.apostle.god, null);
  assert.equal(d.skillBindings.slots[2].tap, null);
  // 保存に失敗して A のデータに使徒が残っていた場合も、参加時に消える
  app.playerService.update("-1", (x) => {
    x.apostle.god = "ojaria";
    x.apostle.skills = { "apostle.ojaria.1": { level: 3, exp: 0 } };
  });
  assert.equal(app.apostles.reconcile("-1"), true);
  assert.equal(app.playerService.dataFor("-1").apostle.god, null);
});

// ---------------- マルチプレイ・保存 ----------------
test("マルチプレイ：クールタイム・熟練度・割り当てがプレイヤーごとに別。連携スキルは別の人の直前の技で成立", () => {
  const { app, tickRef, ps: [a, b] } = setup(2);
  const sb = app.skillBindings;
  for (const p of [a, b]) {
    learn(app, p, "fire_ball");
    learn(app, p, "link.element_slash");
    fullMp(app, p);
  }
  sb.bind(a.id, 0, "tap", "fire_ball");
  sb.bind(b.id, 3, "tap", "link.element_slash");
  sb.bind(a.id, 1, "tap", "link.element_slash");
  assert.equal(sb.tryActivate(a.id, 0, "tap", a).ok, true);
  assert.equal(sb.cooldownLeft(b.id, "fire_ball"), 0);
  assert.equal(sb.get(b.id, 0, "tap"), null);
  assert.equal(sb.tryActivate(b.id, 3, "tap", b).linked, true); // A の属性魔法の直後
  tickRef.t += 100;
  assert.equal(sb.tryActivate(a.id, 1, "tap", a).linked, false); // 自分の技では連携しない・時間切れ
  const calls = sb.runner.calls;
  assert.ok(calls[1].power > calls[2].power);
});

test("再ログイン・再起動後もスキル・熟練度・SP・割り当て・プリセット・信仰・使徒が残る", () => {
  const backend = memoryBackend();
  const tick = { t: 0 };
  let { app } = boot(backend, tick);
  const pa = fakePlayer("-1", "勇者A");
  joinPlayer(app, pa);
  app.skillService.grant(pa.id, "fire_ball");
  app.skillService.setLevel(pa.id, "fire_ball", 4);
  app.skillBindings.bind(pa.id, 5, "tap", "fire_ball");
  app.skillService.savePreset(pa.id, 1, "雑魚戦");
  app.skillService.addMastery(pa.id, "magic", "fire", 500);
  app.faith.setLevel(pa.id, "eucalia", 7);
  app.apostles.contract(pa.id, "eucalia", { force: true });
  app.playerService.leave(pa.id);
  app.worldService.flushAll();
  ({ app } = boot(backend, tick));
  joinPlayer(app, fakePlayer("-1", "勇者A", pa.props));
  const d = app.playerService.dataFor("-1");
  assert.equal(d.skills.learned.fire_ball.level, 4);
  assert.equal(d.skillBindings.slots[5].tap, "fire_ball");
  assert.equal(d.skills.presets[1].name, "雑魚戦");
  assert.ok(d.proficiency.magic.fire.level >= 1);
  assert.equal(d.faith.eucalia.level, 7);
  assert.equal(d.apostle.god, "eucalia");
  assert.equal(app.worldService.world.apostles.eucalia.uid, d.uid);
});

test("既存セーブ（v0.3.0）を読み込める：職業・成長を維持し、スキルの項目を補い、スキルポイントを遡って付与", () => {
  const state = JSON.parse(fs.readFileSync(new URL("./fixtures/v030-state.json", import.meta.url), "utf8"));
  const backend = memoryBackend(new Map(Object.entries(state.world)));
  const app = createApp(backend, () => 0);
  app.worldService.load();
  const w = app.worldService.world;
  assert.deepEqual(w.apostles, {});
  assert.equal(w.labyrinths.unlocked, false);
  for (const id of Object.keys(state.players)) {
    const uid = state.players[id].props["mnq:uid"];
    const before = app.store.read(`p.${uid}`).envelope.d;
    const p = fakePlayer(id, id, new Map(Object.entries(state.players[id].props)));
    joinPlayer(app, p);
    const d = app.playerService.dataFor(p.id);
    assert.equal(d.level, before.level);
    assert.equal(d.job.current, before.job.current);
    assert.deepEqual(d.job.levels, before.job.levels);
    assert.deepEqual(d.talents.active.map((x) => x.id), before.talents.active.map((x) => x.id));
    assert.equal(d.apostle.god, null);
    assert.ok(d.skills.pointsEarned >= before.level - 1);
    if (before.job.current !== "unemployed" && before.job.levels[before.job.current].level >= 5) assert.ok(d.skills.learned[`skill.${before.job.current}.signature`], id);
  }
});
