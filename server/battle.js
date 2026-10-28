// 合戦（戦場画面のターン制バトル）
import {
  TERRITORIES, SIZES, UNIT_TYPES, QUALITY, CHARACTERS, BATTLE_W, BATTLE_H, MAX_ROUNDS, charStats,
} from '../shared/data.js';
import { reachable, targetsFrom, damage, inRange, WALL_HP } from '../shared/battlecore.js';

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
  return size === 'fortress' || size === 'metropolis';
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
  if (side === 'kingdom') q *= 1 + 0.04 * game.resources.kingdom.training;
  return {
    kind: 'troop', type: troop.type, name: `${gen.name}隊・${t.name}`, label: t.label,
    atk: Math.round(t.atk * q), def: Math.round(t.def * q * (1 + (troop.defBonus || 0))), mag: Math.round(t.mag * q), mdef: Math.round(t.mdef * q),
    spd: t.spd, move: t.move, range: t.range, dmg: t.dmg, tri: t.tri, flyer: !!t.flyer, climber: !!t.climber,
    hp: troop.hp, max: troop.max, troopRef: troop.uid,
  };
}

export function leaderUnit(game, gen) {
  const c = CHARACTERS[gen.charId];
  const st = charStats(gen.charId, game.chars[gen.charId]?.level || 1);
  let mot = 1;
  if (gen.charId === 'nanase') mot = game.flags.nanaseMotivation || 1;
  return {
    kind: gen.charId === 'yagyu' ? 'yagyu' : 'char', charId: gen.charId, name: c.name, label: c.label,
    atk: Math.round(st.atk * mot), def: st.def, mag: Math.round(st.mag * mot), mdef: st.mdef, spd: st.spd, move: st.move,
    range: c.range, dmg: c.dmg, tri: null, solo: !!c.solo, hp: gen.hp, max: st.hp, isLeaderUnit: true,
  };
}

// 合戦の準備
export function createBattle(game, { territoryId, attackerSide, defenderSide, attackers, defenders }) {
  const terr = TERRITORIES[territoryId];
  const walls = hasWalls(game, terr);
  const grid = makeGrid(terr, { walls, seed: game.day * 131 + territoryId * 7 + game.battleCount });
  const battle = {
    id: 'b' + (++game.battleCount), territoryId, attackerSide, defenderSide,
    grid, wallHp: {}, units: [], order: [], idx: -1, round: 0, active: null, log: [], result: null,
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
      Object.assign(u, { id: 'u' + (++uid), side, role, alive: true, dealt: 0, kills: 0 });
      if (place(u, back.includes(u) ? backOrder : placeOrder)) battle.units.push(u);
    }
  }
  const names = side => battle.generals[side].map(id => game.generals[id].name).join('・');
  battle.log.push(`【${terr.name}の合戦】 攻め：${names('attacker')} ／ 守り：${names('defender')}`);
  return battle;
}

function aliveUnits(battle, side) { return battle.units.filter(u => u.alive && u.side === side); }

function nextActive(battle) {
  while (true) {
    battle.idx++;
    if (battle.idx >= battle.order.length) {
      battle.round++;
      if (battle.round > MAX_ROUNDS) {
        finish(battle, battle.defenderSide, '時間切れ。守りきった');
        return;
      }
      battle.order = battle.units.filter(u => u.alive)
        .sort((a, b) => b.spd - a.spd || a.role.localeCompare(b.role) || a.id.localeCompare(b.id))
        .map(u => u.id);
      battle.idx = 0;
      battle.log.push(`― ${battle.round}ターン目 ―`);
    }
    const u = battle.units.find(x => x.id === battle.order[battle.idx]);
    if (u && u.alive) {
      battle.active = { unitId: u.id, moved: false, ox: u.x, oy: u.y };
      return;
    }
  }
}

export function startBattle(battle) {
  nextActive(battle);
}

function finish(battle, winnerSide, reason) {
  battle.result = { winner: winnerSide, reason };
  battle.active = null;
  battle.log.push(`★ ${winnerSide === 'kingdom' ? '王国' : winnerSide === 'demon' ? '魔族' : '中立'}の勝ち（${reason}）`);
}

