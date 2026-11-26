// 第5弾（v0.5.0）統合シナリオ：main.js をモックエンジンで起動し、通常攻撃・敵の攻撃（ガード）・スキル・ダミー・予告攻撃を確認
import assert from "node:assert/strict";
import { world, system, __test, ItemStack } from "@minecraft/server";
console.log = () => {};
console.warn = () => {};
await import("../../packs/BP/scripts/main.js");
const { ctx } = await import("../../packs/BP/scripts/core/context.js");
const { telegraphAttack } = await import("../../packs/BP/scripts/combat/bossRuntime.js");
const result = { phase: "combat", checks: [] };
const ok = (n) => result.checks.push(n);
world.afterEvents.worldLoad.fire({});
await __test.tick(1);
const a = __test.addPlayer("-1", "勇者A", {});
const b = __test.addPlayer("-2", "勇者B", {});
for (const p of [a, b]) world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });
await __test.tick(5);

// 通常攻撃：バニラで7入った攻撃を戦闘計算に合わせて調整（二重に入らない）
a.inventory.slots[0] = new ItemStack("minecraft:iron_sword", 1);
const z = __test.spawnMob("minecraft:zombie", ["monster", "mob", "undead"], { x: 0, y: 64, z: 2 });
z.health.setCurrentValue(z.health.currentValue - 7);
world.afterEvents.entityHurt.fire({ hurtEntity: z, damage: 7, damageSource: { cause: "entityAttack", damagingEntity: a } });
const lost = 20 - z.health.currentValue;
const r = ctx.combat.enemies.get(z.id);
assert.ok(r && lost > 0 && lost < 20, `lost ${lost}`);
assert.ok(Math.abs(lost - (ctx.combat.players.get(a.id).battle.dealt * 0.1) / r.hpScale) < 0.2, "バニラ＋差分＝戦闘計算");
ok(`通常攻撃：戦闘計算の結果だけが入る（バニラ7 → 実際 ${lost.toFixed(2)}・2人の補正 ${r.hpScale}）`);

// 敵の攻撃：しゃがみ始めて直後はジャストガード → ダメージの大半が戻る
a.isSneaking = true;
await __test.tick(2);
const before = a.health.currentValue;
__test.hurt(a, z, 6);
assert.ok(before - a.health.currentValue < 1.5, `受けた ${before - a.health.currentValue}`);
assert.equal(ctx.combat.players.get(a.id).battle.justGuards, 1);
a.isSneaking = false;
ok("ジャストガード：受けたダメージの9割を戻し、反撃のチャンス");

// 仲間への誤攻撃は無効
const hb = b.health.currentValue;
b.health.setCurrentValue(hb - 3);
world.afterEvents.entityHurt.fire({ hurtEntity: b, damage: 3, damageSource: { cause: "entityAttack", damagingEntity: a } });
assert.equal(b.health.currentValue, hb);
ok("仲間への誤攻撃は無効");

// スキル：火球（属性・熟練度・戦闘ログ）
ctx.skillService.grant(a.id, "fire_ball");
ctx.skillBindings.bind(a.id, 0, "tap", "fire_ball");
ctx.playerService.update(a.id, (d) => (d.vitals.mp = d.vitals.mpMax));
z.location = { x: 4, y: 64, z: 2 }; // 火球の射線から外す
const s = __test.spawnMob("minecraft:stray", ["monster", "mob"], { x: 0, y: 64, z: 5 });
const res = ctx.skillBindings.tryActivate(a.id, 0, "tap", a);
assert.equal(res.ok, true, res.reason);
assert.ok(s.health.currentValue < 20);
assert.ok([...ctx.combat.enemies.get(s.id).discovered].includes("fire:major_weak"));
ok("スキルの攻撃も共通の戦闘計算（ストレイに火は大弱点 → 弱点を発見）");

// 予告攻撃：範囲内で回避していないと受ける
const hp0 = b.health.currentValue;
b.location = { x: 4, y: 64, z: 3 };
telegraphAttack(z, { name: "テストの叩きつけ", radius: 5, ticks: 20, damage: 30 });
await __test.tick(25);
assert.ok(b.health.currentValue < hp0);
assert.ok(b.actionBar.some((t) => t.includes("テストの叩きつけ")));
ok("攻撃予告（名前・範囲の表示）→ 予告時間の後に判定");

// 戦闘終了：一定時間でログが保存される
await __test.tick(260);
assert.ok(ctx.playerService.dataFor(a.id).combatLog.battles.length >= 1);
ok("戦闘終了後に戦闘ログを保存（件数上限あり）");
process.stdout.write(JSON.stringify(result));
