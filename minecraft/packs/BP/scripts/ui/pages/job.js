// =============================================================
// 職業メニュー（第3弾）
// 階層型：現在の職業 → 進化先（3種）／職業融合ツリー（系統 → 段階ごとにたどる）／転職／履歴／引き継ぎ／スキル
// 484職業を一画面に出さず、1画面には最大でも「進化先3つ＋操作ボタン」だけを表示する。
// 転職の前には必ず確認画面（能力の比較つき）を出す。
// =============================================================
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { ctx } from "../../core/context.js";
import { jobs, DEFAULT_JOB_ID } from "../../content/jobs.js";
import { JOB_LINES, WEAPONS, ARMORS, ELEMENT_NAMES } from "../../content/jobs/catalog.js";
import { specialStats } from "../../content/specialStats.js";
import { STAT_DEFS, DERIVED_DEFS } from "../../content/stats.js";
import { describeCondition, checkCondition, conditionProgress } from "../../talents/conditions.js";
import { judgeChange } from "../../job/jobService.js";
import { jobExpToNext, jobLevelOf, jobModifierDef, inheritSlots, inheritableJobs } from "../../job/jobBonus.js";
import { computeStats } from "../../stats/statCalc.js";
import { showForm } from "../formUtil.js";
import { showInfoPage } from "./infoPage.js";
import { COMING_SOON, heading, lines, num } from "../format.js";

const STAT_NAME = Object.fromEntries(STAT_DEFS.map((s) => [s.id, s.name]));
const DERIVED_NAME = Object.fromEntries(DERIVED_DEFS.map((s) => [s.id, s.name]));
const KIND_JA = { first: "最初の職業", fusion: "職業融合", return: "以前の職業に戻る", cross: "別系統への転職（転職の証を使用）", hidden: "隠し職業", admin: "管理者による無条件転職" };
const jobName = (id) => jobs.get(id)?.name ?? id;

function data(player) {
  return ctx.playerService.dataFor(player.id);
}

/** 職業の状態の印 */
function mark(d, id) {
  if (d.job.current === id) return "§e★§r";
  if (d.job.held.includes(id)) return "§a✓§r";
  const j = judgeChange(d, id, { world: ctx.worldService.world });
  if (j.ok) return "§b○§r";
  return "§8・§r";
}

function statsText(flat) {
  const e = Object.entries(flat || {});
  return e.length ? e.map(([k, v]) => `${STAT_NAME[k] ?? k}+${v}`).join(" ") : "なし";
}

function bar(cur, max) {
  const n = max > 0 ? Math.round(Math.min(1, cur / max) * 12) : 12;
  return `§b${"|".repeat(n)}§8${"|".repeat(12 - n)}§r`;
}

/** 条件の一覧（達成状況つき） */
function requirementLines(d, def) {
  const env = { world: ctx.worldService.world };
  const conds = [...(def.requirements || [])];
  const j = judgeChange(d, def.id, env);
  if (j.kind === "cross") conds.push(...(def.crossLineRequirements || []));
  return conds.map((c) => {
    const ok = checkCondition(c, d, env);
    const pr = conditionProgress(c, d);
    return `${ok ? "§a✓" : "§c✗"}§r ${describeCondition(c, jobName)}${pr && !ok ? ` §7（現在 ${num(pr.now)}）§r` : ""}`;
  });
}

/** 転職した場合の能力の比較（保存はしない） */
function comparison(d, def) {
  const before = computeStats(d, ctx.nowTick());
  const sim = JSON.parse(JSON.stringify(d));
  sim.job.current = def.id;
  if (!sim.job.levels[def.id]) sim.job.levels[def.id] = { level: 1, exp: 0 };
  const after = computeStats(sim, ctx.nowTick());
  const rows = [];
  for (const s of STAT_DEFS) {
    const a = before.primary[s.id];
    const b = after.primary[s.id];
    if (a !== b) rows.push(`${s.name} ${a} → ${b > a ? "§a" : "§c"}${b}§r`);
  }
  for (const k of ["maxHp", "maxMp", "physAtk", "magAtk", "physDef", "magDef"]) {
    const a = before.derived[k];
    const b = after.derived[k];
    if (a !== b) rows.push(`${DERIVED_NAME[k]} ${a} → ${b > a ? "§a" : "§c"}${b}§r`);
  }
  return rows.length ? rows : ["変化なし"];
}

