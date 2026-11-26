// main.js をモックエンジン上で起動し、シナリオを実行する。
// 使い方: node --import ./tests/mock/loader.mjs tests/integration/session.mjs <状態ファイル> <phase>
// 状態ファイルにはワールドとプレイヤーの動的プロパティを保存し、
// 別プロセスで再度起動することで「ワールド再起動」を再現する。
import fs from "node:fs";
import assert from "node:assert/strict";
import { world, system, __test, GameMode, ItemStack } from "@minecraft/server";
import { __ui } from "@minecraft/server-ui";

const [stateFile, phase] = process.argv.slice(2);
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : { world: {}, players: {} };
for (const [k, v] of Object.entries(state.world)) __test.worldProps.set(k, v);

console.log = () => {};
const logs = [];
console.warn = (...a) => logs.push(a.join(" "));
console.error = (...a) => logs.push("ERROR " + a.join(" "));

await import("../../packs/BP/scripts/main.js");
const { ctx } = await import("../../packs/BP/scripts/core/context.js");
const { getRecentErrors } = await import("../../packs/BP/scripts/core/log.js");

const BOOK = "noguchi:adventurer_book";
const everyone = [];
function join(id, name) {
  const saved = state.players[id] || { props: {}, items: [] };
  const p = __test.addPlayer(id, name, saved.props);
  // 前回のインベントリを復元（冒険者の書の重複付与チェック用）
  saved.items.forEach((t, i) => t && (p.inventory.slots[i] = new ItemStack(t, 1)));
  everyone.push(p);
  world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });
  return p;
}
function bookSlot(p) {
  return p.inventory.slots.findIndex((s) => s && s.typeId === BOOK);
}
function useBook(p) {
  world.afterEvents.itemUse.fire({ source: p, itemStack: p.inventory.getItem(bookSlot(p)) });
}
/** 応答を順番に返す。尽きたら閉じる */
function script(responses) {
  const q = [...responses];
  __ui.responder = (form) => {
    const r = q.shift();
    if (r === undefined) return { canceled: true, cancelationReason: "UserClosed" };
    return typeof r === "function" ? r(form) : r;
  };
  return q;
}
const pick = (i) => ({ canceled: false, selection: i });
const result = { phase, checks: [] };
const ok = (name) => result.checks.push(name);

if (phase === "fallback") {
  // worldLoad が届かない場合でも予備の初期化が動く
  await __test.tick(99);
  assert.equal(ctx.ready, false);
  await __test.tick(2);
  assert.equal(ctx.ready, true);
  ok("worldLoad 未受信時の予備初期化");
} else {
  world.afterEvents.worldLoad.fire({});
  await __test.tick(1);
  assert.equal(ctx.ready, true);
  ok("ワールド起動・データ準備完了");
}

