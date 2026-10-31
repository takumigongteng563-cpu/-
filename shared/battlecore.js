// 合戦の計算（強さ・移動できるマス・攻撃が届くマス・ダメージ）。サーバーとブラウザで共通。
// 確率はどこにもない：同じ状況なら、いつも同じ結果になる。
import { TERRAIN, TRI_ADV, BATTLE_W, BATTLE_H } from './data.js';

const DIR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const DIR4 = DIR8.slice(0, 4);

export const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < BATTLE_W && y < BATTLE_H;
}

// 射程のパターンから、(x,y) から届くマスの一覧
//   adj8 = まわり8マス / line8:a-b = 8方向にaマス〜bマス / orth:a-b = 上下左右にaマス〜bマス / sq:n = n マス以内の四角
export function rangeTiles(range, x, y) {
  const out = [];
  if (range === 'adj8') {
    for (const [dx, dy] of DIR8) out.push([x + dx, y + dy]);
  } else if (range === 'any') {
    for (let j = 0; j < BATTLE_H; j++) for (let i = 0; i < BATTLE_W; i++) out.push([i, j]);
  } else {
    const [kind, span] = range.split(':');
    if (kind === 'sq') {
      const n = Number(span);
      for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) out.push([x + dx, y + dy]);
    } else {
      const [lo, hi] = span.split('-').map(Number);
      const dirs = kind === 'orth' ? DIR4 : DIR8;
      for (const [dx, dy] of dirs) for (let d = lo; d <= hi; d++) out.push([x + dx * d, y + dy * d]);
    }
  }
  return out.filter(([a, b]) => inBounds(a, b));
}

export function unitAt(battle, x, y) {
  return battle.units.find(u => u.alive && u.x === x && u.y === y);
}

const active = (battle, until) => until != null && battle.round <= until;
const findChar = (battle, charId) => battle.units.find(u => u.alive && u.charId === charId);
const learned = (u, lv) => (u.level || 1) >= lv;

// 暗闇（CAR）の中にいる敵は、射程が1マスになる
export function inDarkness(battle, u, x = u.x, y = u.y) {
  return (battle.dark || []).some(d => d.x === x && d.y === y && d.side !== u.side && active(battle, d.until));
}

// ヤギューのLv15パッシブ：周り3マスの敵が受ける強化は半分
function buffsHalved(battle, u) {
  if (u.side === 'demon') return false;
  const y = findChar(battle, 'yagyu');
  return !!y && y.side !== u.side && learned(y, 15) && cheb(y, u) <= 3;
}

// その部隊にかかっている強化・弱体の倍率
function effectMult(battle, u, stat, halveBuffs) {
  let m = 1;
  for (const e of u.effects || []) {
    if (!active(battle, e.until)) continue;
    if (e.stat !== stat && !(e.stat === 'all' && stat !== 'move')) continue;
    let v = e.mult;
    if (v > 1 && halveBuffs) v = 1 + (v - 1) / 2;
    if (v < 1 && u.charId === 'horie' && learned(u, 10)) v = 1 - (1 - v) / 2; // 世渡り上手
    m *= v;
  }
  return m;
}

// 実際の強さ（強化・弱体・オーラ・個人スキルを全部かけたもの）
export function getStat(battle, u, stat) {
  const halve = buffsHalved(battle, u);
  let v = u[stat] * effectMult(battle, u, stat, halve);
  const aura = (m) => { v *= halve && m > 1 ? 1 + (m - 1) / 2 : m; };
  const physical = stat === 'atk' || stat === 'def' || stat === 'mag' || stat === 'mdef';
  if (physical) {
    const yagyu = findChar(battle, 'yagyu');
    // 始祖の力：同じ戦場の魔族部隊が全部少し強くなる
    if (yagyu && u.side === yagyu.side) v *= 1.05;
    // 顔なじみ（堀江）
    const horie = findChar(battle, 'horie');
    if (horie && horie !== u && horie.side === u.side && cheb(horie, u) <= 2 && stat !== 'mag' && stat !== 'mdef') {
      const friends = battle.units.some(x => x.alive && (x.charId === 'yagyu' || x.charId === 'nozomi'));
      aura(friends ? 1.15 : 1.08);
    }
    // 女王の威光（のぞちち）
    const queen = findChar(battle, 'nozomi');
    if (queen && queen !== u && queen.side === u.side && cheb(queen, u) <= 2 && (stat === 'atk' || stat === 'def')) aura(1.15);
    // にらみつける（KKB）
    const kkb = findChar(battle, 'kkb');
    if (kkb && kkb.side !== u.side && cheb(kkb, u) <= 2 && stat === 'atk') v *= 0.9;
  }
  if (u.charId === 'car' && (stat === 'atk' || stat === 'def')) {
    // それな／アマンダム：近くに味方がいると強くなる
    const r = learned(u, 20) ? 3 : 2;
    const n = battle.units.filter(x => x.alive && x !== u && x.side === u.side && cheb(x, u) <= r).length;
    if (n >= 2 && learned(u, 20)) v *= 1.4; else if (n >= 1) v *= 1.25;
  }
  if (u.charId === 'yagyu' && stat === 'atk') v *= 1 + 0.3 * (1 - u.hp / u.max); // HPが減るほど攻撃が上がる
  if (u.charId === 'sumire' && stat === 'atk') v *= 1 + 0.05 * (u.cover || 0);   // 愛情魂でかばった回数
  if (u.charId === 'oh' && physical) {
    // 寄生：隣の味方のステータスの一部を上乗せ
    for (const x of battle.units) {
      if (!x.alive || x === u || x.side !== u.side || cheb(x, u) > 1) continue;
      v += x[stat] * effectMult(battle, x, stat, false) * 0.1;
    }
  }
  return v;
}

