// 合戦のバランス確認：いろいろな組み合わせをAIどうしで戦わせて、王国の勝率を見る
//   node test/balance.js [レベル] [訓練]
import * as G from '../server/game.js';
import { createBattle, startBattle, aiStep } from '../server/battle.js';

const lv = Number(process.argv[2] || 1), training = Number(process.argv[3] || 0), N = 24;
const MATCHES = {
  '勇者3人 vs 幹部3人': [['sumire', 'noguchi', 'nanase'], ['car', 'oh', 'kkb']],
  '勇者1人 vs 幹部1人': [['sumire'], ['kkb']],
  '勇者3人＋兵2 vs ヤギュー': [['sumire', 'noguchi', 'nanase', 's1', 's2'], ['yagyu']],
  '勇者3人＋兵2 vs ヤギュー＋幹部1': [['sumire', 'noguchi', 'nanase', 's1', 's2'], ['yagyu', 'kkb']],
  '全力 vs 全力': [['sumire', 'noguchi', 'nanase', 's1', 's2'], ['yagyu', 'car', 'oh', 'kkb', 'm1']],
};
for (const [label, [K, D]] of Object.entries(MATCHES)) {
  let kw = 0, rounds = 0;
  for (let i = 0; i < N; i++) {
    const game = G.createGame('t', {});
    for (const c of Object.keys(game.chars)) game.chars[c].level = lv;
    G.join(game, 'yagyu', 'y'); G.join(game, 'sumire', 's'); G.start(game);
    game.resources.kingdom.training = training;
    game.day = i + 1;
    const sold = (n, t) => ({ id: n, name: n, side: 'kingdom', kind: 'soldier', status: 'active', location: 16, troops: [{ uid: n + 't', type: t, q: 'kingdom', hp: 300, max: 300 }] });
    game.generals.s1 = sold('s1', 'spear'); game.generals.s2 = sold('s2', 'archer');
    game.generals.m1 = { id: 'm1', name: '魔将', side: 'demon', kind: 'majo', status: 'active', location: 16, troops: [{ uid: 'm1t', type: 'orc', q: 'zako', hp: 300, max: 300 }] };
    for (const id of [...K, ...D]) { const g = game.generals[id]; if (g.charId) g.hp = 99999; }
    for (const g of Object.values(game.generals)) g.controller = 'ai';
    const att = i % 2 ? 'kingdom' : 'demon';
    const b = createBattle(game, { territoryId: [16, 13, 17, 11, 15, 12][i % 6], attackerSide: att, defenderSide: att === 'kingdom' ? 'demon' : 'kingdom', attackers: att === 'kingdom' ? K : D, defenders: att === 'kingdom' ? D : K });
    for (const u of b.units) if (u.hp > u.max) u.hp = u.max;
    startBattle(b);
    let guard = 5000; while (!b.result && guard--) aiStep(b);
    if (b.result.winner === 'kingdom') kw++;
    rounds += b.round;
  }
  console.log(`Lv${lv} 訓練${training} ${label}: 王国勝率 ${Math.round(kw / N * 100)}%（平均${(rounds / N).toFixed(1)}ターン）`);
}
