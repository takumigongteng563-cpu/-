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
