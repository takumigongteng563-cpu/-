// 合戦（戦場画面のターン制バトル）
import {
  TERRITORIES, UNIT_TYPES, QUALITY, CHARACTERS, HERO_ROLES, BATTLE_W, BATTLE_H, MAX_ROUNDS, gameStats, evenStats,
} from '../shared/data.js';
import {
  reachable, targetsFrom, damage, getStat, getRange, reachTiles, isTargetable, unitAt, cheb, inBounds, moveCost, WALL_HP,
} from '../shared/battlecore.js';
import { skillList, skillTargets, areaTiles } from '../shared/skills.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 陣地の地形から戦場を作る
export function makeGrid(terr, { walls, seed }) {
  const rand = rng(seed);
  const g = Array.from({ length: BATTLE_H }, () => Array(BATTLE_W).fill('.'));
  const sprinkle = (ch, rate, x0 = 3, x1 = 13) => {
    for (let y = 0; y < BATTLE_H; y++) for (let x = x0; x < x1; x++) if (rand() < rate) g[y][x] = ch;
  };
  switch (terr.terrain) {
    case 'plain': sprinkle('F', 0.06); sprinkle('H', 0.03); break;
    case 'forest': sprinkle('F', 0.38, 2, 14); break;
    case 'hill': sprinkle('H', 0.18, 4, 15); sprinkle('F', 0.05); break;
    case 'river': {
      for (let y = 0; y < BATTLE_H; y++) { g[y][7] = 'R'; if (rand() < 0.5) g[y][8] = 'R'; }
      const f1 = 1 + Math.floor(rand() * 4), f2 = 6 + Math.floor(rand() * 4);
      g[f1][7] = g[f1][8] = '.'; g[f2][7] = g[f2][8] = '.';
      sprinkle('F', 0.05);
      break;
    }
    case 'mountain': {
      sprinkle('C', 0.28, 3, 14); sprinkle('H', 0.06);
      const row = 3 + Math.floor(rand() * 5);
      for (let x = 0; x < BATTLE_W; x++) { g[row][x] = '.'; }
      break;
    }
    case 'castle': {
      for (let y = 0; y < BATTLE_H; y++) for (let x = 3; x < BATTLE_W; x++) g[y][x] = 'C';
      // 勇者が通れる細い道が2本と、城の前の広場
      let r1 = 2, r2 = 8;
      for (let x = 0; x < BATTLE_W; x++) {
        g[r1][x] = '.'; g[r2][x] = '.';
        if (x > 3 && x % 3 === 0) { r1 = Math.min(4, Math.max(1, r1 + (rand() < 0.5 ? -1 : 1))); g[r1][x] = '.'; }
        if (x > 3 && x % 4 === 0) { r2 = Math.min(9, Math.max(6, r2 + (rand() < 0.5 ? -1 : 1))); g[r2][x] = '.'; }
      }
      for (let y = 1; y < BATTLE_H - 1; y++) for (let x = 12; x < BATTLE_W; x++) if (y >= 3 && y <= 7) g[y][x] = '.';
      for (let y = 0; y < BATTLE_H; y++) g[y][13] = g[y][13] === 'C' ? '.' : g[y][13];
      break;
    }
    case 'capital': {
      for (let y = 0; y < BATTLE_H; y++) for (let x = 0; x < BATTLE_W; x++) g[y][x] = 'S';
      break;
    }
  }
  if (walls) {
    for (let y = 0; y < BATTLE_H; y++) if (y !== 2 && y !== 8) g[y][11] = 'W';
  }
  // 攻める側の出撃地点は平らにする
  for (let y = 0; y < BATTLE_H; y++) for (let x = 0; x < 3; x++) if (g[y][x] !== 'S') g[y][x] = '.';
  return g;
}

export function hasWalls(game, terr) {
  const size = terr.size;
  if (terr.id === 0) {
    // 王都の城壁は、まわりの砦（近衛の砦・白百合の城塞）が王国にあるかぎり残る
    return game.territories[2].owner === 'kingdom' || game.territories[3].owner === 'kingdom';
  }
  const f = game.territories[terr.id].facility;
  return size === 'fortress' || size === 'metropolis' || f === 'fort' || f === 'rock';
}

const COMMANDER_RANK = { yagyu: 100, nozomi: 90, sumire: 80, noguchi: 79, nanase: 78, horie: 70, kkb: 62, oh: 61, car: 60, yuki: 30 };
function commanderRank(gen) {
  if (gen.charId) return COMMANDER_RANK[gen.charId] || 50;
  if (gen.kind === 'majo') return 40;
  if (gen.kind === 'soldier') return 20;
  return 10;
}

function troopUnit(game, gen, troop, side) {
  const t = UNIT_TYPES[troop.type];
  let q = QUALITY[troop.q] || 1;
  let wq = 1, aq = 1;
  // 訓練と兵の装備は、王国（群雄割拠ではどの勢力でも）の兵に効く
  const K = game.resources[side];
  if (K && K.training != null) {
    q *= 1 + 0.04 * K.training;
    wq = 1 + 0.05 * (K.gearWeapon || 0); // 兵の武器
    aq = 1 + 0.05 * (K.gearArmor || 0);  // 兵の防具
  }
  return {
    kind: 'troop', type: troop.type, name: `${gen.name}隊・${t.name}`, label: t.label,
    atk: Math.round(t.atk * q * wq), def: Math.round(t.def * q * aq * (1 + (troop.defBonus || 0))), mag: Math.round(t.mag * q), mdef: Math.round(t.mdef * q),
    spd: t.spd, move: t.move, range: t.range, dmg: t.dmg, tri: t.tri, flyer: !!t.flyer, climber: !!t.climber,
    hp: troop.hp, max: troop.max, troopRef: troop.uid,
  };
}

export function leaderUnit(game, gen) {
  const c = CHARACTERS[gen.charId];
  const level = game.chars[gen.charId]?.level || 1;
  const st = gameStats(game, gen.charId);
  let mot = 1;
  if (gen.charId === 'nanase') mot = game.flags.nanaseMotivation || 1;
  return {
    kind: gen.charId === 'yagyu' ? 'yagyu' : 'char', charId: gen.charId, name: c.name, label: c.label, level,
    atk: Math.round(st.atk * mot), def: st.def, mag: Math.round(st.mag * mot), mdef: st.mdef, spd: st.spd, move: st.move,
    range: c.range, dmg: c.dmg, tri: null, solo: !!c.solo, hp: gen.hp, max: st.hp, isLeaderUnit: true,
    mp: st.mp, maxMp: st.mp,
  };
}

