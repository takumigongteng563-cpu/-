// すべての技を1回ずつ使ってみて、エラーにならず効果が出るかを確かめる
import * as G from '../server/game.js';
import { createBattle, startBattle, applyBattleAction } from '../server/battle.js';
import { SKILLS, skillTargets, skillList } from '../shared/skills.js';

let ok = 0, ng = 0;
for (const [charId, list] of Object.entries(SKILLS)) {
  for (const s of list.filter(x => x.kind === 'active' || x.kind === 'charge')) {
    const game = G.createGame('t', { trial: true });
    G.join(game, 'yagyu', 'y'); G.join(game, 'sumire', 's'); G.start(game);
    game.generals.horie = { id: 'horie', charId: 'horie', name: '堀江', side: 'kingdom', kind: 'horie', status: 'active', controller: 'ai', location: 16, hp: 500, troops: [] };
    const K = ['sumire', 'noguchi', 'nanase', 'horie', 'nozomi'];
    const D = ['yagyu', 'car', 'oh', 'kkb'];
    const b = createBattle(game, { territoryId: 16, attackerSide: 'demon', defenderSide: 'kingdom', attackers: D, defenders: K });
    startBattle(b);
    const u = b.units.find(x => x.charId === charId);
    // 敵と味方を近くに集める
    const allies = b.units.filter(x => x.side === u.side && x !== u).slice(0, 3);
    const enemies = b.units.filter(x => x.side !== u.side).slice(0, 4);
    u.x = 7; u.y = 5;
    [[6, 5], [7, 4], [8, 6]].forEach(([x, y], i) => { if (allies[i]) { allies[i].x = x; allies[i].y = y; } });
    [[8, 5], [9, 5], [7, 7], [9, 3]].forEach(([x, y], i) => { if (enemies[i]) { enemies[i].x = x; enemies[i].y = y; } });
    for (const x of b.units) if ((x.x === u.x && x.y === u.y && x !== u)) { x.x = 0; x.y = 0; }
    if (s.needs) u.effects.push({ tag: s.needs, stat: 'atk', mult: 1.4, until: 99 });
    b.active = { unitId: u.id, moved: false, ox: u.x, oy: u.y };
    const st = skillList(b, u).find(x => x.id === s.id);
    const { units, cells } = skillTargets(b, u, s);
    const action = { type: 'skill', skillId: s.id };
    if (s.target === 'enemy' || s.target === 'ally') action.targetId = units[0]?.id;
    if (s.target === 'enemy2' || s.target === 'ally2') action.targetIds = units.slice(0, 2).map(x => x.id);
    if (s.target === 'tile' || s.target === 'dir') { const c = cells.find(([x, y]) => x === 8 && y === 5) || cells[0]; action.x = c[0]; action.y = c[1]; }
    const before = b.log.length;
    try {
      if (!st.ok) throw new Error('使えない: ' + st.why);
      applyBattleAction(b, null, action);
      console.log(`○ ${charId} ${s.name}: ${b.log.slice(before, before + 3).join(' / ')}`);
      ok++;
    } catch (e) {
      console.log(`× ${charId} ${s.name}: ${e.message}`);
      ng++;
    }
  }
}
console.log(`成功 ${ok} / 失敗 ${ng}`);
process.exit(ng ? 1 : 0);
