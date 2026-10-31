// 群雄割拠（バトルロワイヤルの国取り）：いろんな勢力が同じ地図で天下を争う
// 勢力のID は 'f:キャラ'（例 'f:sumire'）。人が遊ぶ役は、その勢力の当主のキャラ。
import { TERRITORIES, SIZES, CHARACTERS, neighbors, gameStats, garrisonCap, ROYALE_CHARS, emptyMaterials, CONQUEST_ACTIONS, CONQUEST_WIN } from '../shared/data.js';
import {
  addGeneral, newTroop, gensAt, retreat, payCost, randomHex, randomCode, genStrength, territoryStrength, processPending, gainExp,
} from './game.js';
import { planMoves } from './ai.js';

export const CONQUEST_LEADERS = ROYALE_CHARS.filter(c => c !== 'yuki');
// 本拠地（勢力の数だけ、前から順に使う。地図の上でなるべく離れるように並べてある）
export const HOMES = [0, 28, 10, 18, 22, 4, 26, 15];
const WIN_COUNT = CONQUEST_WIN;
export const fid = c => 'f:' + c;
export const leaderOf = f => f.slice(2);
const DEMONISH = ['yagyu', 'car', 'oh', 'kkb'];
const RETAINER_NAMES = ['権兵衛', '与作', '弥助', '源太', '才蔵', '半蔵', '吉兵衛', '太郎丸', '小六', '又左', '新八', '勘助', '五郎', '彦六', '十兵衛', '平次'];

export const factionName = (game, f) => {
  if (!f || !f.startsWith('f:')) return '中立';
  return `${CHARACTERS[leaderOf(f)].name}軍`;
};
export const alive = (game, f) => game.conquest.factions.includes(f) && !game.conquest.out.includes(f);
export const aliveFactions = (game) => game.conquest.factions.filter(f => !game.conquest.out.includes(f));
const pairKey = (a, b) => [a, b].sort().join('|');
export const allied = (game, a, b) => a !== b && game.conquest.allies.includes(pairKey(a, b));
export const hostile = (game, a, b) => a !== b && !!a && !!b && a.startsWith('f:') && b.startsWith('f:') && !allied(game, a, b);
const owned = (game, f) => game.territories.filter(t => t.owner === f);
export const actionCount = (game, f) => 2 + Math.floor(owned(game, f).length / 4);
// 入っていい陣地：自分の陣地・中立・敵の陣地（同盟相手の陣地には入れない）
export const canEnter = (game, f, tid) => !allied(game, f, game.territories[tid].owner);

// ---- ゲームを作る ----
export function initConquest(game, opts, name) {
  game.mode = 'conquest';
  game.players = {};
  game.conquest = {
    bots: Math.max(0, Math.min(7, Number(opts.bots ?? 3))), level: [1, 10, 20].includes(Number(opts.level)) ? Number(opts.level) : 1,
    factions: [], out: [], allies: [], proposals: [], breaks: [], homes: {}, ranking: null,
  };
  game.resources = {};
  if (!name) game.name = '群雄割拠';
  // 最初はぜんぶ中立
  for (const t of game.territories) { t.owner = 'neutral'; t.fear = 0; t.loyalty = 60; }
}

export function joinConquest(game, charId, name) {
  if (!CONQUEST_LEADERS.includes(charId)) throw new Error('そのキャラは選べません');
  if (game.phase !== 'lobby') throw new Error('もう始まっています');
  if (game.players[charId]) throw new Error('そのキャラはもう選ばれています');
  if (Object.keys(game.players).length >= 8) throw new Error('8人までです');
  const token = randomHex(12);
  game.players[charId] = { name: (name || '').slice(0, 20) || CHARACTERS[charId].name, token, code: randomCode() };
  return token;
}

function troopTypes(charId) {
  return DEMONISH.includes(charId) ? ['orc', 'harpy', 'goat', 'orc'] : ['spear', 'archer', 'cavalry', 'spear'];
}

function hireRetainer(game, f, tid) {
  const C = game.conquest;
  C.hired = (C.hired || 0) + 1;
  const types = troopTypes(leaderOf(f));
  const name = RETAINER_NAMES[(C.hired - 1) % RETAINER_NAMES.length] + (C.hired > RETAINER_NAMES.length ? '二世' : '');
  const g = addGeneral(game, {
    name, side: f, kind: 'retainer', location: tid,
    troops: [types[C.hired % 2 ? 0 : 1], types[2]].map(t => newTroop(game, t, 'kingdom')),
  });
  g.controller = controllerOf(game, f);
  return g;
}