// 合戦の準備
export function createBattle(game, { territoryId, attackerSide, defenderSide, attackers, defenders }) {
  const terr = TERRITORIES[territoryId];
  const walls = hasWalls(game, terr);
  const grid = makeGrid(terr, { walls, seed: game.day * 131 + territoryId * 7 + game.battleCount });
  const battle = {
    id: 'b' + (++game.battleCount), territoryId, attackerSide, defenderSide,
    grid, wallHp: {}, units: [], order: [], idx: -1, round: 0, active: null, log: [], result: null, hits: [],
    dark: [], rain: [], seeds: [], fallen: { kingdom: 0, demon: 0, neutral: 0 },
    generals: { attacker: attackers.slice(0, 5), defender: defenders.slice(0, 5) },
    reserve: { attacker: attackers.slice(5), defender: defenders.slice(5) },
  };
  for (let y = 0; y < BATTLE_H; y++) for (let x = 0; x < BATTLE_W; x++) if (grid[y][x] === 'W') battle.wallHp[x + ',' + y] = WALL_HP;

  let uid = 0;
  for (const role of ['attacker', 'defender']) {
    const side = role === 'attacker' ? attackerSide : defenderSide;
    const gens = battle.generals[role].map(id => game.generals[id]);
    const commander = gens.slice().sort((a, b) => commanderRank(b) - commanderRank(a))[0];
    battle[role + 'Commander'] = commander.id;
    const front = [], back = [];
    for (const gen of gens) {
      const ctrl = gen.controller;
      if (gen.charId) {
        back.push({ ...leaderUnit(game, gen), genId: gen.id, controller: ctrl, isCommander: gen.id === commander.id });
      }
      for (const tr of gen.troops) {
        if (tr.hp <= 0) continue;
        const u = { ...troopUnit(game, gen, tr, side), genId: gen.id, controller: ctrl };
        // キャラのいない武将（兵の武将・魔将・守備隊）が大将なら、その最初の部隊が大将
        if (!gen.charId && gen.id === commander.id && !back.some(b => b.isCommander)) {
          u.isCommander = true; back.push(u);
        } else front.push(u);
      }
    }
    const placeOrder = role === 'attacker' ? [2, 1, 0, 3] : (walls ? [12, 13, 14, 15] : [13, 14, 15, 12]);
    const backOrder = role === 'attacker' ? [0, 1, 2, 3] : (walls ? [14, 15, 13, 12] : [15, 14, 13, 12]);
    const rows = [5, 4, 6, 3, 7, 2, 8, 1, 9, 0, 10];
    const place = (u, cols) => {
      for (const x of cols) for (const y of rows) {
        if (battle.units.some(o => o.x === x && o.y === y)) continue;
        const tile = grid[y][x];
        if (tile === 'C' && side !== 'demon') continue;
        if (tile === 'W' && role !== 'defender') continue;
        u.x = x; u.y = y; return true;
      }
      return false;
    };
    for (const u of [...front, ...back]) {
      Object.assign(u, { id: 'u' + (++uid), side, role, alive: true, dealt: 0, kills: 0, effects: [], used: {}, onceRound: {} });
      if (place(u, back.includes(u) ? backOrder : placeOrder)) battle.units.push(u);
    }
  }
  // 見張り台：ここで守る側は、敵の動きが見えているので先に動ける
  const here = game.territories[territoryId];
  if (here.facility === 'tower' && here.owner === defenderSide) {
    for (const u of battle.units) if (u.role === 'defender') u.spd += 2;
    battle.log.push('見張り台：守る側の速さ+2');
  }
  const names = side => battle.generals[side].map(id => game.generals[id].name).join('・');
  battle.log.push(`【${terr.name}の合戦】 攻め：${names('attacker')} ／ 守り：${names('defender')}`);
  return battle;
}

// ---------- 小さな道具 ----------
const aliveUnits = (b, side) => b.units.filter(u => u.alive && u.side === side);
const findChar = (b, charId) => b.units.find(u => u.alive && u.charId === charId);
const enemiesOf = (b, u) => b.units.filter(x => x.alive && x.side !== u.side);
const alliesOf = (b, u) => b.units.filter(x => x.alive && x.side === u.side);
const lvOK = (u, lv) => (u.level || 1) >= lv;
const asleep = (b, u) => u.sleepUntil != null && b.round <= u.sleepUntil;
const stunned = (b, u) => u.stunFrom != null && b.round >= u.stunFrom && b.round <= u.stunUntil;
const hasTag = (b, u, tag) => u.effects.some(e => e.tag === tag && b.round <= e.until);
const sideName = s => (s === 'kingdom' ? '王国' : s === 'demon' ? '魔族' : '中立');

function addEffect(u, e) { u.effects.push(e); }

// 毒・眠り・呪いは「無感情」の野口には効かない
function ailmentImmune(u) { return u.charId === 'noguchi' && lvOK(u, 10); }

function heal(b, t, amount, label) {
  if (!t.alive || amount <= 0) return 0;
  const before = t.hp;
  t.hp = Math.min(t.max, t.hp + Math.round(amount));
  const got = t.hp - before;
  if (got > 0) b.log.push(`${t.name} が${got}回復${label ? `（${label}）` : ''}`);
  return got;
}

function applyDamage(b, src, t, dmg, label) {
  if (!t.alive) return 0;
  const dealt = Math.min(dmg, t.hp);
  t.hp -= dmg;
  if (src) src.dealt += dealt;
  b.hits.push({ to: t.id, dmg });
  b.log.push(src ? `${src.name}${label ? `の${label}` : ''} → ${t.name}：${dmg}` : `${t.name} は${label}で${dmg}減った`);
  if (t.hp <= 0) {
    if (t.charId === 'yagyu' && !t.revived) {
      // 始祖の力：1合戦に1回、HP3割で立ち上がる
      t.revived = true;
      t.hp = Math.round(t.max * 0.3);
      b.log.push('ヤギューが立ち上がった！（始祖の力）');
    } else {
      t.hp = 0;
      t.alive = false;
      if (src) src.kills++;
      b.actionKills = (b.actionKills || 0) + 1;
      b.fallen[t.side] = (b.fallen[t.side] || 0) + 1;
      if (t.charge) t.charge = null;
      b.log.push(`${t.name} が倒れた`);
    }
  }
  return dealt;
}

function pushBack(b, t, dx, dy) {
  if (!t.alive) return;
  const nx = t.x + dx, ny = t.y + dy;
  if (!inBounds(nx, ny) || unitAt(b, nx, ny) || moveCost(b.grid[ny][nx], t, b) === Infinity) return;
  t.x = nx; t.y = ny;
  b.log.push(`${t.name} は押し戻された`);
}

// 1つの相手をねらう攻撃（通常攻撃・単体の技）。かばう・居合い切り・追撃もここで起きる
function strike(b, att, def, opts = {}) {
  if (!opts.noCover) {
    const s = findChar(b, 'sumire');
    if (s && s !== def && s.side === def.side && cheb(s, def) <= 1 && !asleep(b, s) && !stunned(b, s) && s.onceRound.cover !== b.round) {
      s.onceRound.cover = b.round;
      s.cover = Math.min(6, (s.cover || 0) + 1);
      b.log.push(`スミレが${def.name}をかばった！（愛情魂）`);
      def = s;
    }
  }
  if (def.charId === 'sumire' && lvOK(def, 10) && cheb(att, def) <= 1 && def.onceRound.iai !== b.round && !asleep(b, def) && !stunned(b, def)) {
    def.onceRound.iai = b.round;
    applyDamage(b, def, att, damage(b, def, att, { mult: 0.5 }), '居合い切り');
    if (!att.alive) return { target: def, dmg: 0 };
  }
  let dmg = damage(b, att, def, opts);
  if (opts.execute && !def.solo && def.hp <= def.max * 0.3) { dmg = def.hp; b.log.push('一刀両断！'); }
  applyDamage(b, att, def, dmg, opts.label);
  if (def.charge && HERO_ROLES.includes(att.charId)) {
    def.charge = null;
    def.effects = def.effects.filter(e => e.tag !== 'chargeGuard');
    b.log.push(`${def.name}の溜めが消えた`);
  }
  if (att.charId === 'noguchi') att.visibleUntil = b.round + 1;
  if (!opts.noFollow) {
    const car = findChar(b, 'car');
    if (car && car !== att && car.side === att.side && lvOK(car, 10) && car.onceRound.tsui !== b.round && def.alive
      && reachTiles(b, car, getRange(b, car)).some(([x, y]) => x === def.x && y === def.y) && isTargetable(b, car, def)) {
      car.onceRound.tsui = b.round;
      strike(b, car, def, { mult: 0.5, noFollow: true, label: '追撃' });
    }
  }
  return { target: def, dmg };
}

// 範囲攻撃（かばう・追撃は起きない）
function areaDamage(b, u, tiles, opts = {}) {
  let total = 0;
  for (const [x, y] of tiles) {
    const t = unitAt(b, x, y);
    if (t && t.side !== u.side) total += applyDamage(b, u, t, damage(b, u, t, opts), opts.label);
  }
  if (u.charId === 'noguchi') u.visibleUntil = b.round + 1;
  return total;
}

