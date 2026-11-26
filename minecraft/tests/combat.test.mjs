// 第5弾（v0.5.0）戦闘・属性相性・状態異常の単体テスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, join, stripTalents } from "./rpgHelpers.mjs";
import { computeDamage, elementMultiplier, DAMAGE_TYPES } from "../packs/BP/scripts/combat/damageCalc.js";
import { CombatService } from "../packs/BP/scripts/combat/combatService.js";
import { ELEMENTS, ELEMENT_IDS, ELEMENT_FUSIONS, findFusion, baseAffinity } from "../packs/BP/scripts/content/combat/elements.js";
import { STATUS_EFFECTS, STATUS_IDS } from "../packs/BP/scripts/content/combat/statusEffects.js";
import { ROLE_COMBAT, styleOf } from "../packs/BP/scripts/content/combat/jobCombat.js";
import { BOSS_ABILITIES } from "../packs/BP/scripts/content/combat/bossAbilities.js";
import { gods, GOD_DETAILS, APOSTLE_STAGES } from "../packs/BP/scripts/content/gods.js";
import { skills } from "../packs/BP/scripts/content/skills.js";
import { normalJobs } from "../packs/BP/scripts/content/jobs.js";
import { DEFENSE, COMBO, PARTY_SCALING, COMBAT_LOG, COMBAT } from "../packs/BP/scripts/balance/combat.js";

const prof = (o = {}) => ({ level: 1, element: "none", resist: {}, def: 0, mdef: 0, poise: 30, tags: [], caps: { fixed: 50, percent: 0.05 }, ...o });
const never = () => 0.999;
const always = () => 0;

function setup(n = 1) {
  const c = boot();
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(join(c.app, String(-1 - i), `勇者${"ABCD"[i]}`));
  for (const p of ps) stripTalents(c.app, p.id);
  c.app.combat.rng = never;
  return { ...c, ps, cs: c.app.combat };
}
const mob = (id = "m1", typeId = "minecraft:zombie") => ({ id, typeId, maxHp: 20 });

test("データ：22属性・属性融合12種・状態異常23種・ボス特殊能力10種・役割12→戦闘スタイル", () => {
  assert.equal(ELEMENT_IDS.length, 22);
  assert.equal(ELEMENT_FUSIONS.length, 12);
  assert.equal(STATUS_IDS.length, 23);
  assert.equal(Object.keys(BOSS_ABILITIES).length, 10);
  assert.equal(Object.keys(ROLE_COMBAT).length, 12);
  for (const s of Object.values(STATUS_EFFECTS)) for (const k of ["chance", "duration", "power", "maxStacks", "cure"]) assert.ok(s[k] !== undefined, `${s.name}.${k}`);
  // 上位属性でもすべての属性に勝てない（弱点を突けるのは2〜3属性）
  for (const [id, e] of Object.entries(ELEMENTS)) assert.ok(e.strong.length <= 3, id);
  const styles = new Set(normalJobs().map(styleOf));
  assert.ok(styles.size >= 9);
});

test("ダメージ計算：処理の順番・防御・極端な値でも有限・固定/割合ダメージは敵ごとの上限", () => {
  const r = computeDamage({ derived: { magAtk: 50, critRate: 0 } }, { profile: prof({ mdef: 20, element: "ice" }), maxHp: 200 }, { type: "magical", base: 50, skillMult: 2, elements: ["fire"] }, never);
  assert.deepEqual(r.steps.map((s) => s[0].split(" ")[0]), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]);
  assert.equal(r.elementMult, 1.5); // 火→氷は弱点
  assert.ok(r.damage > 0 && r.damage < 150);
  for (const bad of [Infinity, NaN, 1e308, -5]) {
    const x = computeDamage({ derived: { physAtk: bad, critRate: bad, critMultiplier: bad } }, { profile: prof({ def: bad }) }, { base: bad, skillMult: bad, special: bad }, always);
    assert.ok(Number.isFinite(x.damage) && x.damage >= 0 && x.damage <= COMBAT.maxDamage, String(bad));
  }
  const fixed = computeDamage({ derived: {} }, { profile: prof({ caps: { fixed: 30, percent: 0.02 } }), maxHp: 10000 }, { type: "fixed", fixed: 9999 }, never);
  assert.equal(fixed.damage, 30);
  const pct = computeDamage({ derived: {} }, { profile: prof({ caps: { fixed: 30, percent: 0.02 } }), maxHp: 10000 }, { type: "percent", percent: 0.5 }, never);
  assert.equal(pct.damage, 200);
  assert.equal(Object.keys(DAMAGE_TYPES).length, 10);
});

