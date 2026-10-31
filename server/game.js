// ゲーム全体の進行（ふだんの1日・合戦の順番・内政・AI・勝ち負け）
// 乱数（Node でもブラウザでも動く Web Crypto を使う）
export const randomHex = (bytes) => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
export const randomCode = () => String(globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
import {
  TERRITORIES, SIZES, CHARACTERS, HERO_ROLES, ROLES, UNIT_MAX, MAJORITY,
  neighbors, gameStats, KINGDOM_ACTIONS, DEMON_ACTIONS, levelUpCost, expToNext,
  MATERIALS, RECIPES, GEAR_MAX, SPECIALTIES, emptyMaterials, troopGearCost, recipeName, FACILITIES, canRemodel, garrisonCap, ROYALE_CHARS,
} from '../shared/data.js';
import { createBattle, startBattle, applyBattleAction, aiStep, activeUnit, setCommander, createPursuit, createRoyale, royaleRanking } from './battle.js';
import { getStat } from '../shared/battlecore.js';
import { checkEvents, ENDINGS } from './events.js';
import { rollIncidents, resolveIncidents, chooseIncident, dailyRecovery, sendMonsters } from './incidents.js';
import { demonAIOrders, aiIncidentChoices } from './demonai.js';
import { planMoves } from './ai.js';
import {
  initConquest, joinConquest, startConquest, setConquestOrders, resolveConquestDay, conquestConflictAt, conquestCapture,
  conquestEndOfDay, checkConquestWin, conquestRoles, controllerOf, factionName, actionCount, conquestSummary,
} from './conquest.js';

const isConquest = (game) => game.mode === 'conquest';
// 命令を出す人の役（群雄割拠では、滅びていない勢力の当主）
const humanRoles = (game) => (isConquest(game) ? conquestRoles(game) : ROLES.filter(r => game.players[r]));

export function actionCost(game, side, type, extra) {
  if (side === 'kingdom') {
    const K = game.resources.kingdom;
    const c = { ...KINGDOM_ACTIONS[type].cost };
    const tr = K.training;
    // 兵が強くなるほど（訓練・装備）、徴兵は高くなる
    if (type === 'conscript') c.gold = Math.round(40 * (1 + 0.25 * tr + 0.15 * (K.gearWeapon + K.gearArmor)));
    if (type === 'gearWeapon') return troopGearCost('weapon', K.gearWeapon);
    if (type === 'gearArmor') return troopGearCost('armor', K.gearArmor);
    if (type === 'craft') return { ...RECIPES[extra]?.cost };
    if (type === 'build') return { ...FACILITIES[extra]?.cost };
    if (type === 'train') c.gold = Math.round(200 * (1 + 0.5 * tr));
    return c;
  }
  const c = { ...DEMON_ACTIONS[type].cost };
  if (type === 'levelup') c.magic = levelUpCost(game.chars[extra]?.level || 1, extra);
  if (type === 'build') return { ...FACILITIES[extra]?.cost };
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
  const id = randomHex(4);
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
    resources: {
      kingdom: { gold: 800, food: 1500, training: 0, gearWeapon: 0, gearArmor: 0, materials: emptyMaterials() },
      demon: { food: 1200, magic: 60 },
    },
    gear: { sumire: {}, noguchi: {}, nanase: {} },
    orders: {}, ready: {},
    pending: [], battle: null, battleCount: 0, troopCount: 0, genCount: 0,
    flags: { nanaseMotivation: 1, metroStreak: { side: null, days: 0 } },
    reinforcements: [],
    stats: { civLoss: { kingdom: 0, demon: 0, neutral: 0 }, battles: 0 },
    eventLog: [], firedEvents: [], log: [], winner: null, ending: null,
    incidents: [], closed: {}, injuries: {},
    trial: !!opts.trial,
    allowNoHumans: !!opts.allowNoHumans, // テスト用：AIどうしで最後まで
    difficulty: ['easy', 'normal', 'hard'].includes(opts.difficulty) ? opts.difficulty : 'normal',
    solo: !!opts.solo,
  };
  // お試しモード：全員Lv30から（技をすぐ試せる）
  const startLv = opts.trial ? 30 : 1;
  if (opts.mode === 'royale') {
    // バトルロワイヤル：役は「キャラ」。だれがどのキャラかは players[キャラ] に入る
    game.mode = 'royale';
    game.players = {};
    game.royale = { level: [10, 20, 30].includes(Number(opts.level)) ? Number(opts.level) : 20, bots: Math.max(0, Math.min(7, Number(opts.bots ?? 3))), entrants: [] };
    if (!name) game.name = 'バトルロワイヤル';
  }
  if (opts.mode === 'conquest') initConquest(game, opts, name);
  for (const c of Object.keys(CHARACTERS)) game.chars[c] = { level: startLv, exp: 0 };
  if (opts.trial) {
    // お試しモード：装備づくりもすぐ試せるように、素材とお金を多めに
    for (const k of Object.keys(game.resources.kingdom.materials)) game.resources.kingdom.materials[k] = 20;
    game.resources.kingdom.gold = 3000;
  }
  return game;
}

export function newTroop(game, type, q, hp = UNIT_MAX) {
  return { uid: 't' + (++game.troopCount), type, q, hp, max: UNIT_MAX };
}