function jobSummary(def, level) {
  const mod = jobModifierDef(def, Math.max(1, level));
  const sp = Object.entries(mod.special.flat || {}).map(([k, v]) => `${specialStats.get(k)?.name ?? k} ${v}`);
  return lines(
    `§l${def.name}§r §7${def.tierName ?? ""}${def.lineName ? `／${def.lineName}系統` : ""}${def.category === "hidden" ? "／隠し職業" : ""}§r`,
    def.fusionText ? `§7${def.fusionText}§r` : null,
    def.description,
    def.style ? `戦闘スタイル: ${def.style}` : null,
    def.roleName ? `役割: ${def.roleName}` : null,
    def.weapons && def.weapons.length ? `得意武器: ${def.weapons.map((w) => WEAPONS[w] ?? w).join("・")}` : null,
    def.equipment ? `防具: ${def.equipment.armor.map((a) => ARMORS[a] ?? a).join("・")}` : null,
    def.elements && def.elements.length ? `得意属性: ${def.elements.map((e) => ELEMENT_NAMES[e] ?? e).join("・")}` : null,
    `能力値補正: ${statsText(mod.stats.flat)}${level > 1 ? ` §7(職業Lv${level})§r` : ""}`,
    sp.length ? `専用能力値: ${sp.join(" ")}` : null,
    def.passive ? `固有パッシブ: §d${def.passive.name}§r` : null,
    def.passive ? `  §7効果（実装済み）: ${describeNow(def.passive.now)}§r` : null,
    def.passive ? `  §7効果（第4弾以降）: ${def.passive.planned}§r` : null,
    def.strengths ? `§a強み§r: ${def.strengths.join("、")}` : null,
    def.weaknesses ? `§c弱点§r: ${def.weaknesses.join("、")}` : null,
    def.situations ? `得意な場面: ${def.situations}` : null
  );
}

function describeNow(now) {
  const d = now && now.derived;
  if (!d) return "なし";
  const parts = [
    ...Object.entries(d.flat || {}).map(([k, v]) => `${DERIVED_NAME[k] ?? k}+${v}`),
    ...Object.entries(d.pct || {}).map(([k, v]) => `${DERIVED_NAME[k] ?? k}+${v}%`),
  ];
  return parts.join(" ") || "なし";
}

function skillLines(def) {
  if (!def.skills) return ["なし"];
  return [...def.skills, def.ultimate].map(
    (s) => `・${s.kind === "ultimate" ? "§6奥義§r" : s.kind === "secret" ? "§e秘技§r" : "専用技"}「${s.name}」 §7職業Lv${s.learn.jobLevel}で習得／${s.effect}§r`
  );
}

/**
 * 確認してから転職する
 * @param {import("@minecraft/server").Player} viewer  確認画面を見る人（管理者テストでは管理者）
 * @param {import("@minecraft/server").Player} subject 転職する人
 */
async function confirmAndChange(viewer, subject, def, { force = false } = {}) {
  const player = subject;
  const d = data(subject);
  const j = force ? { ok: true, kind: "admin" } : judgeChange(d, def.id, { world: ctx.worldService.world });
  if (!j.ok) {
    viewer.sendMessage(`§c転職できません：${j.reason}`);
    return;
  }
  const form = new MessageFormData()
    .title("転職の確認")
    .body(
      lines(
        `${jobName(d.job.current)} → §l${def.name}§r`,
        `種類: ${KIND_JA[j.kind] ?? j.kind}`,
        "",
        heading("能力の変化"),
        comparison(d, def),
        "",
        "§7プレイヤーレベル・経験した職業のレベルは失われません。§r",
        j.kind === "cross" ? "§e「転職の証」を1つ使います。§r" : null
      )
    )
    .button1("転職する")
    .button2("やめる");
  const res = await showForm(viewer, form);
  if (!res || res.selection !== 0) return;
  /** @type {any} */
  const r = ctx.jobs.changeJob(player.id, def.id, force ? { force: true, by: `admin:${viewer.name}` } : {});
  viewer.sendMessage(r.ok ? `§a${player.name === viewer.name ? "" : `${player.name}は`}${def.name}に転職した！` : `§c転職できませんでした：${r.reason}`);
}

function changeAllowed() {
  return !!ctx.worldService.world.settings.jobs.changeFromMenu;
}

/**
 * 職業の詳細（ツリーをたどる画面を兼ねる）
 * @param {import("@minecraft/server").Player} player
 * @param {{admin?: boolean, targetPlayer?: import("@minecraft/server").Player}} [opt] admin = 管理者テスト（対象プレイヤーを無条件で転職）
 */
