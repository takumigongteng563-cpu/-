// =============================================================
// スキルの管理（第4弾）：習得・熟練度・スキルレベル・スキルポイント・進化・融合・プリセット・武器/魔法熟練度
// ・@minecraft/server に依存しない（テストで動かせる）
// ・習得記録は data.skills.learned（使徒専用スキルは apostleService が data.apostle.skills で管理）
// ・進化・融合しても元のスキルは消さない
// ・熟練度は「命中」「仲間への効果」で上がる。同じスキルは最短間隔あり、1回の発動で数える命中数に上限あり、
//   訓練（敵がいない使用）は訓練場の解放後のみ・1日の上限あり → 連打・放置で無限に稼げない
// =============================================================
import { skills, fusionRecipes, isApostleSkill } from "../content/skills.js";
import { jobs } from "../content/jobs.js";
import { checkAll, checkCondition } from "../talents/conditions.js";
import { emit } from "../core/eventBus.js";
import { PROFICIENCY_GAIN, SKILL_POINTS, MASTERY_CURVE, PRESET_SLOTS } from "../balance/skills.js";
import { maxLevelOf, skillEnv, proficiencyToNext, masteryToNext, growthMultiplier, usability, learnedRecord, inheritedSkillLimit, jobUsage, countInheritedBindings } from "./skillRules.js";
import { HOTBAR_SLOTS } from "../balance/input.js";

const MAX_HISTORY = 100;
const GAME_DAY_TICKS = 24000;

/** 習得方法の日本語名 */
export const LEARN_METHOD_NAMES = Object.freeze({
  playerLevel: "プレイヤーレベル",
  jobLevel: "職業レベル",
  skillPoint: "スキルポイント",
  weaponMastery: "武器熟練度",
  magicMastery: "魔法熟練度",
  action: "行動",
  grimoire: "魔導書",
  master: "師匠NPC",
  boss: "ボス討伐",
  stage: "ステージ攻略",
  talent: "才能覚醒",
  potential: "潜在能力覚醒",
  equipment: "特殊装備",
  godTrial: "神々の試練",
  faith: "信仰",
  apostle: "使徒契約",
  hidden: "隠し条件",
  evolution: "進化",
  fusion: "融合",
  jobFusion: "職業融合",
  admin: "管理者",
});

function newRecord(source, now) {
  return { level: 1, exp: 0, learnedAt: now, uses: 0, hits: 0, source, evolvedTo: null };
}

export class SkillService {
  /**
   * @param {import("../player/playerService.js").PlayerService} playerService
   * @param {import("../world/worldService.js").WorldService} worldService
   * @param {() => number} nowTick
   */
  constructor(playerService, worldService, nowTick) {
    this.playerService = playerService;
    this.worldService = worldService;
    this.nowTick = nowTick;
    /** @type {Map<string, Map<string, number>>} 熟練度の最短間隔（保存しない） */
    this.lastGain = new Map();
    // 習得判定の対象（使徒専用・融合・進化先は自動習得しない）
    this.autoLearn = skills.all().filter((d) => !isApostleSkill(d) && Array.isArray(d.learn) && d.learn.some((l) => l.method !== "skillPoint"));
  }

  world() {
    return this.worldService.world;
  }

  env() {
    return skillEnv(this.world());
  }

  data(playerId) {
    return this.playerService.dataFor(playerId);
  }

  isLearned(playerId, id) {
    const d = this.data(playerId);
    return !!(d && learnedRecord(d, id));
  }

  // ---------------- 習得 ----------------
  /** 条件を満たした習得方法（skillPoint は除く）があるか */
  learnableBy(def, d, env) {
    for (const l of def.learn || []) {
      if (l.method === "skillPoint") continue;
      if (checkAll(l.conditions, d, env)) return l.method;
    }
    return null;
  }

  /**
   * 自動習得の判定（レベルアップ・行動のまとめ判定・転職・参加時に呼ぶ）
   * @returns {string[]} 新しく習得したスキルID
   */
  evaluate(playerId) {
    const d = this.data(playerId);
    if (!d) return [];
    const env = this.env();
    const held = new Set([...(d.job.held || []), d.job.current]);
    const learned = [];
    const now = Date.now();
    for (const def of this.autoLearn) {
      if (d.skills.learned[def.id]) continue;
      if (def.jobs && !def.jobs.some((j) => held.has(j))) continue; // 経験していない職業のスキルは判定しない（負荷対策）
      const method = this.learnableBy(def, d, env);
      if (!method) continue;
      learned.push({ id: def.id, method });
    }
    const sp = this.pendingSkillPoints(d);
    if (learned.length === 0 && sp.total === 0) return [];
    this.playerService.update(
      playerId,
      (x) => {
        for (const l of learned) {
          x.skills.learned[l.id] = newRecord(l.method, now);
          if (l.method === "hidden" && !x.skills.discovered.includes(l.id)) x.skills.discovered.push(l.id);
        }
        this.applySkillPoints(x, sp);
      },
      { important: learned.length > 0 }
    );
    for (const l of learned) emit("skillLearned", { playerId, id: l.id, method: l.method });
    if (sp.total > 0) emit("skillPointsGained", { playerId, amount: sp.total });
    return learned.map((l) => l.id);
  }

