// =============================================================
// 戦闘の管理（第5弾）。@minecraft/server に依存しない（テスト・負荷測定で動かせる）
// ・戦闘中の対象だけを Map で持ち、戦闘が終わったら消す（毎tickの処理はしない）
// ・プレイヤーの攻撃：computeDamage → 参加人数の補正 → 状態異常 → 属性融合 → コンボ → ヘイト → 体勢値・部位 → ログ
// ・敵の攻撃：ガード／ジャストガード／回避／ジャスト回避を判定し、受けるダメージの割合を返す
// ・状態異常・ヘイトの減衰・戦闘終了は1秒ごとにまとめて処理（tick）
// =============================================================
import { computeDamage, dotDamage, fin } from "./damageCalc.js";
import { COMBAT, DEFENSE, COMBO, STATUS_TOLERANCE, HATE, PARTY_SCALING, COMBAT_LOG, COMBAT_LIMITS } from "../balance/combat.js";
import { ELEMENTS, findFusion } from "../content/combat/elements.js";
import { STATUS_EFFECTS } from "../content/combat/statusEffects.js";
import { BUFF_TYPES } from "../content/combat/buffs.js";
import { enemyProfile } from "../content/combat/enemies.js";
import { ROLE_COMBAT, SPECIAL_COMBAT } from "../content/combat/jobCombat.js";
import { jobs } from "../content/jobs.js";
import { emit } from "../core/eventBus.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, fin(v, a)));
const FUSION_WINDOW = 80;

function newBattle(now) {
  return { start: now, last: now, dealt: 0, taken: 0, healed: 0, crits: 0, weakHits: 0, justGuards: 0, guards: 0, justDodges: 0, dodges: 0, skills: {}, combos: 0, maxCombo: 0, statuses: {}, fusions: 0, breaks: 0, defeat: null, enemies: {} };
}

export class CombatService {
  /**
   * @param {import("../player/playerService.js").PlayerService} playerService
   * @param {import("../stats/statService.js").StatService} stats
   * @param {() => number} nowTick
   * @param {() => number} [rng]
   */
  constructor(playerService, stats, nowTick, rng = Math.random) {
    this.playerService = playerService;
    this.stats = stats;
    this.nowTick = nowTick;
    this.rng = rng;
    /** @type {Map<string, any>} 戦闘中の敵 */
    this.enemies = new Map();
    /** @type {Map<string, any>} プレイヤーの戦闘状態（ガード・回避・コンボ・戦闘ログ） */
    this.players = new Map();
    /** @type {Map<string, any>} 状態異常（敵・プレイヤー共通。キー＝エンティティID） */
    this.status = new Map();
    /** 参加人数（runtime が設定。テストでは直接） */
    this.partyCount = () => Math.max(1, this.playerService.onlineSessions().length);
    /** 訓練ダミー・ボスの上書き設定 { [entityId]: profile の一部 } */
    this.overrides = new Map();
  }

  // ---------------- 状態 ----------------
  player(pid) {
    let s = this.players.get(pid);
    if (!s) {
      s = { guardSince: -1, dodgeStart: -1e9, dodgeCdUntil: 0, counterUntil: 0, combo: { count: 0, last: -1e9, skill: null, run: 0, element: null }, element: { id: null, run: 0 }, moved: 0, battle: null, buffedAllies: 0 };
      this.players.set(pid, s);
    }
    return s;
  }

  enemy(target) {
    let e = this.enemies.get(target.id);
    if (!e) {
      if (this.enemies.size >= COMBAT_LIMITS.trackedEnemies) this.dropOldestEnemy();
      const ov = this.overrides.get(target.id) || {};
      const base = enemyProfile(ov.profileId || target.typeId);
      const profile = { ...base, ...ov, resist: { ...base.resist, ...(ov.resist || {}) }, caps: { ...base.caps, ...(ov.caps || {}) } };
      const party = clamp(this.partyCount(), 1, 4);
      e = {
        id: target.id,
        typeId: target.typeId,
        profile,
        hpScale: PARTY_SCALING.hp[party] || 1,
        atkScale: PARTY_SCALING.attack[party] || 1,
        poise: profile.poise,
        brokenUntil: 0,
        parts: Object.fromEntries((profile.parts || []).map((p) => [p.id, { hp: p.hp, broken: false }])),
        disabled: new Set(),
        hate: new Map(),
        target: null,
        lastElement: null,
        discovered: new Set(),
        defDown: 0,
        last: this.nowTick(),
        form: 1,
        invulnerable: false,
      };
      this.enemies.set(target.id, e);
    }
    e.last = this.nowTick();
    return e;
  }

