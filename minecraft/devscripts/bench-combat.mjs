// 戦闘モジュールの処理負荷測定（第5弾）。結果を docs/combat/処理負荷測定結果.md に書き出す
// Node（PC）上の純粋な計算の測定。実機（Switch）の数値ではない
import fs from "node:fs";
import { performance } from "node:perf_hooks";
console.warn = () => {};
const { memoryBackend, fakePlayer } = await import("../tests/helpers.mjs");
const { createApp, joinPlayer } = await import("../packs/BP/scripts/app.js");
const { computeDamage } = await import("../packs/BP/scripts/combat/damageCalc.js");
const { ADDON_VERSION } = await import("../packs/BP/scripts/config.js");
const { STATUS_IDS } = await import("../packs/BP/scripts/content/combat/statusEffects.js");
const tick = { t: 0 };
const app = createApp(memoryBackend(), () => tick.t);
app.worldService.load();
const ps = [1, 2, 3, 4].map((i) => {
  const p = fakePlayer(String(-i), `P${i}`);
  joinPlayer(app, p);
  return p;
});
const cs = app.combat;
const time = (n, fn) => {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn(i);
  return (performance.now() - t0) / n;
};
const rows = [];
rows.push(["computeDamage 1回", time(20000, () => computeDamage({ derived: { physAtk: 100, critRate: 20, critMultiplier: 1.5 } }, { profile: { def: 20, mdef: 10, element: "ice", resist: {}, caps: {} }, maxHp: 200 }, { type: "elemental", base: 100, elements: ["fire", "wind"] }))]);
rows.push(["playerAttack 1回（計算・状態異常・融合・コンボ・ヘイト・体勢・ログ）", time(20000, (i) => cs.playerAttack(ps[i % 4].id, { id: `e${i % 64}`, typeId: "minecraft:zombie", maxHp: 20 }, { type: "elemental", base: 80, elements: [["fire", "wind", "water", "thunder"][i % 4]], skillId: `s${i % 7}` }))]);
// 4人が同時に奥義：1人あたり12体に命中
rows.push(["4人同時の奥義（4×12体に命中）", time(500, (i) => {
  for (const p of ps) for (let k = 0; k < 12; k++) cs.playerAttack(p.id, { id: `u${k}`, typeId: "minecraft:husk", maxHp: 20 }, { type: "elemental", base: 300, skillMult: 3, elements: ["holy"], skillId: `ult${i}` });
})]);
for (let i = 0; i < 64; i++) for (const sid of STATUS_IDS.slice(0, 5)) cs.applyStatus(`e${i}`, sid, { force: true });
rows.push([`1秒ごとの処理 tick（敵${cs.enemies.size}体・状態異常${[...cs.status.values()].reduce((t, b) => t + Object.keys(b.list).length, 0)}件）`, time(200, () => cs.tick())]);
rows.push(["incoming（敵の攻撃1回：ガード判定）", time(20000, (i) => cs.incoming(ps[i % 4].id, { id: "e1", typeId: "minecraft:zombie" }, 3))]);
const ms = (v) => `${(v).toFixed(4)} ms`;
const out = [
  `# 処理負荷測定結果（v${ADDON_VERSION}）`,
  "",
  "`node devscripts/bench-combat.mjs` で測定（PC の Node.js 上。**実機（Switch）では未測定**）。",
  "1tick は 50ms。戦闘の処理は1回の攻撃・1秒ごとの処理だけで、毎tickの処理はない（ガード・回避の確認は2tickごと・戦闘中の人だけ）。",
  "",
  "| 処理 | 1回あたり |",
  "|---|---:|",
  ...rows.map(([n, v]) => `| ${n} | ${ms(v)} |`),
  "",
  `- 同時に管理する敵は最大 ${64} 体（超えると古い順に破棄）。状態異常の継続ダメージは1秒ごとに最大64件まとめて処理`,
  "- 召喚獣は1人2体・ワールド8体まで、パーティクルは1回の発動で24個・属性融合で12個まで",
  "- 実機ではエンティティの検索・applyDamage・パーティクル表示の方が重い。半径を限定（スキル範囲・融合は最大12体）している",
  "",
];
fs.writeFileSync("docs/combat/処理負荷測定結果.md", out.join("\n"));
console.log(rows.map(([n, v]) => `${n}: ${ms(v)}`).join("\n"));