test("属性相性：倍率6段階・敵ごとの上書き・複数属性は平均（過剰な重複なし）・上限2.0", () => {
  assert.equal(baseAffinity("fire", "fire"), "resist");
  assert.equal(elementMultiplier(["water"], prof({ resist: { water: "major_weak" } })).mult, 2);
  assert.equal(elementMultiplier(["poison"], prof({ resist: { poison: "immune" } })).mult, 0);
  assert.equal(elementMultiplier(["fire"], prof({ resist: { fire: "strong_resist" } })).mult, 0.25);
  assert.equal(elementMultiplier(["fire", "ice"], prof({ resist: { fire: "major_weak", ice: "major_weak" } })).mult, 2); // 2×2 にならない
  assert.equal(elementMultiplier(["thunder"], prof({ resist: { thunder: "major_weak" } }), { elementWeak: { thunder: 1.25 }, elementTaken: 0.5 }).mult, 2);
});

test("属性融合：定義済みの組み合わせだけ・別の属性で続けて攻撃すると発生", () => {
  assert.equal(findFusion("fire", "wind").id, "flame_tornado");
  assert.equal(findFusion("wind", "fire").id, "flame_tornado");
  assert.equal(findFusion("fire", "fire"), null);
  assert.equal(findFusion("fire", "holy"), null);
  const { cs, ps: [a, b] } = setup(2);
  cs.playerAttack(a.id, mob(), { type: "elemental", base: 20, elements: ["water"] });
  const r = cs.playerAttack(b.id, mob(), { type: "elemental", base: 20, elements: ["thunder"] });
  assert.equal(r.fusion.id, "electro_chain");
  assert.equal(cs.playerAttack(a.id, mob(), { type: "elemental", base: 20, elements: ["thunder"] }).fusion, null); // 一度使うとリセット
});

test("状態異常：付与・重複上限・解除・完全無効・ボスは累積耐性で行動不能にできない", () => {
  const { cs } = setup();
  cs.rng = always;
  for (let i = 0; i < 6; i++) cs.applyStatus("m1", "burn", { source: "p" });
  assert.equal(cs.statusesOf("m1").burn.stacks, 3);
  assert.equal(cs.applyStatus("m1", "wet", {}), true);
  assert.equal(cs.statusesOf("m1").burn, undefined); // 水濡れで火傷が消える
  assert.equal(cs.applyStatus("m2", "burn", { tags: ["burn_immune"] }), false);
  // ボス：確率半減・行動妨害は最長40tick・付与するたびに効果時間が短くなる
  const durs = [];
  for (let i = 0; i < 4; i++) {
    cs.status.delete("boss");
    cs.status.set("boss", { list: {}, tol: cs.status.get("boss")?.tol || {} });
  }
  const t0 = cs.nowTick();
  let tol = {};
  for (let i = 0; i < 4; i++) {
    cs.status.set("boss", { list: {}, tol });
    cs.applyStatus("boss", "sleep", { boss: true, force: true });
    durs.push(cs.statusesOf("boss").sleep.until - t0);
    tol = cs.status.get("boss").tol;
  }
  assert.ok(durs[0] <= 40 && durs[3] < durs[0], durs.join(","));
  assert.equal(cs.cure("boss", "hit"), 1); // 睡眠は攻撃で解除
  cs.applyStatus("x", "skill_seal", { force: true });
  assert.equal(cs.canUseSkill("x", null).reason, "スキル封印");
});

