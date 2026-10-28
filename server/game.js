// ゲーム全体の進行（ふだんの1日・合戦の順番・内政・AI・勝ち負け）
import crypto from 'node:crypto';
import {
  TERRITORIES, SIZES, CHARACTERS, HERO_ROLES, ROLES, REQUIRED_ROLES, UNIT_MAX, MAJORITY,
  neighbors, charStats, KINGDOM_ACTIONS, DEMON_ACTIONS, levelUpCost, expToNext,
} from '../shared/data.js';
import { createBattle, startBattle, applyBattleAction, aiStep, activeUnit, setCommander, createPursuit } from './battle.js';
import { getStat } from '../shared/battlecore.js';
import { checkEvents, ENDINGS } from './events.js';

export function actionCost(game, side, type, charId) {
  if (side === 'kingdom') {
    const c = { ...KINGDOM_ACTIONS[type].cost };
    const tr = game.resources.kingdom.training;
    if (type === 'conscript') c.gold = Math.round(40 * (1 + 0.25 * tr));
    if (type === 'train') c.gold = Math.round(200 * (1 + 0.5 * tr));
    return c;
  }
  const c = { ...DEMON_ACTIONS[type].cost };
  if (type === 'levelup') c.magic = levelUpCost(game.chars[charId]?.level || 1);
  return c;
}

export function demonActionCount(game) {
  return 1 + Math.floor(ownedCount(game, 'demon') / 3);
}
export function queenActionCount(game) {
  return 2 + Math.floor(ownedCount(game, 'kingdom') / 5);
}

const ownedCount = (game, side) => game.territories.filter(t => t.owner === side).length;

// ---- ゲームを作る ----
export function createGame(name, opts = {}) {
  const id = crypto.randomBytes(4).toString('hex');
  const game = {
    id, name: name || '魔王ヤギュー討伐戦', createdAt: Date.now(), version: 1,
    phase: 'lobby', day: 0,
    players: Object.fromEntries(ROLES.map(r => [r, null])),
    territories: TERRITORIES.map(t => {
      const s = SIZES[t.size];
      return {
        id: t.id, owner: t.owner, pop: s.pop, farm: s.farm, commerce: s.commerce, garrison: s.garrison,
        defense: s.defense, loyalty: 60, fear: t.owner === 'demon' ? 50 : 0, damaged: 0, rebel: 0,
        attackedCount: 0,
      };
    }),
    generals: {}, chars: {},
    resources: { kingdom: { gold: 800, food: 1500, training: 0 }, demon: { food: 1200, magic: 60 } },
    orders: {}, ready: {},
    pending: [], battle: null, battleCount: 0, troopCount: 0, genCount: 0,
    flags: { nanaseMotivation: 1, metroStreak: { side: null, days: 0 } },
    reinforcements: [],
    stats: { civLoss: { kingdom: 0, demon: 0, neutral: 0 }, battles: 0 },
    eventLog: [], firedEvents: [], log: [], winner: null, ending: null,
    trial: !!opts.trial,
  };
  // お試しモード：全員Lv30から（技をすぐ試せる）
  const startLv = opts.trial ? 30 : 1;
  for (const c of Object.keys(CHARACTERS)) game.chars[c] = { level: startLv, exp: 0 };
  return game;
}

function newTroop(game, type, q, hp = UNIT_MAX) {
  return { uid: 't' + (++game.troopCount), type, q, hp, max: UNIT_MAX };
}

function addGeneral(game, g) {
  const id = g.charId || ('g' + (++game.genCount));
  const gen = { id, status: 'active', controller: 'ai', troops: [], ...g };
  if (gen.charId) {
    gen.name = CHARACTERS[gen.charId].name;
    gen.hp = charStats(gen.charId, game.chars[gen.charId].level).hp;
  }
  game.generals[id] = gen;
  return gen;
}

function setupGenerals(game) {
  const K = 'kingdom', D = 'demon';
  const heroTroops = [['spear', 'cavalry', 'archer', 'spear'], ['spear', 'archer', 'spear', 'cavalry'], ['spear', 'archer', 'cavalry', 'archer']];
  const homes = { sumire: 5, noguchi: 7, nanase: 8 };
  HERO_ROLES.forEach((r, i) => {
    addGeneral(game, { charId: r, side: K, kind: 'hero', location: homes[r], troops: heroTroops[i].map(t => newTroop(game, t, 'kingdom')) });
    addGeneral(game, { name: `${CHARACTERS[r].name}の兵`, side: K, kind: 'soldier', owner: r, location: homes[r], troops: [newTroop(game, 'spear', 'kingdom')] });
  });
  addGeneral(game, { charId: 'nozomi', side: K, kind: 'queen', location: 0, troops: [] });
  addGeneral(game, { charId: 'yagyu', side: D, kind: 'yagyu', location: 28,
    troops: ['orc', 'orc', 'goat', 'harpy', 'harpy'].map(t => newTroop(game, t, 'guard')) });
  addGeneral(game, { charId: 'car', side: D, kind: 'officer', location: 23, troops: ['harpy', 'harpy'].map(t => newTroop(game, t, 'officer')) });
  addGeneral(game, { charId: 'oh', side: D, kind: 'officer', location: 24, troops: ['orc', 'goat'].map(t => newTroop(game, t, 'officer')) });
  addGeneral(game, { charId: 'kkb', side: D, kind: 'officer', location: 25, troops: ['orc', 'orc'].map(t => newTroop(game, t, 'officer')) });
  addGeneral(game, { name: '魔将ボルグ', side: D, kind: 'majo', location: 22, troops: [newTroop(game, 'goat', 'zako')] });
  addGeneral(game, { name: '魔将ザザ', side: D, kind: 'majo', location: 26, troops: [newTroop(game, 'orc', 'zako')] });
}

// 武将を誰が動かすか
export function controllerFor(game, gen) {
  if (gen.side === 'demon') return 'yagyu';
  if (gen.kind === 'hero' && game.players[gen.charId]) return gen.charId;
  if (gen.kind === 'soldier' && gen.owner && game.players[gen.owner]) return gen.owner;
  return 'ai';
}

