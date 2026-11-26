// =============================================================
// スキルメニュー（第4弾）
// ・技の割り当て：枠（1～9）→ 操作（5種）→ スキルを選ぶ（検索・分類・並べ替え・ページ送り）
// ・習得済み／習得できるスキル、詳細（レベル・消費・クールタイム・威力・属性・熟練度・進化条件）
// ・進化（分岐を1つ選ぶ）・融合（定義済みの組み合わせ）・スキルポイント・プリセット・武器/魔法熟練度
// Switch で操作しやすいよう、1画面のボタンは最大でも約15個にする
// =============================================================
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { ctx } from "../../core/context.js";
import { ACTION_TYPES, HOTBAR_SLOTS } from "../../balance/input.js";
import { PRESET_SLOTS, MAX_SKILL_FOCUS } from "../../balance/skills.js";
import { skills, fusionRecipes, isApostleSkill } from "../../content/skills.js";
import { SKILL_CATEGORIES, SKILL_RARITIES, ACTION_NAMES, EFFECT_TYPES, SHAPES, ELEMENT_NAMES } from "../../content/skills/catalog.js";
import { WEAPONS } from "../../content/jobs/catalog.js";
import { STAT_DEFS } from "../../content/stats.js";
import { describeCondition, checkCondition, conditionProgress } from "../../talents/conditions.js";
import { skillStats, learnedRecord, usability, skillEnv, proficiencyToNext } from "../../skills/skillRules.js";
import { LEARN_METHOD_NAMES } from "../../skills/skillService.js";
import { giveSkillFocus, countSkillFocus } from "../../items/adventurerBook.js";
import { jobs } from "../../content/jobs.js";
import { showForm } from "../formUtil.js";
import { showInfoPage } from "./infoPage.js";
import { heading, lines, num } from "../format.js";

const PAGE_SIZE = 12;
const STAT_NAME = Object.fromEntries(STAT_DEFS.map((s) => [s.id, s.name]));
const RARITY_NAME = Object.fromEntries(SKILL_RARITIES.map((r) => [r.id, r.name]));
const ACTION_SHORT = { tap: "通常", jump: "ジャンプ中", sprint: "ダッシュ中", charge: "しゃがみ溜め", ultimate: "長時間溜め" };
const jobName = (id) => jobs.get(id)?.name ?? id;
const sec = (t) => `${(t / 20).toFixed(1)}秒`;

const data = (player) => ctx.playerService.dataFor(player.id);

/** 1行の要約 */
function shortLine(d, def) {
  const rec = learnedRecord(d, def.id);
  const st = skillStats(def, rec, d);
  const cost = [st.mp ? `MP${st.mp}` : "", st.stamina ? `ST${st.stamina}` : ""].filter(Boolean).join("/") || "消費なし";
  return `${def.name}${rec ? ` §2Lv${rec.level}` : " §8未習得"}§r\n§8${SKILL_CATEGORIES[def.category]}・${cost}・CD${sec(st.cooldown)}`;
}