  dropOldestEnemy() {
    let oldest = null;
    for (const e of this.enemies.values()) if (!oldest || e.last < oldest.last) oldest = e;
    if (oldest) this.forgetEntity(oldest.id);
  }

  battle(pid) {
    const s = this.player(pid);
    const now = this.nowTick();
    if (!s.battle) s.battle = newBattle(now);
    s.battle.last = now;
    return s.battle;
  }

  // ---------------- 補正の収集 ----------------
  /** プレイヤーの戦闘補正（一時効果の combat 値・状態異常） */
  playerMods(pid, d) {
    const m = { atk: 0, damageTaken: 0, elementTaken: 0, critRate: 0, divine: 0, healTaken: 0, cooldown: 0, defDown: 0, elementWeak: {} };
    const now = this.nowTick();
    for (const b of d.buffs || []) {
      if (!b || (b.untilTick && b.untilTick <= now)) continue;
      const t = b.combat || (b.type && BUFF_TYPES[b.type] && BUFF_TYPES[b.type].combat);
      if (t) for (const [k, v] of Object.entries(t)) if (k in m && typeof v === "number") m[k] += v;
      if (typeof b.source === "string" && (b.source.startsWith("blessing") || b.source.startsWith("apostle"))) m.divine += 0.05;
    }
    this.statusMods(pid, m);
    m.atk = clamp(m.atk, -0.9, 2);
    m.damageTaken = clamp(m.damageTaken, -0.8, 2);
    return m;
  }

  statusMods(id, m) {
    const box = this.status.get(id);
    if (!box) return m;
    for (const [sid, st] of Object.entries(box.list)) {
      const def = STATUS_EFFECTS[sid];
      const k = def.power * st.stacks;
      if (def.stat) {
        if (def.stat.atk) m.atk = (m.atk || 0) - k;
        if (def.stat.def) m.defDown = (m.defDown || 0) + k;
        if (def.stat.elementTaken) m.elementTaken = (m.elementTaken || 0) + k;
        if (def.stat.heal) m.healTaken = (m.healTaken || 0) - k;
      }
      if (def.elementWeak) m.elementWeak = { ...(m.elementWeak || {}), ...def.elementWeak };
    }
    return m;
  }

  /** 職業の特性（段階で強くなる） */
  jobTrait(d) {
    const job = jobs.get(d.job.current);
    const t = job && ROLE_COMBAT[job.role];
    return { t: t || {}, scale: job && job.tier ? 0.6 + job.tier * 0.2 : 0, job };
  }

  /** 職業専用能力値の戦闘効果 */
  special(d, key) {
    let v = 0;
    const sp = (d.computed && d.computed.special) || {};
    for (const [sid, val] of Object.entries(sp)) {
      const c = SPECIAL_COMBAT[sid];
      if (c && c[key]) v += Math.min(c.max, c[key] * val);
    }
    return v;
  }

