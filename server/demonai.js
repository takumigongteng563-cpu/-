// 魔族のAI（ヤギューを人が動かさないとき）。ヤギュー・幹部・魔将の移動と、魔族の内政を決める。
// 返す形は、人がヤギューとして出す命令（orders.yagyu）と同じ。
import {
  HERO_ROLES, neighbors, canRemodel, garrisonCap, levelUpCost,
} from '../shared/data.js';
import { territoryStrength, stepToward, actionCost, demonActionCount } from './game.js';
import { planMoves } from './ai.js';

function demonMoves(game) {
  const gens = Object.values(game.generals).filter(g => g.status === 'active' && g.side === 'demon' && g.controller === 'ai' && !g.temp);
  // 魔王城がねらわれていたら、ヤギューは戻って守る
  const castleThreat = neighbors(28, 'kingdom', game.closed).reduce((a, n) => a + territoryStrength(game, n, 'kingdom'), 0);
  const castleGuard = territoryStrength(game, 28, 'demon');
  const y = game.generals.yagyu;
  const moves = {};
  let rest = gens;
  if (y?.status === 'active' && y.controller === 'ai' && castleThreat > castleGuard * 0.8 && y.location !== 28) {
    const step = stepToward(game, y, n => n === 28);
    if (step !== null) { moves.yagyu = step; rest = gens.filter(g => g !== y); }
  }
  // 追いつめられたら（陣地が4つ以下）、ヤギューたちは不利でも打って出る
  const cornered = game.territories.filter(t => t.owner === 'demon').length <= 4;
  return { ...planMoves(game, 'demon', rest, cornered ? 0.8 : 1.3), ...moves };
}

function demonInternal(game) {
  const R = game.resources.demon;
  const max = demonActionCount(game);
  const acts = {};
  const globals = [];
  let magic = R.magic;
  let n = 0;
  const add = (a) => {
    if (n >= max) return false;
    const cost = a.type === 'levelup' ? levelUpCost(game.chars[a.charId].level) : (actionCost(game, 'demon', a.type, a.facility).magic || 0);
    if (cost > magic) return false;
    magic -= cost;
    if (a.type === 'levelup' || a.type === 'curse') globals.push(a); else acts['ai' + n] = a;
    n++;
    return true;
  };
  const mine = game.territories.filter(t => t.owner === 'demon');
  const isFront = (t) => neighbors(t.id, 'demon').some(m => game.territories[m].owner !== 'demon');
  // 1. 恐怖が下がった陣地をおどす（反乱を防ぐ）
  for (const t of mine.filter(x => x.fear < 30).sort((a, b) => a.fear - b.fear)) add({ type: 'terror', tid: t.id });
  // 2. 食料が少なければ開墾
  if (R.food < 300) { const t = mine.sort((a, b) => a.farm - b.farm)[0]; if (t) add({ type: 'farm', tid: t.id }); }
  // 3. まずレベル上げ（ヤギューを優先、幹部は低い順）。手下づくりのぶんは少し残す
  const order = () => ['yagyu', ...['car', 'oh', 'kkb'].sort((x, y) => game.chars[x].level - game.chars[y].level)];
  for (let i = 0; i < 2; i++) {
    const pick = order().find(c => game.chars[c].level < 30 && levelUpCost(game.chars[c].level) <= magic);
    if (!pick || !add({ type: 'levelup', charId: pick })) break;
  }
  // 4. 前線の兵が少ない陣地に手下を生む
  const weak = mine.filter(x => (isFront(x) || x.id === 28) && x.garrison < garrisonCap(x) * 0.5).sort((a, c) => a.garrison - c.garrison);
  for (const t of weak.slice(0, magic >= 80 ? 3 : 1)) add({ type: 'spawn', tid: t.id });
  // 5. ときどき作り変え：前線は岩の砦、奥は恐怖の塔
  if (game.day % 6 === 0) {
    const t = mine.find(x => canRemodel(x.id) && !x.facility && !isFront(x)) || mine.find(x => canRemodel(x.id) && !x.facility);
    if (t) add({ type: 'build', tid: t.id, facility: isFront(t) ? 'rock' : 'fear' });
  }
  // 6. ときどき王国に魔物を送る・勇者を呪う
  if (game.day % 6 === 3 && magic >= 60) {
    const target = game.territories.filter(t => t.owner === 'kingdom' && t.id !== 0).sort((a, b) => a.garrison - b.garrison)[0];
    if (target) add({ type: 'monsters', tid: target.id });
  }
  if (game.day % 7 === 0 && magic >= 80) {
    const hero = HERO_ROLES.find(h => game.generals[h]?.status === 'active' && neighbors(game.generals[h].location, 'kingdom').some(m => game.territories[m].owner === 'demon'));
    if (hero && hero !== 'noguchi') add({ type: 'curse', charId: hero });
  }
  // 7. 残りの魔力で、もう一度レベル上げ
  const pick = order().find(c => game.chars[c].level < 30 && levelUpCost(game.chars[c].level) <= magic);
  if (pick) add({ type: 'levelup', charId: pick });
  return { acts, globals };
}

export function demonAIOrders(game) {
  const { acts, globals } = demonInternal(game);
  return { moves: demonMoves(game), acts, globals };
}

// AIの陣営のできごとに、対応を選ぶ
export function aiIncidentChoices(game, side) {
  for (const inc of (game.incidents || []).filter(i => !i.resolved && !i.choice && i.side === side)) {
    const R = game.resources[side];
    const ids = inc.choices.map(c => c.id);
    let choice = inc.def;
    if (inc.kind === 'bandit' || inc.kind === 'monster') {
      const hero = ids.find(c => c.startsWith('hero:') && inc.choices.find(x => x.id === c).desc.includes('楽に'));
      const t = game.territories[inc.tid];
      if (hero) choice = hero;
      else if (t.garrison >= inc.strength) choice = 'garrison';
      else if (ids.includes('pay') && R.gold >= inc.strength) choice = 'pay';
    } else if (inc.kind === 'merchant') choice = R.gold > 900 ? 'both' : R.gold > 500 ? ids[0] : 'ignore';
    else if (inc.kind === 'harvest') choice = inc.good ? 'store' : (R.food > inc.amount * 2 ? 'open' : (side === 'kingdom' ? 'endure' : 'squeeze'));
    else if (inc.kind === 'weather') choice = inc.snow ? (R.magic >= 30 ? 'clear' : 'wait') : ((side === 'kingdom' ? R.gold >= 300 : R.magic >= 40) ? 'dike' : 'wait');
    else if (inc.kind === 'rebel') choice = (side === 'kingdom' ? R.food >= 300 : R.magic >= 40) ? 'calm' : 'force';
    if (ids.includes(choice)) inc.choice = choice;
  }
}

