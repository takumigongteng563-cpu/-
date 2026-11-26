// =============================================================
// 開発者専用：仮想訓練場（第5弾・指示書第27章）。管理者テストからのみ開く（通常のプレイでは使えない）
// 訓練ダミー（倒れない・耐性とHPを変更可）・属性・状態異常・予告攻撃・ボス特殊能力・戦闘ログとダメージ内訳
// =============================================================
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { ctx } from "../../core/context.js";
import { showForm } from "../formUtil.js";
import { showInfoPage } from "./infoPage.js";
import { heading, lines } from "../format.js";
import { ELEMENT_IDS, AFFINITY_LEVELS } from "../../content/combat/elements.js";
import { ELEMENT_NAMES } from "../../content/jobs/catalog.js";
import { STATUS_EFFECTS, STATUS_IDS } from "../../content/combat/statusEffects.js";
import { BOSS_ABILITIES } from "../../content/combat/bossAbilities.js";
import { PARTY_SCALING } from "../../balance/combat.js";
import { DUMMY_TAG, lastTarget } from "../../combat/combatRuntime.js";
import { telegraphAttack, useBossAbility } from "../../combat/bossRuntime.js";
import { isAdmin } from "../../admin/adminAuth.js";

const AFF = Object.keys(AFFINITY_LEVELS);

function dummies(admin) {
  try {
    return admin.dimension.getEntities({ location: admin.location, maxDistance: 32, tags: [DUMMY_TAG] });
  } catch {
    return [];
  }
}

function spawnDummy(admin) {
  const d = admin.getViewDirection();
  const loc = { x: admin.location.x + d.x * 3, y: admin.location.y, z: admin.location.z + d.z * 3 };
  const e = admin.dimension.spawnEntity("minecraft:zombie", loc);
  e.addTag(DUMMY_TAG);
  try {
    e.nameTag = "訓練ダミー";
    e.addEffect("slowness", 20 * 60 * 30, { amplifier: 255, showParticles: false });
    e.addEffect("weakness", 20 * 60 * 30, { amplifier: 255, showParticles: false });
    e.addEffect("fire_resistance", 20 * 60 * 30, { amplifier: 0, showParticles: false });
  } catch {
    // 無視
  }
  ctx.combat.overrides.set(e.id, { profileId: "noguchi:training_dummy" });
  return e;
}

const ACTIONS = [
  { label: "訓練ダミーを出す", run: (a) => (spawnDummy(a), a.sendMessage("§a訓練ダミーを出した（倒れない。受けたダメージは戦闘ログで確認）")) },
  {
    label: "ダミーの属性・耐性・体勢値を変える",
    async run(a) {
      const list = dummies(a);
      if (!list.length) return a.sendMessage("§c近くに訓練ダミーがいない");
      const r = await showForm(
        a,
        new ModalFormData()
          .title("ダミーの設定")
          .dropdown("ダミーの属性", ELEMENT_IDS.map((e) => ELEMENT_NAMES[e]))
          .dropdown("耐性を変える属性", ELEMENT_IDS.map((e) => ELEMENT_NAMES[e]))
          .dropdown("相性", AFF.map((k) => AFFINITY_LEVELS[k].name))
          .textField("体勢値", "100", { defaultValue: "100" })
          .textField("防御力", "5", { defaultValue: "5" })
      );
      if (!r || !r.formValues) return;
      const [el, rel, aff, poise, def] = r.formValues;
      for (const e of list) {
        const prev = ctx.combat.overrides.get(e.id) || { profileId: "noguchi:training_dummy" };
        ctx.combat.overrides.set(e.id, { ...prev, element: ELEMENT_IDS[Number(el)], resist: { ...(prev.resist || {}), [ELEMENT_IDS[Number(rel)]]: AFF[Number(aff)] }, poise: Number(poise) || 100, def: Number(def) || 0 });
        ctx.combat.enemies.delete(e.id); // 次の攻撃から新しい設定
      }
      a.sendMessage("§aダミーの設定を変えた");
    },
  },
  {
    label: "状態異常を付与（自分またはダミー）",
    async run(a) {
      const r = await showForm(a, new ModalFormData().title("状態異常").dropdown("状態異常", STATUS_IDS.map((s) => STATUS_EFFECTS[s].name)).dropdown("対象", ["自分", "近くのダミー"]));
      if (!r || !r.formValues) return;
      const sid = STATUS_IDS[Number(r.formValues[0])];
      const targets = Number(r.formValues[1]) === 0 ? [a] : dummies(a);
      for (const t of targets) ctx.combat.applyStatus(t.id, sid, { force: true, source: a.id });
      a.sendMessage(`§a${STATUS_EFFECTS[sid].name}を付与（${targets.length}体）`);
    },
  },
  {
    label: "予告攻撃のテスト（ガード・回避の確認）",
    run(a) {
      const d = dummies(a)[0];
      if (!d) return a.sendMessage("§c近くに訓練ダミーがいない");
      telegraphAttack(d, { name: "訓練用の大振り", radius: 6, ticks: 40, damage: 60 });
    },
  },
  {
    label: "ボス特殊能力のテスト（ダミーが使う）",
    async run(a) {
      const ids = Object.keys(BOSS_ABILITIES);
      const r = await showForm(a, new ModalFormData().title("ボス特殊能力").dropdown("能力", ids.map((k) => BOSS_ABILITIES[k].name)));
      if (!r || !r.formValues) return;
      const d = dummies(a)[0];
      if (!d) return a.sendMessage("§c近くに訓練ダミーがいない");
      a.sendMessage(useBossAbility(d, ids[Number(r.formValues[0])]) ? "§a発動した" : "§c発動できない（部位破壊などで停止中）");
    },
  },
  {
    label: "直近のダメージ内訳・戦闘ログ",
    async run(a) {
      const lt = lastTarget.get(a.id);
      const d = ctx.playerService.dataFor(a.id);
      const r = lt && lt.result;
      await showInfoPage(
        a,
        "ダメージ内訳",
        lines(
          heading("直近の攻撃"),
          r ? [`ダメージ ${r.damage}（バニラ換算 ${r.vanilla}）${r.crit ? " クリティカル" : ""} 属性倍率×${r.elementMult} コンボ${r.combo}`, ...r.steps.map(([n, v]) => `　${n}：${v}`)] : "なし",
          "",
          heading("参加人数の補正（敵HP）"),
          Object.entries(PARTY_SCALING.hp).map(([k, v]) => `${k}人：${Math.round(v * 100)}%`).join("　"),
          "",
          heading("戦闘ログ（直近）"),
          d.combatLog.battles[0] ? JSON.stringify(d.combatLog.battles[0]).slice(0, 600) : "なし"
        )
      );
    },
  },
  { label: "§c訓練ダミーを消す", run: (a) => dummies(a).forEach((e) => (ctx.combat.forgetEntity(e.id), e.remove())) },
];

/** @param {import("@minecraft/server").Player} admin */
export async function openCombatTest(admin) {
  for (;;) {
    if (!isAdmin(admin)) return;
    const f = new ActionFormData().title("仮想訓練場（開発者専用）").body("§c開発確認用。通常のプレイでは使えません。§r");
    for (const x of ACTIONS) f.button(x.label);
    f.button("§l戻る");
    const r = await showForm(admin, f);
    if (!r || r.selection === undefined || r.selection >= ACTIONS.length) return;
    await ACTIONS[r.selection].run(admin);
  }
}