  // ---------------- プレイヤーの攻撃 ----------------
  /**
   * @param {string} pid
   * @param {{id: string, typeId: string, maxHp?: number, distance?: number}} target maxHp はバニラの体力
   * @param {{type?: string, base?: number, skillMult?: number, elements?: string[], skillId?: string, skillLevel?: number,
   *   isNormal?: boolean, airborne?: boolean, statuses?: {id: string, chance?: number}[], poise?: number, partId?: string,
   *   linked?: boolean, weapon?: string, category?: string, noFusion?: boolean, weaponMult?: number}} hit
   */
  playerAttack(pid, target, hit) {
    const d = this.playerService.dataFor(pid);
    if (!d) return null;
    const now = this.nowTick();
    const e = this.enemy(target);
    const s = this.player(pid);
    const b = this.battle(pid);
    const { t, scale } = this.jobTrait(d);
    const prof = e.profile;
    const elements = hit.elements && hit.elements.length ? hit.elements : ["none"];
    // 特殊効果（コンボ・反撃・連携・役割の仕組み）
    let special = 1;
    let critBonus = 0;
    const combo = this.updateCombo(s, hit, now);
    special += combo.bonus;
    const counter = s.counterUntil > now;
    if (counter) {
      special *= DEFENSE.counterMult;
      if (t.counterCrit) critBonus = 1;
      s.counterUntil = 0;
    }
    if (t.comboChain) special += Math.min(0.3, combo.count * t.comboChain * scale);
    if (t.distance && target.distance) special += Math.min(t.distanceMax, target.distance * t.distance * scale);
    if (t.sameElement) {
      const el = elements[0];
      s.element.run = s.element.id === el ? s.element.run + 1 : 0;
      s.element.id = el;
      special += Math.min(t.sameElementMax, s.element.run * t.sameElement * scale);
    }
    if (t.unaware && e.target && e.target !== pid) special += t.unaware * scale + this.special(d, "unaware");
    if (t.moveBonus && s.moved > 0) {
      special += Math.min(t.moveMax, Math.floor(s.moved / 10) * t.moveBonus * scale);
      s.moved = 0;
    }
    if (hit.linked) special += 0.2;
    // 職業専用能力値
    let jobMult = 1;
    const kind = hit.type === "magical" || hit.type === "elemental" ? "magical" : "physical";
    jobMult += this.special(d, kind);
    if (kind === "physical" && hit.weapon === "bow") jobMult += this.special(d, "ranged");
    if (hit.type === "elemental") jobMult += this.special(d, "elemental");
    if (elements.includes("holy")) jobMult += this.special(d, "holy");
    if (prof.undead && elements.includes("holy")) jobMult += ELEMENTS.holy.undeadBonus;
    const partDef = hit.partId && (prof.parts || []).find((p) => p.id === hit.partId);
    const attacker = { derived: d.computed.derived, level: d.level, mods: this.playerMods(pid, d) };
    const dmods = { damageTaken: 0, elementTaken: 0, defDown: e.defDown, elementWeak: {} };
    this.statusMods(e.id, dmods);
    if (e.invulnerable) dmods.damageTaken = -1;
    const defender = { profile: prof, derived: { physDef: prof.def + prof.level, magDef: prof.mdef + prof.level }, mods: dmods, maxHp: fin(target.maxHp, 20) / COMBAT.vanillaScale };
    const r = computeDamage(attacker, defender, { ...hit, elements, jobMult, special, critBonus, part: partDef, broken: e.brokenUntil > now, divine: this.special(d, "divine") }, this.rng);
    // 参加人数の補正（敵の実効HP）→ バニラの体力へ換算
    const vanilla = Math.round((r.damage * COMBAT.vanillaScale * 100) / e.hpScale) / 100;
    // 弱点の発見（攻撃で知る）
    r.affinity.forEach((lv, i) => {
      if (lv !== "normal") e.discovered.add(`${elements[i]}:${lv}`);
    });
    // 状態異常
    const applied = [];
    const chanceBonus = (t.statusChance || 0) * scale + this.special(d, "status") * 100 + fin(d.computed.primary && d.computed.primary.luk, 0) * 0.1;
    const durMult = 1 + (t.statusDuration || 0) * scale;
    const want = [...(hit.statuses || [])];
    if (!hit.isNormal) for (const el of elements) for (const sid of ELEMENTS[el].status) want.push({ id: sid, chance: STATUS_EFFECTS[sid].chance * 0.5 });
    for (const w of want) if (this.applyStatus(e.id, w.id, { source: pid, chance: w.chance, chanceBonus, durationMult: durMult, boss: prof.tags.includes("boss_like"), tags: prof.tags })) applied.push(w.id);
    // 属性融合
    let fusion = null;
    const el = elements.find((x) => x !== "none");
    if (el && !hit.noFusion) {
      if (e.lastElement && now - e.lastElement.tick <= FUSION_WINDOW) fusion = findFusion(e.lastElement.el, el);
      e.lastElement = fusion ? null : { el, tick: now, by: pid };
      if (fusion) b.fusions++;
    }
    // ヘイト
    this.addHate(e, pid, r.damage * HATE.perDamage * (t.hate || 1), d);
    // 体勢値（地属性・闘気で削りやすい）
    let broke = false;
    const poiseHit = fin(hit.poise, r.damage * 0.2) * (elements.includes("earth") ? ELEMENTS.earth.poise : 1) * (1 + this.special(d, "poise"));
    if (e.brokenUntil <= now) {
      e.poise -= poiseHit;
      if (e.poise <= 0) {
        e.brokenUntil = now + 100;
        e.poise = prof.poise;
        broke = true;
        b.breaks++;
      }
    }
    // 部位
    let partBroken = null;
    if (partDef && e.parts[partDef.id] && !e.parts[partDef.id].broken) {
      const p = e.parts[partDef.id];
      p.hp -= r.damage;
      if (p.hp <= 0) {
        p.broken = true;
        partBroken = partDef;
        this.onPartBreak(e, partDef);
      }
    }
    // ログ
    b.dealt += r.damage;
    if (r.crit) b.crits++;
    if (r.elementMult > 1) b.weakHits++;
    if (hit.skillId) b.skills[hit.skillId] = (b.skills[hit.skillId] || 0) + 1;
    if (combo.count > 1) b.combos++;
    b.maxCombo = Math.max(b.maxCombo, combo.count);
    for (const a of applied) b.statuses[a] = (b.statuses[a] || 0) + 1;
    b.enemies[e.typeId] = (b.enemies[e.typeId] || 0) + 1;
    return { ...r, vanilla, applied, fusion, broke, partBroken, combo: combo.count, counter };
  }

