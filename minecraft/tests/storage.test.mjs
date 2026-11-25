import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryBackend, makeStore } from "./helpers.mjs";
import { migrate } from "../packs/BP/scripts/storage/migration.js";
import { conform } from "../packs/BP/scripts/storage/sanitize.js";

test("書き込んだデータを読み出せる（日本語を含む）", () => {
  const s = makeStore(memoryBackend());
  const r = s.write("x", "t", 1, { name: "魔神野口🔥", n: 3 });
  assert.equal(r.ok, true);
  const got = s.read("x");
  assert.equal(got.status, "ok");
  assert.deepEqual(got.envelope.d, { name: "魔神野口🔥", n: 3 });
});

test("保存値はASCIIのみ（チャンク境界でマルチバイト文字が壊れない）", () => {
  const b = memoryBackend();
  const s = makeStore(b, 97); // 奇数長で区切り位置をずらす
  const data = { text: "菫・山羊・水牛".repeat(50) + "😀".repeat(20) };
  s.write("x", "t", 1, data);
  for (const v of b.map.values()) assert.match(v, /^[\x00-\x7f]*$/);
  assert.deepEqual(s.read("x").envelope.d, data);
});

test("大きなデータは複数チャンクに分割され、縮んだときに余分なチャンクが消える", () => {
  const b = memoryBackend();
  const s = makeStore(b, 100);
  s.write("x", "t", 1, { big: "a".repeat(1000) });
  s.write("x", "t", 1, { big: "a".repeat(1000) });
  const before = [...b.map.keys()].length;
  s.write("x", "t", 1, { small: 1 });
  s.write("x", "t", 1, { small: 2 });
  assert.ok([...b.map.keys()].length < before);
  assert.deepEqual(s.read("x").envelope.d, { small: 2 });
});

test("A/Bスロットが交互に使われ、前回分がバックアップとして残る", () => {
  const b = memoryBackend();
  const s = makeStore(b);
  s.write("x", "t", 1, { v: 1 });
  s.write("x", "t", 1, { v: 2 });
  const meta = JSON.parse(b.get("mnq:x:m"));
  assert.equal(meta.active, "b");
  assert.ok(b.get("mnq:x:a0").includes('"v":1'));
});

test("破損検知：最新スロットが壊れたらバックアップから復旧", () => {
  const b = memoryBackend();
  const s = makeStore(b);
  s.write("x", "t", 1, { v: 1 });
  s.write("x", "t", 1, { v: 2 });
  b.map.set("mnq:x:b0", b.get("mnq:x:b0").replace('"v":2', '"v":9')); // 改ざん
  const r = s.read("x");
  assert.equal(r.status, "recovered");
  assert.deepEqual(r.envelope.d, { v: 1 });
  assert.ok(r.errors.some((e) => e.includes("チェックサム")));
});

test("破損検知：チャンク欠損", () => {
  const b = memoryBackend();
  const s = makeStore(b, 10);
  s.write("x", "t", 1, { v: "1234567890123" });
  s.write("x", "t", 1, { v: "abcdefghijklm" });
  b.map.delete("mnq:x:b1");
  const r = s.read("x");
  assert.equal(r.status, "recovered");
  assert.equal(r.envelope.d.v, "1234567890123");
});

test("メタ情報が壊れても、チャンクから新しい世代を復旧", () => {
  const b = memoryBackend();
  const s = makeStore(b);
  s.write("x", "t", 1, { v: 1 });
  s.write("x", "t", 1, { v: 2 });
  b.map.set("mnq:x:m", "{broken");
  const r = s.read("x");
  assert.equal(r.status, "recovered");
  assert.deepEqual(r.envelope.d, { v: 2 });
  // メタ消失後の書き込みは読める方のスロットを上書きしない
  const w = s.write("x", "t", 1, { v: 3 });
  assert.equal(w.ok, true);
  assert.deepEqual(s.read("x").envelope.d, { v: 3 });
});

test("両スロット破損は corrupt、退避（quarantine）できる", () => {
  const b = memoryBackend();
  const s = makeStore(b);
  s.write("x", "t", 1, { v: 1 });
  s.write("x", "t", 1, { v: 2 });
  b.map.set("mnq:x:a0", "garbage");
  b.map.set("mnq:x:b0", "garbage2");
  const r = s.read("x");
  assert.equal(r.status, "corrupt");
  const q = s.quarantine("x");
  assert.ok(q);
  const qr = s.read(q);
  assert.equal(qr.status, "ok");
  assert.equal(qr.envelope.d.raw.a, "garbage");
});

test("存在しないレコードは missing", () => {
  assert.equal(makeStore(memoryBackend()).read("none").status, "missing");
});

test("書き込み途中の失敗では前回のデータが残る", () => {
  const b = memoryBackend();
  const s = makeStore(b, 100);
  s.write("x", "t", 1, { v: "ok" });
  let calls = 0;
  const origSet = b.set.bind(b);
  b.set = (k, v) => {
    if (++calls === 2) throw new Error("容量不足");
    origSet(k, v);
  };
  const r = s.write("x", "t", 1, { v: "x".repeat(500) });
  assert.equal(r.ok, false);
  b.set = origSet;
  assert.deepEqual(s.read("x").envelope.d, { v: "ok" });
});

test("移行処理：古いバージョンから順に適用される", () => {
  const m = { 1: (d) => ({ ...d, a: 1 }), 2: (d) => ({ ...d, b: d.a + 1 }) };
  const r = migrate({}, 1, 3, m);
  assert.deepEqual(r.data, { a: 1, b: 2 });
  assert.equal(r.schema, 3);
  assert.equal(r.changed, true);
});

test("移行処理：保存データの方が新しい場合は fromFuture", () => {
  const r = migrate({ z: 1 }, 5, 3, {});
  assert.equal(r.fromFuture, true);
  assert.deepEqual(r.data, { z: 1 });
});

test("移行処理：未定義の段階があれば例外", () => {
  assert.throws(() => migrate({}, 1, 3, { 1: (d) => d }));
});

test("conform：欠損補完・型修復・未知の項目は残す", () => {
  const repairs = [];
  const out = conform({ a: "x", c: { d: 1 }, extra: 42 }, { a: 1, b: "s", c: { d: 0, e: [] } }, "", repairs);
  assert.deepEqual(out, { a: 1, b: "s", c: { d: 1, e: [] }, extra: 42 });
  assert.equal(repairs.length, 3);
});

test("アップデート時の移行：v1 で保存 → v2 のアドオンで読み込むと移行・補完され、保存される", async () => {
  const { RecordManager } = await import("../packs/BP/scripts/storage/recordManager.js");
  const b = memoryBackend();
  const s = makeStore(b);
  s.write("p.x", "player", 1, { hp: 10, name: "A" });
  const rm = new RecordManager(s, {
    kind: "player",
    schema: 2,
    migrations: { 1: (d) => ({ ...d, vitals: { hp: d.hp } }) },
    conform: (raw) => {
      const repairs = [];
      if (!("mp" in raw)) {
        raw.mp = 0;
        repairs.push("mp");
      }
      return { data: raw, repairs };
    },
  });
  const e = rm.open("p.x", () => ({}));
  assert.deepEqual(e.data, { hp: 10, name: "A", vitals: { hp: 10 }, mp: 0 });
  assert.equal(e.dirty, true);
  rm.flushAll();
  const r = s.read("p.x");
  assert.equal(r.envelope.s, 2);
  assert.deepEqual(r.envelope.d.vitals, { hp: 10 });
});