function refreshControllers(game) {
  for (const g of Object.values(game.generals)) if (!g.temp) g.controller = controllerFor(game, g);
}

export function join(game, role, name) {
  if (!ROLES.includes(role)) throw new Error('その役はありません');
  if (game.players[role]) throw new Error('その役はもう選ばれています');
  if (game.phase !== 'lobby' && role !== 'noguchi' && role !== 'nanase') throw new Error('始まったあとに入れるのは野口・七星だけです');
  const token = crypto.randomBytes(12).toString('hex');
  game.players[role] = { name: (name || '').slice(0, 20) || CHARACTERS[role].name, token };
  if (game.phase !== 'lobby') {
    refreshControllers(game);
    game.log.push(`${game.players[role].name} が ${CHARACTERS[role].name} として参加`);
  }
  return token;
}

export function roleOf(game, token) {
  for (const r of ROLES) if (game.players[r]?.token === token) return r;
  return null;
}

export function start(game) {
  if (game.phase !== 'lobby') throw new Error('もう始まっています');
  for (const r of REQUIRED_ROLES) if (!game.players[r]) throw new Error(`${CHARACTERS[r].name}の役の人が必要です`);
  setupGenerals(game);
  refreshControllers(game);
  game.phase = 'day';
  game.day = 1;
  checkEvents(game, eventHelpers(game));
  resetOrders(game);
}

function resetOrders(game) {
  game.orders = {};
  game.ready = {};
  for (const r of ROLES) if (game.players[r]) { game.orders[r] = { moves: {}, acts: {}, globals: [] }; game.ready[r] = false; }
}

// ---- 命令 ----
// orders = { moves: {genId: tid}, acts: {genId|'tid:N': {type, tid}}, globals: [{type, charId}] }
export function setOrders(game, role, orders) {
  if (game.phase !== 'day') throw new Error('今は命令を出せません');
  const clean = { moves: {}, acts: {}, globals: [] };
  for (const [gid, tid] of Object.entries(orders.moves || {})) {
    const g = game.generals[gid];
    if (!g || g.status !== 'active' || g.controller !== role || g.kind === 'queen') continue;
    if (!neighbors(g.location, g.side).includes(tid)) continue;
    clean.moves[gid] = tid;
  }
  if (role === 'yagyu') {
    const max = demonActionCount(game);
    let n = 0;
    for (const a of Object.values(orders.acts || {})) {
      if (n >= max || !DEMON_ACTIONS[a.type] || DEMON_ACTIONS[a.type].global) continue;
      if (game.territories[a.tid]?.owner !== 'demon') continue;
      clean.acts['t' + a.tid + '_' + n] = { type: a.type, tid: a.tid }; n++;
    }
    for (const a of orders.globals || []) {
      if (n >= max || a.type !== 'levelup' || CHARACTERS[a.charId]?.side !== 'demon') continue;
      clean.globals.push({ type: 'levelup', charId: a.charId }); n++;
    }
  } else {
    // 勇者は自分の兵の武将に内政をさせられる（その日は動かない）
    for (const [gid, a] of Object.entries(orders.acts || {})) {
      const g = game.generals[gid];
      if (!g || g.kind !== 'soldier' || g.controller !== role || g.status !== 'active') continue;
      if (!KINGDOM_ACTIONS[a.type] || KINGDOM_ACTIONS[a.type].queenOnly) continue;
      if (clean.moves[gid] !== undefined) continue;
      clean.acts[gid] = { type: a.type, tid: g.location };
    }
  }
  game.orders[role] = clean;
  game.ready[role] = false;
}

export function setReady(game, role, ready) {
  if (game.phase !== 'day') throw new Error('今は準備できません');
  game.ready[role] = !!ready;
  if (ROLES.every(r => !game.players[r] || game.ready[r])) resolveDay(game);
}

// ---- 強さの見積もり（AI用） ----
function genStrength(game, g) {
  let s = 0;
  if (g.charId) {
    const st = charStats(g.charId, game.chars[g.charId].level);
    s += g.hp * Math.max(st.atk, st.mag) / 18;
  }
  for (const t of g.troops) s += t.hp;
  return s;
}
function territoryStrength(game, tid, side) {
  let s = 0;
  const t = game.territories[tid];
  if (t.owner === side) s += t.garrison * 0.8;
  for (const g of Object.values(game.generals)) if (g.status === 'active' && g.location === tid && g.side === side) s += genStrength(game, g);
  return s;
}

function payCost(res, cost) {
  for (const [k, v] of Object.entries(cost)) if ((res[k] || 0) < v) return false;
  for (const [k, v] of Object.entries(cost)) res[k] -= v;
  return true;
}

function doInternal(game, side, type, tid, by) {
  const res = game.resources[side];
  const t = game.territories[tid];
  const T = TERRITORIES[tid];
  const S = SIZES[T.size];
  const cost = actionCost(game, side, type);
  if (!payCost(res, cost)) { game.log.push(`${by}：${T.name}で${(side === 'kingdom' ? KINGDOM_ACTIONS : DEMON_ACTIONS)[type].name}…お金や食料が足りない`); return false; }
  switch (type) {
    case 'farm': t.farm = Math.min(S.farm * 2, t.farm + 4); break;
    case 'commerce': t.commerce = Math.min(Math.max(S.commerce, 20) * 2, t.commerce + 4); break;
    case 'people': t.pop = Math.min(Math.round(S.pop * 1.5), t.pop + 200); break;
    case 'conscript': {
      const n = Math.min(150, t.pop - 200, S.cap - t.garrison);
      if (n <= 0) { game.log.push(`${by}：${T.name}ではこれ以上兵を集められない`); return false; }
      t.pop -= n; t.garrison += n; t.loyalty = Math.max(0, t.loyalty - 2); break;
    }
    case 'fortify': t.defense = Math.min(100, t.defense + 10); break;
    case 'alms': t.loyalty = Math.min(100, t.loyalty + 12); break;
    case 'train': res.training = Math.min(10, res.training + 1); break;
    case 'terror': t.fear = Math.min(100, t.fear + 15); t.pop = Math.max(100, t.pop - 80); break;
    case 'spawn': t.garrison = Math.min(S.cap, t.garrison + 150); break;
  }
  return true;
}