if (phase === "first") {
  const a = join("-4294967295", "勇者A");
  const b = join("-4294967296", "勇者B");
  assert.ok(bookSlot(a) >= 0 && bookSlot(b) >= 0);
  const bookItem = a.inventory.getItem(bookSlot(a));
  assert.equal(bookItem.lockMode, "inventory");
  assert.equal(bookItem.keepOnDeath, true);
  assert.ok(a.messages.some((m) => m.includes("ようこそ")));
  ok("初回参加：歓迎メッセージ・冒険者の書の付与");

  const da = ctx.playerService.dataFor(a.id);
  assert.equal(da.race, "human");
  assert.equal(da.level, 1);
  assert.equal(da.job.current, "unemployed");
  assert.equal(da.gold, 0);
  ok("初回参加：初期データ生成（人間/Lv1/無職/金貨0）");

  // メニュー：全ページを順に開いて「戻る」
  const pageCount = 11;
  const seq = [];
  for (let i = 0; i < pageCount; i++) {
    seq.push(pick(i));
    seq.push((form) => {
      // 各ページの「戻る」ボタン（設定ページは項目の後ろ）
      const back = form.buttons.findIndex((x) => x.text.includes("戻る"));
      return pick(back);
    });
  }
  script(seq);
  __ui.shown.length = 0;
  useBook(a);
  await __test.tick(5);
  const main = __ui.shown[0].form;
  assert.equal(main._title.includes("冒険者の書"), true);
  assert.deepEqual(
    main.buttons.map((x) => x.text),
    ["ステータス", "職業", "スキル", "才能", "装備", "称号", "クエスト", "冒険者情報", "ステージ情報", "倉庫", "設定"]
  );
  const pageTitles = __ui.shown.filter((s, i) => i % 2 === 1).map((s) => s.form._title);
  assert.equal(pageTitles.length, pageCount);
  // 未実装の機能を含むページには「今後実装予定」。第2弾で実装したステータス・才能、第3弾で実装した職業には出ない
  const soonTitles = __ui.shown.filter((s) => s.form._body.includes("今後実装予定")).map((s) => s.form._title);
  assert.deepEqual(soonTitles, ["スキル", "装備", "称号", "クエスト", "冒険者情報", "ステージ情報", "倉庫"]);
  ok("RPG専用メニュー：11項目が開き、未実装項目は「今後実装予定」表示");

  // 多重表示防止：連打しても1つしか開かない
  __ui.shown.length = 0;
  let resolveForm;
  __ui.responder = () => new Promise((r) => (resolveForm = r));
  await __test.tick(20);
  useBook(a);
  useBook(a);
  await __test.tick(2);
  assert.equal(__ui.shown.length, 1);
  resolveForm({ canceled: true, cancelationReason: "UserClosed" });
  await __test.tick(2);
  ok("メニューの多重表示防止");

  // チャット中（UserBusy）でも再試行して開く
  __ui.shown.length = 0;
  let busy = 2;
  __ui.responder = () => (busy-- > 0 ? { canceled: true, cancelationReason: "UserBusy" } : { canceled: true, cancelationReason: "UserClosed" });
  await __test.tick(20);
  useBook(a);
  await __test.tick(30);
  assert.equal(__ui.shown.length, 3);
  ok("UserBusy 時の再試行");

  // 設定 → 個人設定（保存通知ON）
  script([pick(10), pick(0), { canceled: false, formValues: [true] }]);
  await __test.tick(20);
  useBook(a);
  await __test.tick(10);
  assert.equal(ctx.playerService.dataFor(a.id).settings.saveNotice, true);
  ok("設定：個人設定の保存");

  // 重要でない更新 → 自動保存で書き込まれる
  ctx.playerService.update(a.id, (d) => (d.gold = 500));
  ctx.playerService.update(b.id, (d) => (d.exp = 7));
  assert.ok(ctx.playerService.dirtyCount() >= 2);
  await __test.tick(420);
  assert.equal(ctx.playerService.dirtyCount(), 0);
  ok("自動保存（変更分のみ）");

  // B は途中退出
  __test.removePlayer(b);
  assert.equal(ctx.playerService.getSession(b.id), undefined);
  ok("途中退出：保存してセッション終了");

  // 非管理者には管理者項目が表示されない
  __ui.shown.length = 0;
  script([pick(10)]);
  await __test.tick(20);
  useBook(a);
  await __test.tick(5);
  assert.equal(__ui.shown[1].form.buttons.some((x) => x.text.includes("管理者")), false);
  ok("管理者項目は管理者タグ所持者のみ表示");
  // shutdown イベントなしで終了（クラッシュ相当）
} else if (phase === "restart") {
  const a = join("-4294967295", "勇者A");
  const b = join("-4294967296", "勇者B");
  const c = join("-4294967297", "勇者C");
  const [da, db, dc] = [a, b, c].map((p) => ctx.playerService.dataFor(p.id));
  assert.equal(da.gold, 500);
  assert.equal(da.settings.saveNotice, true);
  assert.equal(db.exp, 7);
  assert.equal(db.gold, 0);
  assert.equal(dc.gold, 0);
  assert.equal(da.sessionLog.joinCount, 2);
  assert.equal(dc.sessionLog.joinCount, 1);
  assert.equal(new Set([da.uid, db.uid, dc.uid]).size, 3);
  assert.ok(a.messages.some((m) => m.includes("おかえりなさい")));
  assert.ok(c.messages.some((m) => m.includes("ようこそ")));
  ok("ワールド再起動後：再参加でデータ維持・新規参加者は初期化・混同なし");

  // 書は二重に配られない
  for (const p of [a, b, c]) assert.equal(p.inventory.slots.filter((s) => s && s.typeId === BOOK).length, 1);
  assert.ok(!a.messages.some((m) => m.includes("受け取った")));
  ok("再参加時に冒険者の書を重複付与しない");

  // 行動制限（既定はOFF）
  let ev = world.beforeEvents.playerBreakBlock.fire({ player: a, cancel: false });
  assert.equal(ev.cancel, false);
  system.afterEvents.scriptEventReceive.fire({ id: "noguchi:restrict", message: "break on", sourceEntity: a });
  ev = world.beforeEvents.playerBreakBlock.fire({ player: a, cancel: false });
  assert.equal(ev.cancel, true);
  c.gameMode = GameMode.Creative;
  ev = world.beforeEvents.playerBreakBlock.fire({ player: c, cancel: false });
  assert.equal(ev.cancel, false);
  system.afterEvents.scriptEventReceive.fire({ id: "noguchi:restrict", message: "place on", sourceEntity: a });
  ev = world.beforeEvents.playerInteractWithBlock.fire({ player: a, cancel: false, isFirstEvent: true, itemStack: { typeId: "minecraft:stone" } });
  assert.equal(ev.cancel, true);
  ev = world.beforeEvents.playerInteractWithBlock.fire({ player: a, cancel: false, isFirstEvent: true, itemStack: { typeId: "minecraft:apple" } });
  assert.equal(ev.cancel, false);
  await __test.tick(2);
  ok("行動制限：既定OFF・ON時に破壊/設置を取り消し・クリエイティブは対象外");

  // 冒険者の書をブロックに向けて使ってもメニューが開く
  __ui.shown.length = 0;
  script([]);
  ev = world.beforeEvents.playerInteractWithBlock.fire({ player: b, cancel: false, isFirstEvent: true, itemStack: b.inventory.getItem(bookSlot(b)) });
  assert.equal(ev.cancel, true);
  await __test.tick(3);
  assert.equal(__ui.shown.length, 1);
  ok("ブロックに向けて冒険者の書を使ってもメニューが開く");

  // 管理者は設定に管理者項目が出る → 行動制限設定フォーム
  a.addTag("noguchi_admin");
  script([pick(10), (f) => pick(f.buttons.findIndex((x) => x.text.includes("行動制限"))), { canceled: false, formValues: [undefined, false, false, false] }]);
  useBook(a);
  await __test.tick(10);
  assert.deepEqual(ctx.worldService.world.settings.restrictions, { blockBreak: false, blockPlace: false, blockInteract: false });
  ok("管理者：行動制限の設定画面");

  // /scriptevent 系
  system.afterEvents.scriptEventReceive.fire({ id: "noguchi:status", message: "", sourceEntity: a });
  system.afterEvents.scriptEventReceive.fire({ id: "noguchi:save", message: "", sourceEntity: a });
  system.afterEvents.scriptEventReceive.fire({ id: "noguchi:dump", message: "", sourceEntity: a });
  assert.ok(logs.some((l) => l.includes("[DUMP]")));
  ok("scriptevent コマンド");

  // 世界データ更新 → シャットダウン時の保存
  ctx.worldService.updateWorld((w) => (w.story.chapter = 1));
  ctx.playerService.update(c.id, (d) => (d.gold = 3));
  __test.shutdown();
  assert.equal(ctx.worldService.dirtyCount() + ctx.playerService.dirtyCount(), 0);
  ok("終了時の全保存");
} else if (phase === "fallback") {
  const c = join("-4294967297", "勇者C");
  assert.equal(ctx.playerService.dataFor(c.id).gold, 3);
  ok("予備初期化後も保存データを読み込める");
} else if (phase === "third") {
  const c = join("-4294967297", "勇者C");
  assert.equal(ctx.worldService.world.story.chapter, 1);
  assert.equal(ctx.playerService.dataFor(c.id).gold, 3);
  assert.equal(Object.keys(ctx.worldService.index.players).length, 3);
  ok("2回目の再起動後もワールド・個人データ維持");
}

const errs = getRecentErrors();
assert.deepEqual(errs, [], "スクリプトエラーが発生しない");
assert.ok(!logs.some((l) => l.startsWith("ERROR")), logs.join("\n"));
ok("重大なスクリプトエラーなし");

// 状態を保存
state.world = Object.fromEntries(__test.worldProps);
for (const p of everyone) {
  state.players[p.id] = { props: Object.fromEntries(p.props), items: p.inventory.slots.map((s) => (s ? s.typeId : null)) };
}
fs.writeFileSync(stateFile, JSON.stringify(state));
process.stdout.write(JSON.stringify(result));
process.exit(0);