export const controllerOf = (game, f) => (game.players[leaderOf(f)] ? leaderOf(f) : 'ai');

export function startConquest(game) {
  const humans = Object.keys(game.players);
  if (!humans.length && !game.allowNoHumans) throw new Error('だれも参加していません');
  const C = game.conquest;
  const free = CONQUEST_LEADERS.filter(c => !game.players[c]).sort(() => Math.random() - 0.5);
  const want = Math.min(8, Math.max(2, humans.length + C.bots)) - humans.length;
  const leaders = [...humans, ...free.slice(0, want)].sort(() => Math.random() - 0.5);
  C.factions = leaders.map(fid);
  leaders.forEach((c, i) => {
    const f = fid(c);
    const home = HOMES[i];
    C.homes[f] = home;
    game.resources[f] = { gold: 600, food: 1200, training: 0, gearWeapon: 0, gearArmor: 0, materials: emptyMaterials() };
    // 本拠地はどこでも同じくらいの強さにそろえる
    const t = game.territories[home];
    Object.assign(t, { owner: f, pop: 4000, farm: 60, commerce: 60, garrison: 900, defense: 30, loyalty: 70 });
    game.chars[c].level = Math.max(game.chars[c].level, C.level);
    const types = troopTypes(c);
    const g = addGeneral(game, { charId: c, side: f, kind: 'leader', location: home, troops: types.map(x => newTroop(game, x, 'kingdom')) });
    g.controller = controllerOf(game, f);
    hireRetainer(game, f, home);
    hireRetainer(game, f, home);
  });
  game.phase = 'day';
  game.day = 1;
  game.log.push(`群雄割拠！ ${C.factions.map(f => factionName(game, f)).join('・')} が天下を争う`);
  game.log.push(`${WIN_COUNT}陣地を取るか、最後の1勢力になれば勝ち`);
}

export function conquestRoles(game) {
  return Object.keys(game.players).filter(c => alive(game, fid(c)));
}

// ---- 命令 ----
// orders = { moves: {genId: tid}, acts: [{type, tid}], diplo: [{type, to}] }
export function setConquestOrders(game, role, orders) {
  const f = fid(role);
  if (!alive(game, f)) throw new Error('あなたの勢力はもう滅びています');
  const clean = { moves: {}, acts: [], diplo: [] };
  for (const [gid, tid] of Object.entries(orders.moves || {})) {
    const g = game.generals[gid];
    if (!g || g.status !== 'active' || g.side !== f) continue;
    if (!neighbors(g.location, f, game.closed).includes(tid) || !canEnter(game, f, tid)) continue;
    clean.moves[gid] = tid;
  }
  const max = actionCount(game, f);
  for (const a of orders.acts || []) {
    if (clean.acts.length >= max) break;
    const A = CONQUEST_ACTIONS[a.type];
    if (!A) continue;
    if (!A.global && game.territories[a.tid]?.owner !== f) continue;
    clean.acts.push({ type: a.type, tid: A.global ? null : a.tid });
  }
  for (const d of orders.diplo || []) {
    if (!['propose', 'accept', 'decline', 'break'].includes(d.type) || !alive(game, d.to) || d.to === f) continue;
    if (clean.diplo.some(x => x.to === d.to)) continue;
    clean.diplo.push({ type: d.type, to: d.to });
  }
  game.orders[role] = clean;
  game.ready[role] = false;
}

// ---- 内政 ----
function doAction(game, f, a, by) {
  const A = CONQUEST_ACTIONS[a.type];
  const res = game.resources[f];
  const t = a.tid != null ? game.territories[a.tid] : null;
  if (t && t.owner !== f) return false;
  if (!payCost(res, A.cost)) return false;
  const S = t && SIZES[TERRITORIES[t.id].size];
  switch (a.type) {
    case 'farm': t.farm = Math.min(Math.max(S.farm, 60) * 2, t.farm + 4); break;
    case 'commerce': t.commerce = Math.min(Math.max(S.commerce, 40) * 2, t.commerce + 4); break;
    case 'conscript': {
      const n = Math.min(150, t.pop - 200, garrisonCap(t) - t.garrison);
      if (n <= 0) return false;
      t.pop -= n; t.garrison += n; t.loyalty = Math.max(0, t.loyalty - 2); break;
    }
    case 'fortify': t.defense = Math.min(100, t.defense + 10); break;
    case 'alms': t.loyalty = Math.min(100, t.loyalty + 12); break;
    case 'train': res.training = Math.min(10, res.training + 1); break;
    case 'hire': {
      const at = t.id;
      const g = hireRetainer(game, f, at);
      game.log.push(`${by}：新しい武将「${g.name}」が${TERRITORIES[at].name}に来た`);
      return true;
    }
  }
  return true;
}