// ---- AI ----
function aiOrders(game) {
  const moves = {};
  const acts = [];
  // 王国のAI武将
  const aiGens = Object.values(game.generals).filter(g => g.status === 'active' && g.side === 'kingdom' && g.controller === 'ai' && g.kind !== 'queen');
  const claimed = {};
  for (const g of aiGens) {
    const own = genStrength(game, g);
    if (g.kind === 'soldier') {
      const t = game.territories[g.location];
      const S = SIZES[TERRITORIES[g.location].size];
      acts.push({ gid: g.id, type: t.garrison < S.garrison * 0.6 ? 'conscript' : (game.resources.kingdom.food < 600 ? 'farm' : (game.day % 2 ? 'commerce' : 'farm')), tid: g.location });
      continue;
    }
    const full = g.troops.reduce((a, t) => a + t.hp, 0) / (g.troops.length * UNIT_MAX || 1);
    const st = charStats(g.charId, game.chars[g.charId].level);
    if (full < 0.6 || g.hp < st.hp * 0.6) {
      // 兵が減ったら、兵の多い自分の陣地へ戻って補充する
      const step = stepToward(game, g, n => game.territories[n].garrison >= 300);
      if (step !== null) moves[g.id] = step;
      continue;
    }
    let best = null;
    for (const n of neighbors(g.location, 'kingdom')) {
      const t = game.territories[n];
      if (t.owner === 'kingdom') continue;
      const enemy = territoryStrength(game, n, t.owner) + (t.owner === 'neutral' ? 0 : 0);
      const allies = (claimed[n] || 0) + own;
      const score = allies / (enemy + 1) + (TERRITORIES[n].metropolis ? 0.3 : 0) + (t.owner === 'demon' ? 0.1 : 0);
      if (allies > enemy * 1.3 && (!best || score > best.score)) best = { n, score };
    }
    if (best) { moves[g.id] = best.n; claimed[best.n] = (claimed[best.n] || 0) + own; }
  }
  return { moves, acts };
}

// 自分の陣地だけを通って、条件に合う一番近い陣地へ向かう最初の一歩
function stepToward(game, g, ok) {
  const side = g.side;
  if (ok(g.location) && game.territories[g.location].owner === side) return null;
  const prev = new Map([[g.location, null]]);
  const q = [g.location];
  while (q.length) {
    const c = q.shift();
    for (const n of neighbors(c, side)) {
      if (prev.has(n) || game.territories[n].owner !== side) continue;
      prev.set(n, c);
      if (ok(n)) {
        let cur = n;
        while (prev.get(cur) !== g.location) cur = prev.get(cur);
        return cur;
      }
      q.push(n);
    }
  }
  return null;
}

function queenInternal(game) {
  const n = queenActionCount(game);
  const res = game.resources.kingdom;
  const mine = game.territories.filter(t => t.owner === 'kingdom');
  const front = mine.filter(t => neighbors(t.id, 'demon').some(m => game.territories[m].owner === 'demon'));
  for (let i = 0; i < n; i++) {
    let type, tid;
    const low = mine.slice().sort((a, b) => a.loyalty - b.loyalty)[0];
    const weakFront = front.slice().sort((a, b) => a.garrison / SIZES[TERRITORIES[a.id].size].cap - b.garrison / SIZES[TERRITORIES[b.id].size].cap)[0];
    if (res.food < 500) { type = 'farm'; tid = mine.slice().sort((a, b) => a.farm - b.farm)[0]?.id; }
    else if (low && low.loyalty < 35) { type = 'alms'; tid = low.id; }
    else if (weakFront && weakFront.garrison < SIZES[TERRITORIES[weakFront.id].size].cap * 0.5 && i % 2 === 0) { type = 'conscript'; tid = weakFront.id; }
    else if (res.gold > 900 && res.training < 10 && i === 0) { type = 'train'; tid = 0; }
    else { type = i % 2 ? 'commerce' : 'farm'; tid = mine[(game.day * 3 + i) % mine.length]?.id; }
    if (tid === undefined) continue;
    doInternal(game, 'kingdom', type, tid, 'のぞちち');
  }
}

// ---- 1日の結果をまとめて反映 ----
function resolveDay(game) {
  game.log.push(`== ${game.day}日目の結果 ==`);
  const ai = aiOrders(game);
  const moves = { ...ai.moves };
  const kActs = ai.acts.slice();
  for (const r of ROLES) {
    const o = game.orders[r];
    if (!o) continue;
    Object.assign(moves, o.moves);
    if (r === 'yagyu') {
      for (const a of Object.values(o.acts)) doInternal(game, 'demon', a.type, a.tid, 'ヤギュー');
      for (const a of o.globals) {
        const cost = actionCost(game, 'demon', 'levelup', a.charId);
        if (game.chars[a.charId].level >= 30) continue;
        if (payCost(game.resources.demon, cost)) {
          levelUp(game, a.charId);
        } else game.log.push(`魔力が足りず、${CHARACTERS[a.charId].name}のレベルを上げられない`);
      }
    } else {
      for (const [gid, a] of Object.entries(o.acts)) kActs.push({ gid, ...a });
    }
  }
  for (const a of kActs) {
    const g = game.generals[a.gid];
    if (g && g.status === 'active' && game.territories[g.location].owner === 'kingdom') doInternal(game, 'kingdom', a.type, g.location, g.name);
  }
  queenInternal(game);

  // すれ違い：向かい合って動いた敵同士は、遅い方が足止めされる
  const entries = Object.entries(moves);
  for (const [ga, ta] of entries) {
    for (const [gb, tb] of entries) {
      const A = game.generals[ga], B = game.generals[gb];
      if (A.side !== B.side && ta === B.location && tb === A.location && moves[ga] !== undefined && moves[gb] !== undefined) {
        const sa = A.charId ? charStats(A.charId, game.chars[A.charId].level).spd : 6;
        const sb = B.charId ? charStats(B.charId, game.chars[B.charId].level).spd : 6;
        delete moves[sa >= sb ? gb : ga];
      }
    }
  }
  const touched = new Set();
  for (const [gid, tid] of Object.entries(moves)) {
    const g = game.generals[gid];
    g.prevLocation = g.location;
    g.location = tid;
    g.moved = true;
    touched.add(tid);
  }
  game.pending = [...touched].sort((a, b) => a - b);
  processPending(game);
}

