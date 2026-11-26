// =============================================================
// 職業共通スキル（系統ごと）と、職業融合による特殊スキル（第4弾）
// ・共通スキル：その系統を主軸とする職業、またはその系統と融合した職業で使える
// ・融合特殊スキル：現在の職業が2つの系統を両方含む（主軸＋融合）ときだけ使える
// =============================================================
import { S, P } from "./helpers.js";

const line = (lineId, opt) => S({ category: "job", lines: [lineId], learn: [{ method: "jobLevel", conditions: [{ type: "jobLine", line: lineId }, { type: "currentJobLevel", min: opt.minJobLevel ?? 5 }] }], ...opt });
const fusion = (a, b, opt) => S({ category: "job", fusionLines: [a, b], rarity: "rare", learn: [{ method: "jobFusion", conditions: [{ type: "jobHasLines", lines: [a, b] }, { type: "currentJobLevel", min: 10 }] }], ...opt });

export const LINE_SKILLS = [
  line("warrior", { id: "line.warrior.provoke", name: "挑発", description: "周囲の敵を怒らせて自分に引きつけ、守りを固める。", elements: ["none"], cost: { stamina: 10 }, cooldown: 160, shape: "circle", range: 6, duration: 160, effect: { type: "shield", buff: { derived: { pct: { physDef: 15 } } }, alsoDebuff: [{ id: "weakness", amplifier: 0 }], self: true }, actions: ["charge", "jump"] }),
  line("warrior", { id: "line.warrior.war_cry", name: "雄叫び", description: "仲間の物理攻撃力を高める。", elements: ["none"], cost: { stamina: 15 }, cooldown: 300, shape: "party", range: 8, target: "ally", duration: 400, effect: { type: "buff", buff: { derived: { pct: { physAtk: 12 } } } }, actions: ["jump", "tap"], minJobLevel: 10 }),
  line("mage", { id: "line.mage.concentrate", name: "魔力集中", description: "魔力を集中させ、次の魔法を強める。", elements: ["none"], cost: { mp: 5 }, cooldown: 200, shape: "self", target: "self", duration: 200, effect: { type: "buff", buff: { derived: { pct: { magAtk: 20 } } } } }),
  line("mage", { id: "line.mage.magic_ward", name: "魔法障壁", description: "魔法攻撃を防ぐ障壁を張る。", elements: ["space"], cost: { mp: 12 }, cooldown: 240, shape: "party", range: 5, target: "ally", duration: 300, effect: { type: "shield", buff: { derived: { pct: { magDef: 30 } } } }, actions: ["charge", "tap"], minJobLevel: 10 }),
  line("thief", { id: "line.thief.evade_step", name: "回避ステップ", description: "素早く横へ跳んで攻撃をかわす。", elements: ["wind"], cost: { stamina: 8 }, cooldown: 30, shape: "self", target: "self", effect: { type: "dash", force: 1.0, sideways: true }, actions: ["sprint", "jump"] }),
  line("thief", { id: "line.thief.keen_eye", name: "鷹の眼", description: "感覚を研ぎ澄ませ、命中とクリティカルを高める。", elements: ["none"], cost: { stamina: 8 }, cooldown: 240, shape: "self", target: "self", duration: 400, effect: { type: "buff", buff: { derived: { flat: { hitRate: 10, critRate: 8 } } } }, minJobLevel: 10 }),
  line("priest", { id: "line.priest.first_aid", name: "応急手当", description: "自分の傷を手早く手当てする。", elements: ["life"], cost: { mp: 4 }, cooldown: 60, shape: "self", target: "self", power: P(18, 4, { mnd: 0.8, lif: 0.8 }, "heal"), effect: { type: "heal" } }),
  line("priest", { id: "line.priest.prayer", name: "祈り", description: "祈りで仲間の魔力の回復を高める。", elements: ["holy"], cost: { mp: 5 }, cooldown: 300, shape: "party", range: 8, target: "ally", duration: 600, effect: { type: "buff", buff: { derived: { pct: { mpRegen: 60 } } } }, minJobLevel: 10 }),
];

export const FUSION_LINE_SKILLS = [
  fusion("warrior", "mage", { id: "fusion_job.magic_blade", name: "魔法剣", description: "剣に魔力を通して斬る。", elements: ["none"], cost: { mp: 8, stamina: 10 }, cooldown: 50, shape: "cone", range: 3.5, power: P(34, 5, { str: 0.7, mag: 0.7 }, "physical"), effect: { type: "melee" }, actions: ["tap", "charge"] }),
  fusion("warrior", "thief", { id: "fusion_job.gale_slash", name: "疾風斬", description: "駆け抜けながら斬る。", elements: ["wind"], cost: { stamina: 16 }, cooldown: 50, distance: 6, power: P(30, 5, { str: 0.7, agi: 0.7 }, "physical"), effect: { type: "dash", force: 1.6, strikeRadius: 2.5 }, actions: ["sprint"] }),
  fusion("warrior", "priest", { id: "fusion_job.holy_bash", name: "聖なる盾撃", description: "盾で打ちつつ自分を癒す。", elements: ["holy"], cost: { mp: 6, stamina: 10 }, cooldown: 60, shape: "cone", range: 3, power: P(24, 4, { str: 0.6, mnd: 0.6 }, "physical"), effect: { type: "melee", selfHeal: 0.3 }, actions: ["tap", "charge"] }),
  fusion("mage", "thief", { id: "fusion_job.illusion_mist", name: "幻惑の霧", description: "幻の霧で敵を惑わす。", elements: ["mind"], cost: { mp: 12 }, cooldown: 120, shape: "circle", range: 5, duration: 100, effect: { type: "debuff", center: "self", statusEffects: [{ id: "slowness", amplifier: 1 }, { id: "blindness", amplifier: 0 }] }, actions: ["jump", "tap"] }),
  fusion("mage", "priest", { id: "fusion_job.holy_magic_bullet", name: "聖魔の弾丸", description: "聖と魔の力を合わせた魔弾。", elements: ["holy", "dark"], cost: { mp: 10 }, cooldown: 40, distance: 16, power: P(32, 5, { mag: 0.8, mnd: 0.6 }), effect: { type: "projectile", pierce: 1 } }),
  fusion("thief", "priest", { id: "fusion_job.healing_arrow", name: "癒しの射法", description: "仲間に当てると傷を癒す矢。周囲の仲間を少し回復する。", elements: ["life"], cost: { mp: 8 }, cooldown: 60, shape: "party", range: 10, target: "ally", power: P(20, 4, { dex: 0.5, mnd: 0.8 }, "heal"), effect: { type: "heal" } }),
];