  /** スキルポイントでの習得 */
  learnWithSp(playerId, id) {
    const def = skills.get(id);
    const d = this.data(playerId);
    if (!def || !d) return { ok: false, reason: "存在しないスキル" };
    if (d.skills.learned[id]) return { ok: false, reason: "習得済み" };
    const l = (def.learn || []).find((x) => x.method === "skillPoint");
    if (!l) return { ok: false, reason: "スキルポイントでは習得できない" };
    if (!checkAll(l.conditions, d, this.env())) return { ok: false, reason: "習得の条件を満たしていない" };
    if (d.skills.points < l.sp) return { ok: false, reason: "スキルポイントが足りない" };
    this.playerService.update(
      playerId,
      (x) => {
        x.skills.points -= l.sp;
        x.skills.learned[id] = newRecord("skillPoint", Date.now());
      },
      { important: true }
    );
    emit("skillLearned", { playerId, id, method: "skillPoint" });
    return { ok: true };
  }

  /** 管理者・特殊イベント用の付与（使徒専用スキルは付与しない） */
  grant(playerId, id, source = "admin") {
    const def = skills.get(id);
    if (!def) return { ok: false, reason: "存在しないスキル" };
    if (isApostleSkill(def)) return { ok: false, reason: "使徒専用スキルは使徒契約でのみ得られる" };
    const ok = this.playerService.update(playerId, (d) => {
      if (!d.skills.learned[id]) d.skills.learned[id] = newRecord(source, Date.now());
    }, { important: true });
    if (ok) emit("skillLearned", { playerId, id, method: source });
    return { ok };
  }

  // ---------------- スキルポイント ----------------
  /** まだ付与していないスキルポイント（既存プレイヤーはこれまでのレベル分を遡って付与） */
  pendingSkillPoints(d) {
    const fromLevel = Math.max(0, (d.level - 1) - Math.max(0, (d.skills.pointsGrantedLevel || 1) - 1)) * SKILL_POINTS.perPlayerLevel;
    const jobs = {};
    let fromJobs = 0;
    for (const [jid, l] of Object.entries(d.job.levels || {})) {
      const got = Math.floor((d.skills.pointsGrantedJobLevels[jid] || 0) / SKILL_POINTS.perJobLevels);
      const now = Math.floor((l.level || 0) / SKILL_POINTS.perJobLevels);
      if (now > got) {
        fromJobs += now - got;
        jobs[jid] = l.level;
      }
    }
    return { total: fromLevel + fromJobs, level: d.level, jobs };
  }

  applySkillPoints(x, sp) {
    if (sp.total <= 0) return;
    x.skills.points += sp.total;
    x.skills.pointsEarned += sp.total;
    x.skills.pointsGrantedLevel = Math.max(x.skills.pointsGrantedLevel || 1, sp.level);
    for (const [jid, lv] of Object.entries(sp.jobs)) x.skills.pointsGrantedJobLevels[jid] = lv;
  }