  updateCombo(s, hit, now) {
    const c = s.combo;
    if (now - c.last > COMBO.windowTicks) {
      c.count = 0;
      c.run = 0;
      c.skill = null;
    }
    const key = hit.skillId || "normal";
    c.run = c.skill === key ? c.run + 1 : 1;
    if (c.run <= COMBO.sameSkillLimit && c.count < COMBO.maxCount) c.count++;
    let bonus = Math.min(COMBO.bonusMax, Math.max(0, c.count - 1) * COMBO.bonusPerHit);
    const el = (hit.elements || [])[0] || "none";
    if (c.element && el !== "none" && c.element !== el) bonus += COMBO.elementSwap;
    if (hit.airborne) bonus += COMBO.airBonus;
    c.element = el;
    c.skill = key;
    c.last = now;
    return { count: c.count, bonus };
  }

  onPartBreak(e, part) {
    const ob = part.onBreak || {};
    if (ob.defDown) e.defDown = Math.min(0.9, e.defDown + ob.defDown);
    if (ob.disableAbility) e.disabled.add(ob.disableAbility);
    if (ob.newWeak) e.profile = { ...e.profile, resist: { ...e.profile.resist, ...ob.newWeak } };
    if (ob.reward) e.rewardFlags = [...(e.rewardFlags || []), ob.reward];
    emit("partBroken", { enemyId: e.id, part: part.id });
  }

  // ---------------- 敵の攻撃 ----------------
  startGuard(pid) {
    const s = this.player(pid);
    if (s.guardSince < 0) s.guardSince = this.nowTick();
  }

  stopGuard(pid) {
    this.player(pid).guardSince = -1;
  }

  /** 回避（ダッシュジャンプ・移動技）。再使用待ちとスタミナで無限回避を防ぐ */
  tryDodge(pid, vitals) {
    const s = this.player(pid);
    const now = this.nowTick();
    if (now < s.dodgeCdUntil) return { ok: false, reason: "回避の再使用待ち" };
    if (vitals && !vitals.trySpend(pid, { stamina: DEFENSE.dodgeStamina })) return { ok: false, reason: "スタミナ不足" };
    s.dodgeStart = now;
    s.dodgeCdUntil = now + DEFENSE.dodgeCooldown;
    return { ok: true };
  }