test("ガード・ジャストガード・回避・ジャスト回避・反撃・無限回避の防止", () => {
  const { app, tickRef, cs, ps: [a] } = setup();
  const v = app.vitals;
  const full = () => app.playerService.update(a.id, (d) => ((d.vitals.stamina = d.vitals.staminaMax), (d.vitals.exhausted = false)));
  full();
  assert.equal(cs.incoming(a.id, mob(), 4, v).outcome, "hit");
  cs.startGuard(a.id);
  const jg = cs.incoming(a.id, mob(), 4, v);
  assert.equal(jg.outcome, "just_guard");
  assert.ok(jg.keep <= 0.1 + 1e-9);
  tickRef.t += DEFENSE.justGuardWindow + 1;
  const g = cs.incoming(a.id, mob(), 4, v);
  assert.equal(g.outcome, "guard");
  assert.ok(g.keep > jg.keep && g.keep < 1);
  cs.stopGuard(a.id);
  full();
  assert.equal(cs.tryDodge(a.id, v).ok, true);
  assert.equal(cs.incoming(a.id, mob(), 4, v).outcome, "just_dodge");
  assert.equal(cs.tryDodge(a.id, v).reason, "回避の再使用待ち");
  tickRef.t += DEFENSE.dodgeWindow + 1;
  assert.equal(cs.incoming(a.id, mob(), 4, v).outcome, "hit"); // 無敵時間が切れた
  // 反撃：ジャスト回避の直後は1.5倍（反撃できる時間を過ぎると通常）
  tickRef.t += DEFENSE.counterWindow;
  const r = cs.playerAttack(a.id, mob("m9"), { type: "physical", base: 20 });
  assert.equal(r.counter, false); // 反撃時間を過ぎている
  tickRef.t += DEFENSE.dodgeCooldown;
  cs.tryDodge(a.id, v);
  cs.incoming(a.id, mob(), 4, v);
  assert.equal(cs.playerAttack(a.id, mob("m9"), { type: "physical", base: 20 }).counter, true);
  // スタミナが無いと回避できない
  tickRef.t += DEFENSE.dodgeCooldown;
  app.playerService.update(a.id, (d) => (d.vitals.stamina = 0));
  assert.equal(cs.tryDodge(a.id, v).ok, false);
});

test("コンボ：段数で威力が上がる・同じ技の繰り返しは数えない・時間切れでリセット", () => {
  const { tickRef, cs, ps: [a] } = setup();
  let last;
  for (let i = 0; i < 6; i++) {
    tickRef.t += 5;
    last = cs.playerAttack(a.id, mob(), { type: "physical", base: 20, skillId: "same" });
  }
  assert.equal(last.combo, COMBO.sameSkillLimit);
  const ids = ["a", "b", "c", "d", "e", "f"];
  for (const id of ids) {
    tickRef.t += 5;
    last = cs.playerAttack(a.id, mob(), { type: "physical", base: 20, skillId: id });
  }
  assert.equal(last.combo, COMBO.sameSkillLimit + ids.length);
  tickRef.t += COMBO.windowTicks + 1;
  assert.equal(cs.playerAttack(a.id, mob(), { type: "physical", base: 20, skillId: "a" }).combo, 1);
});