// ---- 外交 ----
function addAlliance(game, a, b) {
  const C = game.conquest;
  const k = pairKey(a, b);
  if (!C.allies.includes(k)) C.allies.push(k);
  C.proposals = C.proposals.filter(p => !(pairKey(p.from, p.to) === k));
  game.log.push(`🤝 ${factionName(game, a)} と ${factionName(game, b)} が同盟を結んだ`);
}

function breakAlliance(game, a, b, why) {
  const C = game.conquest;
  const k = pairKey(a, b);
  if (!C.allies.includes(k)) return;
  C.allies = C.allies.filter(x => x !== k);
  game.log.push(`💢 ${factionName(game, a)} と ${factionName(game, b)} の同盟が切れた${why ? '（' + why + '）' : ''}`);
}

function applyDiplo(game, f, d) {
  const C = game.conquest;
  if (!alive(game, d.to)) return;
  if (d.type === 'propose') {
    if (allied(game, f, d.to) || C.proposals.some(p => p.from === f && p.to === d.to)) return;
    // 相手からもう申し込まれていれば、そのまま同盟
    if (C.proposals.some(p => p.from === d.to && p.to === f)) { addAlliance(game, f, d.to); return; }
    C.proposals.push({ from: f, to: d.to, day: game.day });
    game.log.push(`✉ ${factionName(game, f)} が ${factionName(game, d.to)} に同盟を申し込んだ`);
  } else if (d.type === 'accept') {
    if (C.proposals.some(p => p.from === d.to && p.to === f)) addAlliance(game, f, d.to);
  } else if (d.type === 'decline') {
    if (!C.proposals.some(p => p.from === d.to && p.to === f)) return;
    C.proposals = C.proposals.filter(p => !(p.from === d.to && p.to === f));
    game.log.push(`✖ ${factionName(game, f)} は ${factionName(game, d.to)} の同盟の申し込みを断った`);
  } else if (d.type === 'break') {
    // 同盟を切るのは次の日から（その日のうちに裏切って攻めることはできない）
    if (allied(game, f, d.to) && !C.breaks.some(x => x.from === f && x.to === d.to)) {
      C.breaks.push({ from: f, to: d.to, day: game.day });
      game.log.push(`⚠ ${factionName(game, f)} は ${factionName(game, d.to)} との同盟を明日で切ると伝えた`);
    }
  }
}

// ---- AI ----
const power = (game, f) => Object.values(game.generals).filter(g => g.status === 'active' && g.side === f).reduce((a, g) => a + genStrength(game, g), 0)
  + owned(game, f).reduce((a, t) => a + Math.min(t.garrison, 900), 0);

function borders(game, a, b) {
  return owned(game, a).some(t => neighbors(t.id, a, game.closed).some(n => game.territories[n].owner === b));
}