/** スキルの詳細（指示書の表示項目） */
export function skillDetailText(d, def) {
  const rec = learnedRecord(d, def.id);
  const st = skillStats(def, rec, d);
  const u = usability(def, d, ctx.worldService.world);
  const env = skillEnv(ctx.worldService.world);
  const prog = rec ? { exp: rec.exp || 0, need: rec.level >= def.maxLevel ? 0 : proficiencyToNext(rec.level) } : null;
  const powerText = def.power
    ? `${st.power}（基本${def.power.base}＋Lvごと${def.power.perLevel}＋${Object.entries(def.power.stats).map(([k, v]) => `${STAT_NAME[k] ?? k}×${v}`).join("＋")}）`
    : "なし";
  const out = [
    heading(def.name),
    `§7${def.description}§r`,
    `分類：${SKILL_CATEGORIES[def.category]}　レアリティ：${RARITY_NAME[def.rarity]}`,
    `属性：${(def.elements || []).map((e) => ELEMENT_NAMES[e] ?? e).join("・") || "なし"}`,
    `状態：${rec ? `§a習得済み Lv${rec.level}/${def.maxLevel}` : "§c未習得"}§r　${u.ok ? "§a使用可能" : `§c使用不可（${u.reason}）`}§r`,
    prog && prog.need ? `熟練度：${num(prog.exp)} / ${num(prog.need)}` : prog ? "熟練度：最大レベル" : null,
    rec ? `使用回数：${num(rec.uses || 0)}　命中：${num(rec.hits || 0)}` : null,
    "",
    heading("性能（現在のレベル）"),
    `効果：${EFFECT_TYPES[def.effect.type]}`,
    `威力：${powerText}`,
    `消費：MP ${st.mp}　スタミナ ${st.stamina}`,
    `クールタイム：${sec(st.cooldown)}　詠唱：${st.castTicks ? sec(st.castTicks) : "なし"}`,
    `範囲：${SHAPES[def.shape]}${st.range ? ` 半径${st.range}` : ""}${st.distance ? ` 距離${st.distance}` : ""}${st.duration ? `　効果時間：${sec(st.duration)}` : ""}`,
    `操作：${(def.actions || []).map((a) => ACTION_SHORT[a]).join("・") || "（パッシブ：常に効果）"}`,
    def.jobs ? `職業：${def.jobs.map(jobName).join("・")}${def.inherit ? `（引き継ぎ：職業Lv${def.inherit.jobLevel}以上・${def.inherit.weapons.map((w) => WEAPONS[w]).join("/")}を扱う職業）` : "（その職業でのみ）"}` : null,
    def.weapons && !def.jobs ? `必要な武器：${def.weapons.map((w) => WEAPONS[w]).join("・")}` : null,
    def.linkAfter ? `連携：仲間が${def.linkAfter.categories.map((c) => SKILL_CATEGORIES[c]).join("・")}を使った直後なら威力アップ（1人でも使える）` : null,
    def.condition && def.condition.minLevel ? `発動条件：レベル${def.condition.minLevel}以上` : null,
    def.condition && def.condition.hpBelow ? `発動条件：HP${Math.round(def.condition.hpBelow * 100)}%以下` : null,
    def.provisional ? "§7【暫定効果】神々の能力の確定後に調整します§r" : null,
  ];
  if (!rec && def.learn && def.learn.length) {
    out.push("", heading("習得方法"));
    for (const l of def.learn) {
      out.push(`◆ ${LEARN_METHOD_NAMES[l.method] ?? l.method}${l.sp ? `（スキルポイント${l.sp}）` : ""}`);
      for (const c of l.conditions) {
        const ok = checkCondition(c, d, env);
        const pr = conditionProgress(c, d);
        out.push(`　${ok ? "§a✓" : "§c✗"}§r ${describeCondition(c, jobName)}${pr && !ok ? ` §7（現在 ${num(pr.now)}）§r` : ""}`);
      }
    }
  }
  if (def.evolvesTo && def.evolvesTo.length) {
    out.push("", heading("進化先（1つだけ選べる・元のスキルは残る）"));
    for (const e of def.evolvesTo) {
      const t = skills.get(e.to);
      out.push(`◆ ${t ? t.name : e.to}（${e.style}）${rec && rec.evolvedTo === e.to ? " §a選択済み§r" : ""}`);
      for (const c of e.conditions) out.push(`　${checkCondition(c, d, env) ? "§a✓" : "§c✗"}§r ${describeCondition(c, jobName)}`);
    }
  }
  return lines(out);
}

/**
 * スキルを選ぶ（検索・分類・並べ替え・ページ送り）
 * @returns {Promise<any|null|"none">} 選んだ定義 / null＝戻る / "none"＝割り当てを外す
 */