test("ヘイト：盾役はヘイトを集めやすい・挑発・回復・ちらつき防止・敵ごとの優先条件", () => {
  const { app, cs, ps: [a, b] } = setup(2);
  app.jobs.changeJob(a.id, "warrior.priest", { force: true });
  for (let i = 0; i < 3; i++) cs.playerAttack(b.id, mob("z"), { type: "physical", base: 30, skillId: `s${i}` });
  const cand = [{ pid: a.id, distance: 6, hpRatio: 1 }, { pid: b.id, distance: 6, hpRatio: 0.2 }];
  assert.equal(cs.chooseTarget("z", cand).target, b.id);
  cs.provoke("z", a.id);
  assert.equal(cs.chooseTarget("z", cand).target, a.id);
  // 蜘蛛は HP の低い人を狙う
  cs.playerAttack(a.id, mob("s", "minecraft:spider"), { type: "physical", base: 30 });
  assert.equal(cs.chooseTarget("s", cand).target, b.id);
  cs.onHeal(b.id, 100);
  assert.ok(cs.enemies.get("z").hate.get(b.id) > 0);
});

test("体勢崩し・部位破壊（防御低下・能力停止・新しい弱点）", () => {
  const { cs, ps: [a] } = setup();
  cs.overrides.set("dummy", { profileId: "noguchi:training_dummy" });
  let broke = false;
  for (let i = 0; i < 20 && !broke; i++) broke = cs.playerAttack(a.id, { id: "dummy", typeId: "minecraft:zombie", maxHp: 20 }, { type: "physical", base: 200, skillId: `k${i}`, poise: 30 }).broke;
  assert.ok(broke);
  const e = cs.enemies.get("dummy");
  assert.ok(e.brokenUntil > cs.nowTick());
  let part = null;
  for (let i = 0; i < 20 && !part; i++) part = cs.playerAttack(a.id, { id: "dummy", typeId: "x" }, { type: "elemental", base: 100, elements: ["thunder"], partId: "head", skillId: `p${i}` }).partBroken;
  assert.equal(part.id, "head");
  assert.ok(e.defDown > 0 && e.profile.resist.fire === "weak");
  for (let i = 0; i < 20 && !e.parts.arm.broken; i++) cs.playerAttack(a.id, { id: "dummy", typeId: "x" }, { type: "physical", base: 200, partId: "arm", skillId: `q${i}` });
  assert.ok(e.disabled.has("smash"));
});

test("参加人数の補正：敵の実効HPは 100/160/220/280%。攻撃力は人数に比例しない", () => {
  assert.deepEqual(PARTY_SCALING.hp, { 1: 1, 2: 1.6, 3: 2.2, 4: 2.8 });
  const outs = [];
  for (const n of [1, 2, 3, 4]) {
    const { cs, ps: [a] } = setup();
    cs.partyCount = () => n;
    outs.push(cs.playerAttack(a.id, mob(`n${n}`), { type: "fixed", fixed: 20 }).vanilla);
  }
  assert.ok(Math.abs(outs[0] / outs[3] - 2.8) < 0.05, outs.join(","));
  assert.ok(Object.values(PARTY_SCALING.attack).every((v) => v === 1));
});

test("職業の特性：射撃は距離、魔法は同じ属性の連続、暗殺は狙われていない敵に強い", () => {
  const { app, cs, ps: [a] } = setup();
  app.jobs.changeJob(a.id, "thief", { force: true }); // 盗賊（技巧または射撃）
  const near = cs.playerAttack(a.id, { ...mob("d1"), distance: 1 }, { type: "physical", base: 50, skillId: "x1" }).damage;
  const far = cs.playerAttack(a.id, { ...mob("d2"), distance: 20 }, { type: "physical", base: 50, skillId: "x2" }).damage;
  const job = normalJobs().find((j) => j.id === "thief");
  if (job.role === "marksman") assert.ok(far > near);
  else assert.ok(far >= near * 0.9);
});