// まっすぐ突進して、最初にぶつかった敵を攻撃する
function dash(b, u, [dx, dy], maxSteps, opts) {
  for (let i = 0; i < maxSteps; i++) {
    const nx = u.x + dx, ny = u.y + dy;
    if (!inBounds(nx, ny)) break;
    const occ = unitAt(b, nx, ny);
    if (occ && occ.side !== u.side) {
      const r = strike(b, u, occ, opts);
      if (opts.push && r.target === occ) pushBack(b, occ, dx, dy);
      return;
    }
    if (occ || moveCost(b.grid[ny][nx], u, b) === Infinity) break;
    u.x = nx; u.y = ny;
  }
  b.log.push(`${u.name} の突進はだれにも当たらなかった`);
}

const lineTiles = (u, [dx, dy], n) => Array.from({ length: n }, (_, i) => [u.x + dx * (i + 1), u.y + dy * (i + 1)]).filter(([x, y]) => inBounds(x, y));

function fireCharge(b, u) {
  const { id, dir } = u.charge;
  u.charge = null;
  u.effects = u.effects.filter(e => e.tag !== 'chargeGuard');
  if (id === 'shogeki') {
    b.log.push(`${u.name} の衝撃波！`);
    areaDamage(b, u, lineTiles(u, dir, 3), { mult: 1.5, label: '衝撃波' });
  } else if (id === 'totsugeki') {
    b.log.push(`${u.name} の突撃！`);
    dash(b, u, dir, 4, { mult: 2.2, label: '突撃' });
  }
}

// ---------- 技を使う ----------
function useSkill(b, u, s, tgt) {
  const r = b.round;
  u.mp -= s.mp;
  if (s.once) u.used[s.id] = true;
  b.log.push(`${u.name} の「${s.name}」`);
  const t = tgt.units?.[0];
  const near = (n, side) => b.units.filter(x => x.alive && (side === 'ally' ? x.side === u.side : x.side !== u.side) && cheb(x, u) <= n);
  switch (s.id) {
    // スミレ
    case 'kirisute': strike(b, u, t, { mult: 1.3, execute: true, label: '切り捨て' }); break;
    case 'tehodoki': addEffect(t, { stat: 'atk', mult: 1.2, until: r + 3, tag: 'tehodoki' }); break;
    case 'tokon':
      u.hp = Math.max(1, u.hp - Math.round(u.max * 0.1));
      strike(b, u, t, { mult: 2, label: '闘魂切り' });
      break;
    case 'yaguri': strike(b, u, t, { mult: t.charId === 'yagyu' ? 3.5 : t.side === 'demon' ? 2.5 : 1, label: '屠羊ノ太刀' }); break;
    // 野口
    case 'iyashi': heal(b, t, getStat(b, u, 'mag') * 4, 'いやしの魔法'); break;
    case 'gunyu':
      for (const x of near(2, 'ally')) { addEffect(x, { stat: 'atk', mult: 1.15, until: r + 2 }); addEffect(x, { stat: 'def', mult: 1.15, until: r + 2 }); }
      break;
    case 'ame': areaDamage(b, u, areaTiles('cross', tgt.x, tgt.y), { mult: 0.9, type: 'mag', label: 'ノ具血之雨' }); break;
    case 'heel':
      for (const x of near(2, 'ally')) {
        heal(b, x, getStat(b, u, 'mag') * 6, 'ハイヒール');
        x.poisonUntil = null; x.sleepUntil = null;
      }
      break;
    case 'saiseiki':
      addEffect(u, { stat: 'mag', mult: 1.5, until: r + 3, tag: 'peak' });
      u.stunFrom = r + 4; u.stunUntil = r + 4;
      break;
    // 七星
    case 'star1': strike(b, u, t, { mult: 0.8, label: 'Ⅰ星' }); break;
    case 'star2': for (const x of tgt.units.slice(0, 2)) if (x.alive) strike(b, u, x, { mult: 0.8, label: 'Ⅱ星' }); break;
    case 'star4': areaDamage(b, u, areaTiles('2x2', tgt.x, tgt.y), { mult: 0.9, label: 'Ⅳ星' }); break;
    case 'star5': areaDamage(b, u, areaTiles('cross', tgt.x, tgt.y), { mult: 1.0, label: 'Ⅴ星' }); break;
    case 'star7': {
      const list = enemiesOf(b, u).sort((a, c) => a.hp / a.max - c.hp / c.max).slice(0, 7);
      for (const x of list) applyDamage(b, u, x, damage(b, u, x, { mult: 1.2 }), 'Ⅶ星');
      break;
    }
    // ヤギュー
    case 'tosshin': dash(b, u, tgt.dir, 4, { mult: 1.6, push: true, label: '突進' }); break;
    case 'hoko':
      for (const x of near(3, 'enemy')) { addEffect(x, { stat: 'atk', mult: 0.85, until: r + 2 }); addEffect(x, { stat: 'def', mult: 0.85, until: r + 2 }); }
      for (const x of near(3, 'ally')) addEffect(x, { stat: 'atk', mult: 1.15, until: r + 2 });
      break;
    case 'mayagi': areaDamage(b, u, areaTiles('sq:1', u.x, u.y), { label: '魔山羊斬' }); break;
    case 'majin':
      addEffect(u, { stat: 'atk', mult: 1.4, until: r + 3, tag: 'majin' });
      addEffect(u, { stat: 'spd', mult: 1.4, until: r + 3 });
      break;
    case 'shinka':
      addEffect(u, { stat: 'all', mult: 1.4, until: r + 3, tag: 'shinka' });
      u.stunFrom = r + 4; u.stunUntil = r + 5;
      break;
    // 堀江
    case 'ryoto': strike(b, u, t, { type: 'both', label: '両刀斬り' }); break;
    case 'hashiwatashi': {
      const [a, c] = tgt.units;
      if (!a || !c || a === c) throw new Error('入れ替える味方を2つ選んでください');
      if (moveCost(b.grid[c.y][c.x], a, b) === Infinity || moveCost(b.grid[a.y][a.x], c, b) === Infinity) throw new Error('その場所には行けない部隊がいます');
      [a.x, c.x] = [c.x, a.x]; [a.y, c.y] = [c.y, a.y];
      b.log.push(`${a.name}と${c.name}の位置が入れ替わった`);
      break;
    }
    case 'torinashi': addEffect(t, { tag: 'pacified', until: r + 1 }); b.log.push(`${t.name} は話し合いに応じた（攻撃できない）`); break;
    case 'tenbin': {
      const own = alliesOf(b, u).reduce((a, x) => a + x.hp, 0);
      const opp = enemiesOf(b, u).reduce((a, x) => a + x.hp, 0);
      strike(b, u, t, { mult: 1.5 * Math.min(2, Math.max(1, opp / Math.max(1, own))), label: '天秤の一閃' });
      break;
    }
    // CAR
    case 'kuroi': strike(b, u, t, { mult: 0.8, label: '黒いですカー？' }); if (t.alive) t.markUntil = r + 1; break;
    case 'kurayami': for (const [x, y] of areaTiles('cross', tgt.x, tgt.y)) b.dark.push({ x, y, until: r + 2, side: u.side }); break;
    case 'bighorn': for (const x of near(3, 'ally')) addEffect(x, { stat: 'atk', mult: 1.2, until: r + 2 }); break;
    case 'trashbox': areaDamage(b, u, areaTiles('sq:3', u.x, u.y), { mult: 0.6 + 0.15 * (b.fallen[u.side] || 0), label: 'Trash Box Car' }); break;
    // OH
    case 'suitoru': { const res = strike(b, u, t, { label: '吸い取る' }); heal(b, u, res.dmg / 2, '吸い取る'); break; }
    case 'oen': addEffect(t, { stat: 'atk', mult: 1.2, until: r + 2 }); addEffect(t, { stat: 'def', mult: 1.2, until: r + 2 }); break;
    case 'tane': b.seeds.push({ x: tgt.x, y: tgt.y, round: r, casterId: u.id, side: u.side }); break;
    case 'suigyu': {
      const tiles = lineTiles(u, tgt.dir, 4).reverse(); // 奥から順に押し戻す
      for (const [x, y] of tiles) {
        const e = unitAt(b, x, y);
        if (e && e.side !== u.side) { applyDamage(b, u, e, damage(b, u, e), '水牛'); pushBack(b, e, ...tgt.dir); }
      }
      break;
    }
    case 'suijin': b.rain.push({ side: u.side, until: r + 3 }); b.log.push('雨が降りはじめた'); break;
    // KKB
    case 'girori': addEffect(t, { stat: 'move', add: -1, until: r + 2 }); addEffect(t, { stat: 'atk', mult: 0.85, until: r + 2 }); break;
    case 'shogeki':
    case 'totsugeki':
      u.charge = { id: s.id, dir: tgt.dir };
      if (s.id === 'totsugeki') addEffect(u, { stat: 'def', mult: 1.3, until: r + 5, tag: 'chargeGuard' });
      if (u.instantCharge) { u.instantCharge = false; fireCharge(b, u); }
      else b.log.push(`${u.name} は力を溜めている…`);
      break;
    case 'kyoho': {
      addEffect(t, { stat: 'move', add: -1, until: r + 1 });
      const i = b.order.indexOf(t.id);
      if (i > b.idx) { b.order.splice(i, 1); b.order.push(t.id); } else t.lastRound = r + 1;
      b.log.push(`${t.name} はウソの知らせに惑わされた`);
      break;
    }
    case 'kittanai':
      for (const x of near(2, 'enemy')) addEffect(x, { stat: 'def', mult: 0.7, until: r + 2 });
      u.instantCharge = true;
      break;
    // のぞちち
    case 'doku': if (ailmentImmune(t)) b.log.push(`${t.name} には効かない`); else t.poisonUntil = r + 3; break;
    case 'bakuhatsu': areaDamage(b, u, areaTiles('3x3', tgt.x, tgt.y), { mult: 0.8, type: 'mag', label: '爆発の薬' }); break;
    case 'nemuri': if (ailmentImmune(t)) b.log.push(`${t.name} には効かない`); else { t.sleepUntil = r + 1; b.log.push(`${t.name} は眠ってしまった`); } break;
    default: throw new Error('この技はまだ使えません');
  }
}

