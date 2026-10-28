// 日々のできごと（旅の商人・盗賊・はぐれ魔物・豊作/不作・大雨/大雪・反乱）
// 1日の終わりに起きて、次の日のあいだに対応を選ぶ。選ばなければ「◯◯（ふつうの対応）」になる。
// 結果は確率ではなく、選ぶ前に見える数字で決まる（盗賊の強さと、守る兵や勇者の強さをくらべる）。
import {
  TERRITORIES, CHARACTERS, HERO_ROLES, MATERIALS, neighbors, edgeKey, gameStats, isInjured,
} from '../shared/data.js';

// ゲームごと・日ごとに決まる乱数（同じセーブデータなら同じことが起きる）
function rng(game, salt) {
  let h = 2166136261;
  for (const c of `${game.id}:${game.day}:${salt}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const sideName = s => (s === 'kingdom' ? '王国' : '魔族');

// 勇者が退治に行ったときの強さ
export function heroPower(game, hero) {
  const g = game.generals[hero];
  const st = gameStats(game, hero);
  return Math.round(Math.max(st.atk, st.mag) * 8 + g.hp * 0.5);
}

// 盗賊・魔物に、近くの勇者が行ったらどうなるか（選ぶ前に見せる）
export function heroOutcome(game, hero, strength) {
  const p = heroPower(game, hero);
  if (p >= strength * 1.5) return { power: p, text: '楽に勝てる', injury: 0, hpLoss: 0 };
  if (p >= strength) return { power: p, text: '勝てるが、怪我をする（2日）', injury: 2, hpLoss: 0.15 };
  return { power: p, text: '苦戦して大怪我（4日）。本隊も3割へる', injury: 4, hpLoss: 0.3 };
}

function garrisonOutcome(t, strength) {
  if (t.garrison >= strength * 1.5) return { text: `追い払える（兵${Math.round(strength * 0.3)}人へる）`, loss: Math.round(strength * 0.3), win: true, dmg: 0 };
  if (t.garrison >= strength) return { text: `なんとか追い払える（兵${Math.round(strength * 0.6)}人へる・荒れる3日）`, loss: Math.round(strength * 0.6), win: true, dmg: 3 };
  return { text: '守りきれない（兵の半分を失い、民と食料もうばわれる）', loss: Math.round(t.garrison * 0.5), win: false, dmg: 5 };
}

// 陣地にいる勇者、なければとなりの勇者
function nearbyHeroes(game, tid) {
  const near = [tid, ...neighbors(tid, 'kingdom', game.closed)];
  return HERO_ROLES.filter(h => game.generals[h]?.status === 'active' && near.includes(game.generals[h].location))
    .sort((a, b) => (game.generals[a].location === tid ? 0 : 1) - (game.generals[b].location === tid ? 0 : 1));
}

// ---------- できごとの中身 ----------
function raidIncident(game, kind, tid, strength, fromYagyu) {
  const t = game.territories[tid];
  const T = TERRITORIES[tid];
  const monster = kind === 'monster';
  const what = monster ? (fromYagyu ? 'ヤギューが送りこんだ魔物' : 'はぐれ魔物') : '盗賊';
  const choices = [];
  const go = garrisonOutcome(t, strength);
  choices.push({ id: 'garrison', label: '陣地の兵で戦う', desc: go.text });
  for (const h of nearbyHeroes(game, tid)) {
    const o = heroOutcome(game, h, strength);
    choices.push({ id: 'hero:' + h, label: `${CHARACTERS[h].name}に退治してもらう`, desc: `${CHARACTERS[h].name}の強さ${o.power}：${o.text}` });
  }
  if (!monster) choices.push({ id: 'pay', label: `お金${Math.round(strength * 0.8)}で引き取ってもらう`, desc: '何も失わないが、お金がかかる' });
  choices.push({ id: 'ignore', label: '何もしない', desc: '民と食料がうばわれ、陣地が荒れる。忠誠も下がる' });
  return {
    kind, side: 'kingdom', tid, strength,
    title: `${T.name}に${what}`,
    text: `${T.name}に${what}（強さ${strength}）があらわれた。陣地の兵は${t.garrison}人。${monster ? '倒せば魔物の素材が手に入る。' : ''}`,
    choices, def: 'garrison',
  };
}

function merchantIncident(game, rand) {
  const rares = Object.keys(MATERIALS).filter(k => MATERIALS[k].rare && k !== 'officer');
  const basics = Object.keys(MATERIALS).filter(k => !MATERIALS[k].rare && k !== 'monster');
  const a = pick(rand, rares), b = pick(rand, basics);
  const offers = [
    { id: 'buy:' + a, mat: a, n: 3, gold: 180 },
    { id: 'buy:' + b, mat: b, n: 6, gold: 90 },
  ];
  return {
    kind: 'merchant', side: 'kingdom', tid: 0, offers,
    title: '旅の商人',
    text: '旅の商人が王都にやってきた。「珍しい品がありますよ」',
    choices: [
      ...offers.map(o => ({ id: o.id, label: `${MATERIALS[o.mat].name}を${o.n}つ買う`, desc: `お金${o.gold}` })),
      { id: 'both', label: '両方買う', desc: `お金${offers[0].gold + offers[1].gold}` },
      { id: 'ignore', label: '買わない', desc: '' },
    ],
    def: 'ignore',
  };
}

function harvestIncident(game, side, good, amount) {
  const K = side === 'kingdom';
  if (good) return {
    kind: 'harvest', side, good, amount, tid: null,
    title: `${sideName(side)}の豊作`,
    text: `今年は${K ? '王国' : '魔族の土地'}の畑がよく実った（食料${amount}ぶん）。`,
    choices: K
      ? [{ id: 'store', label: '蓄える', desc: `食料+${amount}` }, { id: 'share', label: '民にふるまう', desc: `食料+${Math.round(amount / 2)}、王国の全陣地の忠誠+8` }]
      : [{ id: 'store', label: '蓄える', desc: `食料+${amount}` }, { id: 'mountain', label: '山の民へ送る', desc: `食料は増えないが、山の民が喜び魔力+${Math.round(amount / 8)}` }],
    def: 'store',
  };
  return {
    kind: 'harvest', side, good, amount, tid: null,
    title: `${sideName(side)}の不作`,
    text: `日照りで、${K ? '王国' : '魔族の土地'}の畑が実らなかった（食料${amount}ぶんが足りない）。`,
    choices: K
      ? [{ id: 'open', label: '倉を開く', desc: `食料-${amount}` }, { id: 'endure', label: '民に我慢させる', desc: '王国の全陣地の忠誠-10、民が3%へる' }]
      : [{ id: 'open', label: '倉を開く', desc: `食料-${amount}` }, { id: 'squeeze', label: '恐怖で取り立てる', desc: '魔族の全陣地の恐怖+10、民が5%へる' }],
    def: 'open',
  };
}

function weatherIncident(game, tid, snow) {
  const t = game.territories[tid];
  const T = TERRITORIES[tid];
  const side = t.owner;
  const K = side === 'kingdom';
  return {
    kind: 'weather', side, tid, snow,
    title: snow ? `${T.name}に大雪` : `${T.name}で大雨`,
    text: snow ? `${T.name}のまわりの山道が雪でうまった。しばらく通れない。` : `大雨で${T.name}の川があふれ、まわりの道が通れなくなった。`,
    choices: snow
      ? [{ id: 'clear', label: '雪かきをする', desc: `${K ? 'お金60' : '魔力10'}：通れない日が1日ですむ` }, { id: 'wait', label: '雪がとけるのを待つ', desc: '4日間通れない' }]
      : [{ id: 'dike', label: '堤防を築く', desc: `${K ? 'お金100' : '魔力20'}：畑は守れる（道は3日通れない）` }, { id: 'wait', label: '様子を見る', desc: '道は3日通れず、畑が流されて荒れる（4日）' }],
    def: 'wait',
  };
}

function rebelIncident(game, tid) {
  const t = game.territories[tid];
  const T = TERRITORIES[tid];
  const K = t.owner === 'kingdom';
  return {
    kind: 'rebel', side: t.owner, tid,
    title: `${T.name}で反乱の気配`,
    text: K ? `${T.name}の民が王国への不満を口にしている（忠誠${t.loyalty}）。このままだと2日後に独立してしまう。`
      : `${T.name}の民が魔族を恐れなくなってきた（恐怖${t.fear}）。このままだと2日後に独立してしまう。`,
    choices: K
      ? [{ id: 'calm', label: '施しでなだめる', desc: '食料100：忠誠+25' }, { id: 'force', label: '力で抑える', desc: '兵100人・民200人を失う。忠誠+10、ほかの陣地の忠誠-3' }, { id: 'ignore', label: '放っておく', desc: '2日後に独立するかもしれない' }]
      : [{ id: 'calm', label: '恐怖で抑える', desc: '魔力20：恐怖+25' }, { id: 'force', label: '見せしめにする', desc: '民300人を失う。恐怖+40' }, { id: 'ignore', label: '放っておく', desc: '2日後に独立するかもしれない' }],
    def: K ? 'calm' : 'calm',
  };
}

// ---------- 1日の終わりに、次の日のできごとを起こす ----------
export function rollIncidents(game) {
  game.incidents ||= [];
  game.incidentCount ||= 0;
  const add = (inc) => { game.incidents.push({ id: 'i' + (++game.incidentCount), day: game.day, choice: null, ...inc }); };
  const rand = rng(game, 'daily');
  const mine = (side) => game.territories.filter(t => t.owner === side);

  // ヤギューが送りこんだ魔物（必ず起きる）
  for (const m of game.sentMonsters || []) {
    if (game.territories[m.tid].owner === 'kingdom') add(raidIncident(game, 'monster', m.tid, m.strength, true));
  }
  game.sentMonsters = [];

  // 反乱の気配（不満が3日続いた陣地）
  for (const t of game.territories) {
    if (t.rebel === 3 && (t.owner === 'kingdom' || t.owner === 'demon') && t.id !== 0 && t.id !== 28) add(rebelIncident(game, t.id));
  }

  // 王国のできごと（だいたい2日に1回）
  if (rand() < 0.5) {
    const r = rand();
    const kt = mine('kingdom').filter(t => t.id !== 0);
    if (r < 0.2) add(merchantIncident(game, rand));
    else if (r < 0.45 && kt.length) add(raidIncident(game, 'bandit', pick(rand, kt).id, Math.min(400, 100 + game.day * 2 + Math.floor(rand() * 60))));
    else if (r < 0.65 && kt.length) add(raidIncident(game, 'monster', pick(rand, kt).id, Math.min(500, 150 + game.day * 2 + Math.floor(rand() * 80))));
    else if (r < 0.85) add(harvestIncident(game, 'kingdom', rand() < 0.5, 150 + game.day * 2));
    else {
      const wet = kt.filter(t => TERRITORIES[t.id].terrain === 'river' || TERRITORIES[t.id].terrain === 'forest');
      if (wet.length) add(weatherIncident(game, pick(rand, wet).id, false));
    }
  }
  // 魔族のできごと（だいたい4日に1回）
  if (rand() < 0.25) {
    const dt = mine('demon').filter(t => t.id !== 28);
    if (rand() < 0.5) add(harvestIncident(game, 'demon', rand() < 0.5, 120 + game.day * 2));
    else {
      const hills = dt.filter(t => TERRITORIES[t.id].terrain === 'mountain');
      if (hills.length) add(weatherIncident(game, pick(rand, hills).id, true));
    }
  }
}

// 対応を選ぶ
export function chooseIncident(game, role, id, choice) {
  const inc = (game.incidents || []).find(x => x.id === id);
  if (!inc || inc.resolved) throw new Error('そのできごとはありません');
  const side = role === 'yagyu' ? 'demon' : 'kingdom';
  if (inc.side !== side) throw new Error('あなたの陣営のできごとではありません');
  if (!inc.choices.some(c => c.id === choice)) throw new Error('その対応はありません');
  inc.choice = choice;
  inc.by = role;
}

const injure = (game, hero, days) => {
  game.injuries ||= {};
  game.injuries[hero] = Math.max(game.injuries[hero] || 0, game.day + days);
};

// その日の結果を出すときに、選ばれた対応を反映する
export function resolveIncidents(game) {
  const log = (s) => game.log.push(`《できごと》${s}`);
  for (const inc of (game.incidents || []).filter(x => !x.resolved)) {
    inc.resolved = true;
    const choice = inc.choice || inc.def;
    inc.result = choice;
    const R = game.resources[inc.side];
    const t = inc.tid != null ? game.territories[inc.tid] : null;
    const T = inc.tid != null ? TERRITORIES[inc.tid] : null;
    if (t && t.owner !== inc.side && inc.kind !== 'weather') { log(`${inc.title}：もう${sideName(inc.side)}の陣地ではない`); continue; }
    switch (inc.kind) {
      case 'bandit':
      case 'monster': {
        const S = inc.strength;
        const monster = inc.kind === 'monster';
        let won = false;
        if (choice === 'garrison') {
          const o = garrisonOutcome(t, S);
          t.garrison -= o.loss;
          if (o.dmg) t.damaged = Math.max(t.damaged, o.dmg);
          won = o.win;
          if (!won) { t.pop = Math.max(100, t.pop - S); R.food = Math.max(0, R.food - Math.round(S / 2)); t.loyalty = Math.max(0, t.loyalty - 10); }
          log(`${inc.title}：陣地の兵で${won ? '追い払った' : '守りきれなかった'}（兵${o.loss}人へった）`);
        } else if (choice.startsWith('hero:')) {
          const hero = choice.slice(5);
          const g = game.generals[hero];
          if (!g || g.status !== 'active') { log(`${inc.title}：${CHARACTERS[hero].name}は来られなかった`); inc.result = 'ignore'; continue; }
          const o = heroOutcome(game, hero, S);
          won = true;
          if (o.injury) injure(game, hero, o.injury);
          if (o.hpLoss) {
            const max = gameStats(game, hero).hp;
            g.hp -= Math.round(max * o.hpLoss);
            if (g.hp <= max * 0.1) {
              // 倒れることもある
              g.hp = 1;
              g.status = 'down'; g.location = null; g.respawnDay = game.day + 3;
              log(`${inc.title}：${CHARACTERS[hero].name}は退治したが、倒れてしまった`);
              break;
            }
          }
          log(`${inc.title}：${CHARACTERS[hero].name}が退治した${o.injury ? `（怪我${o.injury}日）` : ''}`);
        } else if (choice === 'pay') {
          const cost = Math.round(S * 0.8);
          if (R.gold >= cost) { R.gold -= cost; log(`${inc.title}：お金${cost}で引き取ってもらった`); continue; }
          log(`${inc.title}：お金が足りなかった`);
          inc.result = 'ignore';
        }
        if (inc.result === 'ignore' || choice === 'ignore') {
          t.pop = Math.max(100, t.pop - S);
          R.food = Math.max(0, R.food - Math.round(S / 2));
          t.damaged = Math.max(t.damaged, 4);
          t.loyalty = Math.max(0, t.loyalty - 10);
          if (monster) t.garrison = Math.max(0, t.garrison - Math.round(S * 0.3));
          log(`${inc.title}：何もできず、民と食料がうばわれた`);
        }
        if (won && monster) { R.materials.monster += 2; log('魔物の素材を2つ手に入れた'); }
        break;
      }
      case 'merchant': {
        const buys = choice === 'both' ? inc.offers : inc.offers.filter(o => o.id === choice);
        for (const o of buys) {
          if (R.gold < o.gold) { log(`旅の商人：お金が足りず${MATERIALS[o.mat].name}を買えなかった`); continue; }
          R.gold -= o.gold;
          R.materials[o.mat] += o.n;
          log(`旅の商人から${MATERIALS[o.mat].name}を${o.n}つ買った`);
        }
        break;
      }
      case 'harvest': {
        const A = inc.amount;
        const terrs = game.territories.filter(x => x.owner === inc.side);
        if (inc.good) {
          if (choice === 'store') R.food += A;
          else if (choice === 'share') { R.food += Math.round(A / 2); for (const x of terrs) x.loyalty = Math.min(100, x.loyalty + 8); }
          else if (choice === 'mountain') R.magic += Math.round(A / 8);
        } else if (choice === 'open' && R.food >= A) R.food -= A;
        else if (inc.side === 'kingdom') { for (const x of terrs) { x.loyalty = Math.max(0, x.loyalty - 10); x.pop = Math.round(x.pop * 0.97); } }
        else for (const x of terrs) { x.fear = Math.min(100, x.fear + 10); x.pop = Math.round(x.pop * 0.95); }
        log(`${inc.title}：${inc.choices.find(c => c.id === choice)?.label || '倉を開けず、民に我慢させた'}`);
        break;
      }
      case 'weather': {
        const K = inc.side === 'kingdom';
        let days = inc.snow ? 4 : 3;
        if (choice === 'clear' && (K ? R.gold >= 60 : R.magic >= 10)) { if (K) R.gold -= 60; else R.magic -= 10; days = 1; }
        if (choice === 'dike' && (K ? R.gold >= 100 : R.magic >= 20)) { if (K) R.gold -= 100; else R.magic -= 20; }
        else if (!inc.snow) { t.damaged = Math.max(t.damaged, 4); t.farm = Math.max(5, Math.round(t.farm * 0.9)); }
        game.closed ||= {};
        for (const n of neighbors(inc.tid, 'demon')) game.closed[edgeKey(inc.tid, n)] = game.day + days - 1;
        log(`${inc.title}：まわりの道が${days}日通れない`);
        break;
      }
      case 'rebel': {
        const K = t.owner === 'kingdom';
        if (choice === 'calm') {
          if (K && R.food >= 100) { R.food -= 100; t.loyalty = Math.min(100, t.loyalty + 25); t.rebel = 0; }
          else if (!K && R.magic >= 20) { R.magic -= 20; t.fear = Math.min(100, t.fear + 25); t.rebel = 0; }
          else { log(`${inc.title}：なだめる力が足りなかった`); break; }
        } else if (choice === 'force') {
          t.pop = Math.max(100, t.pop - (K ? 200 : 300));
          t.rebel = 0;
          if (K) {
            t.garrison = Math.max(0, t.garrison - 100);
            t.loyalty = Math.min(100, t.loyalty + 10);
            for (const x of game.territories) if (x.owner === 'kingdom' && x !== t) x.loyalty = Math.max(0, x.loyalty - 3);
          } else t.fear = Math.min(100, t.fear + 40);
        }
        log(`${inc.title}：${inc.choices.find(c => c.id === choice).label}`);
        break;
      }
    }
  }
  // 古いできごとは捨てる（履歴は最近の30件だけ）
  game.incidents = game.incidents.filter(x => !x.resolved).concat(game.incidents.filter(x => x.resolved).slice(-30));
}

// 1日の終わり：怪我の回復と、通れない道の回復
export function dailyRecovery(game) {
  for (const [hero, until] of Object.entries(game.injuries || {})) {
    if (!isInjured(game, hero)) { delete game.injuries[hero]; continue; }
    const g = game.generals[hero];
    if (!g || g.status !== 'active') continue;
    // 回復役（野口の技、のぞちちの薬）がいれば早く治る
    const nog = game.generals.noguchi;
    const withNoguchi = hero !== 'noguchi' && nog?.status === 'active' && nog.location === g.location && (game.chars.noguchi.level || 1) >= 5;
    const atCapital = g.location === 0 && game.generals.nozomi?.status === 'active';
    if (withNoguchi || atCapital) {
      game.injuries[hero] = until - 1;
      game.log.push(`${CHARACTERS[hero].name}の怪我は${withNoguchi ? '野口の魔法' : 'のぞちちの薬'}で早く治っている`);
    }
  }
  for (const [k, until] of Object.entries(game.closed || {})) if (until <= game.day) delete game.closed[k];
}

// ヤギューの「魔物を送る」
export function sendMonsters(game, tid, strength) {
  game.sentMonsters ||= [];
  // 王国には秘密（できごとの名前で、あとから分かる）
  game.sentMonsters.push({ tid, strength });
}