test("戦闘ログ：件数に上限・戦闘不能の原因・戦闘終了で戦闘中だけの効果を解除", () => {
  const { app, tickRef, cs, ps: [a] } = setup();
  for (let i = 0; i < COMBAT_LOG.keepBattles + 3; i++) {
    cs.playerAttack(a.id, mob(`l${i}`), { type: "physical", base: 20, skillId: "fire_ball" });
    tickRef.t += 1000;
    cs.tick();
  }
  const d = app.playerService.dataFor(a.id);
  assert.equal(d.combatLog.battles.length, COMBAT_LOG.keepBattles);
  assert.equal(d.combatLog.totals.battles, COMBAT_LOG.keepBattles + 3);
  assert.ok(d.combatLog.battles[0].skills.fire_ball >= 1);
  app.stats.addBuff(a.id, { id: "combat:x", source: "combat", derived: { flat: { moveSpeed: 0.1 } }, durationTicks: 99999 });
  cs.incoming(a.id, mob(), 5);
  cs.onDefeat(a.id, { cause: "entityAttack", by: "minecraft:zombie", statuses: ["poison"] });
  const d2 = app.playerService.dataFor(a.id);
  assert.equal(d2.combatLog.lastDefeat.by, "minecraft:zombie");
  assert.ok(!d2.buffs.some((b) => b.source === "combat"));
});

test("状態異常でスキルが使えない（スキル封印・沈黙）・スキル発動と連携", () => {
  const { app, tickRef, cs, ps: [a] } = setup();
  app.skillBindings.runner = () => ({ hits: 1 });
  app.skillService.grant(a.id, "fire_ball");
  app.skillBindings.bind(a.id, 0, "tap", "fire_ball");
  app.playerService.update(a.id, (d) => (d.vitals.mp = d.vitals.mpMax));
  cs.applyStatus(a.id, "silence", { force: true });
  assert.equal(app.skillBindings.tryActivate(a.id, 0, "tap", a).reason, "沈黙（魔法不可）");
  cs.cure(a.id, "cleanse");
  tickRef.t += 10;
  assert.equal(app.skillBindings.tryActivate(a.id, 0, "tap", a).ok, true);
});

test("神々：試練・使徒能力・報酬装備（24柱）・使徒能力5段階×24＝120・信仰Lv1/10/20/30/50", () => {
  assert.equal(Object.keys(GOD_DETAILS).length, 24);
  for (const g of gods.all()) for (const k of ["trial", "ability", "artifact", "equipment", "power"]) assert.ok(GOD_DETAILS[g.id][k], `${g.id}.${k}`);
  assert.deepEqual(APOSTLE_STAGES, [1, 10, 20, 30, 50]);
  const ap = skills.all().filter((s) => s.category === "apostle");
  assert.equal(ap.length, 120);
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => skills.get(`apostle.fudonius.${n}`).name), ["時の加護", "時間加速", "時間遅延", "時間逆行", "時界支配"]);
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => skills.get(`apostle.kenjios.${n}`).name), ["戦意", "闘気解放", "戦神の鼓動", "超越闘気", "戦域支配"]);
  assert.equal(skills.get("apostle.nomuradia.5").name, "魂の共鳴領域");
  assert.equal(skills.get("apostle.fudonius.5").effect.type, "rewind");
  assert.equal(skills.get("apostle.komjina.5").effect.type, "shield"); // 黄金創造は金貨を生まない
});

test("使徒になっても職業を失わない・信仰Lv50で最終段階・解除で完全消失", () => {
  const { app, ps: [a] } = setup();
  app.jobs.changeJob(a.id, "mage", { force: true });
  app.faith.setLevel(a.id, "fudonius", 50);
  app.apostles.contract(a.id, "fudonius", { force: true });
  const d = app.playerService.dataFor(a.id);
  assert.equal(d.job.current, "mage");
  assert.equal(Object.keys(d.apostle.skills).length, 5);
  app.apostles.resign(a.id);
  assert.deepEqual(app.playerService.dataFor(a.id).apostle.skills, {});
  assert.equal(app.playerService.dataFor(a.id).job.current, "mage");
});
