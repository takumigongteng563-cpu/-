// 第2弾の統合シナリオ（第1弾のセーブデータから更新 → 戦闘・成長・メニュー → 再起動）
// 使い方: node --import ./tests/mock/loader.mjs tests/integration/rpgSession.mjs <状態ファイル> <phase>
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
const { expToNext } = await import("../../packs/BP/scripts/progression/levelMath.js");
const { potentials } = await import("../../packs/BP/scripts/content/potentials.js");

const BOOK = "noguchi:adventurer_book";
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
const bookOf = (p) => p.inventory.slots.find((s) => s && s.typeId === BOOK);
const useBook = (p) => world.afterEvents.itemUse.fire({ source: p, itemStack: bookOf(p) });
const pick = (i) => ({ canceled: false, selection: i });
const byText = (t) => (f) => pick(f.buttons.findIndex((b) => b.text.includes(t)));
/** プレイヤーごとの応答キュー */
const queues = new Map();
__ui.responder = (form, player) => {
  const q = queues.get(player.name) || [];
  const r = q.shift();
  if (r === undefined) return { canceled: true, cancelationReason: "UserClosed" };
  return typeof r === "function" ? r(form) : r;
};
const script = (p, list) => queues.set(p.name, [...list]);
const data = (p) => ctx.playerService.dataFor(p.id);
const result = { phase, checks: [] };
const ok = (n) => result.checks.push(n);
let ticksWaited = 0;
async function tick(n) {
  ticksWaited += n;
  await __test.tick(n);
}

world.afterEvents.worldLoad.fire({});
await tick(1);