  // ---------------- 熟練度・スキルレベル ----------------
  /**
   * 熟練度を得る
   * @param {string} playerId
   * @param {string} id
   * @param {{hits?: number, practice?: boolean}} opt hits = 命中数（仲間への効果を含む） / practice = 敵がいない使用
   * @returns {{gained: number, levelUp: boolean, level?: number, reason?: string}}
   */
  gainProficiency(playerId, id, opt = {}) {
    const def = skills.get(id);
    const d = this.data(playerId);
    if (!def || !d) return { gained: 0, levelUp: false, reason: "存在しない" };
    const apostle = isApostleSkill(def);
    const rec = learnedRecord(d, id);
    if (!rec) return { gained: 0, levelUp: false, reason: "未習得" };
    const now = this.nowTick();
    const per = this.lastGain.get(playerId) || new Map();
    if (now - (per.get(id) ?? -Infinity) < PROFICIENCY_GAIN.minIntervalTicks) return { gained: 0, levelUp: false, reason: "間隔が短すぎる" };
    let amount = 0;
    const hits = Math.min(PROFICIENCY_GAIN.maxHitsCounted, Math.max(0, Math.floor(opt.hits || 0)));
    const day = Math.floor(now / GAME_DAY_TICKS);
    let practiceUsed = false;
    if (hits > 0) amount = hits * PROFICIENCY_GAIN.perHit;
    else if (opt.practice) {
      const w = this.world();
      if (!w.kingdom.facilities.training) return { gained: 0, levelUp: false, reason: "訓練場が未解放" };
      const pr = d.skills.practice;
      const used = pr.day === day ? pr.counts[id] || 0 : 0;
      if (used >= PROFICIENCY_GAIN.practicePerDay) return { gained: 0, levelUp: false, reason: "今日の訓練の上限" };
      amount = PROFICIENCY_GAIN.practice;
      practiceUsed = true;
    }
    if (amount <= 0) return { gained: 0, levelUp: false, reason: "効果がなかった" };
    amount = Math.max(1, Math.round(amount * growthMultiplier(def, d)));
    per.set(id, now);
    this.lastGain.set(playerId, per);
    let levelUp = false;
    let level = rec.level;
    this.playerService.update(playerId, (x) => {
      const r = apostle ? x.apostle.skills[id] : x.skills.learned[id];
      if (!r) return;
      if (practiceUsed) {
        if (x.skills.practice.day !== day) x.skills.practice = { day, counts: {} };
        x.skills.practice.counts[id] = (x.skills.practice.counts[id] || 0) + 1;
      }
      r.hits = (r.hits || 0) + hits;
      const max = def.maxLevel;
      if (r.level >= max) return; // 最大レベルでは熟練度を貯めない
      r.exp = (r.exp || 0) + amount;
      while (r.level < max && r.exp >= proficiencyToNext(r.level)) {
        r.exp -= proficiencyToNext(r.level);
        r.level++;
        levelUp = true;
      }
      if (r.level >= max) r.exp = 0;
      level = r.level;
    }, { important: levelUp });
    if (levelUp) emit("skillLevelUp", { playerId, id, level });
    return { gained: amount, levelUp, level };
  }

  /** 使用回数の記録（発動成功時） */
  recordUse(playerId, id) {
    const def = skills.get(id);
    this.playerService.update(playerId, (x) => {
      const r = def && isApostleSkill(def) ? x.apostle.skills[id] : x.skills.learned[id];
      if (r) r.uses = (r.uses || 0) + 1;
    });
  }

  /** スキルポイントでレベルを上げる（熟練度が必要量の半分以上たまっているとき） */
  levelUpWithSp(playerId, id) {
    const def = skills.get(id);
    const d = this.data(playerId);
    const rec = d && d.skills.learned[id];
    if (!def || !rec) return { ok: false, reason: "未習得" };
    if (rec.level >= def.maxLevel) return { ok: false, reason: "最大レベル" };
    const need = proficiencyToNext(rec.level);
    if ((rec.exp || 0) < need / 2) return { ok: false, reason: "熟練度が足りない（必要量の半分以上）" };
    const cost = Math.max(1, Math.ceil(rec.level * SKILL_POINTS.levelUpCostFactor));
    if (d.skills.points < cost) return { ok: false, reason: `スキルポイントが足りない（${cost}必要）` };
    this.playerService.update(playerId, (x) => {
      const r = x.skills.learned[id];
      x.skills.points -= cost;
      r.exp = 0;
      r.level++;
    }, { important: true });
    emit("skillLevelUp", { playerId, id, level: rec.level });
    return { ok: true, cost };
  }

  setLevel(playerId, id, level) {
    const def = skills.get(id);
    if (!def) return false;
    return this.playerService.update(playerId, (x) => {
      const r = isApostleSkill(def) ? x.apostle.skills[id] : x.skills.learned[id];
      if (r) {
        r.level = Math.max(1, Math.min(def.maxLevel, Math.floor(level)));
        r.exp = 0;
      }
    }, { important: true });
  }

  // ---------------- 進化 ----------------
  /** 進化先の一覧と、それぞれ進化できるか */
  evolutionOptions(playerId, id) {
    const def = skills.get(id);
    const d = this.data(playerId);
    if (!def || !d) return [];
    const rec = learnedRecord(d, id);
    const env = this.env();
    return (def.evolvesTo || []).map((e) => ({
      ...e,
      def: skills.get(e.to),
      can: !!rec && !rec.evolvedTo && !d.skills.learned[e.to] && checkAll(e.conditions, d, env),
      chosen: !!rec && rec.evolvedTo === e.to,
    }));
  }