// ---------- ターンのはじめ ----------
function roundStart(b) {
  b.round++;
  const r = b.round;
  b.log.push(`― ${r}ターン目 ―`);
  for (const u of b.units) u.effects = u.effects.filter(e => e.until >= r);
  b.dark = b.dark.filter(d => d.until >= r);
  b.rain = b.rain.filter(d => d.until >= r);
  for (const u of b.units) if (u.alive && u.maxMp) u.mp = Math.min(u.maxMp, u.mp + 2);

  // 種爆弾
  for (const seed of b.seeds.filter(x => x.round < r)) {
    const caster = b.units.find(x => x.id === seed.casterId);
    if (caster && caster.alive) { b.log.push('種爆弾が爆発した！'); areaDamage(b, caster, areaTiles('3x3', seed.x, seed.y), { label: '種爆弾' }); }
  }
  b.seeds = b.seeds.filter(x => x.round >= r);

  for (const u of b.units.filter(x => x.alive)) {
    if (u.charId === 'yagyu') heal(b, u, u.max * 0.03, '始祖の力');
    if (u.poisonUntil != null && r <= u.poisonUntil) applyDamage(b, null, u, Math.max(1, Math.round(u.max * 0.06)), '毒');
    if (u.charId === 'oh' && lvOK(u, 20)) {
      for (const x of b.units) if (x.alive && x.side === u.side && cheb(x, u) <= 1) heal(b, x, x.max * 0.05, '自然の恵み');
    }
    if (b.rain.some(w => w.side === u.side)) heal(b, u, u.max * 0.08, '水神');
    if (u.charId === 'horie' && lvOK(u, 25) && u.effects.filter(e => e.tag === 'nandemo').length < 5) {
      const pick = ['atk', 'def', 'mag'].sort((a, c) => getStat(b, u, a) - getStat(b, u, c))[0];
      addEffect(u, { stat: pick, mult: 1.05, until: 999, tag: 'nandemo' });
    }
    if (u.charId === 'nanase' && u.alive) {
      // 洛星（Ⅲ星で強く、Ⅵ星で2つ）
      const n = lvOK(u, 25) ? 2 : 1;
      const mult = lvOK(u, 10) ? 0.55 : 0.35;
      const list = enemiesOf(b, u).filter(e => cheb(e, u) <= 3).sort((a, c) => a.hp / a.max - c.hp / c.max).slice(0, n);
      for (const e of list) {
        applyDamage(b, u, e, damage(b, u, e, { mult }), '洛星');
        if (lvOK(u, 10) && e.alive) addEffect(e, { stat: 'move', add: -1, until: r });
      }
    }
  }
  if (b.support && b.support.left > 0 && r >= b.support.next) queenSupport(b);
  if (b.kind === 'royale') royaleStorm(b);
  if (checkEnd(b)) return;
  const last = b.units.filter(u => u.lastRound === r).map(u => u.id);
  b.order = b.units.filter(u => u.alive)
    .sort((a, c) => getStat(b, c, 'spd') - getStat(b, a, 'spd') || a.role.localeCompare(c.role) || a.id.localeCompare(c.id))
    .map(u => u.id);
  b.order = [...b.order.filter(id => !last.includes(id)), ...b.order.filter(id => last.includes(id))];
  b.idx = 0;
}

function nextActive(b) {
  let guard = 500;
  while (guard--) {
    b.idx++;
    if (b.idx >= b.order.length) {
      if (b.round >= (b.maxRounds || MAX_ROUNDS)) {
        if (b.kind === 'royale') royaleTimeout(b);
        else finish(b, b.defenderSide, b.kind === 'pursuit' ? '逃げ切った' : '時間切れ。守りきった');
        return;
      }
      roundStart(b);
      if (b.result) return;
    }
    const u = b.units.find(x => x.id === b.order[b.idx]);
    if (!u || !u.alive) continue;
    if (asleep(b, u)) { b.log.push(`${u.name} は眠っている`); continue; }
    if (stunned(b, u)) { b.log.push(`${u.name} は動けない`); continue; }
    if (u.charge) {
      b.hits = [];
      fireCharge(b, u);
      if (checkEnd(b)) return;
      continue;
    }
    b.hits = [];
    b.actionKills = 0;
    b.active = { unitId: u.id, moved: false, ox: u.x, oy: u.y };
    return;
  }
}

export function startBattle(battle) {
  nextActive(battle);
}

function finish(battle, winnerSide, reason) {
  battle.result = { winner: winnerSide, reason };
  battle.active = null;
  const name = battle.sideNames?.[winnerSide] ?? sideName(winnerSide);
  battle.log.push(winnerSide ? `★ ${name}の勝ち（${reason}）` : `★ 勝者なし（${reason}）`);
}

function checkEnd(battle) {
  if (battle.result) return true;
  if (battle.kind === 'royale') return royaleCheck(battle);
  for (const role of ['attacker', 'defender']) {
    const side = role === 'attacker' ? battle.attackerSide : battle.defenderSide;
    const other = role === 'attacker' ? battle.defenderSide : battle.attackerSide;
    const cmd = battle.units.find(u => u.isCommander && u.role === role);
    if (!cmd || !cmd.alive) { finish(battle, other, `${cmd ? cmd.name : '大将'}を倒した`); return true; }
    if (aliveUnits(battle, side).length === 0) { finish(battle, other, '敵が全滅した'); return true; }
  }
  return false;
}

export function activeUnit(battle) {
  return battle.active && battle.units.find(u => u.id === battle.active.unitId);
}