// 合戦・占領が必要か調べて、必要なら次の合戦を始める
function processPending(game) {
  while (game.pending.length) {
    const tid = game.pending[0];
    const c = conflictAt(game, tid);
    if (!c) { game.pending.shift(); continue; }
    if (c.capture) { capture(game, tid, c.side, c.gens); continue; }
    beginBattle(game, c);
    return;
  }
  endOfDay(game);
}

function gensAt(game, tid) {
  return Object.values(game.generals).filter(g => g.status === 'active' && g.location === tid && !g.temp);
}

function conflictAt(game, tid) {
  const t = game.territories[tid];
  const gens = gensAt(game, tid);
  const k = gens.filter(g => g.side === 'kingdom');
  const d = gens.filter(g => g.side === 'demon');
  const n = gens.filter(g => g.side === 'neutral');
  if (k.length && d.length) {
    let defenderSide = t.owner === 'kingdom' || t.owner === 'demon' ? t.owner : null;
    if (!defenderSide) defenderSide = d.some(g => !g.moved) ? 'demon' : 'kingdom';
    const attackerSide = defenderSide === 'kingdom' ? 'demon' : 'kingdom';
    return { territoryId: tid, attackerSide, defenderSide, attackers: attackerSide === 'kingdom' ? k : d, defenders: defenderSide === 'kingdom' ? k : d, garrison: t.owner === defenderSide };
  }
  const side = k.length ? 'kingdom' : d.length ? 'demon' : n.length ? 'neutral' : null;
  if (!side || t.owner === side) return null;
  const arrivals = side === 'kingdom' ? k : side === 'demon' ? d : n;
  if (t.garrison > 0) return { territoryId: tid, attackerSide: side, defenderSide: t.owner, attackers: arrivals, defenders: [], garrison: true };
  return { capture: true, side, gens: arrivals };
}

function garrisonGeneral(game, tid) {
  const t = game.territories[tid];
  const side = t.owner;
  const types = side === 'demon' ? ['orc', 'harpy', 'goat'] : ['spear', 'archer', 'spear'];
  const n = Math.min(3, Math.ceil(t.garrison / UNIT_MAX));
  const troops = [];
  let left = t.garrison;
  for (let i = 0; i < n; i++) {
    const hp = Math.min(UNIT_MAX, Math.ceil(left / (n - i)));
    left -= hp;
    const tr = newTroop(game, types[i], side === 'demon' ? 'zako' : 'kingdom', hp);
    tr.defBonus = t.defense / 200;
    troops.push(tr);
  }
  const gen = addGeneral(game, { name: `${TERRITORIES[tid].name}守備隊`, side, kind: 'garrison', location: tid, troops, temp: true, reserve: left });
  return gen;
}

function beginBattle(game, c) {
  const defenders = c.defenders.slice();
  // 守備隊は、武将が5人に満たないときだけ一緒に戦う
  if (c.garrison && defenders.length < 5 && game.territories[c.territoryId].garrison > 0) {
    defenders.push(garrisonGeneral(game, c.territoryId));
  }
  const b = createBattle(game, {
    territoryId: c.territoryId, attackerSide: c.attackerSide, defenderSide: c.defenderSide,
    attackers: c.attackers.map(g => g.id), defenders: defenders.map(g => g.id),
  });
  game.battle = b;
  game.phase = 'battle';
  game.stats.battles++;
  b.auto = !b.units.some(u => u.controller !== 'ai');
  // 大将は戦う前に決める：人が動かす武将が2人以上いる側は、その人が選ぶ
  b.pending = {};
  for (const role of ['attacker', 'defender']) {
    const gens = b.generals[role].map(id => game.generals[id]);
    const humans = [...new Set(gens.map(g => g.controller).filter(r => r !== 'ai'))];
    if (humans.length && gens.length >= 2) b.pending[role] = humans;
  }
  b.stage = Object.keys(b.pending).length ? 'commander' : 'fight';
  if (b.stage === 'fight') startBattle(b);
  progress(game);
}

const rolesOf = (b, side) => [...new Set(b.units.filter(u => u.side === side).map(u => u.controller).filter(r => r !== 'ai'))];
const RANK = { yagyu: 100, nozomi: 90, sumire: 80, noguchi: 79, nanase: 78, horie: 70, kkb: 62, oh: 61, car: 60, yuki: 30 };

// 合戦の段階を、人の決定が必要なところまで進める
function progress(game) {
  let guard = 20000;
  while (guard--) {
    const b = game.battle;
    if (!b) return;
    if (b.stage === 'fight' && !b.result) {
      if (!b.auto) return; // 人がいる合戦は1手ずつ（AIの手はサーバーが少し待って進める）
      aiStep(b);
      continue;
    }
    if (b.stage === 'fight' && b.result) { enterAftermath(game); continue; }
    if (b.stage === 'rearguard' && !b.pendingRoles.length) { enterPursueStage(game); continue; }
    return;
  }
}