function aiDiplomacy(game, f) {
  const C = game.conquest;
  const others = aliveFactions(game).filter(x => x !== f);
  const leader = aliveFactions(game).slice().sort((a, b) => owned(game, b).length - owned(game, a).length)[0];
  const lead = owned(game, leader).length;
  const myAllies = others.filter(x => allied(game, f, x));
  const out = [];
  // 申し込まれたら：一番強い勢力でなく、同盟が2つ未満で、相手がとなりにいるなら受ける
  const mine = owned(game, f).length;
  for (const p of C.proposals.filter(p => p.to === f)) {
    // 大きい勢力どうしは組まない（天下を争う相手なので）
    const rival = mine >= 7 && owned(game, p.from).length >= 7;
    const ok = !rival && p.from !== leader && myAllies.length < 2 && (lead >= 8 ? leader !== f : borders(game, f, p.from));
    out.push({ type: ok ? 'accept' : 'decline', to: p.from });
  }
  // 1つの勢力が強くなりすぎたら、ほかの勢力と組んで止める
  if (lead >= 10 && leader !== f && myAllies.length < 1) {
    const partner = others.filter(x => x !== leader && !C.proposals.some(p => p.from === f && p.to === x)).sort((a, b) => power(game, b) - power(game, a))[0];
    if (partner) out.push({ type: 'propose', to: partner });
  }
  // 同盟相手が強くなりすぎた、またはもう攻める先がないなら、同盟を切る
  for (const x of myAllies) {
    const tooBig = owned(game, x).length >= 12 || (mine >= 7 && owned(game, x).length >= 7);
    const stuck = !owned(game, f).some(t => neighbors(t.id, f, game.closed).some(n => canEnter(game, f, n) && game.territories[n].owner !== f));
    if ((tooBig || stuck) && game.day - (C.allyDay?.[pairKey(f, x)] ?? 0) >= 3) out.push({ type: 'break', to: x });
  }
  return out;
}

function aiInternal(game, f) {
  const res = game.resources[f];
  const mine = owned(game, f);
  if (!mine.length) return [];
  const n = actionCount(game, f);
  const gens = Object.values(game.generals).filter(g => g.side === f && g.status === 'active').length;
  const front = mine.filter(t => neighbors(t.id, f, game.closed).some(m => hostile(game, f, game.territories[m].owner)));
  const acts = [];
  // 武将が足りないときは、雇うお金をためる
  const wantGens = 3 + Math.floor(mine.length / 3);
  const saving = gens < wantGens;
  let gold = res.gold;
  for (let i = 0; i < n; i++) {
    const low = mine.slice().sort((a, b) => a.loyalty - b.loyalty)[0];
    const weak = (front.length ? front : mine).slice().sort((a, b) => a.garrison - b.garrison)[0];
    let a;
    if (saving && gold >= 200 && res.food >= 60 && !acts.some(x => x.type === 'hire')) {
      const home = game.conquest.homes[f];
      a = { type: 'hire', tid: game.territories[home].owner === f ? home : mine.slice().sort((x, y) => y.garrison - x.garrison)[0].id };
    }
    else if (res.food < 400) a = { type: 'farm', tid: mine.slice().sort((x, y) => x.farm - y.farm)[0].id };
    else if (low.loyalty < 35) a = { type: 'alms', tid: low.id };
    else if (weak.garrison < 500 && weak.pop > 600 && i % 2 === 0) a = { type: 'conscript', tid: weak.id };
    else if (res.gold > 800 && res.training < 10 && i === 1) a = { type: 'train' };
    else if (saving && gold < 260) continue;
    else a = { type: (game.day + i) % 2 ? 'commerce' : 'farm', tid: mine[(game.day * 3 + i) % mine.length].id };
    gold -= CONQUEST_ACTIONS[a.type].cost.gold || 0;
    acts.push(a);
  }
  return acts;
}

function aiMoves(game, f) {
  const gens = Object.values(game.generals).filter(g => g.status === 'active' && g.side === f && !g.temp);
  return planMoves(game, f, gens, 1.25, {
    hostile: (s) => hostile(game, f, s),
    canEnter: (tid) => canEnter(game, f, tid),
    homes: new Set(Object.values(game.conquest.homes)),
    goal: new Map(),
  });
}