function doAttackWall(battle, att, x, y) {
  const P = att.dmg === 'mag' ? getStat(battle, att, 'mag') : Math.max(getStat(battle, att, 'atk'), att.dmg === 'best' ? getStat(battle, att, 'mag') : 0);
  const dmg = Math.round(P * P / (P + 30) * 4 * (att.solo ? 1 : 0.5 + 0.5 * att.hp / att.max));
  const k = x + ',' + y;
  battle.wallHp[k] -= dmg;
  battle.log.push(`${att.name} が城壁を攻撃：${dmg}`);
  if (att.charId === 'noguchi') att.visibleUntil = battle.round + 1;
  if (battle.wallHp[k] <= 0) {
    battle.grid[y][x] = '.';
    delete battle.wallHp[k];
    battle.log.push('城壁がくずれた');
  }
}

// 行動のあと：殺戮・最盛期なら、もう一度行動できる
function afterAction(b, u) {
  if (checkEnd(b)) return;
  const r = b.round;
  if (u.alive && !stunned(b, u)) {
    if (u.charId === 'sumire' && lvOK(u, 25) && b.actionKills > 0 && u.onceRound.satsuriku !== r) {
      u.onceRound.satsuriku = r;
      b.log.push('スミレの殺戮！ もう一度行動できる');
      b.active = { unitId: u.id, moved: false, ox: u.x, oy: u.y, extra: true, noSkill: true };
      b.actionKills = 0;
      return;
    }
    if (hasTag(b, u, 'peak') && u.onceRound.peak !== r) {
      u.onceRound.peak = r;
      b.log.push('野口の最盛期！ もう一度行動できる');
      b.active = { unitId: u.id, moved: false, ox: u.x, oy: u.y, extra: true };
      b.actionKills = 0;
      return;
    }
  }
  nextActive(b);
}

function resolveSkillTarget(b, u, s, action) {
  const { units, cells } = skillTargets(b, u, s);
  const tgt = {};
  if (s.target === 'enemy' || s.target === 'ally') {
    const t = units.find(x => x.id === action.targetId);
    if (!t) throw new Error('そこには届きません');
    tgt.units = [t];
  } else if (s.target === 'enemy2' || s.target === 'ally2') {
    const ids = [...new Set(action.targetIds || [])];
    const list = ids.map(id => units.find(x => x.id === id));
    if (!list.length || list.some(x => !x)) throw new Error('そこには届きません');
    if (s.target === 'ally2' && list.length !== 2) throw new Error('味方を2つ選んでください');
    tgt.units = list.slice(0, 2);
  } else if (s.target === 'tile') {
    if (!cells.some(([x, y]) => x === action.x && y === action.y)) throw new Error('そこには届きません');
    tgt.x = action.x; tgt.y = action.y;
  } else if (s.target === 'dir') {
    const c = cells.find(([x, y]) => x === action.x && y === action.y);
    if (!c) throw new Error('向きを選んでください');
    tgt.dir = [action.x - u.x, action.y - u.y];
  }
  return tgt;
}

// 人間の操作（AIも同じ道を通る）
export function applyBattleAction(battle, role, action) {
  if (battle.result) throw new Error('合戦は終わっています');
  const u = activeUnit(battle);
  if (!u) throw new Error('今動ける部隊がありません');
  if (role !== null && u.controller !== role) throw new Error('あなたの部隊の番ではありません');
  const a = battle.active;
  const pacified = hasTag(battle, u, 'pacified');
  switch (action.type) {
    case 'move': {
      if (a.moved) throw new Error('もう移動しました');
      if (!reachable(battle, u).some(([x, y]) => x === action.x && y === action.y)) throw new Error('そこへは動けません');
      u.x = action.x; u.y = action.y; a.moved = true;
      return;
    }
    case 'undo':
      u.x = a.ox; u.y = a.oy; a.moved = false;
      return;
    case 'attack': {
      if (pacified) throw new Error('とりなされていて攻撃できません');
      const t = battle.units.find(x => x.id === action.targetId);
      if (!t || !t.alive || !targetsFrom(battle, u, u.x, u.y).units.includes(t)) throw new Error('攻撃が届きません');
      battle.hits = [];
      strike(battle, u, t);
      break;
    }
    case 'attackWall': {
      if (pacified) throw new Error('とりなされていて攻撃できません');
      const { walls } = targetsFrom(battle, u, u.x, u.y);
      if (!walls.some(([x, y]) => x === action.x && y === action.y)) throw new Error('城壁に届きません');
      doAttackWall(battle, u, action.x, action.y);
      break;
    }
    case 'skill': {
      const s = skillList(battle, u).find(x => x.id === action.skillId);
      if (!s) throw new Error('その技はありません');
      if (!s.ok) throw new Error(s.why);
      if (pacified && s.target !== 'ally' && s.target !== 'ally2' && s.target !== 'self') throw new Error('とりなされていて攻撃できません');
      const tgt = resolveSkillTarget(battle, u, s, action);
      battle.hits = [];
      useSkill(battle, u, s, tgt);
      break;
    }
    case 'wait':
      battle.log.push(`${u.name} は待機`);
      nextActive(battle);
      return;
    default:
      throw new Error('知らない操作です');
  }
  afterAction(battle, u);
}

// ---------- AI ----------
const BUFF_SKILLS = { gunyu: 2, hoko: 3, bighorn: 3, oen: 1, tehodoki: 1, majin: 0, shinka: 0, saiseiki: 0, suijin: 0, kittanai: 2 };

