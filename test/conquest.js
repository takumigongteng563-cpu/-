// 群雄割拠：AIどうしで最後まで遊んで、決着がつくか調べる
// node test/conquest.js [回数] [勢力の数]
import * as G from '../server/game.js';

const N = Number(process.argv[2] || 10);
const F = Number(process.argv[3] || 6);
const wins = {}, days = [], reasons = {};
let battles = 0, alliances = 0;
for (let i = 0; i < N; i++) {
  const g = G.createGame('', { mode: 'conquest', bots: F, allowNoHumans: true });
  G.start(g);
  let guard = 200000;
  while (g.phase !== 'ended' && guard--) {
    if (g.phase === 'day') G.resolveDayForTest(g);
    else if (g.phase === 'battle') G.autoBattleStep(g);
  }
  if (g.phase !== 'ended') { console.log('終わらなかった', g.day); continue; }
  const w = g.winner.slice(2);
  wins[w] = (wins[w] || 0) + 1;
  days.push(g.day);
  battles += g.stats.battles;
  alliances += g.log.filter(l => l.includes('同盟を結んだ')).length;
  const r = g.ending.lines[0].text.split('！ ')[1];
  reasons[r] = (reasons[r] || 0) + 1;
}
console.log('勝った勢力', wins);
console.log('決着', reasons);
console.log('日数 平均', (days.reduce((a, b) => a + b, 0) / days.length).toFixed(1), '最短', Math.min(...days), '最長', Math.max(...days));
console.log('合戦の数 平均', (battles / N).toFixed(1));