// 決着のあと：退却（しんがり）→ 追撃するか → 速さ比べ → 追撃戦
function enterAftermath(game) {
  const b = game.battle;
  if (b.kind === 'pursuit') { b.stage = 'done'; return; }
  const winner = b.result.winner;
  const loser = winner === b.attackerSide ? b.defenderSide : b.attackerSide;
  const losers = b.units.filter(u => u.alive && u.side === loser);
  const winners = b.units.filter(u => u.alive && u.side === winner);
  // 守備隊だけの負けや、どちらかが全滅しているときは追撃なし
  const fleeing = losers.filter(u => !game.generals[u.genId]?.temp);
  if (!fleeing.length || !winners.length) { b.stage = 'done'; return; }
  b.rear = {};
  b.pendingRoles = rolesOf(b, loser).filter(r => fleeing.some(u => u.controller === r && u.kind === 'troop'));
  b.stage = 'rearguard';
  b.log.push(`${loser === 'kingdom' ? '王国' : loser === 'demon' ? '魔族' : '中立'}は退却する`);
}

function enterPursueStage(game) {
  const b = game.battle;
  const winner = b.result.winner;
  b.stage = 'pursue';
  b.pursueInfo = pursueInfo(game, b);
  b.pendingRoles = rolesOf(b, winner);
  if (!b.pendingRoles.length) {
    // AI：勝った側の兵が、逃げる側と同じくらい以上残っていれば追う
    const win = b.units.filter(u => u.alive && u.side === winner).reduce((a, u) => a + u.hp, 0);
    const lose = b.units.filter(u => u.alive && u.side !== winner).reduce((a, u) => a + u.hp, 0);
    decidePursuit(game, win >= lose * 0.8);
  }
}

// 速さ比べの見込み
function pursueInfo(game, b) {
  const winner = b.result.winner;
  const rearIds = Object.values(b.rear).flat();
  const pursuers = b.units.filter(u => u.alive && u.side === winner);
  const flee = b.units.filter(u => u.alive && u.side !== winner && !rearIds.includes(u.id) && !game.generals[u.genId]?.temp);
  // 野口の「くちかわき」：負けて退却するときは、追撃されずに必ず逃げ切れる
  const slipped = flee.filter(u => game.generals[u.genId]?.charId === 'noguchi');
  const caught = flee.filter(u => !slipped.includes(u));
  const kkb = pursuers.find(u => u.charId === 'kkb' && (u.level || 1) >= 20);
  const pursueSpd = Math.max(0, ...pursuers.map(u => getStat(b, u, 'spd')));
  // 逃げる側は、一番えらい武将の速さで逃げる
  const leader = caught.slice().sort((a, c) => (RANK[c.charId] || 0) - (RANK[a.charId] || 0) || (c.isLeaderUnit ? 1 : 0) - (a.isLeaderUnit ? 1 : 0))[0];
  const fleeSpd = leader ? getStat(b, leader, 'spd') : 0;
  return {
    pursueSpd: Math.round(pursueSpd), fleeSpd: Math.round(fleeSpd), kkb: !!kkb,
    catchUp: !!leader && (kkb || pursueSpd > fleeSpd), rearIds, fleeIds: caught.map(u => u.id),
    slipped: slipped.map(u => u.name), fleeCommanderId: leader?.id, leaderName: leader?.name,
  };
}

function decidePursuit(game, yes) {
  const b = game.battle;
  const info = pursueInfo(game, b);
  b.pursueInfo = info;
  if (info.slipped.length) b.log.push(`野口の隊は気づかれずに逃げ切った（くちかわき）`);
  if (!yes) { b.log.push('勝った側は追撃しなかった'); b.stage = 'done'; return; }
  if (!info.fleeIds.length && !info.rearIds.length) { b.stage = 'done'; return; }
  if (!info.catchUp) {
    b.log.push(`追撃したが、速さ比べに負けて追いつけなかった（追う側${info.pursueSpd} ／ 逃げる側${info.fleeSpd}）`);
    b.stage = 'done';
    return;
  }
  b.log.push(info.kkb ? 'KKBの猛追！ 速さ比べに必ず勝つ' : `速さ比べに勝って追いついた（追う側${info.pursueSpd} ／ 逃げる側${info.fleeSpd}）`);
  const winner = b.result.winner;
  const pursuers = b.units.filter(u => u.alive && u.side === winner);
  const pc = pursuers.find(u => u.isCommander) || pursuers.sort((a, c) => (RANK[c.charId] || 0) - (RANK[a.charId] || 0))[0];
  const p = createPursuit(game, b, {
    pursuerIds: pursuers.map(u => u.id), rearIds: info.rearIds, fleeIds: info.fleeIds,
    fleeCommanderId: info.fleeCommanderId, pursuerCommanderId: pc?.id,
  });
  p.auto = b.auto || !p.units.some(u => u.controller !== 'ai');
  game.stats.pursuits = (game.stats.pursuits || 0) + 1;
  p.parent = b;
  b.stage = 'pursuit';
  game.battle = p;
  startBattle(p);
}

// 追撃戦の結果を、元の合戦に戻す
function mergePursuit(game) {
  const p = game.battle;
  const b = p.parent;
  for (const pu of p.units) {
    const u = b.units.find(x => x.id === pu.id);
    if (!u) continue;
    Object.assign(u, { hp: pu.hp, alive: pu.alive, dealt: pu.dealt, kills: pu.kills, mp: pu.mp, used: pu.used, revived: pu.revived });
  }
  b.log.push(...p.log.slice(-3));
  b.pursuitResult = p.result;
  if (p.result.winner === p.attackerSide) game.stats.pursuitWins = (game.stats.pursuitWins || 0) + 1;
  b.stage = 'done';
  game.battle = b;
}

export function aiTurn(game) {
  const b = game.battle;
  const u = b && b.stage === 'fight' && !b.result && activeUnit(b);
  return !!u && u.controller === 'ai';
}

// AIの番なら1手進める。進めたら true（force：テスト用。人の番もAIが動かす）
export function advance(game, force = false) {
  const b = game.battle;
  if (force ? !(b && b.stage === 'fight' && !b.result) : !aiTurn(game)) return false;
  aiStep(game.battle);
  progress(game);
  return true;
}

export function battleDone(game) {
  return game.battle?.stage === 'done';
}