async function pickSkill(player, title, list, { allowNone = false } = {}) {
  const d = data(player);
  let query = "";
  let category = "";
  let sort = "name";
  let page = 0;
  for (;;) {
    let items = list.filter((s) => (!category || s.category === category) && (!query || s.name.includes(query) || (s.description || "").includes(query)));
    if (sort === "level") items.sort((a, b) => (learnedRecord(d, b.id)?.level || 0) - (learnedRecord(d, a.id)?.level || 0));
    else if (sort === "cost") items.sort((a, b) => (a.cost.mp + a.cost.stamina) - (b.cost.mp + b.cost.stamina));
    else if (sort === "rarity") items.sort((a, b) => SKILL_RARITIES.findIndex((r) => r.id === b.rarity) - SKILL_RARITIES.findIndex((r) => r.id === a.rarity));
    else items.sort((a, b) => (a.name < b.name ? -1 : 1));
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const shown = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    const form = new ActionFormData()
      .title(title)
      .body(`${items.length}件（${page + 1}/${pages}ページ）${query ? `　検索：${query}` : ""}${category ? `　分類：${SKILL_CATEGORIES[category]}` : ""}`);
    const actions = [];
    const add = (label, fn) => {
      form.button(label);
      actions.push(fn);
    };
    if (allowNone) add("§c割り当てを外す", () => "none");
    for (const s of shown) add(shortLine(d, s), () => s);
    if (page > 0) add("◀ 前のページ", () => ((page--), undefined));
    if (page < pages - 1) add("次のページ ▶", () => ((page++), undefined));
    add("§b検索・分類・並べ替え", async () => {
      const cats = ["", ...new Set(list.map((s) => s.category))];
      const sorts = ["name", "level", "cost", "rarity"];
      const f = new ModalFormData()
        .title("絞り込み")
        .textField("名前・説明で検索", "例：火", { defaultValue: query })
        .dropdown("分類", cats.map((c) => (c ? SKILL_CATEGORIES[c] : "すべて")), { defaultValueIndex: Math.max(0, cats.indexOf(category)) })
        .dropdown("並べ替え", ["名前", "レベル", "消費の少ない順", "レアリティ"], { defaultValueIndex: sorts.indexOf(sort) });
      const r = await showForm(player, f);
      if (r && r.formValues) {
        query = String(r.formValues[0] || "").trim();
        category = cats[Number(r.formValues[1])] || "";
        sort = sorts[Number(r.formValues[2])] || "name";
        page = 0;
      }
      return undefined;
    });
    add("§l戻る", () => null);
    const res = await showForm(player, form);
    if (!res || res.selection === undefined) return null;
    const v = await actions[res.selection]();
    if (v !== undefined) return v;
  }
}

// ---------------- 割り当て ----------------
async function bindingsPage(player) {
  for (;;) {
    const d = data(player);
    const form = new ActionFormData().title("技の割り当て").body("ホットバーの枠を選んでください。\n技の触媒をその枠に置くと、割り当てた技を使えます。");
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const s = d.skillBindings.slots[i];
      const n = Object.values(s).filter(Boolean).length;
      form.button(`枠${i + 1}  §7（${n}/5）§r\n§8${Object.values(s).filter(Boolean).map((id) => skills.get(id)?.name ?? id).join("・").slice(0, 40) || "なし"}`);
    }
    form.button("§c全枠の割り当てを外す");
    form.button("§l戻る");
    const res = await showForm(player, form);
    if (!res || res.selection === undefined || res.selection === HOTBAR_SLOTS + 1) return "back";
    if (res.selection === HOTBAR_SLOTS) {
      const c = await showForm(player, new MessageFormData().title("確認").body("9枠すべての割り当てを外しますか？").button1("外す").button2("やめる"));
      if (c && c.selection === 0) ctx.skillBindings.clearAll(player.id);
      continue;
    }
    await slotPage(player, res.selection);
  }
}

