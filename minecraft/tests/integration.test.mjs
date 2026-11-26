// main.js をモックエンジン上で3回起動し、ワールド再起動をまたいだ動作を確認する
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(stateFile, phase) {
  const out = execFileSync(process.execPath, ["--import", "./tests/mock/loader.mjs", "tests/integration/session.mjs", stateFile, phase], {
    cwd: root,
    encoding: "utf8",
  });
  return JSON.parse(out);
}

test("統合：初回起動 → 再起動 → 再々起動 → 予備初期化", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mnq-"));
  const stateFile = path.join(dir, "state.json");
  for (const phase of ["first", "restart", "third", "fallback"]) {
    const r = run(stateFile, phase);
    assert.equal(r.phase, phase);
    for (const c of r.checks) console.log(`  [${phase}] ✔ ${c}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

function runRpg(stateFile, phase) {
  const out = execFileSync(process.execPath, ["--import", "./tests/mock/loader.mjs", "tests/integration/rpgSession.mjs", stateFile, phase], {
    cwd: root,
    encoding: "utf8",
  });
  return JSON.parse(out);
}

test("統合（第2弾）：第1弾のセーブデータから更新 → 戦闘・成長・メニュー・管理者 → 強制終了後の再起動", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mnq2-"));
  const stateFile = path.join(dir, "state.json");
  fs.copyFileSync(path.join(root, "tests/fixtures/v1-state.json"), stateFile);
  for (const phase of ["upgrade", "rpg", "rpg-restart"]) {
    const r = runRpg(stateFile, phase);
    assert.equal(r.phase, phase);
    for (const c of r.checks) console.log(`  [${phase}] ✔ ${c}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

function runFinal(stateFile, phase) {
  const out = execFileSync(process.execPath, ["--import", "./tests/mock/loader.mjs", "tests/integration/finalSession.mjs", stateFile, phase], {
    cwd: root,
    encoding: "utf8",
  });
  return JSON.parse(out);
}

test("統合（最終仕様対応）：第2弾のセーブデータから更新 → 操作判定・ステージ・王国 → 再起動", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mnq3-"));
  const stateFile = path.join(dir, "state.json");
  fs.copyFileSync(path.join(root, "tests/fixtures/v2-state.json"), stateFile);
  for (const phase of ["upgrade2", "final-restart"]) {
    const r = runFinal(stateFile, phase);
    assert.equal(r.phase, phase);
    for (const c of r.checks) console.log(`  [${phase}] ✔ ${c}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("統合（第3弾）：v0.2.1 のセーブデータから更新 → 職業メニューで転職・職業融合・ツリー・管理者テスト → 再起動", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mnq4-"));
  const stateFile = path.join(dir, "state.json");
  fs.copyFileSync(path.join(root, "tests/fixtures/v021-state.json"), stateFile);
  for (const phase of ["jobs", "jobs-restart"]) {
    const out = execFileSync(process.execPath, ["--import", "./tests/mock/loader.mjs", "tests/integration/jobSession.mjs", stateFile, phase], { cwd: root, encoding: "utf8" });
    const r = JSON.parse(out);
    assert.equal(r.phase, phase);
    for (const c of r.checks) console.log(`  [${phase}] ✔ ${c}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("統合（第5弾）：通常攻撃・ガード・誤攻撃無効・スキル・攻撃予告・戦闘ログ", () => {
  const out = execFileSync(process.execPath, ["--import", "./tests/mock/loader.mjs", "tests/integration/combatSession.mjs"], { cwd: root, encoding: "utf8" });
  const r = JSON.parse(out);
  for (const c of r.checks) console.log(`  [combat] ✔ ${c}`);
  assert.equal(r.checks.length, 6);
});