// その技を、今の位置からどう使うと一番よいか（点数つき）
function bestSkillUse(b, u, s) {
  const { units, cells } = skillTargets(b, u, s);
  const enemies = enemiesOf(b, u);
  const close = enemies.some(e => cheb(e, u) <= 4);
  const dmgScore = (t, opts) => {
    const d = damage(b, u, t, opts);
    let sc = Math.min(d, t.hp) * (t.solo ? 0.6 : 1);
    if (d >= t.hp) sc += 120;
    if (t.isCommander) sc += d >= t.hp ? 2000 : 40;
    return sc;
  };
  const areaScore = (tiles, opts) => tiles.reduce((a, [x, y]) => { const t = unitAt(b, x, y); return a + (t && t.side !== u.side ? dmgScore(t, opts) : 0); }, 0);
  const cost = s.mp * 2 + (s.once ? 60 : 0);
  let best = null;
  const consider = (score, action) => { if (score > 0 && (!best || score > best.score)) best = { score, action }; };
  switch (s.id) {
    case 'kirisute': case 'tokon': case 'yaguri': case 'star1': case 'ryoto': case 'tenbin': case 'kuroi': case 'suitoru': {
      const mult = { kirisute: 1.3, tokon: 2, star1: 0.8, kuroi: 0.9, tenbin: 2 }[s.id] || 1;
      for (const t of units) {
        let m = mult;
        if (s.id === 'yaguri') m = t.charId === 'yagyu' ? 3.5 : t.side === 'demon' ? 2.5 : 1;
        let sc = dmgScore(t, { mult: m, type: s.id === 'ryoto' ? 'both' : undefined });
        if (s.id === 'kirisute' && !t.solo && t.hp <= t.max * 0.3) sc += 150;
        consider(sc - cost, { targetId: t.id });
      }
      break;
    }
    case 'star2': {
      const top = units.map(t => ({ t, sc: dmgScore(t, { mult: 0.8 }) })).sort((a, c) => c.sc - a.sc).slice(0, 2);
      if (top.length) consider(top.reduce((a, x) => a + x.sc, 0) - cost, { targetIds: top.map(x => x.t.id) });
      break;
    }
    case 'ame': case 'star4': case 'star5': case 'bakuhatsu': {
      const area = { ame: 'cross', star4: '2x2', star5: 'cross', bakuhatsu: '3x3' }[s.id];
      const mult = { ame: 0.9, star4: 0.9, star5: 1, bakuhatsu: 0.8 }[s.id];
      for (const [x, y] of cells) consider(areaScore(areaTiles(area, x, y), { mult, type: s.id === 'star4' || s.id === 'star5' ? undefined : 'mag' }) - cost, { x, y });
      break;
    }
    case 'mayagi': consider(areaScore(areaTiles('sq:1', u.x, u.y), {}) - cost, {}); break;
    case 'trashbox': consider(areaScore(areaTiles('sq:3', u.x, u.y), { mult: 0.6 + 0.15 * (b.fallen[u.side] || 0) }) - cost, {}); break;
    case 'star7': consider(enemies.sort((a, c) => a.hp / a.max - c.hp / c.max).slice(0, 7).reduce((a, t) => a + dmgScore(t, { mult: 1.2 }), 0) - cost, {}); break;
    case 'tosshin': case 'totsugeki': case 'suigyu': case 'shogeki': {
      for (const [x, y] of cells) {
        const dir = [x - u.x, y - u.y];
        const n = s.id === 'shogeki' ? 3 : 4;
        let sc = 0;
        if (s.id === 'suigyu' || s.id === 'shogeki') sc = areaScore(lineTiles(u, dir, n), { mult: s.id === 'shogeki' ? 1.5 : 1 });
        else for (const [tx, ty] of lineTiles(u, dir, n)) {
          const t = unitAt(b, tx, ty);
          if (t && t.side !== u.side) { sc = dmgScore(t, { mult: s.id === 'tosshin' ? 1.6 : 2.2 }); break; }
          if (t || moveCost(b.grid[ty][tx], u, b) === Infinity) break;
        }
        if (s.kind === 'charge' && !u.instantCharge) sc *= 0.6;
        consider(sc - cost, { x, y });
      }
      break;
    }
    case 'iyashi':
      for (const t of units) consider(Math.min(t.max - t.hp, getStat(b, u, 'mag') * 4) * 0.8 - 40 - cost, { targetId: t.id });
      break;
    case 'heel': {
      const sc = alliesOf(b, u).filter(x => cheb(x, u) <= 2).reduce((a, x) => a + Math.min(x.max - x.hp, getStat(b, u, 'mag') * 6), 0);
      consider(sc * 0.8 - 60 - cost, {});
      break;
    }
    case 'oen': case 'tehodoki':
      if (close) for (const t of units) consider(40 + (t.isLeaderUnit ? 20 : 0) - cost, { targetId: t.id });
      break;
    case 'gunyu': case 'hoko': case 'bighorn': case 'kittanai': {
      const n = BUFF_SKILLS[s.id];
      const who = s.id === 'hoko' || s.id === 'kittanai' ? enemies.filter(e => cheb(e, u) <= n) : alliesOf(b, u).filter(x => cheb(x, u) <= n);
      if (close) consider(who.length * 30 - cost, {});
      break;
    }
    case 'majin': case 'shinka': case 'saiseiki': case 'suijin':
      if (enemies.some(e => cheb(e, u) <= 3)) consider(220 - cost, {});
      break;
    case 'torinashi': case 'nemuri':
      for (const t of units) if (!ailmentImmune(t) || s.id === 'torinashi') consider(getStat(b, t, 'atk') * 3 + (t.solo ? 80 : 0) - cost, { targetId: t.id });
      break;
    case 'doku':
      for (const t of units) if (!ailmentImmune(t) && !(t.poisonUntil >= b.round)) consider(t.max * 0.18 - cost, { targetId: t.id });
      break;
    case 'girori': case 'kyoho':
      for (const t of units) consider(getStat(b, t, 'atk') * 1.5 - cost, { targetId: t.id });
      break;
    case 'kurayami':
      for (const [x, y] of cells) {
        const n = areaTiles('cross', x, y).filter(([a, c]) => { const t = unitAt(b, a, c); return t && t.side !== u.side && t.range !== 'adj8'; }).length;
        consider(n * 45 - cost, { x, y });
      }
      break;
    case 'tane':
      for (const [x, y] of cells) consider(areaScore(areaTiles('3x3', x, y), {}) * 0.6 - cost, { x, y });
      break;
    default: break;
  }
  return best;
}

// AIの1手
export function aiStep(battle) {
  const u = activeUnit(battle);
  if (!u) return;
  const b = battle;
  const enemies = enemiesOf(b, u);
  const tiles = reachable(b, u);
  const ox = u.x, oy = u.y;
  const pacified = hasTag(b, u, 'pacified');
  let best = null;
  for (const [x, y] of tiles) {
    u.x = x; u.y = y;
    let danger = u.isCommander ? enemies.filter(e => cheb(e, { x, y }) <= 2).length * (b.kind === 'royale' ? 15 : 40) : 0;
    if (b.kind === 'royale' && !inZone(b, x, y, 1)) danger += 80; // 嵐の中や、次に嵐になる所は避ける
    const { units, walls } = targetsFrom(b, u, x, y);
    if (!pacified) for (const t of units) {
      const d = damage(b, u, t);
      let score = Math.min(d, t.hp) * (t.solo ? 0.6 : 1);
      if (d >= t.hp) score += 150;
      if (t.isCommander) score += d >= t.hp ? 2000 : 60;
      score -= danger;
      if (!best || score > best.score) best = { score, x, y, action: { type: 'attack', targetId: t.id } };
    }
    if (!u.isCommander && !pacified) for (const [wx, wy] of walls) {
      const score = 15 - Math.abs(wy - 5);
      if (!best || score > best.score) best = { score, x, y, action: { type: 'attackWall', x: wx, y: wy } };
    }
    for (const s of skillList(b, u)) {
      if (!s.ok) continue;
      if (pacified && s.target !== 'ally' && s.target !== 'ally2' && s.target !== 'self') continue;
      const use = bestSkillUse(b, u, s);
      if (use && (!best || use.score - danger > best.score)) best = { score: use.score - danger, x, y, action: { type: 'skill', skillId: s.id, ...use.action } };
    }
  }
  u.x = ox; u.y = oy;
  if (best && best.score > 0) {
    if (best.x !== ox || best.y !== oy) applyBattleAction(b, null, { type: 'move', x: best.x, y: best.y });
    try {
      applyBattleAction(b, null, best.action);
    } catch (e) {
      b.log.push(`${u.name} は待機`);
      nextActive(b);
    }
    return;
  }
  // 届く敵がいない：近づく（大将と、城壁の内側の守り手は持ち場を守る）
  const nearest = enemies.slice().sort((a, c) => cheb(a, u) - cheb(c, u))[0];
  const hold = b.kind !== 'royale' && (u.isCommander || (u.role === 'defender' && nearest && cheb(nearest, u) > 6));
  if (b.kind === 'royale' && !inZone(b, u.x, u.y, 1)) {
    // 嵐から逃げる：安全な場所の真ん中へ
    const cx = (b.zone.x0 + b.zone.x1) / 2, cy = (b.zone.y0 + b.zone.y1) / 2;
    let pick = null;
    for (const [x, y] of tiles) { const d = Math.abs(cx - x) + Math.abs(cy - y); if (!pick || d < pick.d) pick = { d, x, y }; }
    if (pick) { u.x = pick.x; u.y = pick.y; }
    b.log.push(`${u.name} は嵐から逃げた`);
    nextActive(b);
    return;
  }
  if (nearest && !hold) {
    let pick = null;
    for (const [x, y] of tiles) {
      const d = Math.abs(nearest.x - x) + Math.abs(nearest.y - y);
      if (!pick || d < pick.d) pick = { d, x, y };
    }
    if (pick) { u.x = pick.x; u.y = pick.y; }
  }
  b.log.push(`${u.name} は${hold ? '構えている' : '前進'}`);
  nextActive(b);
}

// ---------- 大将を選ぶ ----------
export function setCommander(b, role, genId) {
  const mine = b.units.filter(u => u.role === role);
  const pick = mine.find(u => u.genId === genId && u.isLeaderUnit) || mine.find(u => u.genId === genId);
  if (!pick) throw new Error('その武将はこの合戦にいません');
  for (const u of mine) u.isCommander = false;
  pick.isCommander = true;
  b[role + 'Commander'] = genId;
  b.log.push(`${role === 'attacker' ? '攻め' : '守り'}の大将：${pick.name}`);
}

