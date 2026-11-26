// 第3弾（v0.3.0）統合シナリオ：v0.2.1 のセーブデータから更新 → 職業メニューで転職・職業融合 → 再起動
import fs from "node:fs";
import assert from "node:assert/strict";
import { world, system, __test, ItemStack } from "@minecraft/server";
import { __ui } from "@minecraft/server-ui";

const [stateFile, phase] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
for (const [k, v] of Object.entries(state.world)) __test.worldProps.set(k, v);
state.expect = state.expect || {};
console.log = () => {};
const logs = [];
console.warn = (...a) => logs.push(a.join(" "));
console.error = (...a) => logs.push("ERROR " + a.join(" "));

await import("../../packs/BP/scripts/main.js");
const { ctx } = await import("../../packs/BP/scripts/core/context.js");
const { getRecentErrors } = await import("../../packs/BP/scripts/core/log.js");
const { totalExpToReach } = await import("../../packs/BP/scripts/progression/levelMath.js");

const everyone = [];
const NAMES = { "-4294967295": "勇者A", "-4294967296": "勇者B", "-4294967297": "勇者C" };
function join(id) {
  const saved = state.players[id] || { props: {}, items: [] };
  const p = __test.addPlayer(id, NAMES[id], saved.props);
  saved.items.forEach((t, i) => t && (p.inventory.slots[i] = new ItemStack(t, 1)));
  everyone.push(p);
  world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });
  return p;
}
const data = (p) => ctx.playerService.dataFor(p.id);
const pick = (i) => ({ canceled: false, selection: i });
const byText = (t) => (f) => {
  const i = f.buttons.findIndex((b) => b.text.includes(t));
  if (i < 0) throw new Error(`ボタン「${t}」がない: ${f.buttons.map((b) => b.text).join(",")}`);
  return pick(i);
};
const queues = new Map();
__ui.responder = (form, player) => {
  const q = queues.get(player.name) || [];
  const r = q.shift();
  if (r === undefined) return { canceled: true, cancelationReason: "UserClosed" };
  return typeof r === "function" ? r(form) : r;
};
const script = (p, list) => queues.set(p.name, [...list]);
const cmd = (p, id, message = "") => system.afterEvents.scriptEventReceive.fire({ id: `noguchi:${id}`, message, sourceEntity: p });
const useBook = (p) => world.afterEvents.itemUse.fire({ source: p, itemStack: p.inventory.slots.find((s) => s && s.typeId === "noguchi:adventurer_book") });
const result = { phase, checks: [] };
const ok = (n) => result.checks.push(n);
async function menu(p, steps) {
  __ui.shown.length = 0;
  script(p, steps);
  await __test.tick(20);
  useBook(p);
  await __test.tick(10);
  return __ui.shown.filter((s) => s.player === p.name);
}

world.afterEvents.worldLoad.fire({});
await __test.tick(1);