async function slotPage(player, slot) {
  for (;;) {
    const d = data(player);
    const s = d.skillBindings.slots[slot];
    const form = new ActionFormData().title(`枠${slot + 1}の割り当て`).body("操作を選んでください。優先順位：長時間溜め＞しゃがみ溜め＞ダッシュ中＞ジャンプ中＞通常");
    const acts = [...ACTION_TYPES].reverse();
    for (const a of acts) {
      const id = s[a.id];
      const def = id ? skills.get(id) : null;
      const u = def ? usability(def, d, ctx.worldService.world) : null;
      form.button(`${ACTION_SHORT[a.id]}：${def ? def.name : "§8なし"}${u && !u.ok ? " §c（使用不可）" : ""}§r\n§8${a.tier}`);
    }
    form.button("§l戻る");
    const res = await showForm(player, form);
    if (!res || res.selection === undefined || res.selection >= acts.length) return;
    const action = acts[res.selection].id;
    const list = ctx.skillService
      .learnedList(player.id)
      .map((x) => x.def)
      .filter((def) => def.effect.type !== "passive" && (def.actions || []).includes(action));
    const pick = await pickSkill(player, `枠${slot + 1}・${ACTION_SHORT[action]}`, list, { allowNone: true });
    if (pick === null) continue;
    const r = ctx.skillBindings.bind(player.id, slot, action, pick === "none" ? null : pick.id);
    player.sendMessage(r.ok ? `§a枠${slot + 1}・${ACTION_SHORT[action]}：${pick === "none" ? "割り当てを外した" : pick.name}` : `§c${r.reason}`);
  }
}

// ---------------- 一覧・詳細 ----------------
async function detailPage(player, def) {
  for (;;) {
    const d = data(player);
    const rec = learnedRecord(d, def.id);
    const extra = [];
    if (!rec && (def.learn || []).some((l) => l.method === "skillPoint"))
      extra.push({ label: "§aスキルポイントで習得", run: () => say(player, ctx.skillService.learnWithSp(player.id, def.id), `${def.name}を習得した`) });
    if (rec && !isApostleSkill(def) && rec.level < def.maxLevel) extra.push({ label: "§bスキルポイントでレベルアップ", run: () => say(player, ctx.skillService.levelUpWithSp(player.id, def.id), `${def.name}のレベルが上がった`) });
    for (const o of rec ? ctx.skillService.evolutionOptions(player.id, def.id) : [])
      if (o.can) extra.push({ label: `§d進化：${o.def ? o.def.name : o.to}（${o.style}）`, run: () => confirmEvolve(player, def, o) });
    const r = await showInfoPage(player, def.name, skillDetailText(d, def), extra);
    if (r !== "back" || extra.length === 0) return r;
  }
}

async function confirmEvolve(player, def, o) {
  const c = await showForm(
    player,
    new MessageFormData().title("スキル進化").body(`${def.name} → ${o.def.name}（${o.style}）\n\n進化先は1つしか選べません。元のスキルは残ります。進化しますか？`).button1("進化する").button2("やめる")
  );
  if (c && c.selection === 0) say(player, ctx.skillService.evolve(player.id, def.id, o.to), `${o.def.name}に進化した`);
}

function say(player, r, okText) {
  player.sendMessage(r.ok ? `§a${okText}` : `§c${r.reason}`);
}

async function learnedPage(player) {
  for (;;) {
    const list = ctx.skillService.learnedList(player.id).map((x) => x.def);
    const pick = await pickSkill(player, "習得済みスキル", list);
    if (!pick || pick === "none") return "back";
    if ((await detailPage(player, pick)) === "close") return "close";
  }
}

async function unlearnedPage(player) {
  for (;;) {
    const list = ctx.skillService.unlearnedList(player.id);
    const pick = await pickSkill(player, "習得できるスキル（未習得）", list);
    if (!pick || pick === "none") return "back";
    if ((await detailPage(player, pick)) === "close") return "close";
  }
}

