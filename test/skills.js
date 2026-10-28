// 全員Lv30で大きな合戦を組み、AIどうしで戦わせて、技がちゃんと使われるか見るテスト
import * as G from '../server/game.js';
import { createBattle, startBattle, aiStep } from '../server/battle.js';
import { SKILLS } from '../shared/skills.js';

const runs = Number(process.argv[2] || 20);
const used = {};
const wins = { kingdom: 0, demon: 0 };
let rounds = 0;
for (let i = 0; i < runs; i++) {
  const game = G.createGame('技テスト', { trial: true });
  G.join(game, 'yagyu', 'y'); G.join(game, 'sumire', 's');
  G.start(game);
  game.day = i + 1;
  // 堀江も出す
  game.generals.horie = { id: 'horie', charId: 'horie', name: '堀江', side: 'kingdom', kind: 'horie', status: 'active', controller: 'ai', location: 16, hp: 320 + 7 * 29,
    troops: [{ uid: 'h1', type: 'spear', q: 'kingdom', hp: 300, max: 300 }] };
  for (const g of Object.values(game.generals)) g.controller = 'ai';
  const terr = [16, 0, 28, 13, 17][i % 5];
  const kingdom = ['sumire', 'noguchi', 'nanase', 'horie', terr === 0 ? 'nozomi' : null].filter(Boolean);
  const demon = ['yagyu', 'car', 'oh', 'kkb'];
  const b = createBattle(game, { territoryId: terr, attackerSide: i % 2 ? 'kingdom' : 'demon', defenderSide: i % 2 ? 'demon' : 'kingdom',
    attackers: i % 2 ? kingdom : demon, defenders: i % 2 ? demon : kingdom });
  startBattle(b);
  let guard = 3000;
  while (!b.result && guard--) aiStep(b);
  if (!b.result) { console.log('決着せず', i); continue; }
  wins[b.result.winner]++;
  rounds += b.round;
  for (const line of b.log) {
    const m = line.match(/の「(.+)」$/);
    if (m) used[m[1]] = (used[m[1]] || 0) + 1;
  }
  for (const k of ['愛情魂', '居合い切り', '追撃', '洛星', '始祖の力', '自然の恵み', '殺戮', '最盛期', '種爆弾が爆発', '立ち上がった', '溜めが消えた']) {
    used['（' + k + '）'] = (used['（' + k + '）'] || 0) + b.log.filter(l => l.includes(k)).length;
  }
}
console.log('勝ち', wins, '平均ターン', (rounds / runs).toFixed(1));
const all = Object.values(SKILLS).flat().filter(s => s.kind === 'active' || s.kind === 'charge').map(s => s.name);
console.log('使われた技:', Object.entries(used).map(([k, v]) => `${k}×${v}`).join(' '));
console.log('一度も使われなかった技:', all.filter(n => !used[n]).join(' ') || 'なし');