// ---- 1日の結果 ----
export function resolveConquestDay(game) {
  const C = game.conquest;
  game.log.push(`== ${game.day}日目の結果 ==`);
  // 前の日に予告された同盟の破棄
  for (const b of C.breaks.filter(x => x.day < game.day)) breakAlliance(game, b.from, b.to, `${factionName(game, b.from)}が切った`);
  C.breaks = C.breaks.filter(x => x.day >= game.day);

  const moves = {};
  const factions = aliveFactions(game);
  const all = {};
  for (const f of factions) {
    const role = leaderOf(f);
    if (game.players[role]) all[f] = game.orders[role] || { moves: {}, acts: [], diplo: [] };
    else all[f] = { moves: aiMoves(game, f), acts: aiInternal(game, f), diplo: aiDiplomacy(game, f) };
  }
  C.allyDay ||= {};
  const before = new Set(C.allies);
  for (const f of factions) for (const d of all[f].diplo) applyDiplo(game, f, d);
  for (const k of C.allies) if (!before.has(k)) C.allyDay[k] = game.day;
  // 古い申し込みは3日で消える
  C.proposals = C.proposals.filter(p => game.day - p.day < 3 && alive(game, p.from) && alive(game, p.to));
  for (const f of factions) {
    const by = factionName(game, f);
    let done = 0, fail = 0;
    for (const a of all[f].acts) (doAction(game, f, a, by) ? done++ : fail++);
    if (fail && game.players[leaderOf(f)]) game.log.push(`${by}：内政のうち${fail}つは、お金や兵が足りずできなかった`);
  }
  for (const f of factions) {
    for (const [gid, tid] of Object.entries(all[f].moves)) {
      // 同盟したばかりの相手の陣地には入れない
      if (!canEnter(game, f, tid)) continue;
      moves[gid] = tid;
    }
  }
  // すれ違い：向かい合って動いた敵同士は、遅い方が足止めされる
  const entries = Object.entries(moves);
  for (const [ga, ta] of entries) {
    for (const [gb, tb] of entries) {
      const A = game.generals[ga], B = game.generals[gb];
      if (hostile(game, A.side, B.side) && ta === B.location && tb === A.location && moves[ga] !== undefined && moves[gb] !== undefined) {
        const sa = A.charId ? gameStats(game, A.charId).spd : 6;
        const sb = B.charId ? gameStats(game, B.charId).spd : 6;
        delete moves[sa >= sb ? gb : ga];
      }
    }
  }
  const touched = new Set();
  for (const [gid, tid] of Object.entries(moves)) {
    const g = game.generals[gid];
    if (!g || g.status !== 'active' || !neighbors(g.location, g.side, game.closed).includes(tid)) continue;
    g.prevLocation = g.location;
    g.location = tid;
    g.moved = true;
    touched.add(tid);
  }
  game.pending = [...touched].sort((a, b) => a - b);
  processPending(game);
}

// どこで何が起きるか：2つの勢力の合戦か、占領か
export function conquestConflictAt(game, tid) {
  const t = game.territories[tid];
  const gens = gensAt(game, tid);
  const bySide = new Map();
  for (const g of gens) { if (!bySide.has(g.side)) bySide.set(g.side, []); bySide.get(g.side).push(g); }
  const sides = [...bySide.keys()];
  const str = (s) => bySide.get(s).reduce((a, g) => a + genStrength(game, g), 0);
  const owner = t.owner;
  // 陣地の持ち主がいる（武将か守備隊）とき：持ち主を攻める一番強い勢力が先に攻める
  if (owner.startsWith('f:')) {
    const attackers = sides.filter(s => hostile(game, s, owner)).sort((a, b) => str(b) - str(a));
    // 同盟相手の陣地に残ってしまった武将は、自分の陣地へ戻る
    for (const s of sides.filter(s => allied(game, s, owner))) for (const g of bySide.get(s)) retreat(game, g);
    if (!attackers.length) return null;
    const a = attackers[0];
    const defenders = bySide.get(owner) || [];
    if (!defenders.length && t.garrison <= 0) return { capture: true, side: a, gens: bySide.get(a) };
    return { territoryId: tid, attackerSide: a, defenderSide: owner, attackers: bySide.get(a), defenders, garrison: true };
  }
  // 中立の陣地：ほかの勢力どうしが同じ日に来たら、先にその勢力どうしで戦う
  const fs = sides.filter(s => s.startsWith('f:')).sort((a, b) => str(b) - str(a));
  if (!fs.length) return null;
  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length; j++) {
      if (!hostile(game, fs[i], fs[j])) continue;
      // 先にいた方が守る。どちらも来たばかりなら強い方が守る
      const iStay = bySide.get(fs[i]).some(g => !g.moved), jStay = bySide.get(fs[j]).some(g => !g.moved);
      const [d, a] = jStay && !iStay ? [fs[j], fs[i]] : [fs[i], fs[j]];
      return { territoryId: tid, attackerSide: a, defenderSide: d, attackers: bySide.get(a), defenders: bySide.get(d), garrison: false };
    }
  }
  const a = fs[0];
  if (t.garrison > 0) return { territoryId: tid, attackerSide: a, defenderSide: 'neutral', attackers: bySide.get(a), defenders: [], garrison: true };
  return { capture: true, side: a, gens: bySide.get(a) };
}