export function battleAction(game, role, action) {
  if (game.phase !== 'battle' || !game.battle) throw new Error('合戦中ではありません');
  const b = game.battle;
  switch (action.type) {
    case 'conclude':
      if (b.stage !== 'done') throw new Error('まだ終わっていません');
      if (b.kind === 'pursuit') mergePursuit(game);
      concludeBattle(game);
      return;
    case 'commander': {
      if (b.stage !== 'commander') throw new Error('今は大将を選べません');
      const side = Object.keys(b.pending).find(k => b.pending[k].includes(role));
      if (!side) throw new Error('あなたが大将を選ぶ側ではありません');
      if (action.genId) setCommander(b, side, action.genId);
      delete b.pending[side];
      if (!Object.keys(b.pending).length) { b.stage = 'fight'; startBattle(b); }
      break;
    }
    case 'rearguard': {
      if (b.stage !== 'rearguard' || !b.pendingRoles.includes(role)) throw new Error('今はしんがりを選べません');
      const ids = (action.unitIds || []).filter(id => b.units.some(u => u.id === id && u.alive && u.controller === role && u.kind === 'troop'));
      b.rear[role] = ids;
      if (ids.length) b.log.push(`しんがりに残る：${ids.map(id => b.units.find(u => u.id === id).name).join('・')}`);
      b.pendingRoles = b.pendingRoles.filter(r => r !== role);
      break;
    }
    case 'pursue':
      if (b.stage !== 'pursue' || !b.pendingRoles.includes(role)) throw new Error('今は追撃を決められません');
      b.pendingRoles = [];
      decidePursuit(game, !!action.yes);
      break;
    default:
      if (b.stage !== 'fight') throw new Error('今は動かせません');
      applyBattleAction(b, role, action);
  }
  progress(game);
}

function levelUp(game, charId) {
  const c = game.chars[charId];
  const before = charStats(charId, c.level);
  c.level++;
  const after = charStats(charId, c.level);
  const g = game.generals[charId];
  if (g && g.status === 'active') g.hp = Math.min(after.hp, g.hp + (after.hp - before.hp));
  game.log.push(`${CHARACTERS[charId].name} が Lv${c.level} になった`);
}

function gainExp(game, charId, exp) {
  if (!HERO_ROLES.includes(charId) && charId !== 'horie') return;
  const c = game.chars[charId];
  c.exp += Math.round(exp);
  while (c.level < 30 && c.exp >= expToNext(c.level)) { c.exp -= expToNext(c.level); levelUp(game, charId); }
}

function knockDown(game, g) {
  if (g.temp) return;
  if (!g.charId) { delete game.generals[g.id]; game.log.push(`${g.name} は散り散りになった`); return; }
  g.status = 'down';
  g.location = null;
  const wait = { yagyu: 2, nozomi: 0 }[g.charId] ?? (g.kind === 'hero' ? 3 : 4);
  g.respawnDay = game.day + wait;
  for (const t of g.troops) t.hp = 0;
  game.log.push(`${g.name} が倒れた`);
}

function concludeBattle(game) {
  const b = game.battle;
  if (!b || !b.result) throw new Error('まだ決着していません');
  const tid = b.territoryId;
  const T = TERRITORIES[tid];
  const t = game.territories[tid];
  const winner = b.result.winner;
  const winRole = winner === b.attackerSide ? 'attacker' : 'defender';
  const loseRole = winRole === 'attacker' ? 'defender' : 'attacker';

  // 兵の数を武将に戻す
  const participants = new Set();
  for (const u of b.units) {
    const g = game.generals[u.genId];
    if (!g) continue;
    if (u.charId) participants.add(u.charId);
    if (u.isLeaderUnit) {
      g.hp = u.hp;
      if (!u.alive) g.leaderDown = true;
      if (u.charId) gainExp(game, u.charId, u.dealt / 4 + u.kills * 15 + (u.role === winRole ? 30 : 0));
    } else {
      const tr = g.troops.find(x => x.uid === u.troopRef);
      if (tr) tr.hp = u.hp;
    }
  }
  b.participants = [...participants];
  recordBattleFlags(game, b);

  // 守備隊の残りを陣地へ戻す
  for (const gid of [...b.generals.attacker, ...b.generals.defender]) {
    const g = game.generals[gid];
    if (g?.temp) {
      t.garrison = g.troops.reduce((a, x) => a + x.hp, 0) + (g.reserve || 0);
      delete game.generals[gid];
    }
  }
  // 本人が倒れた武将
  for (const gid of [...b.generals.attacker, ...b.generals.defender]) {
    const g = game.generals[gid];
    if (g && g.leaderDown) { delete g.leaderDown; knockDown(game, g); }
    else if (g && !g.charId && g.troops.every(x => x.hp <= 0)) knockDown(game, g);
  }

  // 戦場になった陣地の民と畑
  const loss = Math.round(t.pop * 0.15);
  game.stats.civLoss[t.owner] += loss;
  t.pop -= loss;
  t.farm = Math.max(5, Math.round(t.farm * 0.75));
  t.commerce = Math.max(0, Math.round(t.commerce * 0.85));
  t.damaged = 10;
  t.attackedCount++;
  game.log.push(`${T.name}：戦で民${loss}人が失われ、畑が荒れた`);

  // 負けた側は退却
  const losers = [...b.generals[loseRole], ...b.reserve[loseRole]].map(id => game.generals[id]).filter(g => g && g.status === 'active' && g.location === tid);
  const loserSide = winRole === 'attacker' ? b.defenderSide : b.attackerSide;
  if (loserSide === 'neutral' && loseRole === 'defender') t.garrison = 0;
  for (const g of losers) retreat(game, g);
  if (loseRole === 'defender' && t.owner === b.defenderSide) t.garrison = 0;

  if (b.generals.defender.includes('nozomi') && game.generals.nozomi.status === 'down') {
    game.flags.queenDefeated = true;
  }

  game.log.push(b.log[b.log.length - 1]);
  game.lastBattle = { territoryId: tid, winner, reason: b.result.reason, day: game.day };
  game.battle = null;
  game.phase = 'day';
  checkWin(game);
  if (game.phase === 'ended') return;
  processPending(game);
}