if (phase === "upgrade") {
  const [a, b, c] = ["-4294967295", "-4294967296", "-4294967297"].map(join);
  // 第1弾のデータが残っている
  assert.equal(data(a).gold, 500);
  assert.equal(data(a).settings.saveNotice, true);
  assert.equal(data(b).exp, 7);
  assert.equal(data(c).gold, 3);
  assert.equal(ctx.worldService.world.story.chapter, 1);
  ok("第1弾のセーブデータを維持（金貨・経験値・設定・ストーリー進行）");
  for (const p of [a, b, c]) {
    assert.ok(p.messages.some((m) => m.includes("あなたに宿る才能")), p.name);
    assert.ok(p.messages.some((m) => m.includes("おかえりなさい")));
    assert.equal(data(p).talents.innate.length, 1); // 最終仕様：初期才能は1個
    assert.equal(data(p).hiddenPotential.entries.length, 0); // 最終仕様：潜在能力は開始時点では未確定
    assert.equal(p.inventory.slots.filter((s) => s && s.typeId === BOOK).length, 1);
  }
  ok("更新後の初回参加で初期才能を1回だけ抽選・冒険者の書は重複しない");
  // B は保存通知 OFF（A は第1弾で ON にしているため保存通知が優先される）
  await tick(20);
  assert.ok(b.actionBar.some((t) => t.includes("HP") && t.includes("MP") && t.includes("ST") && t.includes("Lv 1") && t.includes("無職")));
  const hudCount = b.actionBar.length;
  await tick(10);
  assert.equal(b.actionBar.length, hudCount); // 変化がなければ毎回は出さない
  await tick(40);
  assert.ok(b.actionBar.length > hudCount); // 一定間隔で再表示
  ok("HUD：HP・MP・スタミナ・レベル・経験値・職業を表示し、変化がない間は更新しない");
  state.expect.innate = Object.fromEntries([a, b, c].map((p) => [p.id, data(p).talents.innate]));
  state.expect.potential = Object.fromEntries([a, b, c].map((p) => [p.id, data(p).hiddenPotential.entries.map((e) => e.id)]));
} else if (phase === "rpg") {
  const [a, b, c] = ["-4294967295", "-4294967296", "-4294967297"].map(join);
  for (const p of [a, b, c]) assert.deepEqual(data(p).talents.innate, state.expect.innate[p.id]);
  ok("再起動後も才能が変化しない");

  // --- 戦闘：剣で攻撃・討伐 ---
  a.inventory.slots[5] = new ItemStack("minecraft:iron_sword", 1);
  a.selectedSlotIndex = 5;
  const z = __test.spawnMob("minecraft:zombie");
  __test.hit(a, z);
  __test.hit(a, z); // 同じtickの連打は数えない
  assert.equal(data(a).actions["hit.melee.sword"], 1);
  await tick(5);
  __test.hit(a, z);
  assert.equal(data(a).actions["hit.melee.sword"], 2);
  const cow = __test.spawnMob("minecraft:cow", ["animal", "mob"]);
  await tick(5);
  __test.hit(a, cow);
  assert.equal(data(a).actions["hit.melee.sword"], 2);
  ok("行動記録：モンスターへの命中のみ数え、連打・動物は数えない");

  const exp0 = data(a).exp;
  __test.kill(a, z);
  __test.kill(a, z); // 同じ討伐の重複処理
  // ゾンビ（暫定Lv3）は Lv1 の勇者より格上 → レベル差補正で増える
  assert.equal(data(a).exp, exp0 + Math.floor(10 * ctx.progression.levelDiffMultiplier(1, 3)));
  assert.ok(data(a).exp > exp0 + 10);
  assert.equal(data(a).actions["kill.hostile"], 1);
  ok("討伐経験値：同じ討伐で二重に付与されない・格上の敵は経験値が増える");

  // --- 強敵討伐 → 複数レベルアップ・後天性才能 ---
  const w = __test.spawnMob("minecraft:warden");
  __test.kill(a, w);
  await tick(25);
  assert.ok(data(a).level >= 4, `Lv ${data(a).level}`);
  const lv = data(a).level;
  assert.equal(data(a).unspentStatPoints, (lv - 1) * 5);
  assert.ok(a.titles.some((t) => t.title.includes("LEVEL UP")));
  assert.ok(a.sounds.includes("random.levelup"));
  assert.ok(data(a).talents.acquired.includes("giant_slayer"));
  assert.ok(a.messages.some((m) => m.includes("巨獣狩り")));
  ok("複数レベル同時上昇・能力ポイント付与・演出・後天性才能（巨獣狩り）");

  // --- 能力ポイント振り分け（A と B が同時に操作） ---
  ctx.progression.grantExp(b.id, expToNext(1), { source: "admin", noBonus: true });
  await tick(15);
  const strA = data(a).computed.primary.str;
  const vitB = data(b).computed.primary.vit;
  const unA = data(a).unspentStatPoints;
  // 振り分け画面：能力値12ボタン → 12:量変更 13:1つ戻す 14:すべて取り消し 15:確定 16:戻る
  script(a, [pick(0), pick(2), pick(0), pick(12), pick(12), pick(1), pick(13), pick(15), pick(0)]);
  //        状態    振り分け 筋力+1  量→5     量→10    耐久+10 1つ戻す  確定     確認OK
  script(b, [pick(0), pick(2), pick(1), pick(1), pick(15), pick(0)]);
  useBook(a);
  useBook(b);
  await tick(20);
  assert.deepEqual(data(a).statAllocated, { str: 1 });
  assert.equal(data(a).unspentStatPoints, unA - 1);
  assert.equal(data(a).computed.primary.str, strA + 1);
  assert.equal(data(b).statAllocated.vit, 2);
  assert.equal(data(b).unspentStatPoints, 3);
  assert.equal(data(b).computed.primary.vit, vitB + 2);
  ok("能力ポイント振り分け：1/5/10切替・取り消し・確認画面・2人同時操作");

  // --- HP（バニラの体力と連動）---
  const hpMax = data(a).vitals.hpMax;
  __test.hurt(a, __test.spawnMob("minecraft:skeleton"), 10);
  assert.equal(data(a).vitals.hp, Math.round(hpMax / 2));
  __test.hurt(a, __test.spawnMob("minecraft:skeleton"), 7);
  assert.equal(data(a).actions["survive.lowhp"], 1);
  ok("HP：バニラの体力の割合で管理・瀕死からの生還を記録");

  // --- スタミナ ---
  a.isSprinting = true;
  const st0 = data(a).vitals.stamina;
  await tick(40);
  assert.ok(data(a).vitals.stamina < st0);
  await tick(400);
  assert.equal(data(a).vitals.exhausted, true);
  assert.ok(a.effects.some((e) => e.id === "slowness"));
  a.isSprinting = false;
  await tick(200);
  assert.ok(data(a).vitals.stamina > 0);
  ok("スタミナ：ダッシュで消費・0で疲労（移動低下）・休息で回復");

  // --- MP 自然回復 ---
  ctx.vitals.setValue(c.id, "mp", 0);
  await tick(101);
  assert.ok(data(c).vitals.mp > 0);
  ok("MP：時間経過で回復");

  // --- 潜在能力：行動で形成・覚醒まで非公開 ---
  const allPotNames = potentials.all().map((x) => x.name);
  __ui.shown.length = 0;
  script(a, [pick(3)]);
  await tick(20);
  useBook(a);
  await tick(5);
  assert.ok(__ui.shown[1].form._body.includes("まだ何も感じない"));
  // 剣で戦い続ける → 潜在能力が形成される（本人には名前が見えない）
  for (let i = 0; i < 2100; i++) ctx.actions.record(a.id, "hit.melee.sword");
  await tick(25);
  assert.equal(data(a).hiddenPotential.entries.filter((e) => !e.legacy).length, 1);
  const formedId = data(a).hiddenPotential.entries.find((e) => !e.legacy).id;
  __ui.shown.length = 0;
  script(a, [pick(3)]);
  useBook(a);
  await tick(5);
  const talentBody = __ui.shown[1].form._body;
  assert.ok(allPotNames.every((n) => !talentBody.includes(n)));
  assert.ok(talentBody.includes("形になりつつある"));
  assert.ok(!a.messages.some((m) => allPotNames.some((n) => m.includes(n))));
  ok("潜在能力：行動で形成され、覚醒するまで名前も条件も表示しない");

  // --- 一般プレイヤーは管理者機能を使えない ---
  const expB = data(b).exp;
  system.afterEvents.scriptEventReceive.fire({ id: "noguchi:exp", message: "99999", sourceEntity: b });
  assert.equal(data(b).exp, expB);
  assert.ok(b.messages.some((m) => m.includes("管理者")));
  __ui.shown.length = 0;
  script(b, [pick(10)]);
  await tick(20);
  useBook(b);
  await tick(5);
  assert.ok(!__ui.shown[1].form.buttons.some((x) => x.text.includes("テスト機能")));
  ok("一般プレイヤーは管理者テスト機能を使えない（コマンド・メニューとも）");

  // --- 管理者テスト機能（メニュー） ---
  a.addTag("noguchi_admin");
  script(a, [
    pick(10), byText("テスト機能"), { canceled: false, formValues: [0] }, // 設定 → テスト機能 → 対象：勇者A
    byText("才能付与"), (f) => ({ canceled: false, formValues: [f.controls[0].items.findIndex((x) => x.includes("剣術適性"))] }),
    byText("才能進化テスト"), (f) => ({ canceled: false, formValues: [f.controls[0].items.findIndex((x) => x.includes("魔剣適性"))] }),
    byText("潜在能力覚醒テスト"),
    byText("経験値付与"), { canceled: false, formValues: ["50"] },
    byText("セーブデータ確認"), byText("戻る"),
  ]);
  await tick(20);
  useBook(a);
  await tick(20);
  const ta = data(a).talents.active.map((x) => x.id);
  assert.ok(ta.includes("magic_sword_aptitude") && !ta.includes("sword_aptitude"));
  const awakenedEntry = data(a).hiddenPotential.entries.find((e) => e.id === formedId);
  assert.equal(awakenedEntry.awakened, true);
  const potName = potentials.get(formedId).name;
  assert.ok(a.titles.some((t) => t.title.includes("潜在能力")));
  assert.ok(a.sounds.includes("random.totem"));
  assert.ok(a.messages.some((m) => m.includes(potName)));
  ok("管理者テスト：才能付与・進化・潜在能力覚醒（専用演出）・経験値付与・セーブデータ確認");

  // 覚醒後は才能画面に表示される
  __ui.shown.length = 0;
  script(a, [pick(3)]);
  await tick(20);
  useBook(a);
  await tick(5);
  assert.ok(__ui.shown[1].form._body.includes(potName));
  ok("覚醒済み潜在能力は才能画面に表示");

  // 管理者コマンド
  system.afterEvents.scriptEventReceive.fire({ id: "noguchi:level", message: "50 勇者C", sourceEntity: a });
  assert.equal(data(c).level, 50);
  system.afterEvents.scriptEventReceive.fire({ id: "noguchi:exp", message: "100000 勇者C", sourceEntity: a });
  assert.equal(data(c).level, 50);
  assert.ok(data(c).expOverflow > 0);
  ok("レベル上限：一般級は50で止まり、余剰経験値は保留");

  // --- 死亡とリスポーン ---
  a.health.setCurrentValue(0);
  world.afterEvents.entityDie.fire({ deadEntity: a, damageSource: { cause: "entityAttack" } });
  assert.equal(data(a).vitals.hp, 0);
  a.health.setCurrentValue(20);
  world.afterEvents.playerSpawn.fire({ player: a, initialSpawn: false });
  assert.equal(data(a).vitals.hp, data(a).vitals.hpMax);
  assert.equal(data(a).vitals.mp, data(a).vitals.mpMax);
  ok("死亡でHP0・リスポーンで全回復（バニラの死亡処理と矛盾しない）");

  await tick(220); // 自動保存
  state.expect.a = { level: data(a).level, alloc: data(a).statAllocated, active: data(a).talents.active.map((x) => x.id), exp: data(a).exp };
  state.expect.potential = Object.fromEntries([a, b, c].map((p) => [p.id, data(p).hiddenPotential.entries.map((e) => e.id)]));
  state.expect.b = { level: data(b).level, alloc: data(b).statAllocated };
  state.expect.c = { level: data(c).level, overflow: data(c).expOverflow };
  // シャットダウンなしで終了（強制終了相当）
} else if (phase === "rpg-restart") {
  const [a, b, c] = ["-4294967295", "-4294967296", "-4294967297"].map(join);
  assert.equal(data(a).level, state.expect.a.level);
  assert.equal(data(a).exp, state.expect.a.exp);
  assert.deepEqual(data(a).statAllocated, state.expect.a.alloc);
  assert.deepEqual(data(a).talents.active.map((x) => x.id), state.expect.a.active);
  assert.ok(data(a).hiddenPotential.entries.some((e) => e.awakened));
  assert.equal(data(b).level, state.expect.b.level);
  assert.deepEqual(data(b).statAllocated, state.expect.b.alloc);
  assert.equal(data(c).level, state.expect.c.level);
  assert.equal(data(c).expOverflow, state.expect.c.overflow);
  for (const p of [a, b, c]) {
    assert.deepEqual(data(p).talents.innate, state.expect.innate[p.id]);
    assert.deepEqual(data(p).hiddenPotential.entries.map((e) => e.id), state.expect.potential[p.id]);
    assert.ok(!p.messages.some((m) => m.includes("あなたに宿る才能")));
  }
  assert.equal(data(a).gold, 500);
  ok("ワールド再起動後もレベル・振り分け・才能・潜在能力・保留経験値を維持（強制終了後も）");
}

assert.deepEqual(getRecentErrors(), [], "スクリプトエラーが発生しない");
assert.ok(!logs.some((l) => l.startsWith("ERROR")), logs.filter((l) => l.startsWith("ERROR")).join("\n"));
ok("重大なスクリプトエラーなし");

state.world = Object.fromEntries(__test.worldProps);
for (const p of everyone) state.players[p.id] = { props: Object.fromEntries(p.props), items: p.inventory.slots.map((s) => (s ? s.typeId : null)) };
fs.writeFileSync(stateFile, JSON.stringify(state));
process.stdout.write(JSON.stringify(result));
process.exit(0);
