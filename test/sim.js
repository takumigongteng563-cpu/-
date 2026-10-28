// 人間の操作もAIにまかせて、ゲームを最後まで流してみるテスト
import * as G from '../server/game.js';
import { aiStep } from '../server/battle.js';
import { neighbors, TERRITORIES } from '../shared/data.js';

const days = Number(process.argv[2] || 150);
const seedPlayers = process.argv[3] === 'all' ? ['yagyu', 'sumire', 'noguchi', 'nanase'] : ['yagyu', 'sumire'];

const game = G.createGame('テスト');
for (const r of seedPlayers) G.join(game, r, r);
G.start(game);

let guard = 0;
while (game.phase !== 'ended' && game.day <= days && guard++ < 100000) {
  if (game.phase === 'day') {
    for (const role of seedPlayers) {
      const moves = {};
      const acts = {};
      const globals = [];
      for (const g of Object.values(game.generals)) {
        if (g.controller !== role || g.status !== 'active' || g.kind === 'queen') continue;
        const ns = neighbors(g.location, g.side);
        const enemy = ns.filter(n => game.territories[n].owner !== g.side);
        const hpOk = g.troops.every(t => t.hp > 150);
        if (enemy.length && hpOk && game.day % 3 === 0) moves[g.id] = enemy[game.day % enemy.length];
        else if (role === 'yagyu' && game.day % 5 === 0 && ns.length) moves[g.id] = ns[0];
        else if (g.kind === 'soldier') acts[g.id] = { type: 'conscript' };
      }
      if (role === 'yagyu') {
        const mine = game.territories.filter(t => t.owner === 'demon');
        mine.slice(0, 2).forEach((t, i) => { acts['a' + i] = { type: i ? 'spawn' : 'terror', tid: t.id }; });
        globals.push({ type: 'levelup', charId: 'yagyu' });
      }
      G.setOrders(game, role, { moves, acts, globals });
    }
    for (const role of seedPlayers) G.setReady(game, role, true);
  } else if (game.phase === 'battle') {
    const b = game.battle;
    if (!b.result) aiStep(b);
    else G.battleAction(game, 'yagyu', { type: 'conclude' });
  }
}

const own = s => game.territories.filter(t => t.owner === s).length;
console.log(`終了: ${game.day}日目 phase=${game.phase} winner=${game.winner}`);
console.log(`陣地 王国${own('kingdom')} 魔族${own('demon')} 中立${own('neutral')}  合戦${game.stats.battles}回`);
console.log('資源', JSON.stringify(game.resources));
console.log('民の被害', JSON.stringify(game.stats.civLoss));
console.log('イベント', game.eventLog.map(e => `${e.day}:${e.title}`).join(' / '));
console.log('Lv', Object.entries(game.chars).map(([k, v]) => `${k}${v.level}`).join(' '));
for (const g of Object.values(game.generals)) console.log(' ', g.name, g.status, g.location != null ? TERRITORIES[g.location].name : '-', g.hp ?? '', g.troops.map(t => t.hp).join(','));
