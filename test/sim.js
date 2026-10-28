// 人間の操作もAIにまかせて、ゲームを最後まで流してみるテスト
import * as G from '../server/game.js';
import { neighbors, TERRITORIES } from '../shared/data.js';

const days = Number(process.argv[2] || 150);
const seedPlayers = process.argv[3] === 'all' ? ['yagyu', 'sumire', 'noguchi', 'nanase'] : ['yagyu', 'sumire'];

const game = G.createGame('テスト', { trial: process.argv[4] === 'trial' });
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
    // できごとには、毎回ちがう対応を選んでみる
    for (const inc of game.incidents.filter(i => !i.resolved)) {
      const role = inc.side === 'demon' ? 'yagyu' : 'sumire';
      const c = inc.choices[game.day % inc.choices.length];
      G.incidentChoice(game, role, inc.id, c.id);
    }
    if (game.day % 6 === 3) {
      // 作り変えと闇の儀式も試す
      const dt = game.territories.find(t => t.owner === 'demon' && t.id !== 28 && !t.facility);
      const o = game.orders.yagyu;
      if (dt) o.acts = { ...o.acts, b: { type: 'build', facility: ['fear', 'nest', 'rock'][game.day % 3], tid: dt.id }, f: { type: 'darkFortify', tid: dt.id } };
      o.globals = [...o.globals, { type: 'curse', charId: 'sumire' }];
      G.setOrders(game, 'yagyu', o);
      const sg = Object.values(game.generals).find(g => g.kind === 'soldier' && g.controller === 'sumire' && g.status === 'active' && g.location !== 0);
      if (sg) { const k = game.orders.sumire; k.acts = { ...k.acts, [sg.id]: { type: 'build', facility: ['farm', 'market', 'fort', 'barracks', 'tower'][game.day % 5] } }; delete k.moves[sg.id]; G.setOrders(game, 'sumire', k); }
    }
    if (game.day % 4 === 0) {
      const kt = game.territories.find(t => t.owner === 'kingdom' && t.id !== 0);
      if (kt) { const o = game.orders.yagyu; o.acts = { ...o.acts, m: { type: game.day % 8 ? 'monsters' : 'monstersBig', tid: kt.id } }; G.setOrders(game, 'yagyu', o); }
    }
    for (const role of seedPlayers) G.setReady(game, role, true);
  } else if (game.phase === 'battle') {
    G.autoBattleStep(game);
  }
}

const own = s => game.territories.filter(t => t.owner === s).length;
console.log(`終了: ${game.day}日目 phase=${game.phase} winner=${game.winner}`);
console.log(`陣地 王国${own('kingdom')} 魔族${own('demon')} 中立${own('neutral')}  合戦${game.stats.battles}回`);
console.log('資源', JSON.stringify(game.resources), '追撃戦', game.stats.pursuits || 0, '討ち取り', game.stats.pursuitWins || 0);
console.log('民の被害', JSON.stringify(game.stats.civLoss));
console.log('できごと', game.log.filter(l => l.startsWith('《できごと》')).length, '件（最後の80行のうち）', JSON.stringify(game.injuries), '通れない道', JSON.stringify(game.closed));
console.log('イベント', game.eventLog.map(e => `${e.day}:${e.title}`).join(' / '));
console.log('施設', game.territories.filter(t => t.facility).map(t => `${TERRITORIES[t.id].name}:${t.facility}`).join(' '));
console.log('Lv', Object.entries(game.chars).map(([k, v]) => `${k}${v.level}`).join(' '));
for (const g of Object.values(game.generals)) console.log(' ', g.name, g.status, g.location != null ? TERRITORIES[g.location].name : '-', g.hp ?? '', g.troops.map(t => t.hp).join(','));
