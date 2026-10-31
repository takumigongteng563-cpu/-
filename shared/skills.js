// 技・パッシブ・個人スキルの一覧と、「どこを狙えるか」の計算。サーバーとブラウザで共通。
// 中身の動き（ダメージや効果）は server/battle.js の useSkill にある。
import { reachTiles, unitAt, isTargetable, getRange, inBounds, DIR4 } from './battlecore.js';

// kind: personal=個人スキル（いつも効いている） passive=パッシブ active=技 charge=溜め技
// target: enemy=敵1つ / enemy2=敵2つ / ally=味方1つ / ally2=味方2つ / tile=マスを指定 / self=自分中心 / dir=上下左右の向き
// reach: 狙える範囲（normal=通常攻撃と同じ、sq:n=nマス以内、line8:a-b など）
// once: 1合戦に1回
export const SKILLS = {
  sumire: [
    { id: 'yuga', name: '愛情魂（YUGA）', kind: 'personal', lv: 1, desc: '隣の味方部隊が攻撃されたら、必ずスミレがかばう。かばうたびに攻撃+5%（最大+30%）' },
    { id: 'kirisute', name: '切り捨て', kind: 'active', lv: 5, mp: 6, target: 'enemy', reach: 'normal', desc: '威力1.3倍の斬撃。相手の兵が3割以下なら一撃で倒す' },
    { id: 'iai', name: '居合い切り', kind: 'passive', lv: 10, desc: '隣の敵に攻撃されたら、先に斬り返す（1ターンに1回・通常攻撃の半分）' },
    { id: 'tehodoki', name: '手ほどき', kind: 'active', lv: 15, mp: 5, target: 'ally', reach: 'adj8', desc: '隣の味方部隊1つの攻撃を3ターン+20%' },
    { id: 'tokon', name: '闘魂切り', kind: 'active', lv: 20, mp: 8, target: 'enemy', reach: 'normal', desc: '自分のHPを1割削って、威力2倍の斬撃' },
    { id: 'satsuriku', name: '殺戮', kind: 'passive', lv: 25, desc: '敵部隊を倒したら、もう一度行動できる（1ターンに1回・2回目は技なし）' },
    { id: 'yaguri', name: '屠羊ノ太刀（やぎゅり）', kind: 'active', lv: 30, mp: 15, once: true, target: 'enemy', reach: 'normal', desc: '魔族に威力2.5倍、ヤギューには3.5倍' },
  ],
  noguchi: [
    { id: 'kuchikawaki', name: 'くちかわき', kind: 'personal', lv: 1, desc: '敵の隣にいないかぎり、敵から狙われない。攻撃した直後の1ターンだけ気づかれる' },
    { id: 'iyashi', name: 'いやしの魔法', kind: 'active', lv: 5, mp: 5, target: 'ally', reach: 'sq:2', self: true, desc: '2マス以内の味方部隊1つを回復（魔力×4）' },
    { id: 'mukanjo', name: '無感情', kind: 'passive', lv: 10, desc: '毒・眠り・呪いを受けない' },
    { id: 'gunyu', name: 'のぐ乳', kind: 'active', lv: 15, mp: 8, target: 'self', area: 'sq:2', desc: '周り2マスの味方部隊の攻撃・防御を2ターン+15%' },
    { id: 'ame', name: 'ノ具血之雨', kind: 'active', lv: 20, mp: 10, target: 'tile', reach: 'sq:4', area: 'cross', desc: '指定したマスを中心に、十字5マスの敵に魔法の雨（威力0.9倍）' },
    { id: 'heel', name: '野口ハイヒール', kind: 'active', lv: 25, mp: 14, target: 'self', area: 'sq:2', desc: '周り2マスの味方部隊を全部大きく回復（魔力×6）し、状態異常も治す' },
    { id: 'saiseiki', name: '野口の最盛期', kind: 'active', lv: 30, mp: 15, once: true, target: 'self', desc: '3ターン魔力+50%・毎ターン2回行動。終わったあと1ターン動けない' },
  ],
  nanase: [
    { id: 'rakusei', name: '洛星', kind: 'personal', lv: 1, desc: '毎ターンのはじめに、3マス以内で一番弱っている敵部隊に小さな星が落ちる' },
    { id: 'star1', name: 'Ⅰ星', kind: 'active', lv: 1, mp: 3, target: 'enemy', reach: 'line8:1-4', desc: '星を1つ落とす（4マス先まで届く・威力0.8倍）' },
    { id: 'star2', name: 'Ⅱ星', kind: 'active', lv: 5, mp: 6, target: 'enemy2', reach: 'sq:3', desc: '3マス以内の敵2部隊を選んで星を落とす（威力0.8倍）' },
    { id: 'star3', name: 'Ⅲ星', kind: 'passive', lv: 10, desc: '洛星の星が強くなり、当たった敵は1ターン移動力-1' },
    { id: 'star4', name: 'Ⅳ星', kind: 'active', lv: 15, mp: 9, target: 'tile', reach: 'sq:4', area: '2x2', desc: '指定した2×2の4マスに星を落とす（威力0.9倍）' },
    { id: 'star5', name: 'Ⅴ星', kind: 'active', lv: 20, mp: 10, target: 'tile', reach: 'sq:4', area: 'cross', desc: '十字5マスに星を落とす（威力1.0倍）' },
    { id: 'star6', name: 'Ⅵ星', kind: 'passive', lv: 25, desc: '洛星の星が2つになる（別々の敵に落ちる）' },
    { id: 'star7', name: 'Ⅶ星', kind: 'active', lv: 30, mp: 15, once: true, target: 'self', desc: '戦場のどこでも。弱っている順に敵部隊7つへ星を落とす（威力1.2倍）' },
  ],
  yagyu: [
    { id: 'shiso', name: '始祖の力', kind: 'personal', lv: 1, desc: '魔族部隊が全部+5%。1合戦に1回HP3割で立ち上がる。毎ターンHP3%回復、HPが減るほど攻撃が少し上がる' },
    { id: 'tosshin', name: '突進', kind: 'active', lv: 5, mp: 8, target: 'dir', desc: 'まっすぐ最大4マス突進。ぶつかった敵に1.6倍のダメージを与えて1マス押し戻す' },
    { id: 'hoko', name: '大山羊の咆哮', kind: 'active', lv: 10, mp: 8, target: 'self', area: 'sq:3', desc: '周り3マスの敵の攻撃・防御を2ターン-15%、味方の攻撃を+15%' },
    { id: 'nozomin', name: 'ノゾミン「は」つよいよねーｗ', kind: 'passive', lv: 15, desc: '周り3マスの敵部隊が受ける強化が半分になる' },
    { id: 'mayagi', name: '魔山羊斬', kind: 'active', lv: 20, mp: 10, target: 'self', area: 'sq:1', desc: '周り8マスの敵部隊を全部まとめて斬る' },
    { id: 'majin', name: '魔神化', kind: 'active', lv: 25, mp: 12, once: true, target: 'self', desc: '3ターン、攻撃と速さ+40%' },
    { id: 'shinka', name: '神化', kind: 'active', lv: 30, mp: 15, once: true, target: 'self', needs: 'majin', desc: '魔神化中のみ。3ターン全ステータス+40%、通常攻撃が3マスまで、受けるダメージ半分。終わったあと2ターン動けない' },
  ],
  horie: [
    { id: 'kaonajimi', name: '顔なじみ', kind: 'personal', lv: 1, desc: '周り2マスの味方部隊の攻撃・防御+8%（ヤギューかのぞちちが同じ戦場にいれば+15%）' },
    { id: 'ryoto', name: '両刀斬り', kind: 'active', lv: 5, mp: 6, target: 'enemy', reach: 'normal', desc: '攻撃力と魔力を足した威力で攻撃' },
    { id: 'yowatari', name: '世渡り上手', kind: 'passive', lv: 10, desc: '受ける弱体化の効果が半分' },
    { id: 'hashiwatashi', name: '橋渡し', kind: 'active', lv: 15, mp: 6, target: 'ally2', reach: 'sq:2', self: true, desc: '2マス以内の味方部隊2つの位置を入れ替える' },
    { id: 'torinashi', name: 'とりなし', kind: 'active', lv: 20, mp: 8, target: 'enemy', reach: 'sq:2', desc: '敵部隊1つを、話し合いで1ターン攻撃できなくする' },
    { id: 'nandemoya', name: 'なんでも屋', kind: 'passive', lv: 25, desc: '毎ターンのはじめに、攻撃・防御・魔力のうち一番低いものが上がる' },
    { id: 'tenbin', name: '天秤の一閃', kind: 'active', lv: 30, mp: 15, once: true, target: 'enemy', reach: 'normal', desc: '味方が劣勢なほど威力が上がる大攻撃（1.5〜3倍）' },
  ],
  car: [
    { id: 'sorena', name: 'それな', kind: 'personal', lv: 1, desc: '2マス以内に味方部隊がいると、攻撃・防御+25%' },
    { id: 'kuroi', name: '黒いですカー？', kind: 'active', lv: 5, mp: 5, target: 'enemy', reach: 'normal', desc: '闇の弾（0.8倍）。当たった敵は1ターン印がつき、受けるダメージ+20%' },
    { id: 'tsuigeki', name: '追撃', kind: 'passive', lv: 10, desc: '味方が攻撃した敵が射程内なら、CARも追加で攻撃（1ターンに1回・半分の威力）' },
    { id: 'kurayami', name: '暗闇でヵー', kind: 'active', lv: 15, mp: 8, target: 'tile', reach: 'sq:4', area: 'cross', desc: '十字5マスを2ターン暗闇にする。中の敵は射程が1マスになる' },
    { id: 'amandam', name: 'アマンダム', kind: 'passive', lv: 20, desc: '「それな」が3マスまで届き、味方が2部隊以上なら+40%' },
    { id: 'bighorn', name: 'ビッグhorn', kind: 'active', lv: 25, mp: 8, target: 'self', area: 'sq:3', desc: '周り3マスの味方部隊の攻撃を2ターン+20%' },
    { id: 'trashbox', name: 'Trash Box Car', kind: 'active', lv: 30, mp: 15, once: true, target: 'self', area: 'sq:3', desc: '3マス以内の敵全部隊を攻撃。この合戦で倒された味方が多いほど強い' },
  ],
  oh: [
    { id: 'kisei', name: '寄生', kind: 'personal', lv: 1, desc: '隣の味方部隊のステータスの1割を、自分に上乗せ' },
    { id: 'suitoru', name: '吸い取る', kind: 'active', lv: 5, mp: 5, target: 'enemy', reach: 'normal', desc: '攻撃して、与えたダメージの半分だけ回復' },
    { id: 'oen', name: '応援', kind: 'active', lv: 10, mp: 5, target: 'ally', reach: 'adj8', desc: '隣の味方部隊1つの攻撃・防御を2ターン+20%' },
    { id: 'tane', name: '種爆弾', kind: 'active', lv: 15, mp: 8, target: 'tile', reach: 'sq:2', desc: '種を植える。次のターンのはじめに爆発して、周り3×3の敵にダメージ' },
    { id: 'megumi', name: '自然の恵み', kind: 'passive', lv: 20, desc: '毎ターンのはじめに、自分と隣の味方部隊の兵が5%回復' },
    { id: 'suigyu', name: '水牛', kind: 'active', lv: 25, mp: 10, target: 'dir', desc: '上下左右どれか一直線4マスの敵全部を攻撃して、1マス押し戻す' },
    { id: 'suijin', name: '水神', kind: 'active', lv: 30, mp: 15, once: true, target: 'self', desc: '3ターン雨。味方全部隊は毎ターン8%回復、敵全部隊は移動力-1' },
  ],
  kkb: [
    { id: 'niramu', name: 'にらみつける', kind: 'personal', lv: 1, desc: '周り2マスの敵部隊の攻撃-10%' },
    { id: 'girori', name: 'ぎろり', kind: 'active', lv: 5, mp: 5, target: 'enemy', reach: 'adj8', desc: '隣の敵1つをすくませる。2ターン移動力-1・攻撃-15%' },
    { id: 'shogeki', name: '衝撃波', kind: 'charge', lv: 10, mp: 8, target: 'dir', desc: '溜め技。次の番に、上下左右どれか一直線3マスの敵全部に1.5倍のダメージ' },
    { id: 'kyoho', name: '虚報', kind: 'active', lv: 15, mp: 6, target: 'enemy', reach: 'sq:3', desc: '3マス以内の敵1つの行動順を一番最後にして、移動力を1ターン-1' },
    { id: 'motsui', name: '猛追', kind: 'passive', lv: 20, desc: '合戦に勝ったあとの追撃で、速さ比べに必ず勝つ' },
    { id: 'totsugeki', name: '突撃', kind: 'charge', lv: 25, mp: 10, target: 'dir', desc: '溜め技。次の番に、まっすぐ最大4マス突進して2.2倍のダメージ。溜め中は防御+30%' },
    { id: 'kittanai', name: 'きったないんだけどーｗ', kind: 'active', lv: 30, mp: 12, once: true, target: 'self', area: 'sq:2', desc: '周り2マスの敵の防御を2ターン-30%。次の溜め技を溜めなしで撃てる' },
  ],
  nozomi: [
    { id: 'iko', name: '女王の威光', kind: 'personal', lv: 1, desc: '周り2マスの味方部隊の攻撃・防御+15%' },
    { id: 'doku', name: '毒の薬', kind: 'active', lv: 1, mp: 6, target: 'enemy', reach: 'sq:3', desc: '3ターン毒。毎ターンのはじめに6%ずつ減る' },
    { id: 'bakuhatsu', name: '爆発の薬', kind: 'active', lv: 1, mp: 8, target: 'tile', reach: 'sq:3', area: '3x3', desc: '3×3の敵にダメージ（威力0.8倍）' },
    { id: 'nemuri', name: '眠りの薬', kind: 'active', lv: 1, mp: 8, target: 'enemy', reach: 'sq:3', desc: '敵1つを1ターン眠らせる（行動できない）' },
  ],
};