  /**
   * 進化する。分岐は1つだけ選べる（元のスキルは残る）。使徒専用スキルは信仰で進化する（apostleService）
   */
  evolve(playerId, id, to) {
    const def = skills.get(id);
    if (!def || isApostleSkill(def)) return { ok: false, reason: "進化できないスキル" };
    const opt = this.evolutionOptions(playerId, id).find((o) => o.to === to);
    if (!opt) return { ok: false, reason: "その進化先はない" };
    if (!opt.can) return { ok: false, reason: opt.chosen ? "進化済み" : "進化の条件を満たしていない" };
    const now = Date.now();
    this.playerService.update(playerId, (x) => {
      x.skills.learned[id].evolvedTo = to;
      x.skills.learned[to] = newRecord("evolution", now);
      x.skills.evolutions.push({ from: id, to, at: now });
      if (x.skills.evolutions.length > MAX_HISTORY) x.skills.evolutions.shift();
    }, { important: true });
    emit("skillEvolved", { playerId, from: id, to });
    return { ok: true };
  }

  // ---------------- 融合 ----------------
  fusionOptions(playerId) {
    const d = this.data(playerId);
    if (!d) return [];
    const env = this.env();
    return fusionRecipes.all().map((r) => {
      const lv = r.inputs.map((i) => (d.skills.learned[i] ? d.skills.learned[i].level : 0));
      const done = !!d.skills.learned[r.output];
      const can = !done && lv.every((l) => l >= r.minLevel) && (!r.extra || checkAll(r.extra, d, env));
      return { recipe: r, levels: lv, done, can, known: lv.every((l) => l > 0) };
    });
  }

  /** 定義済みの組み合わせだけ融合できる。融合元は消えない */
  fuse(playerId, recipeId) {
    const opt = this.fusionOptions(playerId).find((o) => o.recipe.id === recipeId);
    if (!opt) return { ok: false, reason: "その組み合わせでは融合できない" };
    if (opt.done) return { ok: false, reason: "融合済み" };
    if (!opt.can) return { ok: false, reason: "融合の条件を満たしていない" };
    const now = Date.now();
    const r = opt.recipe;
    this.playerService.update(playerId, (x) => {
      x.skills.learned[r.output] = newRecord("fusion", now);
      x.skills.fusions.push({ recipe: r.id, inputs: [...r.inputs], output: r.output, at: now });
      if (x.skills.fusions.length > MAX_HISTORY) x.skills.fusions.shift();
    }, { important: true });
    emit("skillFused", { playerId, recipe: r.id, output: r.output });
    return { ok: true, output: r.output };
  }

  // ---------------- 使用条件・割り当ての検証 ----------------
  /** 習得済み＋使用条件。発動の直前に毎回呼ぶ（職業・装備が変わっても誤発動しない） */
  canUse(playerId, id) {
    const d = this.data(playerId);
    const def = skills.get(id);
    if (!d || !def) return { ok: false, reason: "存在しないスキル" };
    if (!learnedRecord(d, id)) return { ok: false, reason: "未習得" };
    if (def.effect && def.effect.type === "passive") return { ok: false, reason: "パッシブスキル（常に効果）" };
    const u = usability(def, d, this.world());
    if (!u.ok) return u;
    if (u.inherited) {
      // 引き継ぎスキルは割り当て中の数が上限を超えていたら使えない
      if (countInheritedBindings(d) > inheritedSkillLimit(d)) return { ok: false, reason: "引き継ぎスキルの数が上限を超えている" };
    }
    return { ok: true };
  }

  /** 割り当てられるか（bind の前に呼ぶ） */
  canBind(playerId, slot, action, id) {
    const d = this.data(playerId);
    const def = skills.get(id);
    if (!def || !d) return { ok: false, reason: "存在しないスキル" };
    if (!learnedRecord(d, id)) return { ok: false, reason: "未習得のスキル" };
    if (def.effect && def.effect.type === "passive") return { ok: false, reason: "パッシブスキルは割り当て不要" };
    if (Array.isArray(def.actions) && !def.actions.includes(action)) return { ok: false, reason: "その操作には割り当てられない" };
    if (def.jobs && jobUsage(def, d) === "inherited") {
      const next = d.skillBindings.slots.map((s, i) => (i === slot ? { ...s, [action]: id } : s));
      if (countInheritedBindings(d, next) > inheritedSkillLimit(d)) return { ok: false, reason: `引き継ぎスキルは${inheritedSkillLimit(d)}種類まで` };
    }
    return { ok: true };
  }