// ---------- 追撃戦 ----------
// 合戦に勝った側が、退却する側を追いかける短い戦い。
// 追う側は退却する大将を倒せば勝ち（その武将は倒れる）。退却する側は数ターン耐えれば逃げ切り。
export const PURSUIT_ROUNDS = 3;

export function createPursuit(game, main, { pursuerIds, rearIds, fleeIds, fleeCommanderId, pursuerCommanderId }) {
  const terr = TERRITORIES[main.territoryId];
  const grid = makeGrid(terr, { walls: false, seed: game.day * 977 + main.territoryId * 13 + game.battleCount });
  const winner = main.result.winner;
  const loser = winner === main.attackerSide ? main.defenderSide : main.attackerSide;
  const b = {
    id: main.id + 'p', kind: 'pursuit', territoryId: main.territoryId, attackerSide: winner, defenderSide: loser,
    grid, wallHp: {}, units: [], order: [], idx: -1, round: 0, active: null, log: [], result: null, hits: [],
    dark: [], rain: [], seeds: [], fallen: { kingdom: 0, demon: 0, neutral: 0 }, maxRounds: PURSUIT_ROUNDS,
    generals: main.generals, reserve: main.reserve, stage: 'fight',
  };
  // 逃げ道の戦場：崖は高台にして、どちらの部隊も動けるようにする
  for (let y = 0; y < BATTLE_H; y++) for (let x = 0; x < BATTLE_W; x++) if (grid[y][x] === 'C') grid[y][x] = 'H';
  const copy = (u, role) => ({
    ...u, role, effects: [], onceRound: {}, charge: null, instantCharge: false, isCommander: false,
    sleepUntil: null, poisonUntil: null, markUntil: null, stunFrom: null, stunUntil: null, visibleUntil: null, lastRound: null,
  });
  const rows = [5, 4, 6, 3, 7, 2, 8, 1, 9, 0, 10];
  const place = (u, cols) => {
    for (const x of cols) for (const y of rows) {
      if (b.units.some(o => o.x === x && o.y === y)) continue;
      if (moveCost(grid[y][x], u, b) === Infinity) continue;
      u.x = x; u.y = y; b.units.push(u); return;
    }
  };
  const byId = id => main.units.find(u => u.id === id);
  for (const id of pursuerIds) place(copy(byId(id), 'attacker'), [2, 1, 0, 3]);
  for (const id of rearIds) place(copy(byId(id), 'defender'), [6, 7, 5, 8]);
  for (const id of fleeIds) place(copy(byId(id), 'defender'), [11, 12, 13, 10, 14, 15]);
  const pc = b.units.find(u => u.id === pursuerCommanderId) || b.units.find(u => u.role === 'attacker');
  const fc = b.units.find(u => u.id === fleeCommanderId) || b.units.find(u => u.role === 'defender');
  if (pc) pc.isCommander = true;
  if (fc) fc.isCommander = true;
  b.log.push(`【${terr.name}の追撃戦】 ${sideName(winner)}が追いかける。${sideName(loser)}は${PURSUIT_ROUNDS}ターン耐えれば逃げ切り`);
  if (rearIds.length) b.log.push(`しんがり：${rearIds.map(id => byId(id).name).join('・')}`);
  b.log.push(`逃げる大将：${fc ? fc.name : '-'}（倒されると倒れる）`);
  return b;
}

// ---------- のぞちちの援護 ----------
// 王都から戦場へ、回復薬・強化薬・魔法・援軍のどれかを送る（AIが状況を見て選ぶ）
export const SUPPORT = {
  heal:      { name: '回復薬',     gold: 60, desc: '一番弱っている味方2部隊を4割回復' },
  boost:     { name: '強化薬',     gold: 80, desc: '敵に近い味方3部隊の攻撃・防御を2ターン+15%' },
  magic:     { name: '女王の魔法', gold: 0,  desc: '敵が一番集まっている3×3に魔法を撃ち込む' },
  reinforce: { name: '兵の増援',   gold: 0,  desc: '王都の兵200人が駆けつける（1合戦に1回）' },
};
export const SUPPORT_EVERY = 2;

function queenSupport(b) {
  const sp = b.support;
  const side = 'kingdom';
  const own = b.units.filter(u => u.alive && u.side === side);
  const foes = b.units.filter(u => u.alive && u.side !== side);
  if (!own.length || !foes.length) return;
  const ownHp = own.reduce((a, u) => a + u.hp, 0);
  const foeHp = foes.reduce((a, u) => a + u.hp, 0);
  const canPay = (k) => sp.budget - sp.spent >= SUPPORT[k].gold;
  // 魔法を撃つなら、敵が一番集まっている所
  const queen = { name: 'のぞちち', side, atk: sp.atk, mag: sp.mag, dmg: 'mag', solo: true, effects: [], dealt: 0, kills: 0, x: 0, y: 0 };
  let cluster = null;
  for (let y = 0; y < BATTLE_H; y++) for (let x = 0; x < BATTLE_W; x++) {
    const tiles = areaTiles('3x3', x, y);
    let n = 0, dmg = 0;
    for (const [tx, ty] of tiles) {
      const t = unitAt(b, tx, ty);
      if (t && t.side !== side) { n++; queen.x = tx; queen.y = ty; dmg += Math.min(t.hp, damage(b, queen, t, { mult: 1.1 })); }
    }
    if (n && (!cluster || dmg > cluster.dmg)) cluster = { x, y, n, dmg };
  }
  const hurt = own.filter(u => u.hp < u.max * 0.45).sort((a, c) => (c.isCommander ? 1 : 0) - (a.isCommander ? 1 : 0) || a.hp / a.max - c.hp / c.max);
  let pick;
  if (sp.reinforce && ownHp < foeHp * 0.8) pick = 'reinforce';
  else if (hurt.length && canPay('heal')) pick = 'heal';
  else if (cluster && cluster.n >= 2) pick = 'magic';
  else if (canPay('boost') && foes.some(f => own.some(o => cheb(o, f) <= 3))) pick = 'boost';
  else pick = 'magic';
  sp.left--;
  sp.next = b.round + SUPPORT_EVERY;
  sp.spent += SUPPORT[pick].gold;
  sp.history.push({ round: b.round, kind: pick });
  b.log.push(`【女王の援護】のぞちちが「${SUPPORT[pick].name}」を送った`);
  switch (pick) {
    case 'heal':
      for (const u of hurt.slice(0, 2)) heal(b, u, u.max * 0.4, '回復薬');
      break;
    case 'boost': {
      const front = own.slice().sort((a, c) => Math.min(...foes.map(f => cheb(a, f))) - Math.min(...foes.map(f => cheb(c, f)))).slice(0, 3);
      for (const u of front) { addEffect(u, { stat: 'atk', mult: 1.15, until: b.round + 2 }); addEffect(u, { stat: 'def', mult: 1.15, until: b.round + 2 }); }
      b.log.push(`${front.map(u => u.name).join('・')} が強くなった`);
      break;
    }
    case 'magic':
      if (!cluster) break;
      for (const [tx, ty] of areaTiles('3x3', cluster.x, cluster.y)) {
        const t = unitAt(b, tx, ty);
        if (t && t.side !== side) { queen.x = tx; queen.y = ty; applyDamage(b, queen, t, damage(b, queen, t, { mult: 1.1 }), '女王の魔法'); }
      }
      break;
    case 'reinforce': {
      sp.reinforce = false;
      sp.sentTroops = 200;
      const role = b.attackerSide === side ? 'attacker' : 'defender';
      const cols = role === 'attacker' ? [0, 1, 2, 3] : [15, 14, 13, 12];
      const t = UNIT_TYPES.spear;
      const u = {
        id: 'q' + b.round, kind: 'troop', type: 'spear', name: '王都の援軍・槍兵', label: '槍', side, role, controller: 'ai',
        atk: t.atk, def: t.def, mag: t.mag, mdef: t.mdef, spd: t.spd, move: t.move, range: t.range, dmg: t.dmg, tri: t.tri,
        hp: 200, max: 300, alive: true, dealt: 0, kills: 0, effects: [], used: {}, onceRound: {}, reinforcement: true,
      };
      for (const x of cols) {
        const y = [5, 4, 6, 3, 7, 2, 8, 1, 9, 0, 10].find(yy => !unitAt(b, x, yy) && moveCost(b.grid[yy][x], u, b) !== Infinity);
        if (y !== undefined) { u.x = x; u.y = y; break; }
      }
      if (u.x !== undefined) { b.units.push(u); b.log.push('王都から援軍の槍兵が駆けつけた'); }
      break;
    }
  }
}

