// ゲーム全体の進行（ふだんの1日・合戦の順番・内政・AI・勝ち負け）
// 乱数（Node でもブラウザでも動く Web Crypto を使う）
export const randomHex = (bytes) => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
export const randomCode = () => String(globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
import {
  TERRITORIES, SIZES, CHARACTERS, HERO_ROLES, ROLES, UNIT_MAX, MAJORITY, troopCap, guardCap, genLead, unitCap, castleOf, EXTRA_CHARS, UNIT_TYPES, REFILL_COST, FOOD_PER,
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
  if (type === 'build') return { ...FACILITIES[extra]?.cost };
  return c;
}

export function demonActionCount(game) {
  // 魔族は陣地が少なくても動けるように、最低2回
  return 2 + Math.floor(ownedCount(game, 'demon') / 4);
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
  // 堀江はLv30固定。たける・ジャックナイフはLv15から。ほかの追加武将も少し育った状態から
  if (!opts.trial) Object.assign(game.chars, { horie: { level: 30, exp: 0 }, takeru: { level: 15, exp: 0 }, jack: { level: 15, exp: 0 }, kotaro: { level: 10, exp: 0 }, takumi: { level: 10, exp: 0 }, sakuya: { level: 10, exp: 0 }, kotone: { level: 12, exp: 0 } });
  if (opts.trial) {
    // お試しモード：装備づくりもすぐ試せるように、素材とお金を多めに
    for (const k of Object.keys(game.resources.kingdom.materials)) game.resources.kingdom.materials[k] = 20;
    game.resources.kingdom.gold = 3000;
  }
  return game;
}

// 部隊。hp は兵の数（兵1人＝HP1）。max は率いる武将の統率で決まる（fitTroops でそろえる）。hp を省くと満タン
export function newTroop(game, type, q, hp = null) {
  return { uid: 't' + (++game.troopCount), type, q, hp, max: hp ?? UNIT_MAX };
}

// 武将の部隊の上限を、今の統率に合わせる（hp が null の部隊は満タンにする）
export function fitTroops(game, gen) {
  for (const t of gen.troops) {
    const pool = gen.kind === 'garrison';
    t.max = pool ? Math.max(t.max, t.hp || 0) : troopCap(game, gen, t.type);
    if (t.hp == null) t.hp = t.max;
    t.hp = Math.min(t.hp, Math.max(t.max, pool ? t.hp : 0));
  }
  if (gen.charId) {
    const cap = guardCap(game, gen);
    if (gen.guard == null) gen.guard = 0;
    gen.guard = Math.min(gen.guard, cap);
  }
}

export function addGeneral(game, g) {
  const id = g.id || g.charId || ('g' + (++game.genCount));
  const gen = { id, status: 'active', controller: 'ai', troops: [], ...g };
  if (gen.charId) {
    gen.name = CHARACTERS[gen.charId].name;
    gen.hp = gameStats(game, gen.charId).hp;
  }
  game.generals[id] = gen;
  fitTroops(game, gen);
  return gen;
}

// 最初の兵（11/5）：勇者はそれぞれ300人（槍150・弓100・騎50）。魔王城は500人（オーク300・山羊騎兵100・ハーピー100）＋ヤギュー
// 追加武将：まだどこにも仕えていない（地図に灰色で出る）。その陣地を取って武将を置くと仲間になる
function placeFreeGenerals(game) {
  const free = (charId, location, status = 'free') => addGeneral(game, { charId, side: 'free', kind: 'extra', status, location, troops: [], guard: 0 });
  free('kotaro', 30);            // 中立の町（月見の町）
  free('takumi', 34);            // 中立の城塞都市（星見の城塞）の屋台
  free('sakuya', null, 'hidden'); // 合戦があったばかりの村・町に現れる
  free('kotone', null, 'hidden'); // 流れ者（5日目から、あちこちを旅する）
}

// 仲間になったときの部隊（王国の兵種か、魔族の兵種か）
const EXTRA_TROOPS = {
  kotaro: [['cavalry'], ['goat']], takumi: [['spear'], ['orc']], sakuya: [['archer'], ['harpy']],
  kotone: [['spear', 'archer'], ['orc', 'harpy']], jack: [[], []], takeru: [['gunner', 'tank', 'fighter'], ['gunner', 'tank', 'fighter']],
};
export function recruitExtra(game, g, side, by) {
  g.side = side;
  g.status = 'active';
  g.kind = 'extra';
  g.master = g.charId === 'kotaro' ? (side === 'kingdom' ? 'sumire' : 'yagyu') : undefined;
  g.owner = side === 'kingdom' ? (g.master || (HERO_ROLES.includes(by?.charId) ? by.charId : by?.owner) || 'sumire') : undefined;
  g.troops = EXTRA_TROOPS[g.charId][side === 'demon' ? 1 : 0].map(t => newTroop(game, t, UNIT_TYPES[t].special ? 'kingdom' : side === 'demon' ? 'zako' : 'kingdom'));
  g.guard = 99999;
  g.hp = gameStats(game, g.charId).hp;
  fitTroops(game, g);
  g.controller = controllerFor(game, g);
  const c = CHARACTERS[g.charId];
  game.log.push(`★ ${c.name}（${c.title}）が${side === 'kingdom' ? '王国' : '魔族'}の仲間になった「${c.quote}」`);
}

// 大都市を守る堀江たち（毎回の合戦で全員満タン。負けても捕虜にならず、いったん退く）
function metroArmy(game) {
  const mk = (id, charId, troops) => addGeneral(game, { id, charId, side: 'neutral', kind: 'metro', temp: true, location: 16, guard: 99999, troops: troops.map(t => newTroop(game, t, 'kingdom')) });
  return [
    mk('m_horie', 'horie', ['spear', 'cavalry', 'archer', 'spear']),
    mk('m_takeru', 'takeru', ['gunner', 'tank', 'fighter']),
    mk('m_jack', 'jack', []),
  ];
}
const metroGuarded = (game, tid) => tid === 16 && game.territories[16].owner === 'neutral' && !game.flags.horieSide && !isConquest(game);

function setupGenerals(game) {
  const K = 'kingdom', D = 'demon';
  const T = (type, q, hp) => newTroop(game, type, q, hp);
  const homes = { sumire: 5, noguchi: 7, nanase: 8 };
  for (const r of HERO_ROLES) {
    addGeneral(game, { charId: r, side: K, kind: 'hero', location: homes[r], guard: 0,
      troops: [T('spear', 'kingdom', 150), T('archer', 'kingdom', 100), T('cavalry', 'kingdom', 50), T('spear', 'kingdom', 0)] });
    addGeneral(game, { name: `${CHARACTERS[r].name}の兵`, side: K, kind: 'soldier', grade: 'low', owner: r, location: homes[r], troops: [T('spear', 'kingdom', 100)] });
  }
  addGeneral(game, { charId: 'nozomi', side: K, kind: 'queen', location: 0, troops: [], guard: 300 });
  addGeneral(game, { charId: 'yagyu', side: D, kind: 'yagyu', location: 28,
    troops: [T('orc', 'guard', 150), T('orc', 'guard', 150), T('goat', 'guard', 100), T('harpy', 'guard', 100), T('harpy', 'guard', 0)] });
  addGeneral(game, { charId: 'car', side: D, kind: 'officer', location: 28, guard: 100, troops: [T('harpy', 'officer', 100), T('goat', 'officer', 0)] });
  addGeneral(game, { charId: 'oh', side: D, kind: 'officer', location: 28, guard: 100, troops: [T('orc', 'officer', 100), T('goat', 'officer', 0)] });
  addGeneral(game, { charId: 'kkb', side: D, kind: 'officer', location: 28, guard: 100, troops: [T('orc', 'officer', 100), T('orc', 'officer', 0)] });
  addGeneral(game, { name: '魔将ボルグ', side: D, kind: 'majo', grade: 'mid', location: 28, troops: [T('goat', 'zako', 150)] });
  addGeneral(game, { name: '魔将ザザ', side: D, kind: 'majo', grade: 'mid', location: 28, troops: [T('orc', 'zako', 150)] });
}

// 武将を誰が動かすか
export function controllerFor(game, gen) {
  if (isConquest(game)) return controllerOf(game, gen.side);
  if (gen.side === 'demon') return game.players.yagyu ? 'yagyu' : 'ai';
  if (gen.kind === 'hero' && game.players[gen.charId]) return gen.charId;
  if (gen.kind === 'extra' && gen.owner && game.players[gen.owner]) return gen.owner;
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
  noteJoin(game, role);
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

// ---- 待機場（始まる前の部屋） ----
// 部屋主：最初に入った人。部屋主が抜けたら、次に入った人が部屋主になる
function pickHost(game) {
  const joined = Object.entries(game.players).filter(([, p]) => p).sort((a, b) => (a[1].seq || 0) - (b[1].seq || 0));
  game.host = joined[0]?.[0] || null;
}
function noteJoin(game, role) {
  game.players[role].seq = (game.joinSeq = (game.joinSeq || 0) + 1);
  if (!game.host || !game.players[game.host]) game.host = role;
}
function removeSeat(game, role) {
  if (game.mode === 'royale' || isConquest(game)) delete game.players[role];
  else game.players[role] = null;
  if (game.host === role) pickHost(game);
}
// 抜ける：自分の枠から出る
export function leave(game, role) {
  if (game.phase !== 'lobby') throw new Error('始まったあとは抜けられません');
  if (!game.players[role]) throw new Error('その枠にはだれもいません');
  removeSeat(game, role);
}
// 枠を空ける：部屋主だけ。ほかの人がいる枠を空ける
export function kick(game, byRole, role) {
  if (game.phase !== 'lobby') throw new Error('始まったあとは枠を空けられません');
  if (game.host !== byRole) throw new Error('枠を空けられるのは部屋主だけです');
  if (role === byRole) throw new Error('自分の枠は「抜ける」で出てください');
  if (!game.players[role]) throw new Error('その枠にはだれもいません');
  removeSeat(game, role);
}
// 部屋を解散：部屋主だけ（消すのは呼ぶ側）
export function canDisband(game, role) {
  if (game.host !== role) throw new Error('解散できるのは部屋主だけです');
  return true;
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
  placeFreeGenerals(game);
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
      if (a.type === 'curse' && HERO_ROLES.includes(a.charId)) { clean.globals.push({ type: 'curse', charId: a.charId }); n++; }
    }
  } else {
    // 勇者は自分の兵の武将に内政をさせられる（その日は動かない）
    for (const [gid, a] of Object.entries(orders.acts || {})) {
      const g = game.generals[gid];
      if (!g || (g.kind !== 'soldier' && g.kind !== 'hero') || g.controller !== role || g.status !== 'active') continue;
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

// ---- 編成：部隊ごとの兵種と人数を決める ----
// plan = { guard: 人数, troops: [{ type, want }] }。今いる自分の陣地の兵と入れかえる
//  ・人数を減らすと、余った兵は陣地にもどる。増やすと陣地の兵から入る（補充のお金がかかる・新兵になる）
//  ・兵種を変えると、その部隊の兵は新しい兵種の新兵になる（装備代として補充と同じお金がかかる）
//  ・決めた人数は覚えておき、毎日の補充もそこまでにする
const KINGDOM_TYPES = ['spear', 'archer', 'cavalry'];
const DEMON_TYPES = ['orc', 'harpy', 'goat'];
export function typeChoices(gen) {
  const demonish = gen.side === 'demon' || gen.troops.some(t => UNIT_TYPES[t.type]?.side === 'demon');
  return demonish ? DEMON_TYPES : KINGDOM_TYPES;
}
export function organize(game, role, genId, plan = {}) {
  if (game.phase !== 'day') throw new Error('編成は、ふだんの日にだけできます');
  const g = game.generals[genId];
  if (!g || g.status !== 'active' || g.controller !== role) throw new Error('あなたの武将ではありません');
  const t = game.territories[g.location];
  if (t.owner !== g.side) throw new Error('自分の陣地にいるときだけ編成できます');
  fitTroops(game, g);
  const R = game.resources[g.side];
  const pay = g.side === 'demon' ? 'food' : 'gold';
  const keep = (g.location === 0 && t.owner === 'kingdom') ? 2000 : 0;
  const choices = typeChoices(g);
  const cost = (type, n) => Math.ceil(n * (REFILL_COST[type] || 0.15));
  // まず、減らす・兵種を変える部隊の兵を陣地へもどす（お金はまだ使わない）
  const steps = (plan.troops || []).slice(0, g.troops.length).map((p, i) => {
    const x = g.troops[i];
    const special = UNIT_TYPES[x.type].special;
    const type = !special && choices.includes(p.type) ? p.type : x.type;
    const max = troopCap(game, g, type);
    return { x, type, want: Math.max(0, Math.min(max, Math.round(Number(p.want ?? x.hp)) || 0)), max };
  });
  let need = 0;
  for (const s of steps) {
    if (s.type !== s.x.type) need += cost(s.type, Math.min(s.x.hp, s.want));
  }
  if ((R[pay] || 0) < need) throw new Error(`兵種を変えるのに${pay === 'gold' ? 'お金' : '食料'}が${need}いります`);
  for (const s of steps) {
    const x = s.x;
    if (s.type !== x.type) {
      // 兵種がえ：残る兵は新しい兵種の新兵になる
      const stay = Math.min(x.hp, s.want);
      t.garrison += x.hp - stay;
      R[pay] -= cost(s.type, stay);
      x.type = s.type; x.max = s.max; x.hp = stay; x.raw = stay;
    } else if (s.want < x.hp) {
      t.garrison += x.hp - s.want;
      x.hp = s.want;
      x.raw = Math.min(x.raw || 0, x.hp);
    }
    x.want = s.want;
  }
  // 本隊の護衛
  if (g.charId && plan.guard != null && guardCap(game, g) > 0) {
    const want = Math.max(0, Math.min(guardCap(game, g), Math.round(Number(plan.guard)) || 0));
    if (want < (g.guard || 0)) { t.garrison += g.guard - want; g.guard = want; }
    g.guardWant = want;
  }
  // 足りない部隊に、陣地の兵を入れる（補充のお金がかかる）
  const add = (have, want, type) => {
    let n = Math.max(0, Math.min(want - have, t.garrison - keep));
    n = Math.min(n, Math.floor((R[pay] || 0) / (REFILL_COST[type] || 0.15)));
    R[pay] -= cost(type, n);
    t.garrison -= n;
    return n;
  };
  if (g.charId && g.guardWant != null) g.guard = (g.guard || 0) + add(g.guard || 0, g.guardWant, 'guard');
  for (const s of steps) {
    if (UNIT_TYPES[s.x.type].special && g.location !== 16) continue;
    const n = add(s.x.hp, s.want, s.x.type);
    if (n > 0) { s.x.hp += n; s.x.raw = (s.x.raw || 0) + n; }
  }
  game.log.push(`${g.name} の部隊を編成した（${g.troops.map(x => `${UNIT_TYPES[x.type].name}${x.hp}`).join('・')}${g.charId && guardCap(game, g) ? `・本隊${g.guard}` : ''}）`);
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
  // 戦力（兵の数＋本人のHP÷2）に、強さの目安をかける
  if (g.charId) {
    const st = gameStats(game, g.charId);
    const lv = Math.sqrt(Math.max(st.atk, st.mag) / 15);
    s += ((g.guard || 0) + g.hp / 2) * Math.max(1, lv);
  }
  const lead = 1 + genLead(game, g) / 200;
  for (const t of g.troops) s += t.hp * lead * (t.q === 'guard' || t.q === 'officer' ? 1.3 : 1);
  return s;
}
export function territoryStrength(game, tid, side) {
  let s = 0;
  const t = game.territories[tid];
  // 大都市の堀江たち（技なしで約6,250人ぶん）
  if (side === 'neutral' && metroGuarded(game, tid)) s += 6000;
  if (t.owner === side) {
    // 城の守りのぶん、守備兵は強い（落とすには守備兵の1.2〜3倍がいる）
    s += Math.min(t.garrison, 2000) / castleOf(game, tid).take * 0.9;
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

// AIの魔族が、内政の回数とは別に魔力を使うとき
export function doInternalAI(game, type, tid) { return doInternal(game, 'demon', type, tid, 'ヤギュー'); }

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
    case 'farm': t.farm = Math.min(S.farm * 2, t.farm + 6); break;
    case 'commerce': t.commerce = Math.min(Math.max(S.commerce, 20) * 2, t.commerce + 6); break;
    case 'people': t.pop = Math.min(Math.round(S.pop * 1.5), t.pop + 300); break;
    case 'conscript': {
      // 徴兵：1日に1つの陣地で、民の5%まで（兵舎があれば1.5倍）
      const n = Math.min(Math.round(t.pop * 0.05 * (t.facility === 'barracks' ? 1.5 : 1)), t.pop - 200, garrisonCap(t) - t.garrison);
      if (n <= 0) { game.log.push(`${by}：${T.name}ではこれ以上兵を集められない`); return false; }
      t.pop -= n; t.garrison += n; t.loyalty = Math.max(0, t.loyalty - 2); break;
    }
    case 'fortify': t.defense = Math.min(100, t.defense + 10); break;
    case 'alms': t.loyalty = Math.min(100, t.loyalty + 12); t.almsDay = game.day; break;
    case 'train': res.training = Math.min(10, res.training + 1); break;
    case 'terror': t.fear = Math.min(100, t.fear + 15); t.pop = Math.max(100, t.pop - 80); break;
    case 'spawn': t.garrison = Math.min(garrisonCap(t), t.garrison + 150); break;
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
        g = addGeneral(game, { name: `${CHARACTERS[owner].name}の兵`, side, kind: 'soldier', grade: 'mid', owner, location: tid, troops: [newTroop(game, ['spear', 'cavalry', 'archer'][game.genCount % 3], 'kingdom')] });
      } else {
        const names = ['ガル', 'ドラ', 'ベオ', 'ジン', 'モルド', 'ヴァズ', 'グリム', 'ネロ'];
        g = addGeneral(game, { name: `魔将${names[game.genCount % names.length]}`, side, kind: 'majo', grade: 'mid', location: tid, troops: [newTroop(game, ['orc', 'goat', 'harpy'][game.genCount % 3], 'zako')] });
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
  const moves = planMoves(game, 'kingdom', siege ? aiGens.filter(x => x.kind !== 'soldier' || atFront(x) || x.troops.some(t => t.hp > 0)) : fighters, siege ? 0.75 : 1.3, { siege });
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

// のぞちち：お金が余っていたら、ためこまずに兵の強さと数に変える
function queenSpendSurplus(game) {
  const res = game.resources.kingdom;
  let guard = 12;
  while (res.gold > 1200 && guard--) {
    const before = res.gold;
    if (res.training < 10) doInternal(game, 'kingdom', 'train', 0, 'のぞちち');
    else if (res.gearWeapon < GEAR_MAX || res.gearArmor < GEAR_MAX) queenWorkshop(game);
    const soldiers = Object.values(game.generals).filter(g => g.side === 'kingdom' && g.kind === 'soldier').length;
    const big = game.territories.filter(t => t.owner === 'kingdom' && t.id !== 0 && t.garrison >= 500).sort((a, b) => b.garrison - a.garrison)[0];
    if (soldiers < 10 && big && res.gold > 1200 && res.food > 800) doInternal(game, 'kingdom', 'hire', big.id, 'のぞちち');
    const low = game.territories.filter(t => t.owner === 'kingdom' && t.garrison < garrisonCap(t) * 0.4 && t.pop > 1000).sort((a, b) => a.garrison - b.garrison)[0];
    if (low && res.gold > 1200 && res.food > 400) doInternal(game, 'kingdom', 'conscript', low.id, 'のぞちち');
    if (res.gold === before) break;
  }
}

function queenInternal(game) {
  queenWorkshop(game);
  queenBuild(game);
  queenSpendSurplus(game);
  // お金に余裕があれば、王都で兵の武将を雇う
  const soldiers = Object.values(game.generals).filter(g => g.side === 'kingdom' && g.kind === 'soldier').length;
  if (game.resources.kingdom.gold > 400 && game.resources.kingdom.food > 800 && soldiers < 8 && game.territories[0].owner === 'kingdom' && game.territories[0].garrison >= 600) doInternal(game, 'kingdom', 'hire', 0, 'のぞちち');
  const n = queenActionCount(game);
  const res = game.resources.kingdom;
  const mine = game.territories.filter(t => t.owner === 'kingdom');
  const front = mine.filter(t => neighbors(t.id, 'demon').some(m => game.territories[m].owner === 'demon'));
  // 兵が足りない勇者のいる陣地（補充のもとになる兵を集める）
  const needy = HERO_ROLES.map(h => game.generals[h]).filter(h => h && h.status === 'active' && game.territories[h.location]?.owner === 'kingdom'
    && h.troops.reduce((a, t) => a + t.hp, 0) < h.troops.reduce((a, t) => a + t.max, 0) * 0.8 && game.territories[h.location].garrison < 400 && game.territories[h.location].pop > 800);
  for (let i = 0; i < n; i++) {
    let type, tid;
    const low = mine.slice().sort((a, b) => a.loyalty - b.loyalty)[0];
    // 王都は民が多い：近衛（2,000人）より上の兵を集めておくと、勇者たちが補充に戻ってこられる
    const cap0 = game.territories[0];
    if (i === 0 && cap0.owner === 'kingdom' && cap0.garrison < garrisonCap(cap0) - 300 && cap0.pop > 3000 && res.gold > 100 && res.food >= 300) { doInternal(game, 'kingdom', 'conscript', 0, 'のぞちち'); continue; }
    if (needy[i] && res.gold > 150 && res.food >= 300) { doInternal(game, 'kingdom', 'conscript', needy[i].location, 'のぞちち'); continue; }
    const weakFront = front.slice().sort((a, b) => a.garrison / SIZES[TERRITORIES[a.id].size].cap - b.garrison / SIZES[TERRITORIES[b.id].size].cap)[0];
    if (res.food < 800) { type = 'farm'; tid = mine.slice().sort((a, b) => a.farm - b.farm)[0]?.id; }
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
      }
    } else {
      for (const [gid, a] of Object.entries(o.acts)) kActs.push({ gid, ...a });
    }
  }
  for (const a of kActs) {
    const g = game.generals[a.gid];
    if (g && g.status === 'active' && game.territories[g.location].owner === 'kingdom') doInternal(game, 'kingdom', a.type, g.location, g.name, { recipe: a.recipe, hero: g.owner || (g.kind === 'hero' ? g.charId : undefined), facility: a.facility });
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
  if (t.garrison > 0 || metroGuarded(game, tid)) return { territoryId: tid, attackerSide: side, defenderSide: t.owner, attackers: arrivals, defenders: [], garrison: true };
  return { capture: true, side, gens: arrivals };
}

// 陣地の守備兵を、合戦用の部隊にまとめる（1部隊400人まで、5部隊まで。残りは控え）
function garrisonGeneral(game, tid) {
  const t = game.territories[tid];
  const side = t.owner;
  const types = side === 'demon' ? ['orc', 'harpy', 'goat', 'orc', 'harpy'] : ['spear', 'archer', 'spear', 'cavalry', 'archer'];
  const PER = 400;
  const n = Math.min(5, Math.ceil(t.garrison / PER));
  const troops = [];
  let left = t.garrison;
  for (let i = 0; i < n; i++) {
    const hp = Math.min(PER, Math.ceil(left / (n - i)));
    left -= hp;
    troops.push(newTroop(game, types[i], 'zako', hp));
  }
  const gen = addGeneral(game, { name: `${TERRITORIES[tid].name}守備隊`, side, kind: 'garrison', lead: 50, location: tid, troops, temp: true, reserve: left });
  return gen;
}

function beginBattle(game, c) {
  const defenders = c.defenders.slice();
  // 守備隊は、武将が5人に満たないときだけ一緒に戦う
  if (metroGuarded(game, c.territoryId) && c.defenderSide === 'neutral') defenders.push(...metroArmy(game));
  else if (c.garrison && defenders.length < 5 && game.territories[c.territoryId].garrison > 0) {
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
  // のぞちちは王都の城にいるだけ。戦場への援護（薬・魔法・増援）は送らない
  b.support = null;
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
const RANK = { yagyu: 100, nozomi: 90, sumire: 80, noguchi: 79, nanase: 78, horie: 70, kkb: 62, oh: 61, car: 60, kotone: 55, takeru: 54, jack: 50, takumi: 48, sakuya: 47, kotaro: 45, yuki: 30 };

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
  // 高速移動（こうたろ）：速さ比べでは速さ2倍
  const raceSpd = (u) => getStat(b, u, 'spd') * (game.generals[u.genId]?.charId === 'kotaro' ? 2 : 1);
  const pursueSpd = Math.max(0, ...pursuers.map(raceSpd));
  const slipped = flee.filter(u => game.generals[u.genId]?.charId === 'noguchi' || (game.generals[u.genId]?.charId === 'kotaro' && raceSpd(u) > pursueSpd));
  const caught = flee.filter(u => !slipped.includes(u));
  const kkb = pursuers.find(u => u.charId === 'kkb' && (u.level || 1) >= 20);
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
  if (info.slipped.length) b.log.push(`${info.slipped.join('・')}は追っ手をふり切って逃げ切った`);
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
  if (g) fitTroops(game, g);
  game.log.push(`${CHARACTERS[charId].name} が Lv${c.level} になった`);
}

export function gainExp(game, charId, exp) {
  // 勇者・魔族の幹部とヤギュー・追加武将は、合戦の経験でレベルが上がる
  if (!isConquest(game) && !HERO_ROLES.includes(charId) && !EXTRA_CHARS.includes(charId) && !['yagyu', 'car', 'oh', 'kkb'].includes(charId)) return;
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
  g.guard = 0;
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
      // 護衛の兵が先に減る：残りのうち本人のHPのぶんを分ける
      const me = Math.min(Math.max(0, u.hp), u.charMax ?? u.hp);
      g.hp = me;
      g.guard = Math.max(0, u.hp - me);
      if (!u.alive) g.leaderDown = true;
      // 本隊が3割を切るほど戦った勇者は、怪我をする（2日）
      else if ((HERO_ROLES.includes(u.charId) || isConquest(game)) && u.hp < u.max * 0.3) {
        game.injuries ||= {};
        game.injuries[u.charId] = Math.max(game.injuries[u.charId] || 0, game.day + 2);
        game.log.push(`${u.name}は怪我をした（2日）`);
      }
      if (u.charId) gainExp(game, u.charId, u.dealt / 2 + u.kills * 30 + (u.role === winRole ? 80 : 30));
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
      if (g.kind === 'garrison') t.garrison = g.troops.reduce((a, x) => a + x.hp, 0) + (g.reserve || 0);
      delete game.generals[gid];
    }
  }
  // 本人が倒れた武将
  for (const gid of [...b.generals.attacker, ...b.generals.defender]) {
    const g = game.generals[gid];
    if (g && g.leaderDown) { delete g.leaderDown; knockDown(game, g); }
    else if (g && !g.charId && g.troops.every(x => x.hp <= 0)) knockDown(game, g);
  }

  // さくや：合戦があったばかりの村・町に現れる
  const saku = game.generals.sakuya;
  if (saku && (saku.status === 'hidden' || saku.status === 'free') && ['village', 'town'].includes(T.size) && !isConquest(game)) {
    if (saku.status === 'hidden') game.log.push(`${T.name}に、ともしびを持った流れ者が現れた（さくや）`);
    saku.status = 'free'; saku.location = tid;
  }

  // 戦場になった陣地の民と畑
  // 合戦があった陣地は民が1割減る（城攻めなら2割）
  const loss = Math.round(t.pop * (b.siege ? 0.2 : 0.1));
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
// 補給のもと：王国は王都と勇者の町（スミレ・野口・七星）、魔族は魔王城
function suppliedSet(game, side) {
  const homes = (side === 'kingdom' ? [0, 5, 7, 8] : [28]).filter(h => game.territories[h].owner === side);
  const seen = new Set(homes);
  const q = [...homes];
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
    // 収入（お金・食料・魔力）
    income[t.owner].food += t.farm * 0.35 * mult * (f === 'farm' ? 1.5 : 1);
    if (t.owner === 'kingdom') income.kingdom.gold += t.commerce * 0.7 * mult * (0.6 + t.loyalty / 150) * (f === 'market' ? 1.5 : 1);
    // 魔族はレベル上げに魔力を使わなくなったぶん、国が豊か（魔力1.3倍・食料1.2倍）
    else { income.demon.magic += (t.fear * t.pop / 1000 * 0.13 * mult + (t.id === 28 ? 45 : 0)) * (f === 'fear' ? 1.3 : 1); income.demon.food += t.farm * 0.07 * mult; }
    // 恐怖の塔・魔物の巣
    if (f === 'fear') {
      t.fear = Math.min(100, t.fear + 3);
      for (const n of neighbors(t.id, 'demon')) if (game.territories[n].owner === 'demon') game.territories[n].fear = Math.min(100, game.territories[n].fear + 1);
    }
    if (f === 'nest') t.garrison = Math.min(garrisonCap(t), t.garrison + 60);
    if (t.damaged > 0) t.damaged--;
    // 民兵：民の多い陣地は、守備兵が毎日少しずつ増える（上限の4割まで）
    if (t.pop > 500 && t.garrison < garrisonCap(t) * 0.4) t.garrison = Math.min(Math.round(garrisonCap(t) * 0.4), t.garrison + Math.round(t.pop / 200));
    // 民の暮らし
    const S = SIZES[TERRITORIES[t.id].size];
    // 民：食料が足りていれば1日1%増える（施しをした日は2%）
    if (!t.damaged && R[t.owner].food > 0) t.pop = Math.min(Math.round(S.pop * 1.5), Math.round(t.pop * (t.almsDay === game.day ? 1.02 : 1.01)));
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

  // 増量（たくみ）：毎日、兵100人分の食料を余分に食べる
  for (const g of Object.values(game.generals)) {
    if (g.charId !== 'takumi' || g.status !== 'active' || !R[g.side]) continue;
    g.fed = R[g.side].food >= 1;
    if (g.fed) R[g.side].food -= 1;
  }
  // 兵は食料を食べる
  for (const side of ['kingdom', 'demon']) {
    let home = 0, field = 0;
    for (const t of game.territories) if (t.owner === side) home += t.garrison;
    for (const g of Object.values(game.generals)) if (g.side === side && g.status === 'active') field += g.troops.reduce((a, x) => a + x.hp, 0) + (g.guard || 0);
    const eat = Math.ceil(home / FOOD_PER.garrison + field / FOOD_PER.field);
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
    // 陣地の兵から部隊を補充する（入ったばかりの兵は新兵：5日の訓練で一人前）。王都の近衛2,000人は王都から出ない
    fitTroops(game, g);
    const keep = (g.location === 0 && t.owner === 'kingdom') ? 2000 : 50;
    let room = t.facility === 'barracks' ? 300 : 150;
    // 補充にはお金（魔族は食料）がかかる。足りないぶんは補充できない
    const pay = g.side === 'demon' ? 'food' : 'gold';
    const fill = (have, cap, type) => {
      const per = REFILL_COST[type] || 0.15;
      let n = Math.max(0, Math.min(room, cap - have, t.garrison - keep));
      n = Math.min(n, Math.floor((R[g.side][pay] || 0) / per));
      R[g.side][pay] -= Math.ceil(n * per);
      room -= n; t.garrison -= n;
      return n;
    };
    if (g.charId) g.guard = (g.guard || 0) + fill(g.guard || 0, Math.min(guardCap(game, g), g.guardWant ?? Infinity), 'guard');
    for (const x of g.troops) {
      if (UNIT_TYPES[x.type].special && g.location !== 16) continue; // たけるの兵種は大都市でしか補充できない
      const n = fill(x.hp, Math.min(x.max, x.want ?? Infinity), x.type);
      if (n > 0) { x.hp += n; x.raw = (x.raw || 0) + n; }
    }
  }
  // 新兵の訓練：毎日、部隊の上限の2割ずつ一人前になる
  for (const g of Object.values(game.generals)) for (const x of g.troops) if (x.raw) x.raw = Math.max(0, Math.min(x.hp, x.raw - Math.ceil(x.max * 0.2)));

  // 復活
  const homes = { sumire: 5, noguchi: 7, nanase: 8, yagyu: 28, car: 28, oh: 28, kkb: 28, horie: null, yuki: 12 };
  for (const g of Object.values(game.generals)) {
    if (g.status !== 'down' || game.day + 1 < g.respawnDay) continue;
    let home = homes[g.charId];
    if (g.charId === 'horie' || EXTRA_CHARS.includes(g.charId)) home = g.side === 'kingdom' ? 0 : 28;
    if (home === undefined || home === null) continue;
    // 復活地点を取られていたら、自分の陣営の一番大きい陣地で
    if (game.territories[home].owner !== g.side) {
      const alt = game.territories.filter(t => t.owner === g.side).sort((a, b) => b.garrison - a.garrison)[0];
      if (alt) home = alt.id;
    }
    if (game.territories[home].owner !== g.side) {
      if (!g.blockedMsg) { game.log.push(`${g.name} の復活地点（${TERRITORIES[home].name}）が奪われていて復活できない`); g.blockedMsg = true; }
      continue;
    }
    g.status = 'active'; g.location = home; g.blockedMsg = false;
    g.hp = gameStats(game, g.charId).hp;
    fitTroops(game, g);
    for (const x of g.troops) x.hp = Math.max(x.hp, Math.min(100, x.max));
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

  // 追加武将：自分の陣地に、仕えていない武将と自分の武将がいっしょにいたら登用する
  for (const g of Object.values(game.generals)) {
    if (g.status !== 'free' || g.location == null) continue;
    const owner = game.territories[g.location].owner;
    if (owner !== 'kingdom' && owner !== 'demon') continue;
    const by = gensAt(game, g.location).find(x => x.side === owner);
    if (by) recruitExtra(game, g, owner, by);
  }
  // ことね：5日目から、5日ごとにあちこちを旅する（だれにも仕えていないあいだ）
  const kt = game.generals.kotone;
  if (kt && (kt.status === 'hidden' || kt.status === 'free') && game.day >= 5 && game.day % 5 === 0 && !isConquest(game)) {
    const spots = game.territories.filter(t => t.id !== 0 && t.id !== 28 && t.id !== 16).map(t => t.id);
    const pick = spots[(game.day * 7 + 3) % spots.length];
    if (kt.status === 'hidden') game.log.push(`「えー、みんなすごーい」 流れ者のことねが${TERRITORIES[pick].name}にやってきた`);
    kt.status = 'free'; kt.location = pick;
  }

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
    recruit: (charId, side) => { const x = addGeneral(game, { charId, side: 'free', kind: 'extra', status: 'free', location: 16, troops: [] }); recruitExtra(game, x, side, null); return x; },
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
  // 魔族：勇者スミレを倒して、陣地の大半を取る（王国が「ヤギューを倒して大半」なのと同じ形）
  else if (G.sumire.status === 'down' && d >= MAJORITY) { winner = 'demon'; kind = 'heroes'; }
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
  noteJoin(game, charId);
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
