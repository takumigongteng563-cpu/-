// 地図の上でのAIの攻め方（王国・魔族共通）
// となりにいる武将を集めて、勝てる陣地を一緒に攻める。攻め先がない武将は前線へ出る。
import { TERRITORIES, EDGES, neighbors } from '../shared/data.js';
import { genStrength, territoryStrength, stepToward } from './game.js';

function distanceFrom(target) {
  const dist = new Map([[target, 0]]);
  const q = [target];
  while (q.length) {
    const c = q.shift();
    for (const e of EDGES) {
      const n = e.a === c ? e.b : e.b === c ? e.a : null;
      if (n === null || dist.has(n)) continue;
      dist.set(n, dist.get(c) + 1);
      q.push(n);
    }
  }
  return dist;
}
const TO_CAPITAL = distanceFrom(0);
const TO_CASTLE = distanceFrom(28);

const needsRest = (game, g) => {
  const full = g.troops.length ? g.troops.reduce((a, t) => a + t.hp, 0) / (g.troops.length * 300) : 1;
  return full < 0.5 || (g.charId && g.hp < 120);
};

export function planMoves(game, side, gens, ratio = 1.3) {
  const moves = {};
  const enemySide = side === 'kingdom' ? 'demon' : 'kingdom';
  const goal = side === 'kingdom' ? TO_CASTLE : TO_CAPITAL;
  const free = [];
  for (const g of gens) {
    if (needsRest(game, g)) {
      const step = stepToward(game, g, n => game.territories[n].garrison >= 300);
      if (step !== null) moves[g.id] = step;
    } else free.push(g);
  }
  const strength = new Map(free.map(g => [g.id, genStrength(game, g)]));
  // 守り：となりに自分より強い敵の武将が来ていたら、強い味方のいる陣地へ下がる
  const enemyNear = (tid) => neighbors(tid, enemySide, game.closed).reduce((a, n) => a + Object.values(game.generals)
    .filter(x => x.status === 'active' && x.location === n && x.side === enemySide).reduce((s2, x) => s2 + genStrength(game, x), 0), 0);
  const localPower = (tid) => territoryStrength(game, tid, side);
  for (const g of ratio < 1 ? [] : free.slice()) {
    const threat = enemyNear(g.location);
    if (threat <= localPower(g.location) * 1.1) continue;
    const back = neighbors(g.location, side, game.closed).filter(n => game.territories[n].owner === side)
      .map(n => ({ n, p: localPower(n) - enemyNear(n) })).sort((a, c) => c.p - a.p)[0];
    if (back && back.p > localPower(g.location) - threat) { moves[g.id] = back.n; free.splice(free.indexOf(g), 1); }
  }
  let available = free.slice();
  // 攻め先を1つずつ決める
  for (let round = 0; round < 6 && available.length; round++) {
    let best = null;
    const targets = new Set();
    for (const g of available) for (const n of neighbors(g.location, side, game.closed)) if (game.territories[n].owner !== side) targets.add(n);
    for (const n of targets) {
      const t = game.territories[n];
      let enemy = territoryStrength(game, n, t.owner);
      // 中立の陣地に敵の武将がいれば、それも数える
      if (t.owner === 'neutral') enemy += territoryStrength(game, n, enemySide);
      const helpers = available.filter(g => neighbors(g.location, side, game.closed).includes(n))
        .sort((a, b) => strength.get(b.id) - strength.get(a.id));
      const sum = helpers.reduce((a, g) => a + strength.get(g.id), 0);
      if (sum < enemy * ratio) continue;
      let value = (t.owner === enemySide ? 1 : 0.7) + (10 - (goal.get(n) ?? 10)) * 0.08;
      if (TERRITORIES[n].metropolis) value += 0.4;
      // 相手の大将（ヤギュー／女王）や本拠地をねらう
      const bossHere = Object.values(game.generals).some(x => x.status === 'active' && x.location === n && (x.charId === 'yagyu' || x.charId === 'nozomi'));
      if (bossHere) value += 0.8;
      if (n === 0 || n === 28) value += 0.6;
      const score = value * Math.min(3, sum / (enemy + 1));
      if (!best || score > best.score) best = { n, score, enemy, helpers };
    }
    if (!best) break;
    // 勝てるだけの武将を、強い順に送る
    let sum = 0;
    for (const g of best.helpers) {
      if (sum >= best.enemy * Math.max(1.7, ratio + 0.4) && sum > 0) break;
      moves[g.id] = best.n;
      sum += strength.get(g.id);
      available = available.filter(x => x !== g);
    }
  }
  // 攻め先がない武将は、敵に近い前線へ出る
  const isFront = (n) => game.territories[n].owner === side && neighbors(n, side, game.closed).some(m => game.territories[m].owner !== side);
  for (const g of available) {
    if (isFront(g.location)) continue;
    const step = stepToward(game, g, isFront);
    if (step !== null) moves[g.id] = step;
  }
  return moves;
}