// ---------------- 融合 ----------------
async function fusionPage(player) {
  for (;;) {
    const opts = ctx.skillService.fusionOptions(player.id).filter((o) => o.known || o.done);
    const form = new ActionFormData().title("スキル融合").body("定義済みの組み合わせだけ融合できます。融合元のスキルは消えません。\n（両方のスキルを習得すると、ここに組み合わせが表示されます）");
    for (const o of opts) {
      const out = skills.get(o.recipe.output);
      form.button(`${o.done ? "§a✓" : o.can ? "§b○" : "§8・"}§r ${out.name}\n§8${o.recipe.inputs.map((i) => skills.get(i).name).join("＋")}（各Lv${o.recipe.minLevel}以上）`);
    }
    form.button("§l戻る");
    const res = await showForm(player, form);
    if (!res || res.selection === undefined || res.selection >= opts.length) return "back";
    const o = opts[res.selection];
    const out = skills.get(o.recipe.output);
    const body = lines(skillDetailText(data(player), out), "", heading("融合の条件"), o.recipe.inputs.map((i, k) => `・${skills.get(i).name} Lv${o.levels[k]} / ${o.recipe.minLevel}`), o.recipe.extra ? o.recipe.extra.map((c) => `・${describeCondition(c, jobName)}`) : []);
    await showInfoPage(player, "融合", body, o.can ? [{ label: "§d融合する", run: () => say(player, ctx.skillService.fuse(player.id, o.recipe.id), `${out.name}を習得した`) }] : []);
  }
}

// ---------------- プリセット ----------------
async function presetPage(player) {
  for (;;) {
    const d = data(player);
    const form = new ActionFormData().title("割り当てのプリセット").body(`現在の9枠×5操作の割り当てを${PRESET_SLOTS}つまで保存できます。`);
    for (let i = 0; i < PRESET_SLOTS; i++) {
      const p = d.skills.presets[i];
      form.button(p ? `${p.name}` : `§8空き（${i + 1}）`);
    }
    form.button("§l戻る");
    const res = await showForm(player, form);
    if (!res || res.selection === undefined || res.selection >= PRESET_SLOTS) return "back";
    const i = res.selection;
    const p = d.skills.presets[i];
    const f = new ActionFormData().title(p ? p.name : `プリセット${i + 1}`).button("今の割り当てを保存（上書き）");
    if (p) f.button("読み込む").button("§c削除");
    f.button("§l戻る");
    const r = await showForm(player, f);
    if (!r || r.selection === undefined) continue;
    if (r.selection === 0) {
      const m = await showForm(player, new ModalFormData().title("名前").textField("プリセットの名前", "例：ボス戦", { defaultValue: p ? p.name : `プリセット${i + 1}` }));
      if (m && m.formValues) say(player, ctx.skillService.savePreset(player.id, i, String(m.formValues[0] || "")), "保存した");
    } else if (p && r.selection === 1) {
      const lr = ctx.skillService.loadPreset(player.id, i);
      player.sendMessage(lr.ok ? `§a読み込んだ${lr.dropped ? `（使えなくなった技${lr.dropped}個は外した）` : ""}` : `§c${lr.reason}`);
    } else if (p && r.selection === 2) ctx.skillService.deletePreset(player.id, i);
  }
}

// ---------------- 熟練度・操作方法 ----------------
function masteryText(d) {
  const w = Object.entries(d.proficiency.weapon || {});
  const m = Object.entries(d.proficiency.magic || {});
  return lines(
    heading("武器熟練度"),
    w.length ? w.map(([k, v]) => `・${WEAPONS[k] ?? k} Lv${num(v.level)}`) : "まだありません（武器の技を敵に当てると上がる）",
    "",
    heading("魔法熟練度（属性ごと）"),
    m.length ? m.map(([k, v]) => `・${ELEMENT_NAMES[k] ?? k} Lv${num(v.level)}`) : "まだありません（魔法を敵に当てる・仲間に効かせると上がる）",
    "",
    "§7スキルの熟練度は、敵への命中・仲間への効果で上がります。同じ技は約1秒に1回まで、1回の発動で数える命中は5体までです。",
    "§7訓練場が解放されていれば、敵がいない場所での練習でも少しだけ上がります（1日の上限あり）。§r"
  );
}

