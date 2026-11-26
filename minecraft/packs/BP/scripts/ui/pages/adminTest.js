// =============================================================
// 管理者向けテスト機能（管理者タグ noguchi_admin を持つプレイヤーのみ）
// 一般プレイヤーには表示されず、操作のたびに管理者かどうかを再確認する。
// =============================================================
import { world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { ctx } from "../../core/context.js";
import { isAdmin } from "../../admin/adminAuth.js";
import { talents } from "../../content/talents/index.js";
import { potentials } from "../../content/potentials.js";
import { gradeLabel } from "../../content/grades.js";
import { tierForStage } from "../../content/tiers.js";
import { stageIdOf } from "../../content/stages.js";
import { KINGDOM_PHASES } from "../../content/kingdom.js";
import { TAGS } from "../../config.js";
import { giveSkillFocus } from "../../items/adventurerBook.js";
import { treeBrowser } from "./job.js";
import { validateJobs } from "../../content/jobs/validateJobs.js";
import { validateSkills } from "../../content/skills/validateSkills.js";
import { gods } from "../../content/gods.js";
import { openCombatTest } from "./combatTest.js";
import { jobs } from "../../content/jobs.js";
import { createLogger } from "../../core/log.js";
import { showForm } from "../formUtil.js";
import { heading, lines, num } from "../format.js";
import { showInfoPage } from "./infoPage.js";

const log = createLogger("admin");

function intOf(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.floor(n) : NaN;
}

/** @param {import("@minecraft/server").Player} admin */
async function askNumber(admin, title, label, def = "") {
  const res = await showForm(admin, new ModalFormData().title(title).textField(label, "数値", { defaultValue: def }).submitButton("実行"));
  if (!res || !res.formValues) return NaN;
  return intOf(res.formValues[0]);
}

function report(admin, label, res, targetName) {
  const ok = res === true || (res && res.ok);
  admin.sendMessage(ok ? `§a[テスト] ${label}：成功（${targetName}）` : `§c[テスト] ${label}：失敗 ${res && res.reason ? res.reason : ""}`);
  log.warn(`管理者 ${admin.name} が ${targetName} に ${label} を実行: ${ok ? "成功" : "失敗"}`);
}

/** @param {import("@minecraft/server").Player} admin */
async function pickTarget(admin) {
  const players = world.getAllPlayers().filter((p) => ctx.playerService.getSession(p.id));
  if (players.length === 1) return players[0];
  const res = await showForm(admin, new ModalFormData().title("対象プレイヤー").dropdown("対象", players.map((p) => p.name)).submitButton("決定"));
  if (!res || !res.formValues) return undefined;
  return players[Number(res.formValues[0])];
}

/** @param {import("@minecraft/server").Player} admin */
async function saveDataView(admin, target) {
  const d = ctx.playerService.dataFor(target.id);
  const s = ctx.playerService.getSession(target.id);
  const e = s ? ctx.playerService.records.peek(`p.${s.uid}`) : undefined;
  const pot = d.hiddenPotential.entries.map((x) => `${potentials.get(x.id)?.name ?? x.id}${x.awakened ? "(覚醒済)" : "(未覚醒)"}`);
  const acts = Object.entries(d.actions).map(([k, v]) => `${k}: ${num(v)}`);
  const body = lines(
    heading(`${target.name} のセーブデータ`),
    `識別ID: ${d.uid} / 状態: ${e ? e.status : "-"} / 未保存: ${e && e.dirty ? "あり" : "なし"}`,
    `Lv ${d.level} EXP ${num(d.exp)} 累計 ${num(d.totalExp)} 保留 ${num(d.expOverflow)}`,
    `存在階級: ${tierForStage(d.limitBreak.stage).name}（${d.limitBreak.stage}）`,
    `能力ポイント: 未使用 ${d.unspentStatPoints} / 累計 ${d.statPointsEarned}`,
    `成長: ${JSON.stringify(d.statGrowth)}`,
    `振り分け: ${JSON.stringify(d.statAllocated)}`,
    `HP ${d.vitals.hp}/${d.vitals.hpMax} MP ${Math.floor(d.vitals.mp)}/${d.vitals.mpMax} ST ${Math.floor(d.vitals.stamina)}/${d.vitals.staminaMax}`,
    `初期才能: ${d.talents.innate.map((id) => talents.get(id)?.name ?? id).join(", ") || "なし"}`,
    `有効な才能: ${d.talents.active.map((a) => talents.get(a.id)?.name ?? a.id).join(", ") || "なし"}`,
    `後天性: ${d.talents.acquired.join(", ") || "なし"}`,
    `§d潜在能力（管理者のみ表示）: ${pot.join(", ") || "なし"}§r`,
    "",
    heading("行動の記録"),
    acts.length ? acts : "なし",
    "",
    `フラグ: ${Object.keys(d.flags).join(", ") || "なし"}`
  );
  return showInfoPage(admin, "セーブデータ確認", body);
}

const ACTIONS = [
  {
    label: "経験値付与",
    async run(admin, t) {
      const n = await askNumber(admin, "経験値付与", "付与する経験値", "100");
      if (!(n > 0)) return;
      report(admin, `経験値 ${n}`, ctx.progression.grantExp(t.id, n, { source: "admin", noBonus: true }), t.name);
    },
  },
  {
    label: "レベル設定",
    async run(admin, t) {
      const n = await askNumber(admin, "レベル設定", "レベル（存在階級の上限まで）", String(ctx.playerService.dataFor(t.id).level));
      if (!(n >= 1)) return;
      report(admin, `レベル ${n}`, ctx.progression.setLevel(t.id, n), t.name);
    },
  },
  {
    label: "能力ポイント付与",
    async run(admin, t) {
      const n = await askNumber(admin, "能力ポイント付与", "付与するポイント", "5");
      if (!(n > 0)) return;
      report(admin, `能力ポイント ${n}`, ctx.progression.addStatPoints(t.id, n), t.name);
    },
  },
  {
    label: "HP・MP・スタミナの変更",
    async run(admin, t) {
      const res = await showForm(
        admin,
        new ModalFormData().title("HP・MP・スタミナ").dropdown("項目", ["HP", "MP", "スタミナ"]).textField("値", "数値", { defaultValue: "1" }).submitButton("実行")
      );
      if (!res || !res.formValues) return;
      const kind = ["hp", "mp", "stamina"][Number(res.formValues[0])];
      const v = intOf(res.formValues[1]);
      if (!Number.isFinite(v)) return;
      report(admin, `${kind}=${v}`, ctx.vitals.setValue(t.id, kind, v), t.name);
    },
  },
  {
    label: "才能付与",
    async run(admin, t) {
      const list = talents.all();
      const res = await showForm(
        admin,
        new ModalFormData().title("才能付与").dropdown("才能", list.map((x) => `[${x.grade}] ${x.name}（${x.kind}）`)).submitButton("付与")
      );
      if (!res || !res.formValues) return;
      const def = list[Number(res.formValues[0])];
      report(admin, `才能「${def.name}」付与`, ctx.talents.grant(t.id, def.id), t.name);
    },
  },
  {
    label: "才能進化テスト",
    async run(admin, t) {
      const d = ctx.playerService.dataFor(t.id);
      const options = [];
      for (const a of d.talents.active) {
        const def = talents.get(a.id);
        for (const br of def?.evolvesTo || []) options.push({ from: a.id, to: br.to, label: `${def.name} → ${talents.get(br.to)?.name ?? br.to}` });
      }
      if (options.length === 0) {
        admin.sendMessage("§7進化先のある才能を所持していません（先に「才能付与」で剣術適性などを付与してください）。");
        return;
      }
      const res = await showForm(admin, new ModalFormData().title("才能進化テスト").dropdown("進化", options.map((o) => o.label)).submitButton("進化させる"));
      if (!res || !res.formValues) return;
      const o = options[Number(res.formValues[0])];
      report(admin, `進化 ${o.label}`, ctx.talents.forceEvolve(t.id, o.from, o.to), t.name);
    },
  },
  {
    label: "潜在能力覚醒テスト",
    async run(admin, t) {
      report(admin, "潜在能力覚醒", ctx.talents.forceAwaken(t.id), t.name);
    },
  },
  {
    label: "限界突破テスト（条件を無視）",
    async run(admin, t) {
      report(admin, "限界突破", ctx.progression.limitBreak(t.id, { force: true, by: `admin:${admin.name}` }), t.name);
    },
  },
  {
    label: "ステータス再計算",
    async run(admin, t) {
      report(admin, "再計算", ctx.stats.recalc(t.id, { important: true }), t.name);
    },
  },
  {
    label: "§l職業：無条件転職（ツリーから選ぶ）",
    async run(admin, t) {
      await treeBrowser(admin, { admin: true, targetPlayer: t });
    },
  },
  {
    label: "職業：職業レベル設定",
    async run(admin, t) {
      const d = ctx.playerService.dataFor(t.id);
      const n = await askNumber(admin, "職業レベル設定", `職業レベル（${jobs.get(d.job.current)?.name ?? ""} 上限 ${jobs.get(d.job.current)?.levelCap ?? "-"}）`, "10");
      if (!(n >= 1)) return;
      report(admin, `職業レベル ${n}`, ctx.jobs.setJobLevel(t.id, n), t.name);
    },
  },
  {
    label: "職業：職業経験値付与",
    async run(admin, t) {
      const n = await askNumber(admin, "職業経験値付与", "職業経験値", "500");
      if (!(n > 0)) return;
      const lv = ctx.jobs.addJobExp(t.id, n);
      report(admin, `職業経験値 ${n}（+${lv}レベル）`, true, t.name);
    },
  },
  {
    label: "職業：転職の証を付与",
    async run(admin, t) {
      const n = await askNumber(admin, "転職の証", "個数", "1");
      if (!(n > 0)) return;
      report(admin, `転職の証 ×${n}`, ctx.jobs.addCrossLineToken(t.id, n), t.name);
    },
  },
  {
    label: "職業：解放・隠し職業の判定",
    async run(admin, t) {
      const r = ctx.jobs.evaluateUnlocks(t.id);
      admin.sendMessage(`§a解放：${r.unlocked.map((id) => jobs.get(id)?.name).join("、") || "なし"} ／ 発見：${r.discovered.map((id) => jobs.get(id)?.name).join("、") || "なし"}`);
    },
  },
  {
    label: "職業：データの自動検証",
    async run(admin) {
      const r = validateJobs();
      const body = lines(
        `結果: ${r.ok ? "§a合格§r" : "§c不合格§r"}（職業 ${r.summary.total}件・通常 ${r.summary.normal}・隠し ${r.summary.hidden}・スキル/奥義 ${r.summary.skills}件）`,
        "",
        r.checks.map((c) => `${c.ok ? "§a✓" : "§c✗"}§r ${c.name}
  §7${c.detail}§r`)
      );
      await showInfoPage(admin, "職業データの自動検証", body);
    },
  },
  {
    label: "操作判定テスト ON/OFF（自分）",
    async run(admin) {
      const on = !admin.hasTag(TAGS.inputTest);
      if (on) admin.addTag(TAGS.inputTest);
      else admin.removeTag(TAGS.inputTest);
      if (on) giveSkillFocus(admin);
      admin.sendMessage(on ? "§a操作判定テスト ON：技の触媒を持って、通常／ジャンプ中／ダッシュ中／しゃがみ溜め／長押しで使ってください" : "§7操作判定テスト OFF");
    },
  },
  {
    label: "ステージクリア記録テスト",
    async run(admin) {
      const n = await askNumber(admin, "ステージクリア記録テスト", "ステージ番号（1～110）", "1");
      if (!(n >= 1 && n <= 110)) return;
      const ids = world.getAllPlayers().filter((p) => ctx.playerService.getSession(p.id)).map((p) => p.id);
      report(admin, `ステージ${n} クリア記録`, ctx.stages.recordClear(stageIdOf(n), ids), "参加者全員");
    },
  },
  {
    label: "ワールド進行データ確認",
    async run(admin) {
      const w = ctx.worldService.world;
      const k = w.kingdom;
      const sum = ctx.stages.summary();
      const body = lines(
        heading("ストーリー・ステージ"),
        `章: 第${w.story.chapter}章 / 全10章＋裏章（旧データの章: ${w.story.legacyChapter ?? "-"}）`,
        `神々の迷宮: ${w.labyrinths.unlocked ? "解放済み" : "未解放"} / 使徒: ${Object.entries(w.apostles).map(([g, a]) => `${gods.get(g)?.name ?? g}=${a.name}`).join(", ") || "なし"}`,
        `解放 ${sum.unlocked} / クリア ${sum.cleared} / 全${sum.total}ステージ`,
        heading("富里王国"),
        `状態: ${KINGDOM_PHASES[k.phase] ?? k.phase}`,
        `住民: ${Object.keys(k.residents).join(", ")}`,
        `建物: ${Object.entries(k.buildings).map(([id, b]) => `${id}(${b.state})`).join(", ") || "なし"}`,
        `施設: ${Object.keys(k.facilities).join(", ")}`,
        `配置待ち: ${k.buildQueue.length}件（配置処理は第15弾）`,
        heading("世界唯一の装備"),
        `${Object.entries(w.uniqueItems.registry).map(([id, u]) => `${id}: ${u.state}`).join(", ") || "なし"}`
      );
      await showInfoPage(admin, "ワールド進行データ", body);
    },
  },
  {
    label: "セーブデータ確認",
    async run(admin, t) {
      await saveDataView(admin, t);
    },
  },
  // ---------------- 第5弾：戦闘 ----------------
  {
    label: "仮想訓練場（戦闘テスト）",
    async run(admin) {
      await openCombatTest(admin);
    },
  },
  // ---------------- 第4弾：スキル・信仰・使徒 ----------------
  {
    label: "スキルのテスト（付与・レベル・SP・クールタイム）",
    async run(admin, t) {
      const res = await showForm(
        admin,
        new ModalFormData()
          .title("スキルのテスト")
          .dropdown("操作", ["スキルを付与（ID）", "スキルレベルを設定（ID と レベル）", "スキルポイントを加える", "クールタイムを解除", "スキルデータの自動検証"])
          .textField("スキルID", "例：fire_ball")
          .textField("数値", "例：5", { defaultValue: "1" })
          .submitButton("実行")
      );
      if (!res || !res.formValues) return;
      const op = Number(res.formValues[0]);
      const id = String(res.formValues[1] || "").trim();
      const n = intOf(res.formValues[2]);
      if (op === 0) report(admin, `スキル付与 ${id}`, ctx.skillService.grant(t.id, id), t.name);
      else if (op === 1) report(admin, `スキルレベル ${id} → ${n}`, ctx.skillService.setLevel(t.id, id, n), t.name);
      else if (op === 2) report(admin, `スキルポイント +${n}`, ctx.playerService.update(t.id, (d) => (d.skills.points += Math.max(0, n || 0)), { important: true }), t.name);
      else if (op === 3) {
        ctx.skillBindings.resetCooldowns(t.id);
        report(admin, "クールタイム解除", true, t.name);
      } else {
        const r = validateSkills();
        await showInfoPage(admin, "スキルデータの自動検証", lines(`${r.ok ? "§a合格" : "§c不合格"}§r（${r.stats.total}種・接続済み${r.stats.connected}種）`, r.checks.map((c) => `${c.ok ? "§a✓" : "§c✗"}§r ${c.name}：${c.detail}`)));
      }
    },
  },
  {
    label: "信仰・使徒のテスト",
    async run(admin, t) {
      const list = gods.all();
      const res = await showForm(
        admin,
        new ModalFormData()
          .title("信仰・使徒のテスト")
          .dropdown("神", list.map((g) => `${g.name}（${g.domain}）`))
          .dropdown("操作", ["信仰レベルを設定", "承認フラグを立てる", "使徒契約（条件を無視）", "使徒契約（現使徒と交代）", "使徒契約の解除（管理者）", "神による資格剥奪"])
          .textField("信仰レベル", "0～30", { defaultValue: "5" })
          .submitButton("実行")
      );
      if (!res || !res.formValues) return;
      const g = list[Number(res.formValues[0])];
      const op = Number(res.formValues[1]);
      const n = intOf(res.formValues[2]);
      if (op === 0) report(admin, `${g.name}の信仰レベル → ${n}`, ctx.faith.setLevel(t.id, g.id, n), t.name);
      else if (op === 1) report(admin, `${g.name}の承認`, ctx.actions.setFlag(t.id, g.contract.approvalFlag), t.name);
      else if (op === 2) report(admin, `${g.name}の使徒契約`, ctx.apostles.contract(t.id, g.id, { force: true }), t.name);
      else if (op === 3) report(admin, `${g.name}の使徒交代`, ctx.apostles.contract(t.id, g.id, { force: true, replace: true }), t.name);
      else if (op === 4) report(admin, `${g.name}の使徒契約の解除`, ctx.apostles.release(g.id, "admin"), "現使徒");
      else report(admin, `${g.name}による資格剥奪`, ctx.apostles.revoke(g.id), "現使徒");
    },
  },
];

/** @param {import("@minecraft/server").Player} admin */
export async function openAdminTest(admin) {
  if (!isAdmin(admin)) return "back";
  const target = await pickTarget(admin);
  if (!target) return "back";
  for (;;) {
    if (!isAdmin(admin) || !target.isValid || !ctx.playerService.getSession(target.id)) return "back";
    const d = ctx.playerService.dataFor(target.id);
    const form = new ActionFormData()
      .title("テスト機能（管理者）")
      .body(`対象: §l${target.name}§r  Lv ${d.level}\n才能: ${d.talents.active.map((a) => { const x = talents.get(a.id); return x ? `${gradeLabel(x.grade)}${x.name}` : a.id; }).join(" ") || "なし"}\n§c※ 開発確認用。通常のプレイでは使わないでください。§r`);
    for (const a of ACTIONS) form.button(a.label);
    form.button("§l戻る");
    const res = await showForm(admin, form);
    if (!res || res.selection === undefined || res.selection >= ACTIONS.length) return "back";
    if (!isAdmin(admin)) return "back";
    await ACTIONS[res.selection].run(admin, target);
  }
}
