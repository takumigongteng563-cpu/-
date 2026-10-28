// バトルロワイヤルを、AIだけで何回か最後まで流す
import * as G from '../server/game.js';
const N = Number(process.argv[2] || 10);
const wins = {}, rounds = [];
for (let i = 0; i < N; i++) {
  const game = G.createGame('', { mode: 'royale', bots: 6, level: [10, 20, 30][i % 3], allowNoHumans: true });
  G.start(game);
  let guard = 20000;
  while (game.phase === 'battle' && guard--) G.autoBattleStep(game);
  const r = game.royale.ranking;
  wins[r[0]?.charId || 'なし'] = (wins[r[0]?.charId || 'なし'] || 0) + 1;
  rounds.push(game.battle.round);
  if (i === 0) console.log(game.ending.lines.map(l => l.text).join('\n'));
}
console.log('優勝したキャラ', wins, '平均ターン', (rounds.reduce((a, b) => a + b, 0) / N).toFixed(1));