export async function jobDetail(player, jobId, opt = {}) {
  let id = jobId;
  for (;;) {
    const subject = opt.targetPlayer || player;
    const d = data(subject);
    const def = jobs.get(id);
    if (!d || !def) return "back";
    const lv = jobLevelOf(d, id);
    const judge = judgeChange(d, id, { world: ctx.worldService.world });
    const body = lines(
      jobSummary(def, lv),
      "",
      heading("専用スキル・奥義"),
      skillLines(def),
      "",
      heading("転職条件"),
      def.category === "none" ? "なし" : requirementLines(d, def),
      id !== d.job.current && def.category !== "none" ? ["", heading("転職した場合の能力の変化"), comparison(d, def)] : null
    );
    const form = new ActionFormData().title(def.name).body(body);
    /** @type {{label: string, run: () => Promise<any>|any}[]} */
    const items = [];
    for (const c of def.children || []) {
      if (!jobs.get(c) || def.category === "none") continue;
      items.push({ label: `${mark(d, c)} 進化先：${jobName(c)}`, run: () => (id = c) });
    }
    if (def.parent) items.push({ label: `↑ 進化元：${jobName(def.parent)}`, run: () => (id = def.parent) });
    if (opt.admin) items.push({ label: "§c[管理者] この職業に無条件で転職", run: () => confirmAndChange(player, subject, def, { force: true }) });
    else if (judge.ok && changeAllowed()) items.push({ label: "§2§lこの職業に転職する", run: () => confirmAndChange(player, player, def) });
    for (const it of items) form.button(it.label);
    form.button("§l戻る");
    const res = await showForm(player, form);
    if (!res || res.selection === undefined) return "close";
    if (res.selection >= items.length) return "back";
    await items[res.selection].run();
  }
}

/** 職業融合ツリー：系統を選ぶ → 第1次職業からたどる */
export async function treeBrowser(player, opt = {}) {
  const d = data(opt.targetPlayer || player);
  const form = new ActionFormData()
    .title("職業融合ツリー")
    .body(
      lines(
        "系統を選ぶと、第1次職業から進化先をたどれます。",
        "§e★§r現在 §a✓§r経験済み §b○§r転職できる §8・§r条件未達成",
        "",
        "§7484職業：第1次 4 / 第2次 12 / 第3次 36 / 第4次 108 / 第5次 324§r"
      )
    );
  for (const l of JOB_LINES) form.button(`${mark(d, l.id)} ${l.name}系統`);
  const hiddenFound = Object.keys(d.job.discoveredHidden || {});
  if (hiddenFound.length) form.button(`§5隠し職業（${hiddenFound.length}）`);
  form.button("§l戻る");
  const res = await showForm(player, form);
  if (!res || res.selection === undefined) return "close";
  if (res.selection < JOB_LINES.length) return jobDetail(player, JOB_LINES[res.selection].id, opt);
  if (hiddenFound.length && res.selection === JOB_LINES.length) {
    const f2 = new ActionFormData().title("隠し職業");
    for (const h of hiddenFound) f2.button(jobName(h));
    const r2 = await showForm(player, f2);
    if (r2 && r2.selection !== undefined && hiddenFound[r2.selection]) return jobDetail(player, hiddenFound[r2.selection], opt);
  }
  return "back";
}

/** @param {import("@minecraft/server").Player} player */
async function historyPage(player) {
  const d = data(player);
  const held = d.job.held.map((id) => {
    const def = jobs.get(id);
    const l = d.job.levels[id] || { level: 1 };
    return `・${def ? def.name : id} §7職業Lv${l.level}/${def ? def.levelCap : "?"}${def && l.level >= def.levelCap ? " §6(極めた)" : ""}§r`;
  });
  const hist = d.job.history.slice(-10).reverse().map((h) => `${jobName(h.from)} → ${jobName(h.to)} §7(${KIND_JA[h.kind] ?? h.kind})§r`);
  return showInfoPage(
    player,
    "職業の履歴",
    lines(heading("経験した職業"), held.length ? held : "まだありません", "", heading("転職の履歴（新しい順）"), hist.length ? hist : "まだありません", "", `転職の証: ${d.job.tokens.crossLine}個`)
  );
}