function retreat(game, g) {
  const options = neighbors(g.location, g.side).filter(n => game.territories[n].owner === g.side);
  const safe = options.filter(n => !gensAt(game, n).some(o => o.side !== g.side));
  const pick = (g.prevLocation !== undefined && safe.includes(g.prevLocation)) ? g.prevLocation : safe[0];
  if (pick === undefined) { game.log.push(`${g.name} は逃げ場がなかった`); knockDown(game, g); return; }
  g.location = pick;
  game.log.push(`${g.name} は${TERRITORIES[pick].name}へ退却`);
}

function capture(game, tid, side, gens) {
  const t = game.territories[tid];
  const T = TERRITORIES[tid];
  const before = t.owner;
  t.owner = side;
  t.garrison = Math.min(t.garrison, 50);
  t.loyalty = 40; t.fear = side === 'demon' ? 50 : 0; t.rebel = 0;
  game.log.push(`${T.name} を${side === 'kingdom' ? '王国' : side === 'demon' ? '魔族' : '中立'}が占領（もとは${before === 'kingdom' ? '王国' : before === 'demon' ? '魔族' : '中立'}）`);
  if (side === 'kingdom') {
    const hero = gens.find(g => g.kind === 'hero');
    if (hero) game.reinforcements.push({ tid, owner: hero.charId, day: game.day + 3 });
  }
}

function recordBattleFlags(game, b) {
  const p = new Set(b.participants);
  // 「〇日目以降に合戦でぶつかる」イベント用に、最後にぶつかった日を覚えておく
  if (p.has('sumire') && p.has('car')) game.flags.sumireMetCar = game.day;
  if (p.has('yagyu') && HERO_ROLES.some(h => p.has(h))) game.flags.yagyuMetHero = game.day;
  if (p.has('oh') && b.territoryId === 0) game.flags.ohAtCapital = game.day;
  if (TERRITORIES[b.territoryId].yuki && (b.attackerSide === 'demon')) game.flags.yukiAttacked = true;
}

// 補給線：本拠地から自分の陣地だけを通ってつながっているか
function suppliedSet(game, side) {
  const home = side === 'kingdom' ? 0 : 28;
  const seen = new Set();
  if (game.territories[home].owner !== side) return seen;
  const q = [home];
  seen.add(home);
  while (q.length) {
    const c = q.shift();
    for (const n of neighbors(c, side)) if (!seen.has(n) && game.territories[n].owner === side) { seen.add(n); q.push(n); }
  }
  return seen;
}

function endOfDay(game) {
  const R = game.resources;
  const supplied = { kingdom: suppliedSet(game, 'kingdom'), demon: suppliedSet(game, 'demon') };
  // 生産
  const income = { kingdom: { gold: 0, food: 0 }, demon: { food: 0, magic: 0 } };
  for (const t of game.territories) {
    if (t.owner !== 'kingdom' && t.owner !== 'demon') { if (t.damaged > 0) t.damaged--; continue; }
    const mult = t.damaged > 0 ? 0.5 : 1;
    income[t.owner].food += t.farm * 0.25 * mult;
    if (t.owner === 'kingdom') income.kingdom.gold += t.commerce * 0.5 * mult * (0.6 + t.loyalty / 150);
    else income.demon.magic += t.fear * t.pop / 1000 * 0.04 * mult + (t.id === 28 ? 15 : 0);
    if (t.damaged > 0) t.damaged--;
    // 民の暮らし
    const S = SIZES[TERRITORIES[t.id].size];
    if (!t.damaged && R[t.owner].food > 0) t.pop = Math.min(Math.round(S.pop * 1.5), Math.round(t.pop * 1.005));
    if (t.owner === 'kingdom') {
      t.loyalty += t.damaged ? -1 : (t.loyalty < 50 ? 1 : 0);
      if (!supplied.kingdom.has(t.id)) t.loyalty -= 1;
      t.loyalty = Math.max(0, Math.min(100, t.loyalty));
    } else {
      if (game.day % 2 === 0) t.fear = Math.max(0, t.fear - 1);
    }
    // 反乱
    const unhappy = t.owner === 'kingdom' ? t.loyalty < 15 : t.fear < 10;
    t.rebel = unhappy ? t.rebel + 1 : 0;
    if (t.rebel >= 5 && t.id !== 0 && t.id !== 28) {
      game.stats.rebellions = (game.stats.rebellions || 0) + 1;
      game.log.push(`${TERRITORIES[t.id].name} で反乱！ 民が独立した`);
      t.owner = 'neutral'; t.garrison = 300; t.rebel = 0; t.loyalty = 50; t.fear = 0;
      for (const g of gensAt(game, t.id)) retreat(game, g);
    }
  }
  R.kingdom.gold += Math.round(income.kingdom.gold);
  R.kingdom.food += Math.round(income.kingdom.food);
  R.demon.food += Math.round(income.demon.food);
  R.demon.magic += Math.round(income.demon.magic);

  // 兵は食料を食べる
  for (const side of ['kingdom', 'demon']) {
    let soldiers = 0;
    for (const t of game.territories) if (t.owner === side) soldiers += t.garrison;
    for (const g of Object.values(game.generals)) if (g.side === side && g.status === 'active') soldiers += g.troops.reduce((a, x) => a + x.hp, 0);
    const eat = Math.ceil(soldiers / 100);
    R[side].food -= eat;
    if (R[side].food < 0) {
      R[side].food = 0;
      game.log.push(`${side === 'kingdom' ? '王国' : '魔族'}の食料が尽きた！ 兵が飢えて逃げ出している`);
      for (const g of Object.values(game.generals)) if (g.side === side) for (const x of g.troops) x.hp = Math.floor(x.hp * 0.9);
      for (const t of game.territories) if (t.owner === side) t.garrison = Math.floor(t.garrison * 0.9);
    }
  }

  // 補充と回復
  for (const g of Object.values(game.generals)) {
    if (g.status !== 'active' || g.side === 'neutral') continue;
    const t = game.territories[g.location];
    const ok = t.owner === g.side && supplied[g.side].has(g.location);
    if (!ok) {
      for (const x of g.troops) x.hp = Math.floor(x.hp * 0.95);
      game.log.push(`${g.name} は補給が届かず、兵が逃げている`);
      continue;
    }
    if (g.charId) {
      const st = charStats(g.charId, game.chars[g.charId].level);
      g.hp = Math.min(st.hp, g.hp + Math.round(st.hp * (g.charId === 'yagyu' ? 0.3 : 0.25)));
    }
    for (const x of g.troops) {
      const need = Math.min(100, x.max - x.hp, Math.max(0, t.garrison - 50));
      if (need > 0) { x.hp += need; t.garrison -= need; }
    }
  }

  // 復活
  const homes = { sumire: 5, noguchi: 7, nanase: 8, yagyu: 28, car: 28, oh: 28, kkb: 28, horie: null, yuki: 12 };
  for (const g of Object.values(game.generals)) {
    if (g.status !== 'down' || game.day + 1 < g.respawnDay) continue;
    let home = homes[g.charId];
    if (g.charId === 'horie') home = g.side === 'kingdom' ? 0 : 28;
    if (home === undefined || home === null) continue;
    if (game.territories[home].owner !== g.side) {
      if (!g.blockedMsg) { game.log.push(`${g.name} の復活地点（${TERRITORIES[home].name}）が奪われていて復活できない`); g.blockedMsg = true; }
      continue;
    }
    g.status = 'active'; g.location = home; g.blockedMsg = false;
    g.hp = charStats(g.charId, game.chars[g.charId].level).hp;
    for (const x of g.troops) x.hp = Math.max(x.hp, 100);
    game.log.push(`${g.name} が${TERRITORIES[home].name}で復活した`);
  }

  // 王国からの増援（勇者が占領した陣地へ、兵の武将が届く）
  game.reinforcements = game.reinforcements.filter(r => {
    if (game.day + 1 < r.day) return true;
    if (game.territories[r.tid].owner === 'kingdom') {
      const g = addGeneral(game, { name: `${CHARACTERS[r.owner].name}の兵`, side: 'kingdom', kind: 'soldier', owner: r.owner, location: r.tid, troops: [newTroop(game, ['spear', 'cavalry', 'archer'][game.genCount % 3], 'kingdom')] });
      g.controller = controllerFor(game, g);
      game.log.push(`${TERRITORIES[r.tid].name} に王国から兵が届いた（${g.name}）`);
    }
    return false;
  });

  // 大都市を占領し続けた日数
  const metro = game.territories[16];
  const ms = game.flags.metroStreak;
  if (metro.owner === 'kingdom' || metro.owner === 'demon') {
    if (ms.side === metro.owner) ms.days++; else { ms.side = metro.owner; ms.days = 1; }
  } else { ms.side = null; ms.days = 0; }

  // 七星のやる気（ゆきちゃんの町しだい）
  if (game.flags.yukiHostile) {
    const yt = game.territories[12];
    game.flags.nanaseMotivation = yt.owner === 'kingdom' ? (yt.damaged ? 1.0 : 1.1) : 0.85;
  }

  for (const g of Object.values(game.generals)) delete g.moved;
  checkWin(game);
  if (game.phase === 'ended') return;
  game.day++;
  checkEvents(game, eventHelpers(game));
  resetOrders(game);
  game.phase = 'day';
}

