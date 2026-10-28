// 合戦の計算（移動できるマス・攻撃が届くマス・ダメージ）。サーバーとブラウザで共通。
import { TERRAIN, TRI_ADV, BATTLE_W, BATTLE_H } from './data.js';

const DIR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIR4 = DIR8.slice(0, 4);

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < BATTLE_W && y < BATTLE_H;
}

// 射程のパターンから、(x,y) から攻撃が届くマスの一覧
export function rangeTiles(range, x, y) {
  const out = [];
  if (range === 'adj8') {
    for (const [dx, dy] of DIR8) out.push([x + dx, y + dy]);
  } else {
    const [kind, span] = range.split(':');
    const [lo, hi] = span.split('-').map(Number);
    const dirs = kind === 'orth' ? DIR4 : DIR8;
    for (const [dx, dy] of dirs) {
      for (let d = lo; d <= hi; d++) out.push([x + dx * d, y + dy * d]);
    }
  }
  return out.filter(([a, b]) => inBounds(a, b));
}

export function inRange(range, fx, fy, tx, ty) {
  return rangeTiles(range, fx, fy).some(([a, b]) => a === tx && b === ty);
}

// 地形ごとの移動コスト（Infinity は通れない）
export function moveCost(tile, unit, battle) {
  const flyer = unit.flyer;
  switch (tile) {
    case '.': return 1;
    case 'F': return flyer ? 1 : 2;
    case 'R': return flyer ? 1 : 3;
    case 'H': return flyer ? 1 : 2;
    case 'C':
      if (unit.side !== 'demon') return Infinity;
      return unit.climber || flyer || unit.kind === 'yagyu' ? 1 : 2;
    case 'W': return unit.side === battle.defenderSide ? 1 : Infinity;
    case 'S': return unit.side === 'demon' ? 2 : 1;
    default: return 1;
  }
}

function occupant(battle, x, y) {
  return battle.units.find(u => u.alive && u.x === x && u.y === y);
}

// 移動できるマス（味方は通り抜けられる、敵は通れない、止まれるのは空きマスだけ）
export function reachable(battle, unit) {
  const move = unit.move + (unit.moveMod || 0);
  const best = new Map();
  const key = (x, y) => x + ',' + y;
  best.set(key(unit.x, unit.y), 0);
  const queue = [[unit.x, unit.y, 0]];
  while (queue.length) {
    queue.sort((a, b) => a[2] - b[2]);
    const [x, y, c] = queue.shift();
    if (c > (best.get(key(x, y)) ?? Infinity)) continue;
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const occ = occupant(battle, nx, ny);
      if (occ && occ.side !== unit.side) continue;
      const cost = c + moveCost(battle.grid[ny][nx], unit, battle);
      if (cost > Math.max(move, 1)) continue;
      if (cost < (best.get(key(nx, ny)) ?? Infinity)) {
        best.set(key(nx, ny), cost);
        queue.push([nx, ny, cost]);
      }
    }
  }
  const out = [];
  for (const k of best.keys()) {
    const [x, y] = k.split(',').map(Number);
    const occ = occupant(battle, x, y);
    if (!occ || occ.id === unit.id) out.push([x, y]);
  }
  return out;
}

// 攻撃できる相手（敵部隊と、壊せる城壁）
export function targetsFrom(battle, unit, x, y) {
  const units = [];
  const walls = [];
  for (const [tx, ty] of rangeTiles(unit.range, x, y)) {
    const occ = occupant(battle, tx, ty);
    if (occ && occ.side !== unit.side) units.push(occ);
    else if (!occ && battle.grid[ty][tx] === 'W' && unit.side !== battle.defenderSide) walls.push([tx, ty]);
  }
  return { units, walls };
}

// ダメージ計算（確率なし。同じ状況なら必ず同じダメージ）
export function damage(battle, att, def) {
  let type = att.dmg;
  if (type === 'best') type = att.atk >= att.mag ? 'phys' : 'mag';
  let P = type === 'mag' ? att.mag : att.atk;
  let D = type === 'mag' ? def.mdef : def.def;
  const aTile = TERRAIN[battle.grid[att.y][att.x]];
  const dTile = TERRAIN[battle.grid[def.y][def.x]];
  if (aTile.atkMod && !att.flyer) P *= aTile.atkMod;
  if (dTile.defMod && !def.flyer) D *= dTile.defMod;
  P *= att.buff || 1;
  let base = (P * P) / (P + D) * 4;
  // 兵が減るほど部隊は弱くなる（単騎のヤギューは別）
  const strength = att.solo ? 1 : 0.5 + 0.5 * att.hp / att.max;
  let tri = 1;
  if (att.tri && def.tri) {
    if (TRI_ADV[att.tri] === def.tri) tri = 1.3;
    else if (TRI_ADV[def.tri] === att.tri) tri = 0.8;
  }
  return Math.max(1, Math.round(base * strength * tri));
}

export const WALL_HP = 200;