  /**
   * 敵の攻撃を受けた
   * @param {string} pid
   * @param {{id: string, typeId: string}} attacker
   * @param {number} vanillaDamage バニラで受けたダメージ
   * @param {any} [vitals]
   * @returns {{outcome: string, keep: number, guardHeal?: number}} outcome＝hit/guard/just_guard/dodge/just_dodge、keep＝実際に受ける割合（残りは回復で戻す）
   */
  incoming(pid, attacker, vanillaDamage, vitals) {
    const d = this.playerService.dataFor(pid);
    if (!d) return { outcome: "hit", keep: 1 };
    const now = this.nowTick();
    const s = this.player(pid);
    const b = this.battle(pid);
    const e = attacker && attacker.id ? this.enemy(attacker) : null;
    const { t, scale } = this.jobTrait(d);
    const mods = this.playerMods(pid, d);
    let outcome = "hit";
    let keep = clamp(1 + mods.damageTaken, 0.2, 3);
    const since = now - s.dodgeStart;
    if (since >= 0 && since <= DEFENSE.dodgeWindow) {
      outcome = since <= DEFENSE.justDodgeWindow ? "just_dodge" : "dodge";
      keep = 0;
    } else if (s.guardSince >= 0) {
      const just = now - s.guardSince <= DEFENSE.justGuardWindow;
      const reduce = just ? DEFENSE.justGuardReduce : Math.min(0.85, DEFENSE.guardReduce + (t.guard || 0) * scale + this.special(d, "guard"));
      const st = (vanillaDamage / COMBAT.vanillaScale) * DEFENSE.guardStaminaPerDamage * (just ? DEFENSE.justGuardStaminaMult : 1);
      if (!vitals || vitals.trySpend(pid, { stamina: Math.ceil(st) })) {
        outcome = just ? "just_guard" : "guard";
        keep *= 1 - reduce;
      }
    }
    if (outcome === "just_guard" || outcome === "just_dodge") {
      s.counterUntil = now + DEFENSE.counterWindow;
      if (outcome === "just_guard" && e) {
        e.poise -= DEFENSE.justGuardPoise;
        if (e.poise <= 0 && e.brokenUntil <= now) {
          e.brokenUntil = now + 100;
          e.poise = e.profile.poise;
          b.breaks++;
        }
      }
      if (outcome === "just_dodge" && this.stats) this.stats.addBuff(pid, { id: "combat:just_evade", name: BUFF_TYPES.just_evade.name, source: "combat", derived: BUFF_TYPES.just_evade.derived, durationTicks: DEFENSE.counterWindow });
    }
    if (outcome === "just_guard") b.justGuards++;
    if (outcome === "guard") b.guards++;
    if (outcome === "just_dodge") b.justDodges++;
    if (outcome === "dodge") b.dodges++;
    if (e) keep *= e.atkScale;
    b.taken += (vanillaDamage * keep) / COMBAT.vanillaScale;
    if ((outcome === "guard" || outcome === "just_guard") && e) this.addHate(e, pid, HATE.protect, d);
    return { outcome, keep: Math.round(clamp(keep, 0, 3) * 1000) / 1000, guardHeal: outcome.includes("guard") ? (t.guardHeal || 0) * scale : 0 };
  }

  // ---------------- 状態異常 ----------------
  /**
   * @returns {boolean} 付与できたか
   */
  applyStatus(targetId, sid, opt = {}) {
    const def = STATUS_EFFECTS[sid];
    if (!def) return false;
    const tags = opt.tags || [];
    if (tags.includes(`${sid}_immune`) || tags.includes("status_immune")) return false;
    const now = this.nowTick();
    const box = this.status.get(targetId) || { list: {}, tol: {} };
    const tol = box.tol[sid] || { v: 0, at: now };
    tol.v = Math.max(0, tol.v - Math.floor((now - tol.at) / STATUS_TOLERANCE.decayTicks) * STATUS_TOLERANCE.perApply);
    let chance = fin(opt.chance, def.chance) + fin(opt.chanceBonus) - fin(opt.resistPct);
    chance *= 1 - tol.v;
    if (opt.boss) chance *= STATUS_TOLERANCE.bossChanceMult;
    if (!opt.force && this.rng() * 100 >= chance) return false;
    let dur = def.duration * fin(opt.durationMult, 1) * (1 - tol.v);
    if (opt.boss && def.kind === "control") dur = Math.min(dur, STATUS_TOLERANCE.controlMaxTicksBoss);
    const cur = box.list[sid];
    if (cur) {
      cur.stacks = Math.min(def.maxStacks, cur.stacks + 1);
      cur.until = Math.max(cur.until, now + dur);
      cur.source = opt.source ?? cur.source;
    } else box.list[sid] = { stacks: 1, until: now + Math.max(10, dur), source: opt.source ?? null, since: now };
    // 打ち消し合う状態（例：水濡れは火傷を消す）
    for (const [other, st] of Object.entries(box.list)) if (other !== sid && STATUS_EFFECTS[other].cure.includes(sid)) delete box.list[other];
    tol.v = Math.min(STATUS_TOLERANCE.max, tol.v + STATUS_TOLERANCE.perApply);
    tol.at = now;
    box.tol[sid] = tol;
    this.status.set(targetId, box);
    return true;
  }