function eventHelpers(game) {
  return {
    addGeneral: (g) => { const x = addGeneral(game, g); x.controller = controllerFor(game, x); return x; },
    newTroop: (t, q) => newTroop(game, t, q),
  };
}

function checkWin(game) {
  const k = ownedCount(game, 'kingdom'), d = ownedCount(game, 'demon');
  const G = game.generals;
  let winner = null, kind = null;
  if (game.flags.queenDefeated || game.territories[0].owner === 'demon') { winner = 'demon'; kind = 'queen'; }
  else if (G.yagyu.status === 'down' && k >= MAJORITY) { winner = 'kingdom'; kind = 'kingdom'; }
  else if (HERO_ROLES.every(h => G[h].status === 'down') && d >= MAJORITY) { winner = 'demon'; kind = 'heroes'; }
  if (winner) {
    game.phase = 'ended';
    game.winner = winner;
    game.ending = ENDINGS[kind];
    game.log.push(`★★ ${winner === 'kingdom' ? '王国' : '魔族'}の勝利 ★★`);
  }
}

// 外に見せる形（合言葉を消す）
// 命令は同じ陣営の人にだけ見せる（王国の三人はおたがいの命令が見える）
export function publicView(game, viewer) {
  const players = {};
  for (const r of ROLES) players[r] = game.players[r] ? { name: game.players[r].name } : null;
  const sideOf = r => (r === 'yagyu' ? 'demon' : 'kingdom');
  const orders = {};
  if (viewer) for (const [r, o] of Object.entries(game.orders)) if (sideOf(r) === sideOf(viewer)) orders[r] = o;
  return {
    ...game,
    players,
    orders,
    log: game.log.slice(-80),
    battle: game.battle ? { ...game.battle, log: game.battle.log.slice(-60), parent: game.battle.parent ? { id: game.battle.parent.id } : undefined } : null,
    meta: { demonActions: demonActionCount(game), queenActions: queenActionCount(game) },
  };
}

// テスト用：人の決定もAIのかわりに済ませて、合戦を1歩進める
export function autoBattleStep(game) {
  const b = game.battle;
  if (!b) return;
  if (b.stage === 'commander') for (const role of Object.values(b.pending).flat()) { if (b.stage === 'commander') battleAction(game, role, { type: 'commander' }); }
  else if (b.stage === 'fight') advance(game, true);
  else if (b.stage === 'rearguard') battleAction(game, b.pendingRoles[0], { type: 'rearguard', unitIds: [] });
  else if (b.stage === 'pursue') battleAction(game, b.pendingRoles[0], { type: 'pursue', yes: true });
  else if (b.stage === 'done') battleAction(game, null, { type: 'conclude' });
}