export const CONTROLS_TEXT = lines(
  heading("操作方法（ホットバー複合操作）"),
  "技の触媒をホットバーに置き、その枠を選んで使います。1つの枠に5つの技を割り当てられます。",
  `・通常使用：そのまま使う（短く押す）`,
  `・ジャンプ中：ジャンプしてすぐ使う`,
  `・ダッシュ中：走りながら使う`,
  `・しゃがみ溜め：しゃがんだまま約0.8秒溜めてから使う`,
  `・長時間溜め：しゃがんだまま約2秒溜めてから使う（奥義）`,
  "",
  "優先順位：長時間溜め＞しゃがみ溜め＞ダッシュ中＞ジャンプ中＞通常",
  "溜めの進み具合は画面下に表示されます。しゃがみを解く・枠を持ち替えると溜めは取り消されます。",
  "詠唱のある技は、詠唱中に持ち替えると中断します（消費なし）。",
  "クールタイム中・MPやスタミナ不足・職業や装備の条件を満たさない技は発動しません。",
  "",
  "§7Switch：ZL＝使う、Lスティック押し込み＝ダッシュ、Rスティック押し込み＝しゃがみ（初期設定）。§r",
  "§7ダッシュ中の判定が難しい場合は、同じ技を「通常」にも割り当てると確実に使えます。§r"
);

export const skillPage = {
  id: "skill",
  label: "スキル",
  icon: "textures/items/book_enchanted",
  /** @param {import("@minecraft/server").Player} player */
  async open(player) {
    for (;;) {
      ctx.skillService.evaluate(player.id);
      const d = data(player);
      const learned = ctx.skillService.learnedList(player.id).length;
      const bound = d.skillBindings.slots.reduce((t, s) => t + Object.values(s).filter(Boolean).length, 0);
      const focus = countSkillFocus(player);
      const items = [
        { label: `技の割り当て §7（${bound}/${HOTBAR_SLOTS * ACTION_TYPES.length}）`, run: () => bindingsPage(player) },
        { label: `習得済みスキル §7（${learned}）`, run: () => learnedPage(player) },
        { label: "習得できるスキル", run: () => unlearnedPage(player) },
        { label: "スキル融合", run: () => fusionPage(player) },
        { label: "割り当てのプリセット", run: () => presetPage(player) },
        { label: "武器・魔法の熟練度", run: () => showInfoPage(player, "熟練度", masteryText(d)) },
        {
          label: `技の触媒を受け取る §7（${focus}/${MAX_SKILL_FOCUS}）`,
          run: () => {
            const n = giveSkillFocus(player, 1);
            player.sendMessage(n > 0 ? "§a技の触媒を受け取った。ホットバーの好きな枠に置いてください。" : `§c受け取れません（最大${MAX_SKILL_FOCUS}個・インベントリの空き）`);
          },
        },
        { label: "操作方法", run: () => showInfoPage(player, "操作方法", CONTROLS_TEXT) },
      ];
      const form = new ActionFormData()
        .title("スキル")
        .body(`スキルポイント：§b${num(d.skills.points)}§r（累計 ${num(d.skills.pointsEarned)}）\n習得済み：${learned}種　割り当て：${bound}/45`);
      for (const it of items) form.button(it.label);
      form.button("§l戻る");
      form.button("閉じる");
      const res = await showForm(player, form);
      if (!res || res.selection === undefined || res.selection === items.length + 1) return "close";
      if (res.selection === items.length) return "back";
      /** @type {any} */
      const r = await items[res.selection].run();
      if (r === "close") return "close";
    }
  },
};

export { ACTION_NAMES };