  // ---------------- プリセット ----------------
  savePreset(playerId, index, name) {
    if (!(index >= 0 && index < PRESET_SLOTS)) return { ok: false, reason: "番号が不正" };
    const ok = this.playerService.update(playerId, (x) => {
      while (x.skills.presets.length <= index) x.skills.presets.push(null);
      x.skills.presets[index] = { name: String(name || `プリセット${index + 1}`).slice(0, 16), slots: JSON.parse(JSON.stringify(x.skillBindings.slots)), savedAt: Date.now() };
    }, { important: true });
    return { ok };
  }

  /** プリセットを読み込む。未習得・使徒契約の切れたスキルは外して読み込む */
  loadPreset(playerId, index) {
    const d = this.data(playerId);
    const p = d && d.skills.presets[index];
    if (!p) return { ok: false, reason: "空のプリセット" };
    let dropped = 0;
    this.playerService.update(playerId, (x) => {
      const slots = [];
      for (let i = 0; i < HOTBAR_SLOTS; i++) {
        const src = p.slots[i] || {};
        const out = { tap: null, jump: null, sprint: null, charge: null, ultimate: null };
        for (const k of Object.keys(out)) {
          const id = src[k];
          if (!id) continue;
          if (learnedRecord(x, id)) out[k] = id;
          else dropped++;
        }
        slots.push(out);
      }
      x.skillBindings.slots = slots;
    }, { important: true });
    return { ok: true, dropped };
  }

  deletePreset(playerId, index) {
    return this.playerService.update(playerId, (x) => {
      if (x.skills.presets[index]) x.skills.presets[index] = null;
    }, { important: true });
  }

  // ---------------- 武器熟練度・魔法熟練度 ----------------
  /**
   * @param {"weapon"|"magic"} kind
   * @param {string} key 武器の種類（sword など）・属性（fire など）
   */
  addMastery(playerId, kind, key, amount) {
    if (!key || !(amount > 0)) return { levelUp: false };
    let levelUp = false;
    let level = 0;
    this.playerService.update(playerId, (x) => {
      const box = x.proficiency[kind];
      const p = box[key] || { level: 0, exp: 0 };
      if (p.level >= MASTERY_CURVE.maxLevel) return;
      p.exp = (p.exp || 0) + amount;
      while (p.level < MASTERY_CURVE.maxLevel && p.exp >= masteryToNext(p.level + 1)) {
        p.exp -= masteryToNext(p.level + 1);
        p.level++;
        levelUp = true;
      }
      level = p.level;
      box[key] = p;
    });
    if (levelUp) emit("masteryLevelUp", { playerId, kind, key, level });
    return { levelUp, level };
  }

  // ---------------- 表示用 ----------------
  /** 習得済みのスキル（使徒専用スキルを含む） [{ def, rec, usable }] */
  learnedList(playerId) {
    const d = this.data(playerId);
    if (!d) return [];
    const w = this.world();
    const out = [];
    for (const [id, rec] of Object.entries(d.skills.learned)) {
      const def = skills.get(id);
      if (def) out.push({ def, rec, usable: usability(def, d, w) });
    }
    for (const [id, rec] of Object.entries((d.apostle && d.apostle.skills) || {})) {
      const def = skills.get(id);
      if (def) out.push({ def, rec, usable: usability(def, d, w) });
    }
    return out;
  }

  /** 未習得で、習得方法が分かっているスキル（隠しスキルは表示しない） */
  unlearnedList(playerId) {
    const d = this.data(playerId);
    if (!d) return [];
    const held = new Set([...(d.job.held || []), d.job.current]);
    return skills
      .all()
      .filter((def) => !learnedRecord(d, def.id) && def.category !== "hidden" && !isApostleSkill(def) && (!def.jobs || def.jobs.some((j) => held.has(j)) || (jobs.get(d.job.current)?.children || []).some((c) => def.jobs.includes(c))));
  }

  /** 熟練度の進み（表示用） */
  progressOf(playerId, id) {
    const d = this.data(playerId);
    const rec = d && learnedRecord(d, id);
    if (!rec) return null;
    const max = maxLevelOf(id);
    return { level: rec.level, max, exp: rec.exp || 0, need: rec.level >= max ? 0 : proficiencyToNext(rec.level) };
  }

  forget(playerId) {
    this.lastGain.delete(playerId);
  }
}

export { checkCondition };
