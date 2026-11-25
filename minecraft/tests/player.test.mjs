import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryBackend, bootWorld, fakePlayer } from "./helpers.mjs";
import { PLAYER_UID_PROPERTY, recordNameForUid } from "../packs/BP/scripts/player/playerService.js";
import { PLAYER_SCHEMA_VERSION } from "../packs/BP/scripts/config.js";

test("初回参加：人間・Lv1・無職・一般人相当・金貨0で作成される", () => {
  const { ps } = bootWorld(memoryBackend());
  const p = fakePlayer("-100", "たろう");
  const r = ps.join(p);
  assert.equal(r.isNew, true);
  const d = ps.dataFor(p.id);
  assert.equal(d.race, "human");
  assert.equal(d.level, 1);
  assert.equal(d.exp, 0);
  assert.equal(d.job.current, "unemployed");
  assert.equal(d.gold, 0);
  // 第2弾で魔力(mag)を追加し8種類
  assert.deepEqual(d.stats, { str: 5, vit: 5, mag: 5, agi: 5, dex: 5, int: 5, mnd: 5, luk: 5 });
  assert.equal(d.unspentStatPoints, 0);
  assert.equal(d.adventurer.rank, "unregistered");
  // PlayerService 単体では才能は未抽選（抽選は app.joinPlayer が行う。rpg.test.mjs で検証）
  assert.deepEqual(d.talents.innate, []);
  assert.deepEqual(d.talents.acquired, []);
  assert.equal(d.talents.rolled, false);
  assert.equal(p.getDynamicProperty(PLAYER_UID_PROPERTY), r.uid);
  // 4-2 の全項目が保存構造に存在する
  for (const k of ["uid", "level", "exp", "job", "vitals", "stats", "unspentStatPoints", "talents", "hiddenPotential", "skills", "proficiency", "equipment", "gold", "titles", "adventurer", "quests", "npcAffinity", "storage", "dungeonRecords", "limitBreak"]) {
    assert.ok(k in d, k);
  }
});

test("参加処理は何度呼んでも二重に作られない", () => {
  const { ps } = bootWorld(memoryBackend());
  const p = fakePlayer("-1", "a");
  const r1 = ps.join(p);
  const r2 = ps.join(p);
  assert.equal(r2.alreadyJoined, true);
  assert.equal(r1.uid, r2.uid);
  assert.equal(ps.dataFor(p.id).sessionLog.joinCount, 1);
});

test("再参加：初期化されず保存済みデータを読み込む", () => {
  const b = memoryBackend();
  const { ps } = bootWorld(b);
  const p = fakePlayer("-1", "たろう");
  ps.join(p);
  ps.update(p.id, (d) => {
    d.gold = 777;
    d.level = 5;
  });
  ps.leave(p.id);
  const r = ps.join(p);
  assert.equal(r.isNew, false);
  assert.equal(ps.dataFor(p.id).gold, 777);
  assert.equal(ps.dataFor(p.id).level, 5);
  assert.equal(ps.dataFor(p.id).sessionLog.joinCount, 2);
});

test("ワールド再起動後もデータが維持される（自動保存分を含む）", () => {
  const b = memoryBackend();
  let w = bootWorld(b);
  const p = fakePlayer("-1", "たろう");
  w.ps.join(p);
  w.ps.update(p.id, (d) => (d.gold = 123)); // 重要フラグなし → 自動保存待ち
  w.ws.updateWorld((wd) => (wd.story.chapter = 2));
  assert.ok(w.ps.dirtyCount() > 0);
  w.ps.flushDirty(10);
  w.ws.flushDirty(10);
  // --- 再起動（メモリ上のキャッシュは全て消える） ---
  w = bootWorld(b);
  w.ps.join(p);
  assert.equal(w.ps.dataFor(p.id).gold, 123);
  assert.equal(w.ws.world.story.chapter, 2);
});

test("複数人（4人）のデータが混同されない", () => {
  const b = memoryBackend();
  let w = bootWorld(b);
  const players = ["A", "B", "C", "D"].map((n, i) => fakePlayer(String(-10 - i), n));
  const uids = players.map((p) => w.ps.join(p).uid);
  assert.equal(new Set(uids).size, 4);
  players.forEach((p, i) => w.ps.update(p.id, (d) => (d.gold = (i + 1) * 100), { important: true }));
  // 途中退出・途中参加
  w.ps.leave(players[1].id);
  w.ps.update(players[0].id, (d) => (d.gold += 1), { important: true });
  w.ps.join(players[1]);
  w = bootWorld(b);
  players.forEach((p) => w.ps.join(p));
  assert.deepEqual(players.map((p) => w.ps.dataFor(p.id).gold), [101, 200, 300, 400]);
  assert.deepEqual(players.map((p) => w.ps.dataFor(p.id).name), ["A", "B", "C", "D"]);
});

test("不在プレイヤーのデータは変化しない（他人の更新が及ばない）", () => {
  const b = memoryBackend();
  const { ps } = bootWorld(b);
  const a = fakePlayer("-1", "A");
  const c = fakePlayer("-2", "C");
  const uidA = ps.join(a).uid;
  ps.join(c);
  ps.leave(a.id);
  const before = JSON.stringify(ps.peekOffline(uidA));
  ps.update(c.id, (d) => (d.gold = 999), { important: true });
  assert.equal(JSON.stringify(ps.peekOffline(uidA)), before);
  assert.equal(ps.update(a.id, (d) => (d.gold = 5)), false); // オフラインは更新できない
});