  statusesOf(id) {
    const box = this.status.get(id);
    return box ? box.list : {};
  }

  /** 解除（浄化＝"cleanse"、攻撃を受けた＝"hit"） */
  cure(id, reason) {
    const box = this.status.get(id);
    if (!box) return 0;
    let n = 0;
    for (const [sid] of Object.entries(box.list)) if (STATUS_EFFECTS[sid].cure.includes(reason)) {
      delete box.list[sid];
      n++;
    }
    return n;
  }

  /** 行動妨害（スキル・魔法の使用を止める） */
  control(id) {
    const out = new Set();
    for (const sid of Object.keys(this.statusesOf(id))) if (STATUS_EFFECTS[sid].control) out.add(STATUS_EFFECTS[sid].control);
    return out;
  }

  canUseSkill(pid, def) {
    const c = this.control(pid);
    if (c.has("stun")) return { ok: false, reason: "行動不能" };
    if (c.has("seal")) return { ok: false, reason: "スキル封印" };
    if (c.has("silence") && def && def.power && def.power.kind === "magic") return { ok: false, reason: "沈黙（魔法不可）" };
    const s = this.players.get(pid);
    if (s && s.restricted && s.restricted.until > this.nowTick() && def && s.restricted.categories.includes(def.category)) return { ok: false, reason: "能力が制限されている" };
    return { ok: true };
  }

  // ---------------- ヘイト ----------------
  addHate(e, pid, amount, d) {
    e.hate.set(pid, fin(e.hate.get(pid)) + Math.max(0, fin(amount)));
  }

  provoke(enemyId, pid) {
    const e = this.enemies.get(enemyId);
    if (!e) return false;
    this.addHate(e, pid, HATE.provoke);
    e.target = pid;
    return true;
  }

  /** 回復したプレイヤー：その人のパーティと戦っている敵すべてのヘイトが少し増える */
  onHeal(pid, amount) {
    const b = this.battle(pid);
    b.healed += amount;
    for (const e of this.enemies.values()) if (e.hate.size > 0) this.addHate(e, pid, amount * HATE.perHeal * (e.profile.hate === "healer" ? 2 : 1));
  }

  /**
   * 敵の標的を決める
   * @param {string} enemyId
   * @param {{pid: string, distance: number, hpRatio: number}[]} candidates 近くのプレイヤー
   */
  chooseTarget(enemyId, candidates) {
    const e = this.enemies.get(enemyId);
    if (!e || candidates.length === 0) return null;
    for (const c of candidates) if (c.distance <= HATE.nearRadius) this.addHate(e, c.pid, HATE.nearPerSecond);
    const rule = e.profile.hate;
    let best;
    if (rule === "nearest") best = [...candidates].sort((a, b) => a.distance - b.distance)[0].pid;
    else if (rule === "lowestHp") best = [...candidates].sort((a, b) => a.hpRatio - b.hpRatio)[0].pid;
    else {
      const ranked = candidates.map((c) => ({ pid: c.pid, h: fin(e.hate.get(c.pid)) })).sort((a, b) => b.h - a.h);
      best = ranked[0].pid;
      const cur = ranked.find((r) => r.pid === e.target);
      if (cur && ranked[0].h < cur.h * HATE.switchMargin) best = e.target;
    }
    const changed = best !== e.target;
    e.target = best;
    return { target: best, changed };
  }