export function conquestCapture(game, tid, side, gens) {
  const t = game.territories[tid];
  const T = TERRITORIES[tid];
  const before = t.owner;
  t.owner = side;
  t.garrison = Math.min(t.garrison, 50);
  t.loyalty = 40; t.rebel = 0;
  if (t.facility) t.facility = null;
  game.log.push(`🚩 ${factionName(game, side)} が ${T.name} を取った（もとは${factionName(game, before)}）`);
  if (game.conquest.homes[before] === tid) game.log.push(`${factionName(game, before)}の本拠地が落ちた！`);
  for (const g of gens) if (g.charId) gainExp(game, g.charId, 30);
  checkOut(game);
}

// 陣地がなくなった勢力は滅びる
function checkOut(game) {
  const C = game.conquest;
  for (const f of aliveFactions(game)) {
    if (owned(game, f).length) continue;
    C.out.push(f);
    C.outDay ||= {};
    C.outDay[f] = game.day;
    C.allies = C.allies.filter(k => !k.split('|').includes(f));
    for (const g of Object.values(game.generals)) {
      if (g.side === f && !g.temp) delete game.generals[g.id];
    }
    game.log.push(`☠ ${factionName(game, f)} は滅びた`);
  }
}

export function conquestEndOfDay(game) {
  const R = game.resources;
  const C = game.conquest;
  const factions = aliveFactions(game);
  const income = Object.fromEntries(factions.map(f => [f, { gold: 0, food: 0 }]));
  for (const t of game.territories) {
    const mult = t.damaged > 0 ? 0.5 : 1;
    if (t.damaged > 0) t.damaged--;
    if (!income[t.owner]) continue;
    income[t.owner].food += t.farm * 0.3 * mult;
    income[t.owner].gold += t.commerce * 0.5 * mult * (0.6 + t.loyalty / 150);
    const S = SIZES[TERRITORIES[t.id].size];
    if (!t.damaged && R[t.owner].food > 0) t.pop = Math.min(Math.round(Math.max(S.pop, 2000) * 1.5), Math.round(t.pop * 1.005) + 5);
    t.loyalty += t.damaged ? -1 : (t.loyalty < 50 ? 1 : 0);
    t.loyalty = Math.max(0, Math.min(100, t.loyalty));
    // 守備隊は少しずつ増える
    if (t.pop > 500) t.garrison = Math.min(garrisonCap(t), t.garrison + 10);
    // 反乱
    t.rebel = t.loyalty < 15 ? t.rebel + 1 : 0;
    if (t.rebel >= 5 && C.homes[t.owner] !== t.id) {
      game.log.push(`${TERRITORIES[t.id].name} で反乱！ 民が独立した`);
      t.owner = 'neutral'; t.garrison = 300; t.rebel = 0; t.loyalty = 50;
      for (const g of gensAt(game, t.id)) retreat(game, g);
    }
  }
  // 中立の陣地は、少しずつ守りを取り戻す
  for (const t of game.territories) if (t.owner === 'neutral') t.garrison = Math.min(SIZES[TERRITORIES[t.id].size].garrison, t.garrison + 15);
  // AIの勢力は、むずかしさに合わせて収入が増える
  const aiBonus = { easy: 1, normal: 1.2, hard: 1.5 }[game.difficulty || 'normal'];
  for (const f of factions) {
    const m = game.players[leaderOf(f)] ? 1 : aiBonus;
    R[f].gold += Math.round(income[f].gold * m) + 20;
    R[f].food += Math.round(income[f].food * m);
    // 兵は食料を食べる
    let soldiers = 0;
    for (const t of game.territories) if (t.owner === f) soldiers += t.garrison;
    for (const g of Object.values(game.generals)) if (g.side === f && g.status === 'active') soldiers += g.troops.reduce((a, x) => a + x.hp, 0);
    R[f].food -= Math.ceil(soldiers / 100);
    if (R[f].food < 0) {
      R[f].food = 0;
      game.log.push(`${factionName(game, f)}の食料が尽きた！ 兵が逃げ出している`);
      for (const g of Object.values(game.generals)) if (g.side === f) for (const x of g.troops) x.hp = Math.floor(x.hp * 0.9);
      for (const t of game.territories) if (t.owner === f) t.garrison = Math.floor(t.garrison * 0.9);
    }
  }
  // 補充と回復（自分の陣地にいるとき）
  for (const g of Object.values(game.generals)) {
    if (g.status !== 'active' || !alive(game, g.side)) continue;
    const t = game.territories[g.location];
    if (t.owner !== g.side) continue;
    if (g.charId) {
      const st = gameStats(game, g.charId);
      g.hp = Math.min(st.hp, g.hp + Math.round(st.hp * 0.25));
    }
    for (const x of g.troops) {
      const need = Math.min(100, x.max - x.hp, Math.max(0, t.garrison - 50));
      if (need > 0) { x.hp += need; t.garrison -= need; }
    }
  }
  // 当主の復活：本拠地か、ほかの自分の陣地で
  for (const g of Object.values(game.generals)) {
    if (g.status !== 'down' || game.day + 1 < g.respawnDay || !alive(game, g.side)) continue;
    const home = C.homes[g.side];
    const at = game.territories[home].owner === g.side ? home : owned(game, g.side).sort((a, b) => b.garrison - a.garrison)[0]?.id;
    if (at === undefined) continue;
    g.status = 'active'; g.location = at;
    g.hp = gameStats(game, g.charId).hp;
    for (const x of g.troops) x.hp = Math.max(x.hp, 150);
    game.log.push(`${g.name} が${TERRITORIES[at].name}で立て直した`);
  }
  for (const g of Object.values(game.generals)) delete g.moved;
  // 残った勢力がみんな同盟していたら、同盟は自然に消える（天下はひとつ）
  const left = aliveFactions(game);
  if (left.length >= 2 && left.every(a => left.every(b => a === b || allied(game, a, b)))) {
    C.allies = [];
    game.log.push('残った勢力どうしの同盟は、天下を前にして消えた');
  }
  if (game.log.length > 400) game.log = game.log.slice(-300);
  checkConquestWin(game);
  if (game.phase === 'ended') return;
  game.day++;
}