/** @param {import("@minecraft/server").Player} player */
async function inheritPage(player) {
  const d = data(player);
  const slots = inheritSlots(d);
  const list = inheritableJobs(d);
  if (slots === 0 || list.length === 0) {
    return showInfoPage(
      player,
      "引き継ぎパッシブ",
      lines(`引き継ぎ枠: ${slots}`, "", "職業レベルを上限まで上げた（極めた）職業の固有パッシブを、転職後も引き継げます。", "", list.length === 0 ? "§7まだ引き継げる職業がありません。§r" : null)
    );
  }
  const form = new ModalFormData().title(`引き継ぎパッシブ（${slots}枠）`);
  for (const j of list) form.toggle(`${j.passive.name}（${j.name}）`, { defaultValue: d.job.inheritedPassives.includes(j.id) });
  form.submitButton("決定");
  const res = await showForm(player, form);
  if (!res || !res.formValues) return "back";
  const chosen = list.filter((_, i) => res.formValues[i] === true).map((j) => j.id);
  const r = ctx.jobs.setInheritedPassives(player.id, chosen);
  player.sendMessage(r.ok ? "§a引き継ぎパッシブを設定した。" : `§c${r.reason}`);
  return "back";
}

/** @param {import("@minecraft/server").Player} player */
async function skillsPage(player) {
  const d = data(player);
  const cur = jobs.get(d.job.current);
  const avail = ctx.jobs.availableSkills(player.id);
  return showInfoPage(
    player,
    "職業のスキル",
    lines(
      heading("使用可能な職業スキル"),
      avail.length
        ? avail.map((a) => `・${a.skill.name} §7(${a.source === "current" ? "現在の職業" : `引き継ぎ：${jobName(a.jobId)}`})${d.skills.learned[a.skill.id] ? " §a習得済み" : " §c未習得"}§r`)
        : "まだありません",
      "",
      heading(`${cur ? cur.name : "無職"}で習得できるスキル`),
      cur ? skillLines(cur) : "なし",
      "",
      "§7習得したスキルは 冒険者の書 → スキル → 技の割り当て で、ホットバー9枠×5操作に割り当てて使います。",
      "§7過去の職業の専用スキル（引き継ぎ）は、職業Lvと得意武器の条件を満たし、割り当てられる数に上限があります。奥義・秘技はその職業でのみ使えます。§r"
    )
  );
}

export const jobPage = {
  id: "job",
  label: "職業",
  icon: "textures/items/iron_sword",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    for (;;) {
      const d = data(player);
      const cur = jobs.get(d.job.current);
      const lv = jobLevelOf(d, d.job.current) || 1;
      const cap = cur ? cur.levelCap : 10;
      const need = lv >= cap ? 0 : jobExpToNext(lv, cur ? cur.tier : 0);
      const exp = (d.job.levels[d.job.current] || { exp: 0 }).exp;
      const r = ctx.stats.inspect(player.id);
      const sp = Object.entries(r.special).map(([k, v]) => `${specialStats.get(k)?.name ?? k} ${v}`);
      const candidates = (cur && cur.category !== "none" ? cur.children : ["warrior", "mage", "thief", "priest"]).filter(Boolean);
      const body = lines(
        heading("現在の職業"),
        cur ? jobSummary(cur, lv) : "無職",
        `職業Lv §l${lv}§r / ${cap}  ${need ? `経験値 ${num(exp)} / ${num(need)} ${bar(exp, need)}` : "§6上限に到達（極めた）§r"}`,
        sp.length ? `専用能力値（現在）: ${sp.join(" ")}` : null,
        `現在の職業補正: ${statsText(r.layers ? Object.fromEntries(STAT_DEFS.map((s) => [s.id, r.layers[s.id].job]).filter(([, v]) => v)) : {})}`,
        "",
        changeAllowed() ? "§7転職：進化先を選んで条件を満たしていれば転職できます（転職神殿の完成までは冒険者の書から）§r" : "§7転職は富里王国の転職神殿で行えます（今後実装予定）§r"
      );
      const form = new ActionFormData().title("職業").body(body);
      /** @type {{label: string, run: () => Promise<any>}[]} */
      const items = [];
      for (const c of candidates) {
        if (!jobs.get(c)) continue;
        items.push({ label: `${mark(d, c)} ${d.job.current === DEFAULT_JOB_ID ? "第1次職業" : "進化先"}：${jobName(c)}`, run: () => jobDetail(player, c) });
      }
      items.push({ label: "職業融合ツリー", run: () => treeBrowser(player) });
      items.push({ label: "過去の職業・転職履歴", run: () => historyPage(player) });
      items.push({ label: "引き継ぎパッシブ", run: () => inheritPage(player) });
      items.push({ label: "職業のスキル", run: () => skillsPage(player) });
      for (const it of items) form.button(it.label);
      form.button("§l戻る");
      form.button("閉じる");
      const res = await showForm(player, form);
      if (!res || res.selection === undefined || res.selection === items.length + 1) return "close";
      if (res.selection === items.length) return "back";
      const rr = await items[res.selection].run();
      if (rr === "close") return "close";
    }
  },
};