  // ---------------- 1秒ごとの処理 ----------------
  /**
   * 継続ダメージ・期限切れ・ヘイトの減衰・戦闘終了をまとめて処理
   * @param {(id: string) => number} maxHpOf バニラの最大体力
   * @returns {{dots: {id: string, vanilla: number, status: string, source: any}[], ended: string[]}}
   */
  tick(maxHpOf = () => 20) {
    const now = this.nowTick();
    const dots = [];
    let n = 0;
    for (const [id, box] of this.status) {
      if (n++ >= COMBAT_LIMITS.statusTickBatch * 4) break;
      for (const [sid, st] of Object.entries(box.list)) {
        if (st.until <= now) {
          delete box.list[sid];
          continue;
        }
        const dmg = dotDamage(sid, st.stacks, maxHpOf(id) / COMBAT.vanillaScale);
        if (dmg > 0) {
          const e = this.enemies.get(id);
          dots.push({ id, vanilla: Math.round(((dmg * COMBAT.vanillaScale) / (e ? e.hpScale : 1)) * 100) / 100, status: sid, source: st.source });
        }
      }
      if (Object.keys(box.list).length === 0 && Object.values(box.tol).every((t) => now - t.at > STATUS_TOLERANCE.decayTicks * 4)) this.status.delete(id);
    }
    for (const e of this.enemies.values()) for (const [pid, h] of e.hate) e.hate.set(pid, h * (1 - HATE.decayPerSecond));
    for (const [id, e] of [...this.enemies]) if (now - e.last > COMBAT.combatEndTicks * 3) this.forgetEntity(id);
    const ended = [];
    for (const [pid, s] of this.players) if (s.battle && now - s.battle.last > COMBAT.combatEndTicks) {
      this.endBattle(pid);
      ended.push(pid);
    }
    return { dots, ended };
  }

  /** 戦闘の終了：ログを保存（件数に上限）し、戦闘中だけの一時効果を解除 */
  endBattle(pid, defeat = null) {
    const s = this.players.get(pid);
    if (!s || !s.battle) return null;
    const b = s.battle;
    s.battle = null;
    if (defeat) b.defeat = defeat;
    const now = this.nowTick();
    const rec = {
      at: Date.now(),
      seconds: Math.round((b.last - b.start) / 20),
      dealt: Math.round(b.dealt),
      taken: Math.round(b.taken),
      healed: Math.round(b.healed),
      crits: b.crits,
      weakHits: b.weakHits,
      justGuards: b.justGuards,
      guards: b.guards,
      justDodges: b.justDodges,
      dodges: b.dodges,
      combos: b.combos,
      maxCombo: b.maxCombo,
      fusions: b.fusions,
      breaks: b.breaks,
      statuses: b.statuses,
      skills: Object.fromEntries(Object.entries(b.skills).sort((x, y) => y[1] - x[1]).slice(0, COMBAT_LOG.keepSkills)),
      enemies: b.enemies,
      defeat: b.defeat,
    };
    this.playerService.update(pid, (d) => {
      d.combatLog.battles.unshift(rec);
      d.combatLog.battles.length = Math.min(d.combatLog.battles.length, COMBAT_LOG.keepBattles);
      d.combatLog.totals.battles = (d.combatLog.totals.battles || 0) + 1;
      d.combatLog.totals.justGuards = (d.combatLog.totals.justGuards || 0) + b.justGuards;
      d.combatLog.totals.justDodges = (d.combatLog.totals.justDodges || 0) + b.justDodges;
      if (b.defeat) d.combatLog.lastDefeat = { ...b.defeat, at: rec.at };
      d.buffs = (d.buffs || []).filter((x) => !(x && x.source === "combat"));
    });
    s.combo.count = 0;
    void now;
    emit("battleEnded", { playerId: pid, record: rec });
    return rec;
  }

  /** 戦闘不能（原因を記録し、戦闘を終える） */
  onDefeat(pid, cause) {
    this.battle(pid);
    return this.endBattle(pid, cause);
  }

  forgetEntity(id) {
    this.enemies.delete(id);
    this.status.delete(id);
    this.overrides.delete(id);
  }

  forgetPlayer(pid) {
    if (this.players.get(pid) && this.players.get(pid).battle) this.endBattle(pid);
    this.players.delete(pid);
    this.status.delete(pid);
    for (const e of this.enemies.values()) e.hate.delete(pid);
  }
}
