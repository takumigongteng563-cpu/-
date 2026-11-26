// 最終仕様対応（v0.2.1）の統合シナリオ：第2弾のセーブデータから更新 → 新しい基盤の確認 → 再起動
// 使い方: node --import ./tests/mock/loader.mjs tests/integration/finalSession.mjs <状態ファイル> <phase>
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
const queues = new Map();
__ui.responder = (form, player) => {
  const q = queues.get(player.name) || [];
  const r = q.shift();
  if (r === undefined) return { canceled: true, cancelationReason: "UserClosed" };
  return typeof r === "function" ? r(form) : r;
};
const script = (p, list) => queues.set(p.name, [...list]);
const cmd = (p, id, message = "") => system.afterEvents.scriptEventReceive.fire({ id: `noguchi:${id}`, message, sourceEntity: p });
const result = { phase, checks: [] };
const ok = (n) => result.checks.push(n);

world.afterEvents.worldLoad.fire({});
await __test.tick(1);

if (phase === "upgrade2") {
  const before = JSON.parse(JSON.stringify(state.expect));
  const [a, b, c] = ["-4294967295", "-4294967296", "-4294967297"].map(join);
  // 第2弾の成長データが残っている
  assert.equal(data(a).level, before.a.level);
  assert.equal(data(a).exp, before.a.exp);
  assert.deepEqual(data(a).statAllocated, before.a.alloc);
  assert.equal(data(c).level, before.c.level);
  assert.equal(data(c).expOverflow, before.c.overflow);
  assert.equal(data(a).gold, 500);
  for (const p of [a, b, c]) {
    assert.equal(data(p).talents.innate.length, 1);
    assert.equal(Object.keys(data(p).computed.primary).length, 12);
    assert.ok(!p.messages.some((m) => m.includes("あなたに宿る才能"))); // 再抽選しない
    assert.ok(p.messages.some((m) => m.includes("おかえりなさい")));
  }
  assert.ok(data(a).talents.archived.length >= 1);
  assert.ok(data(a).hiddenPotential.entries.some((e) => e.awakened && !e.legacy));
  ok("第2弾のデータを維持したまま最終仕様へ移行（12能力値・初期才能1個・旧データは記録として保存）");

  // メニュー（11項目、ダンジョン情報 → ステージ情報）
  __ui.shown.length = 0;
  script(b, [pick(8)]);
  world.afterEvents.itemUse.fire({ source: b, itemStack: b.inventory.slots.find((s) => s && s.typeId === "noguchi:adventurer_book") });
  await __test.tick(5);
  assert.equal(__ui.shown[0].form.buttons.length, 11);
  assert.equal(__ui.shown[1].form._title, "ステージ情報");
  assert.ok(__ui.shown[1].form._body.includes("第1章"));
  assert.ok(__ui.shown[1].form._body.includes("滅亡寸前"));
  ok("メニュー：ステージ情報（章・ステージ・富里王国）");

  // ---- 操作判定テスト ----
  a.addTag("noguchi_admin");
  cmd(a, "input_test", "on");
  cmd(a, "give_focus");
  const slot = a.inventory.slots.findIndex((s) => s && s.typeId === "noguchi:skill_focus");
  assert.ok(slot >= 0);
  a.selectedSlotIndex = slot;
  const focus = a.inventory.slots[slot];
  const last = () => a.actionBar[a.actionBar.length - 1];
  const use = async () => {
    world.afterEvents.itemUse.fire({ source: a, itemStack: focus });
    await __test.tick(2);
    return last();
  };
  await __test.tick(10);
  assert.ok((await use()).includes("通常使用"));
  a.isJumping = true;
  a.isOnGround = false;
  await __test.tick(10);
  assert.ok((await use()).includes("ジャンプ中に使用"));
  a.isJumping = false;
  a.isOnGround = true;
  a.isSprinting = true;
  await __test.tick(10);
  assert.ok((await use()).includes("ダッシュ中に使用"));
  a.isSprinting = false;
  a.isSneaking = true;
  await __test.tick(20);
  assert.ok((await use()).includes("しゃがみながら溜めて"));
  await __test.tick(46);
  assert.ok((await use()).includes("長時間溜めて"));
  a.isSneaking = false;
  // 押して離す方式（使用時間のあるアイテム）
  await __test.tick(10);
  world.afterEvents.itemUse.fire({ source: a, itemStack: focus });
  world.afterEvents.itemStartUse.fire({ source: a, itemStack: focus, useDuration: 72000 });
  await __test.tick(50);
  const nBefore = a.actionBar.length;
  world.afterEvents.itemReleaseUse.fire({ source: a, itemStack: focus, useDuration: 71950 });
  world.afterEvents.itemStopUse.fire({ source: a, itemStack: focus, useDuration: 71950 });
  await __test.tick(2);
  assert.equal(a.actionBar.length, nBefore + 1); // 開始時の itemUse と release/stop で二重に判定しない
  assert.ok(last().includes("長時間溜めて"));
  await __test.tick(10);
  world.afterEvents.itemStartUse.fire({ source: a, itemStack: focus, useDuration: 72000 });
  await __test.tick(12);
  world.afterEvents.itemReleaseUse.fire({ source: a, itemStack: focus, useDuration: 71988 });
  await __test.tick(2);
  assert.ok(last().includes("不発"));
  ok("操作判定：通常／ジャンプ中／ダッシュ中／しゃがみ溜め／長時間溜め／押して離す／中途半端な長押しは不発／二重判定なし");

  cmd(a, "input_test", "off");
  await __test.tick(10);
  await use();
  assert.ok(last().includes("技が割り当てられていない"));
  ok("通常時：技が未割り当てなら発動しない（スキル本体は第4弾）");

  // 一般プレイヤーは管理者用コマンドを使えない
  cmd(b, "stage_clear", "1");
  assert.equal(ctx.worldService.world.stages.records.stage001, undefined);
  ok("一般プレイヤーはステージクリア記録テストを使えない");

  // ---- ステージ・王国 ----
  cmd(a, "stage_clear", "1");
  const w = ctx.worldService.world;
  assert.equal(w.kingdom.phase, "restoring");
  assert.ok(w.stages.unlocked.stage002);
  cmd(a, "stage_clear", "1");
  assert.equal(Object.keys(w.kingdom.buildings).length, 1);
  assert.equal(w.stages.records.stage001.clears, 2);
  cmd(a, "stage_clear", "5");
  assert.equal(w.stages.records.stage005, undefined); // 未解放は記録しない
  ok("ステージ1の初回クリアで王国が復興中へ・次のステージ解放・周回で重複なし・未解放は不可");

  await __test.tick(220);
  state.expect.final = { kingdomPhase: w.kingdom.phase, clears: w.stages.records.stage001.clears, archived: data(a).talents.archived.map((x) => x.id) };
} else if (phase === "final-restart") {
  const [a] = ["-4294967295", "-4294967296", "-4294967297"].map(join);
  const w = ctx.worldService.world;
  assert.equal(w.kingdom.phase, state.expect.final.kingdomPhase);
  assert.equal(w.stages.records.stage001.clears, state.expect.final.clears);
  assert.deepEqual(data(a).talents.archived.map((x) => x.id), state.expect.final.archived);
  assert.equal(data(a).talents.innate.length, 1);
  ok("再起動後もステージ記録・王国の状態・移行結果を維持");
}

assert.deepEqual(getRecentErrors(), [], "スクリプトエラーが発生しない");
assert.ok(!logs.some((l) => l.startsWith("ERROR")), logs.filter((l) => l.startsWith("ERROR")).join("\n"));
ok("重大なスクリプトエラーなし");

state.world = Object.fromEntries(__test.worldProps);
for (const p of everyone) state.players[p.id] = { props: Object.fromEntries(p.props), items: p.inventory.slots.map((s) => (s ? s.typeId : null)) };
fs.writeFileSync(stateFile, JSON.stringify(state));
process.stdout.write(JSON.stringify(result));
process.exit(0);