export function getMove(battle, u) {
  let m = u.move;
  for (const e of u.effects || []) if (e.stat === 'move' && active(battle, e.until)) m += e.add;
  // 水神の雨：敵の移動力が下がる
  if ((battle.rain || []).some(r => r.side !== u.side && active(battle, r.until))) m -= 1;
  return Math.max(1, m);
}

export function getRange(battle, u) {
  if (u.charId === 'yagyu' && (u.effects || []).some(e => e.tag === 'shinka' && active(battle, e.until))) return 'line8:1-3';
  return u.range;
}

// 届くマス（暗闇の中なら1マスに縮む）
export function reachTiles(battle, u, range, x = u.x, y = u.y) {
  let tiles = rangeTiles(range, x, y);
  if (inDarkness(battle, u, x, y)) tiles = tiles.filter(([a, b]) => Math.max(Math.abs(a - x), Math.abs(b - y)) <= 1);
  return tiles;
}

// その敵を「選んで」攻撃できるか（野口の「くちかわき」）
export function isTargetable(battle, att, t) {
  if (t.charId !== 'noguchi') return true;
  if (active(battle, t.visibleUntil)) return true;
  return battle.units.some(e => e.alive && e.side !== t.side && cheb(e, t) <= 1);
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

// 移動できるマス（味方は通り抜けられる、敵は通れない、止まれるのは空きマスだけ）
export function reachable(battle, unit) {
  const move = getMove(battle, unit);
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
      const occ = unitAt(battle, nx, ny);
      if (occ && occ.side !== unit.side) continue;
      const cost = c + moveCost(battle.grid[ny][nx], unit, battle);
      if (cost > move) continue;
      if (cost < (best.get(key(nx, ny)) ?? Infinity)) {
        best.set(key(nx, ny), cost);
        queue.push([nx, ny, cost]);
      }
    }
  }
  const out = [];
  for (const k of best.keys()) {
    const [x, y] = k.split(',').map(Number);
    const occ = unitAt(battle, x, y);
    if (!occ || occ.id === unit.id) out.push([x, y]);
  }
  return out;
}

// 通常攻撃できる相手（敵部隊と、壊せる城壁）
export function targetsFrom(battle, unit, x, y) {
  const units = [];
  const walls = [];
  for (const [tx, ty] of reachTiles(battle, unit, getRange(battle, unit), x, y)) {
    const occ = unitAt(battle, tx, ty);
    if (occ && occ.side !== unit.side) { if (isTargetable(battle, unit, occ)) units.push(occ); }
    else if (!occ && battle.grid[ty][tx] === 'W' && unit.side !== battle.defenderSide) walls.push([tx, ty]);
  }
  return { units, walls };
}

// ダメージ計算。opts.mult = 威力の倍率、opts.type = 'phys'|'mag'|'both'、opts.power = 威力を直接指定
export function damage(battle, att, def, opts = {}) {
  let type = opts.type || att.dmg;
  if (type === 'best') type = getStat(battle, att, 'atk') >= getStat(battle, att, 'mag') ? 'phys' : 'mag';
  let P, D;
  if (type === 'both') {
    P = getStat(battle, att, 'atk') + getStat(battle, att, 'mag');
    D = (getStat(battle, def, 'def') + getStat(battle, def, 'mdef'));
  } else {
    P = opts.power ?? (type === 'mag' ? getStat(battle, att, 'mag') : getStat(battle, att, 'atk'));
    D = type === 'mag' ? getStat(battle, def, 'mdef') : getStat(battle, def, 'def');
  }
  const aTile = TERRAIN[battle.grid[att.y][att.x]];
  const dTile = TERRAIN[battle.grid[def.y][def.x]];
  if (aTile.atkMod && !att.flyer) P *= aTile.atkMod;
  if (dTile.defMod && !def.flyer) D *= dTile.defMod;
  const base = (P * P) / (P + D) * 4;
  // 兵が減るほど部隊は弱くなる（単騎のヤギューは別）
  const strength = att.solo ? 1 : 0.5 + 0.5 * att.hp / att.max;
  let tri = 1;
  if (att.tri && def.tri) {
    if (TRI_ADV[att.tri] === def.tri) tri = 1.3;
    else if (TRI_ADV[def.tri] === att.tri) tri = 0.8;
  }
  let mod = opts.mult || 1;
  if (active(battle, def.markUntil)) mod *= 1.2;                                    // 黒いですカー？の印
  if ((def.effects || []).some(e => e.tag === 'shinka' && active(battle, e.until))) mod *= 0.5; // 神化：受けるダメージ半分
  return Math.max(1, Math.round(base * strength * tri * mod));
}

export const WALL_HP = 200;
