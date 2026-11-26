// =============================================================
// 武器専用スキル（第4弾）：武器の種類ごと。使える条件＝現在の職業の得意武器にその武器がある
// （装備システム（第6弾）の実装後は「装備している武器」で判定する予定）
// =============================================================
import { S, P, learn } from "./helpers.js";

const w = (id, weapon, name, description, opt) =>
  S({
    id: `weapon.${id}`,
    name,
    description,
    category: "weapon",
    weapons: [weapon],
    learn: [{ method: "weaponMastery", conditions: [{ type: "jobWeapon", weapon }, { type: "mastery", kind: "weapon", key: weapon, min: 3 }] }, { method: "jobLevel", conditions: [{ type: "jobWeapon", weapon }, { type: "currentJobLevel", min: 10 }] }],
    ...opt,
  });
const phys = (k = 1) => ({ str: 1 * k, dex: 0.4 * k });

export const WEAPON_SKILLS = [
  w("sword", "sword", "剣閃", "鋭い一閃で前方を斬る。", { elements: ["none"], cost: { stamina: 10 }, cooldown: 30, shape: "cone", range: 3.5, power: P(26, 4, phys(), "physical"), effect: { type: "melee" } }),
  w("greatsword", "greatsword", "大旋風", "大剣を振り回して周囲を薙ぐ。", { elements: ["wind"], cost: { stamina: 22 }, cooldown: 70, shape: "circle", range: 4.5, power: P(40, 6, phys(1.2), "physical"), effect: { type: "melee", center: "self" }, actions: ["charge"] }),
  w("katana", "katana", "居合", "納刀から一瞬で斬り抜ける。", { elements: ["none"], cost: { stamina: 14 }, cooldown: 50, shape: "cone", range: 4, power: P(36, 5, { dex: 1, str: 0.6 }, "physical"), effect: { type: "melee" }, actions: ["charge", "tap"] }),
  w("dual", "dual", "双連撃", "二刀で素早く斬りつける。", { elements: ["none"], cost: { stamina: 12 }, cooldown: 24, shape: "cone", range: 3, power: P(12, 2, { dex: 0.8, agi: 0.4 }, "physical"), effect: { type: "melee", hits: 4 } }),
  w("dagger", "dagger", "急所突き", "背後に回って急所を突く。", { elements: ["none"], cost: { stamina: 12 }, cooldown: 40, distance: 5, power: P(30, 5, { dex: 1, agi: 0.6 }, "physical"), effect: { type: "dash", force: 1.2, strikeRadius: 2 }, actions: ["sprint"] }),
  w("axe", "axe", "兜割り", "斧を振り下ろし、防御ごと叩き割る。", { elements: ["none"], cost: { stamina: 18 }, cooldown: 60, shape: "cone", range: 3, power: P(42, 6, phys(1.3), "physical"), effect: { type: "melee", statusEffects: [{ id: "weakness", amplifier: 0 }] }, duration: 60, actions: ["charge"] }),
  w("spear", "spear", "薙ぎ払い", "長い槍で広く払う。", { elements: ["none"], cost: { stamina: 14 }, cooldown: 40, shape: "cone", range: 5, power: P(24, 4, phys(), "physical"), effect: { type: "melee", knockback: 0.8 } }),
  w("lance", "lance", "突撃", "騎槍を構えて一直線に突撃する。", { elements: ["none"], cost: { stamina: 20 }, cooldown: 60, distance: 8, power: P(36, 6, { str: 1, agi: 0.5 }, "physical"), effect: { type: "dash", force: 2, strikeRadius: 2.5 }, actions: ["sprint"] }),
  w("shield", "shield", "シールドバッシュ", "盾で殴りつけて押し返す。", { elements: ["none"], cost: { stamina: 12 }, cooldown: 40, shape: "cone", range: 2.5, power: P(16, 3, { vit: 1, str: 0.4 }, "physical"), effect: { type: "melee", knockback: 1.5, statusEffects: [{ id: "slowness", amplifier: 1 }] }, duration: 40 }),
  w("mace", "mace", "鉄槌", "重い一撃で地面ごと揺らす。", { elements: ["earth"], cost: { stamina: 16 }, cooldown: 50, shape: "circle", range: 3, power: P(30, 5, phys(1.1), "physical"), effect: { type: "melee", center: "self" }, actions: ["charge", "jump"] }),
  w("fist", "fist", "正拳突き", "腰の入った正拳。", { elements: ["none"], cost: { stamina: 8 }, cooldown: 20, shape: "cone", range: 2.5, power: P(18, 3, { str: 0.8, agi: 0.5 }, "physical"), effect: { type: "melee" } }),
  w("scythe", "scythe", "刈り取り", "大鎌で周囲の命を刈る。", { elements: ["dark"], cost: { stamina: 18 }, cooldown: 60, shape: "circle", range: 4, power: P(34, 5, phys(1.1), "physical"), effect: { type: "melee", center: "self" }, actions: ["charge"] }),
  w("whip", "whip", "打ち据え", "鞭で離れた敵を打ち、動きを止める。", { elements: ["none"], cost: { stamina: 10 }, cooldown: 40, shape: "cone", range: 6, duration: 40, power: P(16, 3, { dex: 1 }, "physical"), effect: { type: "melee", statusEffects: [{ id: "slowness", amplifier: 2 }] } }),
  w("shuriken", "shuriken", "手裏剣投げ", "手裏剣を連続で投げる。", { elements: ["none"], cost: { stamina: 8 }, cooldown: 24, distance: 16, power: P(10, 2, { dex: 1, agi: 0.4 }, "physical"), effect: { type: "projectile", hits: 3 } }),
  w("bow", "bow", "速射", "素早く矢を放つ。", { elements: ["none"], cost: { stamina: 6 }, cooldown: 16, distance: 28, power: P(16, 3, { dex: 1 }, "physical"), effect: { type: "projectile" } }),
  w("crossbow", "crossbow", "重射", "太い矢で敵を貫く。", { elements: ["metal"], cost: { stamina: 14 }, cooldown: 50, distance: 30, power: P(34, 5, { dex: 1, str: 0.4 }, "physical"), effect: { type: "projectile", pierce: 2 }, actions: ["charge", "tap"] }),
  w("staff", "staff", "魔力放出", "杖から魔力をそのまま放つ。", { elements: ["none"], cost: { mp: 4 }, cooldown: 20, distance: 14, power: P(14, 3, { mag: 1, int: 0.3 }), effect: { type: "projectile" } }),
  w("grimoire", "grimoire", "魔導詠唱", "魔導書を読み上げ、次の魔法を強める。", { elements: ["mind"], cost: { mp: 8 }, cooldown: 200, shape: "self", target: "self", duration: 200, effect: { type: "buff", buff: { derived: { pct: { magAtk: 20, castSpeed: 15 } } } } }),
  w("holy_staff", "holy_staff", "聖光杖", "聖杖から光を放ち、仲間を少し癒す。", { elements: ["holy"], cost: { mp: 6 }, cooldown: 40, shape: "party", range: 4, target: "ally", power: P(12, 3, { mnd: 1, lif: 0.4 }, "heal"), effect: { type: "heal" } }),
  w("scripture", "scripture", "祈りの頁", "聖典を開き、仲間の守りを高める。", { elements: ["holy"], cost: { mp: 8 }, cooldown: 200, shape: "party", range: 6, target: "ally", duration: 300, effect: { type: "buff", buff: { derived: { pct: { magDef: 15, statusResist: 10 } } } } }),
  w("orb", "orb", "宝珠の輝き", "宝珠の光で周囲の敵を惑わす。", { elements: ["mind", "light"], cost: { mp: 8 }, cooldown: 80, shape: "circle", range: 4, duration: 60, effect: { type: "debuff", center: "self", statusEffects: [{ id: "slowness", amplifier: 1 }, { id: "weakness", amplifier: 0 }] }, actions: ["jump", "tap"] }),
];

export { learn };