test("エンティティ側の識別IDが失われても索引から同じデータに戻れる", () => {
  const b = memoryBackend();
  let w = bootWorld(b);
  const p = fakePlayer("-1", "たろう");
  const uid = w.ps.join(p).uid;
  w.ps.update(p.id, (d) => (d.gold = 50), { important: true });
  w.ps.leave(p.id);
  p.props.clear();
  w = bootWorld(b);
  const r = w.ps.join(p);
  assert.equal(r.uid, uid);
  assert.equal(w.ps.dataFor(p.id).gold, 50);
  assert.ok(r.notices.length > 0);
});

test("同じ識別IDを持つ別人が同時に参加しても、データを共有しない", () => {
  const b = memoryBackend();
  const { ps } = bootWorld(b);
  const a = fakePlayer("-1", "A");
  const uid = ps.join(a).uid;
  const copy = fakePlayer("-2", "B", new Map([[PLAYER_UID_PROPERTY, uid]]));
  const r = ps.join(copy);
  assert.notEqual(r.uid, uid);
  assert.equal(r.isNew, true);
});

test("個人データの破損：バックアップから復旧し本人に通知", () => {
  const b = memoryBackend();
  let w = bootWorld(b);
  const p = fakePlayer("-1", "たろう");
  const uid = w.ps.join(p).uid;
  w.ps.update(p.id, (d) => (d.gold = 10), { important: true });
  w.ps.update(p.id, (d) => (d.gold = 20), { important: true });
  w.ps.leave(p.id); // 最新 = gold 20（退出時の保存）
  const name = recordNameForUid(uid);
  const meta = JSON.parse(b.get(`mnq:${name}:m`));
  b.map.set(`mnq:${name}:${meta.active}0`, "壊れたデータ");
  w = bootWorld(b);
  const r = w.ps.join(p);
  assert.equal(r.status, "recovered");
  assert.equal(w.ps.dataFor(p.id).gold, 20);
  assert.ok(r.notices.some((n) => n.includes("復旧")));
  assert.ok(w.ws.index.system.recoveries.length > 0);
});

test("個人データの完全破損：退避してから初期化", () => {
  const b = memoryBackend();
  let w = bootWorld(b);
  const p = fakePlayer("-1", "たろう");
  const uid = w.ps.join(p).uid;
  w.ps.leave(p.id);
  const name = recordNameForUid(uid);
  for (const k of [...b.map.keys()]) if (k.startsWith(`mnq:${name}:`) && !k.endsWith(":m")) b.map.set(k, "x");
  w = bootWorld(b);
  const r = w.ps.join(p);
  assert.equal(r.status, "reset");
  assert.ok([...b.map.keys()].some((k) => k.startsWith(`mnq:q:${name}:`)));
});

test("欠けた項目は読み込み時に補完される（アップデートで項目が増えた場合）", () => {
  const b = memoryBackend();
  let w = bootWorld(b);
  const p = fakePlayer("-1", "たろう");
  const uid = w.ps.join(p).uid;
  w.ps.leave(p.id);
  // 古い形式を模擬：limitBreak が無いデータ
  const name = recordNameForUid(uid);
  const env = w.store.read(name).envelope;
  delete env.d.limitBreak;
  env.d.gold = 42;
  w.store.write(name, "player", env.s, env.d);
  w = bootWorld(b);
  w.ps.join(p);
  const d = w.ps.dataFor(p.id);
  assert.deepEqual(d.limitBreak, { stage: 0, unlocked: [], history: [] });
  assert.equal(d.gold, 42);
});

test("新しいバージョンで保存されたデータは上書きしない（保護モード）", () => {
  const b = memoryBackend();
  let w = bootWorld(b);
  const p = fakePlayer("-1", "たろう");
  const uid = w.ps.join(p).uid;
  w.ps.leave(p.id);
  const name = recordNameForUid(uid);
  const env = w.store.read(name).envelope;
  w.store.write(name, "player", PLAYER_SCHEMA_VERSION + 1, { ...env.d, gold: 5, futureField: true });
  const rawBefore = b.get(`mnq:${name}:m`);
  w = bootWorld(b);
  const r = w.ps.join(p);
  assert.equal(r.status, "protected");
  assert.equal(w.ps.update(p.id, (d) => (d.gold = 0), { important: true }), false);
  w.ps.leave(p.id);
  w.ps.flushDirty(99);
  assert.equal(b.get(`mnq:${name}:m`), rawBefore);
});

test("ワールド共有データ：初期状態とバージョン記録", () => {
  const b = memoryBackend();
  const { ws } = bootWorld(b);
  const wd = ws.world;
  assert.equal(wd.story.chapter, 0);
  assert.deepEqual(wd.settings.restrictions, { blockBreak: false, blockPlace: false, blockInteract: false });
  for (const k of ["story", "regions", "dungeons", "bosses", "uniqueItems", "uniqueTitles", "events", "dungeonResume"]) assert.ok(k in wd, k);
  assert.equal(ws.index.system.addonVersion.length > 0, true);
  assert.equal(ws.index.system.versionHistory.length, 1);
  bootWorld(b); // 再起動してもバージョン履歴は増えない
  assert.equal(bootWorld(b).ws.index.system.versionHistory.length, 1);
});

test("自動保存は1回あたりの書き込み件数が制限される（負荷分散）", () => {
  const b = memoryBackend();
  const { ps } = bootWorld(b);
  const ps4 = ["A", "B", "C", "D"].map((n, i) => fakePlayer(String(-i - 1), n));
  ps4.forEach((p) => ps.join(p));
  ps4.forEach((p) => ps.update(p.id, (d) => (d.exp += 1)));
  assert.equal(ps.dirtyCount(), 4);
  assert.equal(ps.flushDirty(2), 2);
  assert.equal(ps.dirtyCount(), 2);
});