export function addGeneral(game, g) {
  const id = g.charId || ('g' + (++game.genCount));
  const gen = { id, status: 'active', controller: 'ai', troops: [], ...g };
  if (gen.charId) {
    gen.name = CHARACTERS[gen.charId].name;
    gen.hp = gameStats(game, gen.charId).hp;
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
  if (isConquest(game)) return controllerOf(game, gen.side);
  if (gen.side === 'demon') return game.players.yagyu ? 'yagyu' : 'ai';
  if (gen.kind === 'hero' && game.players[gen.charId]) return gen.charId;
  if (gen.kind === 'soldier' && gen.owner && game.players[gen.owner]) return gen.owner;
  return 'ai';
}

function refreshControllers(game) {
  for (const g of Object.values(game.generals)) if (!g.temp) g.controller = controllerFor(game, g);
}

export function join(game, role, name) {
  if (game.mode === 'royale') return joinRoyale(game, role, name);
  if (isConquest(game)) return joinConquest(game, role, name);
  if (!ROLES.includes(role)) throw new Error('その役はありません');
  if (game.players[role]) throw new Error('その役はもう選ばれています');
  if (game.phase === 'ended') throw new Error('もう決着しています');
  const token = randomHex(12);
  // あいことば：別のパソコンや、URLが変わったあとでも、自分の役に戻るための4けたの数字
  const code = randomCode();
  game.players[role] = { name: (name || '').slice(0, 20) || CHARACTERS[role].name, token, code };
  if (game.phase !== 'lobby') {
    refreshControllers(game);
    game.log.push(`${game.players[role].name} が ${CHARACTERS[role].name} として参加`);
  }
  return token;
}

// あいことばで自分の役に戻る（まちがいが続いたら少し待たせる）
const wrong = new Map();
export function rejoin(game, role, code) {
  const key = game.id + ':' + role;
  const w = wrong.get(key) || { n: 0, until: 0 };
  if (Date.now() < w.until) throw new Error('まちがいが多いので、1分ほど待ってからもう一度ためしてください');
  const p = game.players[role];
  if (!p || String(code).trim() !== p.code) {
    w.n++;
    if (w.n >= 5) { w.n = 0; w.until = Date.now() + 60000; }
    wrong.set(key, w);
    throw new Error('あいことばがちがいます');
  }
  wrong.delete(key);
  return p.token;
}

export function roleOf(game, token) {
  if (!token) return null;
  for (const r of Object.keys(game.players)) if (game.players[r]?.token === token) return r;
  return null;
}

export function start(game) {
  if (game.phase !== 'lobby') throw new Error('もう始まっています');
  if (game.mode === 'royale') return startRoyale(game);
  if (isConquest(game)) { startConquest(game); resetOrders(game); return; }
  // 人が1人でもいれば始められる。いない役はAIが動かす
  if (!ROLES.some(r => game.players[r]) && !game.allowNoHumans) throw new Error('だれも参加していません');
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
  for (const r of humanRoles(game)) { game.orders[r] = isConquest(game) ? { moves: {}, acts: [], diplo: [] } : { moves: {}, acts: {}, globals: [] }; game.ready[r] = false; }
}

// ---- 命令 ----
// orders = { moves: {genId: tid}, acts: {genId|'tid:N': {type, tid}}, globals: [{type, charId}] }
export function setOrders(game, role, orders) {
  if (game.phase !== 'day') throw new Error('今は命令を出せません');
  if (isConquest(game)) return setConquestOrders(game, role, orders);
  const clean = { moves: {}, acts: {}, globals: [] };
  for (const [gid, tid] of Object.entries(orders.moves || {})) {
    const g = game.generals[gid];
    if (!g || g.status !== 'active' || g.controller !== role || g.kind === 'queen') continue;
    if (!neighbors(g.location, g.side, game.closed).includes(tid)) continue;
    clean.moves[gid] = tid;
  }
  if (role === 'yagyu') {
    const max = demonActionCount(game);
    let n = 0;
    for (const a of Object.values(orders.acts || {})) {
      const D = DEMON_ACTIONS[a.type];
      if (n >= max || !D || D.global || D.heroTarget) continue;
      // 魔物を送る先は王国の陣地、それ以外は魔族の陣地
      if (game.territories[a.tid]?.owner !== (D.enemy ? 'kingdom' : 'demon')) continue;
      if (a.type === 'build' && (FACILITIES[a.facility]?.side !== 'demon' || !canRemodel(a.tid))) continue;
      clean.acts['t' + a.tid + '_' + n] = { type: a.type, tid: a.tid, ...(a.type === 'build' ? { facility: a.facility } : {}) }; n++;
    }
    for (const a of orders.globals || []) {
      if (n >= max) continue;
      if (a.type === 'levelup' && CHARACTERS[a.charId]?.side === 'demon') { clean.globals.push({ type: 'levelup', charId: a.charId }); n++; }
      if (a.type === 'curse' && HERO_ROLES.includes(a.charId)) { clean.globals.push({ type: 'curse', charId: a.charId }); n++; }
    }
  } else {
    // 勇者は自分の兵の武将に内政をさせられる（その日は動かない）
    for (const [gid, a] of Object.entries(orders.acts || {})) {
      const g = game.generals[gid];
      if (!g || g.kind !== 'soldier' || g.controller !== role || g.status !== 'active') continue;
      if (!KINGDOM_ACTIONS[a.type] || KINGDOM_ACTIONS[a.type].queenOnly) continue;
      if (clean.moves[gid] !== undefined) continue;
      if (a.type === 'craft' && !RECIPES[a.recipe]) continue;
      if (a.type === 'build' && (FACILITIES[a.facility]?.side !== 'kingdom' || !canRemodel(g.location))) continue;
      clean.acts[gid] = { type: a.type, tid: g.location, ...(a.type === 'craft' ? { recipe: a.recipe } : {}), ...(a.type === 'build' ? { facility: a.facility } : {}) };
    }
  }
  game.orders[role] = clean;
  game.ready[role] = false;
}

export function incidentChoice(game, role, id, choice) {
  if (game.phase !== 'day') throw new Error('今は選べません');
  chooseIncident(game, role, id, choice);
}

export function setReady(game, role, ready) {
  if (game.phase !== 'day') throw new Error('今は準備できません');
  game.ready[role] = !!ready;
  if (humanRoles(game).every(r => game.ready[r])) resolveDay(game);
}

// ---- 強さの見積もり（AI用） ----
export function genStrength(game, g) {
  let s = 0;
  if (g.charId) {
    const st = gameStats(game, g.charId);
    s += g.hp * Math.max(st.atk, st.mag) / 30;
  }
  for (const t of g.troops) s += t.hp;
  return s;
}
export function territoryStrength(game, tid, side) {
  let s = 0;
  const t = game.territories[tid];
  // 守備隊として戦えるのは3部隊（900人）まで
  if (t.owner === side) {
    const T = TERRITORIES[tid];
    const walls = ['fortress', 'metropolis', 'capital', 'castle'].includes(T.size) || t.facility === 'fort' || t.facility === 'rock';
    s += Math.min(t.garrison, 900) * (1 + t.defense / 200) * (walls ? 1.4 : 1);
  }
  for (const g of Object.values(game.generals)) if (g.status === 'active' && g.location === tid && g.side === side) s += genStrength(game, g);
  return s;
}

// お金・食料・魔力は res に、素材は res.materials にある
export function payCost(res, cost) {
  const pool = (k) => (k in MATERIALS ? res.materials : res);
  for (const [k, v] of Object.entries(cost)) if ((pool(k)[k] || 0) < v) return false;
  for (const [k, v] of Object.entries(cost)) pool(k)[k] -= v;
  return true;
}
function payBack(res, cost) {
  for (const [k, v] of Object.entries(cost)) (k in MATERIALS ? res.materials : res)[k] += v;
}
const soldiersOf = (game, hero) => Object.values(game.generals).filter(g => g.kind === 'soldier' && g.owner === hero).length;
export const canPay = (res, cost) => Object.entries(cost).every(([k, v]) => ((k in MATERIALS ? res.materials : res)[k] || 0) >= v);

function doInternal(game, side, type, tid, by, extra) {
  const res = game.resources[side];
  const t = game.territories[tid];
  const T = TERRITORIES[tid];
  const S = SIZES[T.size];
  const A = (side === 'kingdom' ? KINGDOM_ACTIONS : DEMON_ACTIONS)[type];
  const cost = actionCost(game, side, type, extra?.recipe || extra?.facility);
  if (type === 'build' && (!FACILITIES[extra?.facility] || FACILITIES[extra.facility].side !== side || !canRemodel(tid) || t.owner !== side)) return false;
  if (type === 'build' && t.facility === extra.facility) return false;
  if ((type === 'gearWeapon' && res.gearWeapon >= GEAR_MAX) || (type === 'gearArmor' && res.gearArmor >= GEAR_MAX)) return false;
  if (!payCost(res, cost)) { game.log.push(`${by}：${A.workshop ? '' : T.name + 'で'}${A.name}…お金や素材が足りない`); return false; }
  switch (type) {
    case 'gearWeapon': res.gearWeapon++; game.log.push(`${by}：兵の武器が良くなった（Lv${res.gearWeapon}）`); break;
    case 'gearArmor': res.gearArmor++; game.log.push(`${by}：兵の防具が良くなった（Lv${res.gearArmor}）`); break;
    case 'craft': {
      const r = RECIPES[extra.recipe];
      game.gear[extra.hero] ||= {};
      const before = gameStats(game, extra.hero).hp;
      game.gear[extra.hero][r.slot] = extra.recipe;
      const g = game.generals[extra.hero];
      if (g && g.status === 'active') g.hp += Math.max(0, gameStats(game, extra.hero).hp - before);
      game.log.push(`${by}：${CHARACTERS[extra.hero].name}の「${recipeName(extra.recipe, extra.hero)}」ができた`);
      break;
    }
    case 'farm': t.farm = Math.min(S.farm * 2, t.farm + 4); break;
    case 'commerce': t.commerce = Math.min(Math.max(S.commerce, 20) * 2, t.commerce + 4); break;
    case 'people': t.pop = Math.min(Math.round(S.pop * 1.5), t.pop + 200); break;
    case 'conscript': {
      const n = Math.min(t.facility === 'barracks' ? 250 : 150, t.pop - 200, garrisonCap(t) - t.garrison);
      if (n <= 0) { game.log.push(`${by}：${T.name}ではこれ以上兵を集められない`); return false; }
      t.pop -= n; t.garrison += n; t.loyalty = Math.max(0, t.loyalty - 2); break;
    }
    case 'fortify': t.defense = Math.min(100, t.defense + 10); break;
    case 'alms': t.loyalty = Math.min(100, t.loyalty + 12); break;
    case 'train': res.training = Math.min(10, res.training + 1); break;
    case 'terror': t.fear = Math.min(100, t.fear + 15); t.pop = Math.max(100, t.pop - 80); break;
    case 'spawn': t.garrison = Math.min(garrisonCap(t), t.garrison + 200); break;
    case 'build':
      if (t.facility) game.log.push(`${T.name}の${FACILITIES[t.facility].name}をこわした`);
      t.facility = extra.facility;
      game.log.push(`${by}：${T.name}を${FACILITIES[extra.facility].name}に作り変えた`);
      break;
    case 'darkFortify': t.defense = Math.min(100, t.defense + 15); break;
    case 'monsters': sendMonsters(game, tid, 250); break;
    case 'monstersBig': sendMonsters(game, tid, 500); break;
    case 'hire':
    case 'summon': {
      // 陣地の兵300人をまとめて、新しい武将にする
      if (t.garrison < 300) { game.log.push(`${by}：${T.name}の兵が300人より少なく、武将を立てられない`); payBack(res, cost); return false; }
      t.garrison -= 300;
      let g;
      if (side === 'kingdom') {
        const owner = extra?.hero || HERO_ROLES.slice().sort((a, b) => soldiersOf(game, a) - soldiersOf(game, b))[0];
        g = addGeneral(game, { name: `${CHARACTERS[owner].name}の兵`, side, kind: 'soldier', owner, location: tid, troops: [newTroop(game, ['spear', 'cavalry', 'archer'][game.genCount % 3], 'kingdom')] });
      } else {
        const names = ['ガル', 'ドラ', 'ベオ', 'ジン', 'モルド', 'ヴァズ', 'グリム', 'ネロ'];
        g = addGeneral(game, { name: `魔将${names[game.genCount % names.length]}`, side, kind: 'majo', location: tid, troops: [newTroop(game, ['orc', 'goat', 'harpy'][game.genCount % 3], 'zako')] });
      }
      g.controller = controllerFor(game, g);
      game.log.push(`${by}：${T.name}に新しい武将「${g.name}」が来た`);
      break;
    }
  }
  return true;
}

// ---- AI ----
function aiOrders(game) {
  const acts = [];
  // 王国のAI武将：兵の武将は内政、勇者たちは一緒に攻める
  const aiGens = Object.values(game.generals).filter(g => g.status === 'active' && g.side === 'kingdom' && g.controller === 'ai' && g.kind !== 'queen' && !g.temp);
  // 前線にいる兵の武将は戦いに加わり、うしろの兵の武将は内政をする
  const atFront = (g) => neighbors(g.location, 'kingdom', game.closed).some(n => game.territories[n].owner !== 'kingdom');
  const fighters = aiGens.filter(x => x.kind !== 'soldier' || atFront(x));
  // 魔族の陣地が3つ以下になったら、魔王城へ総攻撃
  const siege = game.territories.filter(t => t.owner === 'demon').length <= 3;
  const moves = planMoves(game, 'kingdom', fighters, siege ? 0.9 : 1.3);
  for (const g of aiGens.filter(x => x.kind === 'soldier' && moves[x.id] === undefined)) {
    const t = game.territories[g.location];
    const S = SIZES[TERRITORIES[g.location].size];
    acts.push({ gid: g.id, type: t.garrison < S.garrison * 0.6 ? 'conscript' : (game.resources.kingdom.food < 600 ? 'farm' : (game.day % 2 ? 'commerce' : 'farm')), tid: g.location });
  }
  return { moves, acts };
}

// 自分の陣地だけを通って、条件に合う一番近い陣地へ向かう最初の一歩
export function stepToward(game, g, ok) {
  const side = g.side;
  if (ok(g.location) && game.territories[g.location].owner === side) return null;
  const prev = new Map([[g.location, null]]);
  const q = [g.location];
  while (q.length) {
    const c = q.shift();
    for (const n of neighbors(c, side, game.closed)) {
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

// のぞちちの工房：お金に余裕があれば、兵の装備と、AIが動かす勇者の装備を作る
function queenWorkshop(game) {
  const res = game.resources.kingdom;
  if (res.gold < 200) return;
  for (const hero of HERO_ROLES) {
    if (game.generals[hero]?.controller !== 'ai') continue;
    const gear = game.gear[hero] || {};
    for (const slot of ['weapon', 'armor']) {
      const cur = gear[slot] ? RECIPES[gear[slot]].tier : 0;
      const next = Object.entries(RECIPES).filter(([, r]) => r.slot === slot && r.tier > cur && canPay(res, r.cost)).sort((a, c) => c[1].tier - a[1].tier)[0];
      if (next && res.gold - next[1].cost.gold >= 100) { doInternal(game, 'kingdom', 'craft', 0, 'のぞちち', { recipe: next[0], hero }); return; }
    }
  }
  const kind = res.gearWeapon <= res.gearArmor ? 'gearWeapon' : 'gearArmor';
  const cost = actionCost(game, 'kingdom', kind);
  if (res[kind] < GEAR_MAX && canPay(res, cost) && res.gold - cost.gold >= 100) doInternal(game, 'kingdom', kind, 0, 'のぞちち');
}

// のぞちちの作り変え：5日に1回、お金に余裕があれば。前線は砦、それ以外は市場か畑
function queenBuild(game) {
  const res = game.resources.kingdom;
  if (game.day % 5 !== 0 || res.gold < 600) return;
  const mine = game.territories.filter(t => t.owner === 'kingdom' && canRemodel(t.id) && !t.facility);
  const front = mine.filter(t => neighbors(t.id, 'demon').some(m => game.territories[m].owner === 'demon'));
  const t = front[0] || mine.sort((a, b) => b.commerce + b.farm - a.commerce - a.farm)[0];
  if (!t) return;
  const facility = front.includes(t) ? 'fort' : (t.commerce >= t.farm ? 'market' : 'farm');
  doInternal(game, 'kingdom', 'build', t.id, 'のぞちち', { facility });
}

function queenInternal(game) {
  queenWorkshop(game);
  queenBuild(game);
  // お金に余裕があれば、王都で兵の武将を雇う
  const soldiers = Object.values(game.generals).filter(g => g.side === 'kingdom' && g.kind === 'soldier').length;
  if (game.resources.kingdom.gold > 400 && soldiers < 8 && game.territories[0].owner === 'kingdom' && game.territories[0].garrison >= 600) doInternal(game, 'kingdom', 'hire', 0, 'のぞちち');
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
  if (isConquest(game)) return resolveConquestDay(game);
  game.log.push(`== ${game.day}日目の結果 ==`);
  // 人のいない陣営は、AIが命令とできごとの対応を決める
  if (!game.players.yagyu) { game.orders.yagyu = demonAIOrders(game); aiIncidentChoices(game, 'demon'); }
  if (!HERO_ROLES.some(h => game.players[h])) aiIncidentChoices(game, 'kingdom');
  resolveIncidents(game);
  const ai = aiOrders(game);
  const moves = { ...ai.moves };
  const kActs = ai.acts.slice();
  for (const r of ROLES) {
    const o = game.orders[r];
    if (!o) continue;
    Object.assign(moves, o.moves);
    if (r === 'yagyu') {
      for (const a of Object.values(o.acts)) doInternal(game, 'demon', a.type, a.tid, 'ヤギュー', { facility: a.facility });
      for (const a of o.globals) {
        if (a.type === 'curse') {
          if (!payCost(game.resources.demon, DEMON_ACTIONS.curse.cost)) { game.log.push('魔力が足りず、呪いをかけられない'); continue; }
          game.injuries ||= {};
          game.injuries[a.charId] = Math.max(game.injuries[a.charId] || 0, game.day + 3);
          game.log.push(`ヤギューの呪いが${CHARACTERS[a.charId].name}にかかった（3日）${a.charId === 'noguchi' && game.chars.noguchi.level >= 10 ? '…が、野口は何も感じていない（無感情）' : ''}`);
          continue;
        }
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
    if (g && g.status === 'active' && game.territories[g.location].owner === 'kingdom') doInternal(game, 'kingdom', a.type, g.location, g.name, { recipe: a.recipe, hero: g.owner, facility: a.facility });
  }
  queenInternal(game);

  // すれ違い：向かい合って動いた敵同士は、遅い方が足止めされる
  const entries = Object.entries(moves);
  for (const [ga, ta] of entries) {
    for (const [gb, tb] of entries) {
      const A = game.generals[ga], B = game.generals[gb];
      if (A.side !== B.side && ta === B.location && tb === A.location && moves[ga] !== undefined && moves[gb] !== undefined) {
        const sa = A.charId ? gameStats(game, A.charId).spd : 6;
        const sb = B.charId ? gameStats(game, B.charId).spd : 6;
        delete moves[sa >= sb ? gb : ga];
      }
    }
  }
  const touched = new Set();
  for (const [gid, tid] of Object.entries(moves)) {
    const g = game.generals[gid];
    if (!g || g.status !== 'active' || !neighbors(g.location, g.side, game.closed).includes(tid)) continue; // 大雨・大雪で道が通れなくなった
    g.prevLocation = g.location;
    g.location = tid;
    g.moved = true;
    touched.add(tid);
  }
  game.pending = [...touched].sort((a, b) => a - b);
  processPending(game);
}

// 合戦・占領が必要か調べて、必要なら次の合戦を始める
export function processPending(game) {
  while (game.pending.length) {
    const tid = game.pending[0];
    const c = isConquest(game) ? conquestConflictAt(game, tid) : conflictAt(game, tid);
    if (!c) { game.pending.shift(); continue; }
    if (c.capture) { capture(game, tid, c.side, c.gens); continue; }
    beginBattle(game, c);
    return;
  }
  endOfDay(game);
}

export function gensAt(game, tid) {
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
  b.support = isConquest(game) ? null : queenSupportFor(game, b);
  if (isConquest(game)) b.sideNames = { [b.attackerSide]: factionName(game, b.attackerSide), [b.defenderSide]: factionName(game, b.defenderSide) };
  b.stage = Object.keys(b.pending).length ? 'commander' : 'fight';
  if (b.stage === 'fight') startBattle(b);
  progress(game);
}

// のぞちちの援護が届くか：女王が王都にいて、戦場が王国の補給線（またはそのとなり）にあること
function queenSupportFor(game, b) {
  const q = game.generals.nozomi;
  if (b.attackerSide !== 'kingdom' && b.defenderSide !== 'kingdom') return null;
  if (b.territoryId === 0 || !q || q.status !== 'active' || game.territories[0].owner !== 'kingdom') return null;
  const supplied = suppliedSet(game, 'kingdom');
  const tid = b.territoryId;
  if (!supplied.has(tid) && !neighbors(tid, 'kingdom').some(n => supplied.has(n))) {
    b.log.push('補給線が届かず、のぞちちの援護は来ない');
    return null;
  }
  const st = gameStats(game, 'nozomi');
  b.log.push('のぞちちの援護が届く（1ターン目から2ターンごと・最大3回）');
  return {
    left: 3, next: 1, budget: Math.min(game.resources.kingdom.gold, 300), spent: 0, history: [],
    reinforce: game.territories[0].garrison >= 600, atk: st.atk, mag: st.mag,
  };
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
    // 群雄割拠では、AIどうしの合戦は画面に出さずにすぐ終わらせる（合戦が多いので）
    if (b.stage === 'done' && b.auto && isConquest(game)) {
      if (b.kind === 'pursuit') mergePursuit(game);
      concludeBattle(game);
      return;
    }
    return;
  }
}

// 決着のあと：退却（しんがり）→ 追撃するか → 速さ比べ → 追撃戦
function enterAftermath(game) {
  const b = game.battle;
  if (b.kind === 'pursuit' || b.kind === 'royale') { b.stage = 'done'; return; }
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
  b.log.push(`${b.sideNames?.[loser] ?? (loser === 'kingdom' ? '王国' : loser === 'demon' ? '魔族' : '中立')}は退却する`);
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
      if (b.kind === 'royale') { finishRoyale(game); return; }
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
  const before = gameStats(game, charId);
  c.level++;
  const after = gameStats(game, charId);
  const g = game.generals[charId];
  if (g && g.status === 'active') g.hp = Math.min(after.hp, g.hp + (after.hp - before.hp));
  game.log.push(`${CHARACTERS[charId].name} が Lv${c.level} になった`);
}

export function gainExp(game, charId, exp) {
  if (!isConquest(game) && !HERO_ROLES.includes(charId) && charId !== 'horie') return;
  const c = game.chars[charId];
  c.exp += Math.round(exp);
  while (c.level < 30 && c.exp >= expToNext(c.level)) { c.exp -= expToNext(c.level); levelUp(game, charId); }
}

function knockDown(game, g) {
  if (g.temp) return;
  if (!g.charId) { delete game.generals[g.id]; game.log.push(`${g.name} は散り散りになった`); return; }
  g.status = 'down';
  g.location = null;
  const wait = isConquest(game) ? 3 : ({ yagyu: 2, nozomi: 0 }[g.charId] ?? (g.kind === 'hero' ? 3 : 4));
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
      // 本隊が3割を切るほど戦った勇者は、怪我をする（2日）
      else if ((HERO_ROLES.includes(u.charId) || isConquest(game)) && u.hp < u.max * 0.3) {
        game.injuries ||= {};
        game.injuries[u.charId] = Math.max(game.injuries[u.charId] || 0, game.day + 2);
        game.log.push(`${u.name}は怪我をした（2日）`);
      }
      if (u.charId) gainExp(game, u.charId, u.dealt / 2 + u.kills * 25 + (u.role === winRole ? 60 : 20));
    } else {
      const tr = g.troops.find(x => x.uid === u.troopRef);
      if (tr) tr.hp = u.hp;
    }
  }
  b.participants = [...participants];
  // 魔族を倒すと素材が手に入る（王国が戦った合戦だけ）
  if (b.attackerSide === 'kingdom' || b.defenderSide === 'kingdom') {
    const M = game.resources.kingdom.materials;
    const got = { monster: 0, officer: 0 };
    for (const u of b.units) {
      if (u.side !== 'demon') continue;
      if (!u.alive && u.kind === 'troop') got.monster++;
      if (!u.alive && ['car', 'oh', 'kkb'].includes(u.charId)) got.officer++;
      if (u.charId === 'yagyu' && (u.revived || !u.alive)) got.officer += 2;
    }
    M.monster += got.monster; M.officer += got.officer;
    if (got.monster || got.officer) game.log.push(`素材を手に入れた：魔物の素材${got.monster}${got.officer ? `・幹部の素材${got.officer}` : ''}`);
  }
  // のぞちちの援護にかかったお金と、王都の兵
  if (b.support) {
    game.resources.kingdom.gold = Math.max(0, game.resources.kingdom.gold - b.support.spent);
    if (b.support.sentTroops) {
      const back = b.units.filter(u => u.reinforcement && u.alive).reduce((a, u) => a + u.hp, 0);
      game.territories[0].garrison = Math.max(0, game.territories[0].garrison - b.support.sentTroops + back);
    }
  }
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
  game.stats.civLoss[t.owner] = (game.stats.civLoss[t.owner] || 0) + loss;
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

  if (!isConquest(game) && b.generals.defender.includes('nozomi') && game.generals.nozomi.status === 'down') {
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

export function retreat(game, g) {
  const options = neighbors(g.location, g.side, game.closed).filter(n => game.territories[n].owner === g.side);
  const safe = options.filter(n => !gensAt(game, n).some(o => o.side !== g.side));
  const pick = (g.prevLocation !== undefined && safe.includes(g.prevLocation)) ? g.prevLocation : safe[0];
  if (pick === undefined) { game.log.push(`${g.name} は逃げ場がなかった`); knockDown(game, g); return; }
  g.location = pick;
  game.log.push(`${g.name} は${TERRITORIES[pick].name}へ退却`);
}

function capture(game, tid, side, gens) {
  if (isConquest(game)) return conquestCapture(game, tid, side, gens);
  const t = game.territories[tid];
  const T = TERRITORIES[tid];
  const before = t.owner;
  t.owner = side;
  t.garrison = Math.min(t.garrison, 50);
  t.loyalty = 40; t.fear = side === 'demon' ? 50 : 0; t.rebel = 0;
  if (t.facility) { game.log.push(`${T.name}の${FACILITIES[t.facility].name}はこわされた`); t.facility = null; }
  game.log.push(`${T.name} を${side === 'kingdom' ? '王国' : side === 'demon' ? '魔族' : '中立'}が占領（もとは${before === 'kingdom' ? '王国' : before === 'demon' ? '魔族' : '中立'}）`);
  if (side === 'kingdom') {
    const hero = gens.find(g => g.kind === 'hero');
    if (hero) game.reinforcements.push({ tid, owner: hero.charId, day: game.day + 3 });
    for (const g of gens) if (g.charId) gainExp(game, g.charId, 30); // 陣地を取ると経験が入る
  }
}

function recordBattleFlags(game, b) {
  if (isConquest(game)) return;
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
    for (const n of neighbors(c, side, game.closed)) if (!seen.has(n) && game.territories[n].owner === side) { seen.add(n); q.push(n); }
  }
  return seen;
}

function endOfDay(game) {
  if (isConquest(game)) {
    conquestEndOfDay(game);
    if (game.phase === 'ended') return;
    resetOrders(game);
    game.phase = 'day';
    return;
  }
  const R = game.resources;
  const supplied = { kingdom: suppliedSet(game, 'kingdom'), demon: suppliedSet(game, 'demon') };
  // 生産
  const income = { kingdom: { gold: 0, food: 0 }, demon: { food: 0, magic: 0 } };
  for (const t of game.territories) {
    if (t.owner !== 'kingdom' && t.owner !== 'demon') { if (t.damaged > 0) t.damaged--; continue; }
    const mult = t.damaged > 0 ? 0.5 : 1;
    const f = t.facility;
    income[t.owner].food += t.farm * 0.25 * mult * (f === 'farm' ? 1.5 : 1);
    if (t.owner === 'kingdom') income.kingdom.gold += t.commerce * 0.5 * mult * (0.6 + t.loyalty / 150) * (f === 'market' ? 1.5 : 1);
    else income.demon.magic += (t.fear * t.pop / 1000 * 0.07 * mult + (t.id === 28 ? 25 : 0)) * (f === 'fear' ? 1.3 : 1);
    // 恐怖の塔・魔物の巣
    if (f === 'fear') {
      t.fear = Math.min(100, t.fear + 3);
      for (const n of neighbors(t.id, 'demon')) if (game.territories[n].owner === 'demon') game.territories[n].fear = Math.min(100, game.territories[n].fear + 1);
    }
    if (f === 'nest') t.garrison = Math.min(garrisonCap(t), t.garrison + 60);
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
      t.owner = 'neutral'; t.garrison = 300; t.rebel = 0; t.loyalty = 50; t.fear = 0; t.facility = null;
      for (const g of gensAt(game, t.id)) retreat(game, g);
    }
  }
  // ひとりで遊ぶとき：AIの陣営は、むずかしさに合わせて収入が増える
  const aiBonus = { easy: 1, normal: 1.3, hard: 1.7 }[game.difficulty || 'normal'];
  for (const side of ['kingdom', 'demon']) {
    const human = side === 'demon' ? game.players.yagyu : HERO_ROLES.some(h => game.players[h]);
    if (human) continue;
    for (const k of Object.keys(income[side])) income[side][k] *= aiBonus;
  }
  R.kingdom.gold += Math.round(income.kingdom.gold);
  // 特産地から素材が取れる（王国の陣地だけ。戦で荒れていると半分）
  for (const t of game.territories) {
    const sp = TERRITORIES[t.id].specialty;
    if (!sp || t.owner !== 'kingdom') continue;
    const mat = SPECIALTIES[sp].material;
    const n = (MATERIALS[mat].rare ? 1 : 2) * (t.damaged ? 0.5 : 1);
    t.matPart = (t.matPart || 0) + n;
    const whole = Math.floor(t.matPart);
    t.matPart -= whole;
    R.kingdom.materials[mat] += whole;
  }
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
      const st = gameStats(game, g.charId);
      g.hp = Math.min(st.hp, g.hp + Math.round(st.hp * (g.charId === 'yagyu' ? 0.3 : 0.25)));
    }
    for (const x of g.troops) {
      const need = Math.min(t.facility === 'barracks' ? 200 : 100, x.max - x.hp, Math.max(0, t.garrison - 50));
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
    g.hp = gameStats(game, g.charId).hp;
    for (const x of g.troops) x.hp = Math.max(x.hp, 100);
    game.log.push(`${g.name} が${TERRITORIES[home].name}で復活した`);
  }

  // 王国からの増援（勇者が占領した陣地へ、兵の武将が届く）
  game.reinforcements = game.reinforcements.filter(r => {
    if (game.day + 1 < r.day) return true;
    // 援軍は王都の兵から出す（王都の兵が足りなければ来ない）
    if (game.territories[r.tid].owner === 'kingdom' && game.territories[0].garrison < 600) {
      game.log.push(`王都の兵が足りず、${TERRITORIES[r.tid].name}への援軍を送れなかった`);
    } else if (game.territories[r.tid].owner === 'kingdom') {
      game.territories[0].garrison -= 300;
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
  // のぞちちは戦いに出ないので、勇者たちの平均レベルについていく
  game.chars.nozomi.level = Math.max(game.chars.nozomi.level, Math.round(HERO_ROLES.reduce((a, h) => a + game.chars[h].level, 0) / HERO_ROLES.length));
  dailyRecovery(game);
  if (game.log.length > 400) game.log = game.log.slice(-300);
  checkWin(game);
  if (game.phase === 'ended') return;
  game.day++;
  checkEvents(game, eventHelpers(game));
  rollIncidents(game);
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
  if (isConquest(game)) return checkConquestWin(game);
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
  for (const r of game.mode === 'royale' || isConquest(game) ? Object.keys(game.players) : ROLES) players[r] = game.players[r] ? { name: game.players[r].name, ...(r === viewer ? { code: game.players[r].code } : {}) } : null;
  const sideOf = r => (isConquest(game) ? 'f:' + r : r === 'yagyu' ? 'demon' : 'kingdom');
  const orders = {};
  if (viewer) for (const [r, o] of Object.entries(game.orders)) if (sideOf(r) === sideOf(viewer)) orders[r] = o;
  const incidents = (game.incidents || []).filter(i => viewer && i.side === sideOf(viewer));
  return {
    ...game,
    players,
    orders,
    incidents,
    sentMonsters: undefined,
    log: game.log.slice(-80),
    battle: game.battle ? { ...game.battle, log: game.battle.log.slice(-60), parent: game.battle.parent ? { id: game.battle.parent.id } : undefined } : null,
    meta: isConquest(game)
      ? { actions: viewer && game.conquest.factions.includes('f:' + viewer) ? actionCount(game, 'f:' + viewer) : 0, factions: conquestSummary(game) }
      : { demonActions: demonActionCount(game), queenActions: queenActionCount(game) },
  };
}

// テスト用：人の決定もAIのかわりに済ませて、合戦を1歩進める
export function autoBattleStep(game) {
  const b = game.battle;
  if (!b) return;
  if (b.stage === 'commander') battleAction(game, Object.values(b.pending)[0][0], { type: 'commander' });
  else if (b.stage === 'fight') advance(game, true);
  else if (b.stage === 'rearguard') battleAction(game, b.pendingRoles[0], { type: 'rearguard', unitIds: [] });
  else if (b.stage === 'pursue') battleAction(game, b.pendingRoles[0], { type: 'pursue', yes: true });
  else if (b.stage === 'done') battleAction(game, null, { type: 'conclude' });
}

// 古いセーブデータに、あとから増えた項目を足す
export function migrate(game) {
  const K = game.resources.kingdom;
  if (K) {
    K.materials ||= emptyMaterials();
    K.gearWeapon ??= 0;
    K.gearArmor ??= 0;
  }
  game.gear ||= { sumire: {}, noguchi: {}, nanase: {} };
  for (const r of ROLES) if (game.players[r] && !game.players[r].code) game.players[r].code = randomCode();
  game.incidents ||= [];
  game.closed ||= {};
  game.injuries ||= {};
  return game;
}

// テスト用：人がいないゲームで、1日を進める
export function resolveDayForTest(game) {
  if (game.phase === 'day') resolveDay(game);
}

// ---------- バトルロワイヤル ----------

function joinRoyale(game, charId, name) {
  if (!ROYALE_CHARS.includes(charId)) throw new Error('そのキャラは選べません');
  if (game.phase !== 'lobby') throw new Error('もう始まっています');
  if (game.players[charId]) throw new Error('そのキャラはもう選ばれています');
  if (Object.keys(game.players).length >= 8) throw new Error('8人までです');
  const token = randomHex(12);
  game.players[charId] = { name: (name || '').slice(0, 20) || CHARACTERS[charId].name, token, code: randomCode() };
  return token;
}

function startRoyale(game) {
  const humans = Object.keys(game.players);
  if (!humans.length && !game.allowNoHumans) throw new Error('だれも参加していません');
  const R = game.royale;
  R.entrants = humans.map(c => ({ charId: c, name: game.players[c].name, controller: c }));
  // あいている数だけAIを入れる（合わせて2人以上・8人まで）
  const free = ROYALE_CHARS.filter(c => !game.players[c]).sort(() => Math.random() - 0.5);
  const want = Math.min(8, Math.max(2, humans.length + R.bots)) - humans.length;
  for (const c of free.slice(0, want)) R.entrants.push({ charId: c, name: 'AI', controller: 'ai' });
  R.entrants.sort(() => Math.random() - 0.5); // 出てくる場所はばらばら
  const b = createRoyale(game);
  b.auto = !R.entrants.some(e => e.controller !== 'ai');
  game.battle = b;
  game.phase = 'battle';
  game.day = 1;
  startBattle(b);
  progress(game);
}

function finishRoyale(game) {
  const b = game.battle;
  const ranking = royaleRanking(b);
  game.royale.ranking = ranking;
  game.winner = b.result.winner;
  game.phase = 'ended';
  const medal = ['🥇', '🥈', '🥉'];
  game.ending = {
    title: 'バトルロワイヤル 結果',
    lines: [
      { who: null, text: b.result.winner ? `${b.sideNames[b.result.winner]} が最後まで生き残った！` : 'だれも生き残らなかった…' },
      ...ranking.map(r => ({ who: null, text: `${medal[r.place - 1] || '　'} ${r.place}位　${r.name}　（倒した部隊 ${r.kills}）` })),
    ],
  };
  b.stage = 'over';
}