// ---------- バトルロワイヤル ----------
// 全員が敵どうし。自分のキャラが倒れたら脱落、最後まで残った1人の勝ち。
// 3ターン目のあとから、戦場のはしから「嵐」がせまってきて、嵐の中にいるとターンのはじめにHPが減る。
export const ROYALE_ROUNDS = 40;
const SPAWNS = [[1, 1], [14, 9], [14, 1], [1, 9], [7, 0], [8, 10], [0, 5], [15, 5]];
const TROOPS = { kingdom: ['spear', 'archer'], demon: ['orc', 'harpy'], neutral: ['cavalry', 'archer'] };

export function inZone(b, x, y, margin = 0) {
  const z = b.zone;
  // margin=1 のときは「次にせばまったあと」も考える
  const nz = margin && b.round >= 3 ? nextZone(b) : z;
  return x >= nz.x0 && x <= nz.x1 && y >= nz.y0 && y <= nz.y1;
}
function nextZone(b) {
  const z = { ...b.zone };
  if (z.x1 - z.x0 > 3) { z.x0++; z.x1--; }
  if (z.y1 - z.y0 > 2) { z.y0++; z.y1--; }
  return z;
}

export function createRoyale(game) {
  const R = game.royale;
  const L = R.level;
  const terr = { terrain: 'plain' };
  const grid = makeGrid(terr, { walls: false, seed: Date.now() % 100000 });
  // 森と高台を少し足して、崖はなくす
  const rand = (i) => { const v = Math.sin(i * 91.7 + game.battleCount) * 10000; return v - Math.floor(v); };
  for (let y = 0; y < BATTLE_H; y++) for (let x = 0; x < BATTLE_W; x++) {
    const r = rand(x * 31 + y * 7);
    grid[y][x] = r < 0.14 ? 'F' : r < 0.2 ? 'H' : '.';
  }
  const b = {
    id: 'r' + (++game.battleCount), kind: 'royale', territoryId: 16, attackerSide: null, defenderSide: null,
    grid, wallHp: {}, units: [], order: [], idx: -1, round: 0, active: null, log: [], result: null, hits: [],
    dark: [], rain: [], seeds: [], fallen: {}, maxRounds: ROYALE_ROUNDS, stage: 'fight',
    zone: { x0: 0, y0: 0, x1: BATTLE_W - 1, y1: BATTLE_H - 1 }, sides: [], sideNames: {}, out: [],
    generals: { attacker: [], defender: [] }, reserve: { attacker: [], defender: [] },
  };
  let uid = 0;
  R.entrants.forEach((e, i) => {
    const side = 'p:' + e.charId;
    const c = CHARACTERS[e.charId];
    const st = evenStats(e.charId, L);
    const [sx, sy] = SPAWNS[i % SPAWNS.length];
    b.sides.push(side);
    b.sideNames[side] = `${c.name}（${e.name}）`;
    grid[sy][sx] = '.';
    const base = { side, role: side, controller: e.controller, alive: true, dealt: 0, kills: 0, effects: [], used: {}, onceRound: {} };
    b.units.push({
      ...base, id: 'u' + (++uid), kind: e.charId === 'yagyu' ? 'yagyu' : 'char', charId: e.charId, name: c.name, label: c.label, level: L,
      ...st, max: st.hp, maxMp: st.mp, range: c.range, dmg: c.dmg, tri: null, solo: false, isLeaderUnit: true, isCommander: true, x: sx, y: sy,
    });
    // 部隊を2つ、となりに置く
    const types = TROOPS[c.side] || TROOPS.neutral;
    const spots = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
      .map(([dx, dy]) => [sx + dx, sy + dy]).filter(([x, y]) => inBounds(x, y) && !b.units.some(u => u.x === x && u.y === y));
    types.forEach((type, k) => {
      const t = UNIT_TYPES[type];
      const [x, y] = spots[k] || [sx, sy];
      grid[y][x] = '.';
      b.units.push({
        ...base, id: 'u' + (++uid), kind: 'troop', type, name: `${c.name}隊・${t.name}`, label: t.label,
        atk: t.atk, def: t.def, mag: t.mag, mdef: t.mdef, spd: t.spd, move: t.move, range: t.range, dmg: t.dmg, tri: t.tri,
        flyer: !!t.flyer, climber: !!t.climber, hp: 220, max: 220, x, y,
      });
    });
  });
  b.log.push(`【バトルロワイヤル】 ${R.entrants.length}人の戦い。自分のキャラが倒れたら脱落。最後まで残った人の勝ち`);
  b.log.push('4ターン目から、はしから嵐がせまってくる（嵐の中にいるとHPが減る）');
  return b;
}

function royaleStorm(b) {
  if (b.round >= 4 && (b.round - 4) % 3 === 0) {
    const before = JSON.stringify(b.zone);
    b.zone = nextZone(b);
    if (JSON.stringify(b.zone) !== before) b.log.push('嵐がせまってきた！');
  }
  for (const u of b.units) {
    if (!u.alive || inZone(b, u.x, u.y)) continue;
    applyDamage(b, null, u, Math.max(1, Math.round(u.max * 0.12)), '嵐');
  }
}

function eliminate(b, side, reason) {
  for (const u of b.units) if (u.side === side && u.alive) { u.alive = false; u.hp = 0; }
  b.out.push({ side, round: b.round });
  b.log.push(`✖ ${b.sideNames[side]} が脱落（${reason}）`);
}

function royaleCheck(b) {
  for (const side of b.sides) {
    if (b.out.some(o => o.side === side)) continue;
    const leader = b.units.find(u => u.side === side && u.isLeaderUnit);
    if (!leader || !leader.alive) eliminate(b, side, `${leader ? leader.name : 'キャラ'}が倒れた`);
  }
  const left = b.sides.filter(s => !b.out.some(o => o.side === s));
  if (left.length === 1) { finish(b, left[0], '最後まで生き残った'); return true; }
  if (left.length === 0) { finish(b, null, 'みんな同時に倒れた'); return true; }
  return false;
}

function royaleTimeout(b) {
  // 時間切れ：自分のキャラのHPがいちばん多く残っている人の勝ち
  const left = b.sides.filter(s => !b.out.some(o => o.side === s))
    .map(s => ({ s, r: b.units.find(u => u.side === s && u.isLeaderUnit).hp / b.units.find(u => u.side === s && u.isLeaderUnit).max }))
    .sort((a, c) => c.r - a.r);
  for (const x of left.slice(1).reverse()) eliminate(b, x.s, '時間切れ・HPが少なかった');
  finish(b, left[0]?.s ?? null, '時間切れ・HPがいちばん多く残った');
}

// 順位（1位から）
export function royaleRanking(b) {
  const winner = b.result?.winner;
  const order = [...(winner ? [winner] : []), ...b.out.slice().reverse().map(o => o.side)];
  return order.map((side, i) => {
    const leader = b.units.find(u => u.side === side && u.isLeaderUnit);
    const kills = b.units.filter(u => u.side === side).reduce((a, u) => a + u.kills, 0);
    return { place: i + 1, side, name: b.sideNames[side], charId: leader?.charId, kills };
  });
}
