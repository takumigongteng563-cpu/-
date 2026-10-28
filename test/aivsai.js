// AIどうし（王国AI vs 魔族AI）で何回もゲームを最後まで流して、勝ち負けと日数を見る
//   node test/aivsai.js [回数] [最大日数]
import * as G from '../server/game.js';

const N = Number(process.argv[2] || 10), MAXDAY = Number(process.argv[3] || 200);
const res = { kingdom: 0, demon: 0, none: 0 };
const days = [];
for (let i = 0; i < N; i++) {
  const game = G.createGame('AI' + i, { allowNoHumans: true });
  G.start(game);
  let guard = 0;
  while (game.phase !== 'ended' && game.day <= MAXDAY && guard++ < 200000) {
    if (game.phase === 'day') G.resolveDayForTest(game);
    else G.autoBattleStep(game);
  }
  res[game.winner || 'none']++;
  const own = s => game.territories.filter(t => t.owner === s).length;
  days.push(game.day);
  console.log(`${i + 1}: ${game.winner || '決着なし'} ${game.day}日目 王国${own('kingdom')} 魔族${own('demon')} 中立${own('neutral')} 合戦${game.stats.battles} Lv:ヤギュー${game.chars.yagyu.level} スミレ${game.chars.sumire.level}`);
}
console.log('結果', res, '平均日数', Math.round(days.reduce((a, b) => a + b, 0) / N));