export function checkConquestWin(game) {
  const C = game.conquest;
  checkOut(game);
  const left = aliveFactions(game);
  const top = left.slice().sort((a, b) => owned(game, b).length - owned(game, a).length)[0];
  let winner = null, why = null;
  if (left.length === 1) { winner = left[0]; why = '最後まで残った'; }
  else if (top && owned(game, top).length >= WIN_COUNT) { winner = top; why = `${WIN_COUNT}陣地を取り、天下統一`; }
  // 決着がつかないまま長引いたら（100日）、陣地が一番多い勢力の勝ち
  else if (game.day >= 100) { winner = top; why = '100日たって、陣地が一番多かった'; }
  if (!winner) return;
  game.phase = 'ended';
  game.winner = winner;
  const ranking = conquestRanking(game);
  C.ranking = ranking;
  const medal = ['🥇', '🥈', '🥉'];
  game.ending = {
    title: '群雄割拠 結果',
    lines: [
      { who: null, text: `${factionName(game, winner)}（${game.players[leaderOf(winner)]?.name || 'AI'}）の天下！ ${why}` },
      ...ranking.map(r => ({ who: null, text: `${medal[r.place - 1] || '　'} ${r.place}位　${r.name}　陣地${r.count}${r.outDay ? `（${r.outDay}日目に滅亡）` : ''}` })),
    ],
  };
  game.log.push(`★★ ${factionName(game, winner)}の天下統一 ★★`);
}

export function conquestRanking(game) {
  const C = game.conquest;
  return C.factions.map(f => ({ f, count: owned(game, f).length, outDay: C.outDay?.[f] || null }))
    .sort((a, b) => (b.outDay ? 0 : 1) - (a.outDay ? 0 : 1) || b.count - a.count || (b.outDay || 0) - (a.outDay || 0))
    .map((r, i) => ({ place: i + 1, side: r.f, charId: leaderOf(r.f), name: `${factionName(game, r.f)}（${game.players[leaderOf(r.f)]?.name || 'AI'}）`, count: r.count, outDay: r.outDay }));
}

// 画面に出す勢力の一覧
export function conquestSummary(game) {
  return aliveFactions(game).concat(game.conquest.out).map(f => ({
    f, charId: leaderOf(f), name: factionName(game, f), player: game.players[leaderOf(f)]?.name || null,
    count: owned(game, f).length, gens: Object.values(game.generals).filter(g => g.side === f).length,
    out: game.conquest.out.includes(f), power: Math.round(power(game, f)),
  }));
}