export const skillOf = (charId, id) => (SKILLS[charId] || []).find(s => s.id === id);

export function areaTiles(area, x, y) {
  if (!area) return [[x, y]];
  if (area === 'cross') return [[x, y], [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => inBounds(a, b));
  if (area === '2x2') return [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].filter(([a, b]) => inBounds(a, b));
  if (area === '3x3') {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(x + dx, y + dy)) out.push([x + dx, y + dy]);
    return out;
  }
  if (area.startsWith('sq:')) {
    const n = Number(area.slice(3));
    const out = [];
    for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) if (inBounds(x + dx, y + dy)) out.push([x + dx, y + dy]);
    return out;
  }
  return [[x, y]];
}

const activeEff = (battle, u, tag) => (u.effects || []).some(e => e.tag === tag && battle.round <= e.until);

// その部隊が今使える技（覚えていない・MP不足・使用済みは理由つき）
export function skillList(battle, u) {
  if (!u.charId) return [];
  return (SKILLS[u.charId] || []).filter(s => s.kind === 'active' || s.kind === 'charge').map(s => {
    let why = null;
    if ((u.level || 1) < s.lv) why = `Lv${s.lv}で覚える`;
    else if (s.once && u.used?.[s.id]) why = '使用済み';
    else if ((u.mp || 0) < s.mp) why = 'MPが足りない';
    else if (s.needs && !activeEff(battle, u, s.needs)) why = '魔神化中のみ';
    else if (battle.active?.noSkill && battle.active.unitId === u.id) why = '2回目の行動では使えない';
    else if (s.kind === 'charge' && u.charge) why = '溜め中';
    else if ((u.effects || []).some(e => e.tag === 'pacified' && battle.round <= e.until)) why = 'とりなされている';
    return { ...s, ok: !why, why };
  });
}

// 技で狙えるもの。units = 選べる部隊、cells = 選べるマス
export function skillTargets(battle, u, s) {
  const reach = s.reach === 'normal' ? getRange(battle, u) : s.reach;
  switch (s.target) {
    case 'enemy':
    case 'enemy2': {
      const units = [];
      for (const [x, y] of reachTiles(battle, u, reach)) {
        const t = unitAt(battle, x, y);
        if (t && t.side !== u.side && isTargetable(battle, u, t)) units.push(t);
      }
      return { units, cells: [] };
    }
    case 'ally':
    case 'ally2': {
      const units = [];
      for (const [x, y] of reachTiles(battle, u, reach)) {
        const t = unitAt(battle, x, y);
        if (t && t.side === u.side && (t !== u)) units.push(t);
      }
      if (s.self) units.push(u);
      return { units, cells: [] };
    }
    case 'tile':
      return { units: [], cells: reachTiles(battle, u, reach) };
    case 'dir':
      return { units: [], cells: DIR4.map(([dx, dy]) => [u.x + dx, u.y + dy]).filter(([x, y]) => inBounds(x, y)) };
    default:
      return { units: [], cells: [] };
  }
}