if (phase === "jobs") {
  const [a, b, c] = ["-4294967295", "-4294967296", "-4294967297"].map(join);
  for (const p of [a, b, c]) assert.equal(data(p).job.current, "unemployed");
  ok("v0.2.1 のデータを読み込み、全員が無職から開始（初期職業を強制しない）");

  // 職業メニュー：無職の画面には第1次職業4種類が並ぶ
  let shown = await menu(a, [pick(1)]);
  const jobForm = shown[1].form;
  assert.equal(jobForm._title, "職業");
  assert.deepEqual(jobForm.buttons.slice(0, 4).map((x) => x.text.replace(/§./g, "").replace(/^[★✓○・] /, "")), ["第1次職業：戦士", "第1次職業：魔法使い", "第1次職業：盗賊", "第1次職業：僧侶"]);
  ok("職業メニュー：第1次職業4種類を表示");

  // レベル5未満（勇者B）では転職ボタンが出ない
  assert.ok(data(b).level < 5);
  shown = await menu(b, [pick(1), pick(0)]);
  assert.ok(!shown[2].form.buttons.some((x) => x.text.includes("この職業に転職する")));
  assert.ok(shown[2].form._body.includes("✗"));
  ok("条件を満たしていない職業は選択できない（転職ボタンなし・✗表示）");

  // A・B とも Lv5 → 戦士へ（確認画面 → 転職）
  ctx.progression.grantExp(b.id, totalExpToReach(5), { source: "admin", noBonus: true });
  await __test.tick(5);
  for (const p of [a, b]) script(p, [pick(1), pick(0), byText("この職業に転職する"), pick(0)]);
  __ui.shown.length = 0;
  useBook(a);
  useBook(b);
  await __test.tick(15);
  const confirm = __ui.shown.find((s) => s.form.type === "message" && s.player === "勇者A").form;
  assert.equal(confirm._title, "転職の確認");
  assert.ok(confirm._body.includes("能力の変化"));
  assert.equal(data(a).job.current, "warrior");
  assert.equal(data(b).job.current, "warrior");
  assert.ok(a.titles.some((t) => t.title.includes("転職")));
  await __test.tick(15);
  assert.ok(b.actionBar.some((t) => t.includes("戦士 Lv1")));
  ok("確認画面（能力比較）を経て転職・2人同時に同じ職業へ・HUD に職業と職業Lv");

  // 職業経験値：戦闘行動で増える
  a.inventory.slots[5] = new ItemStack("minecraft:iron_sword", 1);
  a.selectedSlotIndex = 5;
  const z = __test.spawnMob("minecraft:zombie");
  __test.hit(a, z);
  await __test.tick(5);
  __test.kill(a, z);
  const jl = data(a).job.levels.warrior;
  assert.ok(jl.level > 1 || jl.exp > 0);
  ok("戦闘行動・討伐で職業経験値を獲得");

  // 職業融合：戦士 Lv15 ＋ 魔法の適性 → 魔剣士
  ctx.progression.setLevel(a.id, 15);
  cmd(a, "joblevel", "15"); // 管理者タグなし → 拒否される
  assert.equal(data(a).job.levels.warrior.level, jl.level);
  a.addTag("noguchi_admin");
  cmd(a, "joblevel", "15");
  assert.equal(data(a).job.levels.warrior.level, 15);
  shown = await menu(a, [pick(1), byText("魔剣士")]);
  assert.ok(!shown[2].form.buttons.some((x) => x.text.includes("この職業に転職する"))); // 魔法の適性が未達
  ctx.playerService.update(a.id, (d) => Object.assign(d.statAllocated, { mag: 6, int: 6 }));
  ctx.stats.recalc(a.id);
  shown = await menu(a, [pick(1), byText("魔剣士"), byText("この職業に転職する"), pick(0)]);
  assert.ok(shown[2].form._body.includes("転職した場合の能力の変化"));
  assert.equal(data(a).job.current, "warrior.mage");
  assert.equal(data(a).level, 15);
  assert.ok(a.titles.some((t) => t.title.includes("職業融合")));
  ok("職業融合：戦士＋魔法の適性 → 魔剣士（プレイヤーレベル維持・融合演出）");

  // 職業融合ツリーをたどる（盗賊系統 → 魔弓士 → 属性弓士）
  shown = await menu(a, [pick(1), byText("職業融合ツリー"), byText("盗賊系統"), byText("魔弓士"), byText("属性弓士")]);
  const titles = shown.map((s) => s.form._title);
  assert.deepEqual(titles.slice(2), ["職業融合ツリー", "盗賊", "魔弓士", "属性弓士"]);
  assert.ok(shown[5].form.buttons.some((x) => x.text.includes("天弓術師")));
  ok("職業融合ツリー：系統 → 段階ごとに進化先3種類をたどれる");

  // 管理者テスト：C を無条件で 僧侶 → 賢者 に
  shown = await menu(a, [
    pick(10), byText("テスト機能"), { canceled: false, formValues: [2] },
    byText("無条件転職"), byText("僧侶系統"), byText("賢者"), byText("無条件で転職"), pick(0), byText("戻る"),
  ]);
  assert.equal(data(c).job.current, "priest.mage");
  ok("管理者テスト：職業ツリーから対象プレイヤーを無条件転職");

  // 一般プレイヤーには管理者用の無条件転職が出ない
  shown = await menu(b, [pick(1), byText("職業融合ツリー"), byText("戦士系統")]);
  assert.ok(!shown[3].form.buttons.some((x) => x.text.includes("無条件")));
  cmd(b, "job", "priest.mage.mage");
  assert.equal(data(b).job.current, "warrior");
  ok("一般プレイヤーは無条件転職を使えない（メニュー・コマンド）");

  cmd(a, "jobcheck");
  assert.ok(a.messages.some((m) => m.includes("職業データの自動検証：合格")));
  ok("ゲーム内から職業データの自動検証を実行（合格）");

  await __test.tick(220);
  state.expect.jobs = { a: data(a).job.current, aLevels: data(a).job.levels, b: data(b).job.current, c: data(c).job.current };
} else if (phase === "jobs-restart") {
  const [a, b, c] = ["-4294967295", "-4294967296", "-4294967297"].map(join);
  assert.equal(data(a).job.current, state.expect.jobs.a);
  assert.deepEqual(data(a).job.levels, state.expect.jobs.aLevels);
  assert.equal(data(b).job.current, state.expect.jobs.b);
  assert.equal(data(c).job.current, state.expect.jobs.c);
  assert.deepEqual(data(a).job.held, ["warrior", "warrior.mage"]);
  // 死亡してもリスポーン後に職業は維持
  a.health.setCurrentValue(0);
  world.afterEvents.entityDie.fire({ deadEntity: a, damageSource: { cause: "entityAttack" } });
  a.health.setCurrentValue(20);
  world.afterEvents.playerSpawn.fire({ player: a, initialSpawn: false });
  assert.equal(data(a).job.current, state.expect.jobs.a);
  ok("再起動・死亡後も職業・職業レベル・経験した職業を維持");
}

assert.deepEqual(getRecentErrors(), [], "スクリプトエラーが発生しない");
assert.ok(!logs.some((l) => l.startsWith("ERROR")), logs.filter((l) => l.startsWith("ERROR")).join("\n"));
ok("重大なスクリプトエラーなし");
state.world = Object.fromEntries(__test.worldProps);
for (const p of everyone) state.players[p.id] = { props: Object.fromEntries(p.props), items: p.inventory.slots.map((s) => (s ? s.typeId : null)) };
fs.writeFileSync(stateFile, JSON.stringify(state));
process.stdout.write(JSON.stringify(result));
process.exit(0);