function checkEnd(battle) {
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

function doAttack(battle, att, def) {
  const dmg = damage(battle, att, def);
  def.hp = Math.max(0, def.hp - dmg);
  att.dealt += dmg;
  battle.log.push(`${att.name} → ${def.name}：${dmg}${def.solo || def.isLeaderUnit ? '' : '人'}`);
  battle.lastHit = { from: att.id, to: def.id, dmg, at: Date.now() };
  if (def.hp <= 0) {
    def.alive = false;
    att.kills++;
    battle.log.push(`${def.name} が倒れた`);
  }
}

function doAttackWall(battle, att, x, y) {
  const P = att.dmg === 'mag' ? att.mag : Math.max(att.atk, att.dmg === 'best' ? att.mag : 0);
  const dmg = Math.round(P * P / (P + 30) * 4 * (att.solo ? 1 : 0.5 + 0.5 * att.hp / att.max));
  const k = x + ',' + y;
  battle.wallHp[k] -= dmg;
  battle.log.push(`${att.name} が城壁を攻撃：${dmg}`);
  if (battle.wallHp[k] <= 0) {
    battle.grid[y][x] = '.';
    delete battle.wallHp[k];
    battle.log.push('城壁がくずれた');
  }
}

function endTurn(battle) {
  if (!checkEnd(battle)) nextActive(battle);
}

// 人間の操作
export function applyBattleAction(battle, role, action) {
  if (battle.result) throw new Error('合戦は終わっています');
  const u = activeUnit(battle);
  if (!u) throw new Error('今動ける部隊がありません');
  if (u.controller !== role) throw new Error('あなたの部隊の番ではありません');
  const a = battle.active;
  switch (action.type) {
    case 'move': {
      if (a.moved) throw new Error('もう移動しました');
      if (!reachable(battle, u).some(([x, y]) => x === action.x && y === action.y)) throw new Error('そこへは動けません');
      u.x = action.x; u.y = action.y; a.moved = true;
      break;
    }
    case 'undo': {
      u.x = a.ox; u.y = a.oy; a.moved = false;
      break;
    }
    case 'attack': {
      const t = battle.units.find(x => x.id === action.targetId);
      if (!t || !t.alive || t.side === u.side || !inRange(u.range, u.x, u.y, t.x, t.y)) throw new Error('攻撃が届きません');
      doAttack(battle, u, t);
      endTurn(battle);
      break;
    }
    case 'attackWall': {
      const { walls } = targetsFrom(battle, u, u.x, u.y);
      if (!walls.some(([x, y]) => x === action.x && y === action.y)) throw new Error('城壁に届きません');
      doAttackWall(battle, u, action.x, action.y);
      endTurn(battle);
      break;
    }
    case 'wait':
      battle.log.push(`${u.name} は待機`);
      endTurn(battle);
      break;
    default:
      throw new Error('知らない操作です');
  }
}

const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// AIの1手
export function aiStep(battle) {
  const u = activeUnit(battle);
  if (!u) return;
  const enemies = battle.units.filter(e => e.alive && e.side !== u.side);
  const tiles = reachable(battle, u);
  const ox = u.x, oy = u.y;
  let best = null;
  for (const [x, y] of tiles) {
    u.x = x; u.y = y;
    const { units, walls } = targetsFrom(battle, u, x, y);
    for (const t of units) {
      const d = damage(battle, u, t);
      let score = Math.min(d, t.hp) * (t.solo ? 0.5 : 1);
      if (d >= t.hp) score += 150;
      if (t.isCommander) score += d >= t.hp ? 2000 : 60;
      // 大将は危ないところへ出ていかない
      if (u.isCommander) score -= enemies.filter(e => dist(e, { x, y }) <= 2).length * 40;
      if (!best || score > best.score) best = { score, x, y, target: t };
    }
    if (!u.isCommander) for (const [wx, wy] of walls) {
      const score = 15 - Math.abs(wy - 5);
      if (!best || score > best.score) best = { score, x, y, wall: [wx, wy] };
    }
  }
  u.x = ox; u.y = oy;
  if (best && (best.target || best.wall)) {
    u.x = best.x; u.y = best.y;
    if (best.target) doAttack(battle, u, best.target);
    else doAttackWall(battle, u, ...best.wall);
    endTurn(battle);
    return;
  }
  // 届く敵がいない：近づく（大将と、城壁の内側の守り手は持ち場を守る）
  const nearest = enemies.slice().sort((a, b) => dist(a, u) - dist(b, u))[0];
  const hold = u.isCommander || (u.role === 'defender' && nearest && dist(nearest, u) > 6);
  if (nearest && !hold) {
    let pick = null;
    for (const [x, y] of tiles) {
      const d = Math.abs(nearest.x - x) + Math.abs(nearest.y - y);
      if (!pick || d < pick.d) pick = { d, x, y };
    }
    if (pick) { u.x = pick.x; u.y = pick.y; }
  }
  battle.log.push(`${u.name} は${hold ? '構えている' : '前進'}`);
  endTurn(battle);
}
