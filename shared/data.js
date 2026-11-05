// ゲームの基本データ（地図・キャラ・兵種・地形）。サーバーとブラウザの両方で使う。

export const MAJORITY = 20; // 「陣地の大半」= 35個中20個

// ---- 都市の大きさ ----
// 11/5の表：民・置ける兵の上限（cap）・中立のときの守備兵（garrison）
export const SIZES = {
  village:    { name: '村',       pop: 1000,  farm: 30,  commerce: 20,  garrison: 150,  defense: 0,  cap: 400 },
  town:       { name: '町',       pop: 3000,  farm: 50,  commerce: 50,  garrison: 400,  defense: 10, cap: 1000 },
  fortress:   { name: '城塞都市', pop: 6000,  farm: 60,  commerce: 70,  garrison: 900,  defense: 30, cap: 2000 },
  metropolis: { name: '大都市',   pop: 10000, farm: 100, commerce: 150, garrison: 0,    defense: 30, cap: 3000 },
  capital:    { name: '王都',     pop: 12000, farm: 80,  commerce: 120, garrison: 2000, defense: 50, cap: 4000 },
  castle:     { name: '魔王城',   pop: 2000,  farm: 50,  commerce: 0,   garrison: 0,    defense: 50, cap: 3000 },
};

// 城と守り（11/5）：take＝守り側が受けるダメージ、deal＝守り側の攻撃、towers＝櫓の数、gate＝門の耐久（城壁はその2倍）
export const CASTLES = {
  village:    { name: '木の柵',               take: 0.75, deal: 1.0, towers: 0, gate: 0 },
  town:       { name: '土塁と堀',             take: 0.65, deal: 1.1, towers: 0, gate: 0 },
  fortress:   { name: '石の城壁と門',         take: 0.55, deal: 1.2, towers: 2, gate: 600 },
  metropolis: { name: '二重の城壁と門',       take: 0.45, deal: 1.2, towers: 4, gate: 1000 },
  capital:    { name: '三重の城壁と聖なる石畳', take: 0.4, deal: 1.2, towers: 6, gate: 1500 },
  castle:     { name: '岩の城と崖',           take: 0.5,  deal: 1.3, towers: 4, gate: 1500 },
};
const TIER = ['village', 'town', 'fortress', 'metropolis', 'capital'];
// 陣地の守りの設備。築城で守りが60以上になるか、砦・岩の砦に作り変えると1段上がる
export function castleOf(game, tid) {
  const size = TERRITORIES[tid].size;
  const t = game.territories[tid];
  if (size === 'castle' || size === 'capital') return { size, ...CASTLES[size] };
  const up = (t.facility === 'fort' || t.facility === 'rock' ? 1 : 0) + (t.defense >= 60 ? 1 : 0);
  const s2 = TIER[Math.min(TIER.length - 1, TIER.indexOf(size) + Math.min(1, up))];
  return { size: s2, ...CASTLES[s2] };
}

// ---- 特産 ----
export const SPECIALTIES = {
  mine:       { name: '鉱山',     material: 'iron' },
  deepMine:   { name: '深い鉱山', material: 'mithril' },
  forest:     { name: '森',       material: 'wood' },
  deepForest: { name: '奥の森',   material: 'ancientBranch' },
  ranch:      { name: '牧場',     material: 'leather' },
  dragonNest: { name: '竜の巣',   material: 'dragonLeather' },
  ruins:      { name: '遺跡',     material: 'magicStone' },
  shrine:     { name: 'ほこら',   material: 'starStone' },
};

// ---- 陣地35個 ----
// x,y は地図上の位置（1000×660）。terrain は戦場の形のもと。
export const TERRITORIES = [
  { id: 0,  name: '王都',         size: 'capital',    x: 70,  y: 330, owner: 'kingdom', terrain: 'capital' },
  { id: 1,  name: '麦穂の村',     size: 'village',    x: 180, y: 120, owner: 'neutral', terrain: 'plain' },
  { id: 2,  name: '近衛の砦',     size: 'fortress',   x: 180, y: 250, owner: 'kingdom', terrain: 'plain' },
  { id: 3,  name: '白百合の城塞', size: 'fortress',   x: 180, y: 410, owner: 'kingdom', terrain: 'hill' },
  { id: 4,  name: '港の村',       size: 'village',    x: 180, y: 545, owner: 'neutral', terrain: 'river' },
  { id: 5,  name: 'スミレの町',   size: 'town',       x: 300, y: 110, owner: 'kingdom', terrain: 'plain', home: 'sumire' },
  { id: 6,  name: '牧場の村',     size: 'village',    x: 300, y: 225, owner: 'kingdom', terrain: 'plain', specialty: 'ranch' },
  { id: 7,  name: '野口の町',     size: 'town',       x: 300, y: 340, owner: 'kingdom', terrain: 'forest', home: 'noguchi' },
  { id: 8,  name: '七星の町',     size: 'town',       x: 300, y: 465, owner: 'kingdom', terrain: 'hill', home: 'nanase' },
  { id: 9,  name: '湖の村',       size: 'village',    x: 300, y: 590, owner: 'neutral', terrain: 'river' },
  { id: 10, name: '鉄床の村',     size: 'village',    x: 420, y: 60,  owner: 'neutral', terrain: 'hill', specialty: 'mine' },
  { id: 11, name: '交易の町',     size: 'town',       x: 420, y: 200, owner: 'neutral', terrain: 'plain' },
  { id: 12, name: 'ゆきの町',     size: 'town',       x: 420, y: 420, owner: 'kingdom', terrain: 'forest', yuki: true },
  { id: 13, name: '大森林の村',   size: 'village',    x: 420, y: 560, owner: 'neutral', terrain: 'forest', specialty: 'forest' },
  { id: 14, name: '古の遺跡',     size: 'village',    x: 540, y: 105, owner: 'neutral', terrain: 'hill', specialty: 'ruins', ruins: true },
  { id: 15, name: '風車の村',     size: 'village',    x: 540, y: 215, owner: 'neutral', terrain: 'plain' },
  { id: 16, name: '大都市',       size: 'metropolis', x: 540, y: 330, owner: 'neutral', terrain: 'plain', metropolis: true },
  { id: 17, name: '渡しの村',     size: 'village',    x: 540, y: 450, owner: 'neutral', terrain: 'river' },
  { id: 18, name: '奥の森',       size: 'village',    x: 540, y: 585, owner: 'neutral', terrain: 'forest', specialty: 'deepForest' },
  { id: 19, name: '峠の城塞',     size: 'fortress',   x: 660, y: 70,  owner: 'neutral', terrain: 'mountain' },
  { id: 20, name: '川辺の村',     size: 'village',    x: 660, y: 220, owner: 'neutral', terrain: 'river' },
  { id: 21, name: 'ほこらの村',   size: 'village',    x: 660, y: 450, owner: 'neutral', terrain: 'forest', specialty: 'shrine' },
  { id: 22, name: '深い鉱山',     size: 'village',    x: 780, y: 80,  owner: 'demon',   terrain: 'mountain', specialty: 'deepMine' },
  { id: 23, name: '黒角の砦',     size: 'fortress',   x: 780, y: 210, owner: 'demon',   terrain: 'mountain' },
  { id: 24, name: '辺境の町',     size: 'town',       x: 780, y: 335, owner: 'demon',   terrain: 'plain', ohHome: true },
  { id: 25, name: '骨の城塞',     size: 'fortress',   x: 780, y: 460, owner: 'demon',   terrain: 'hill' },
  { id: 26, name: '枯れ谷の村',   size: 'village',    x: 780, y: 590, owner: 'demon',   terrain: 'mountain' },
  { id: 27, name: '岩山の村',     size: 'village',    x: 910, y: 140, owner: 'demon',   terrain: 'mountain' },
  { id: 28, name: '魔王城',       size: 'castle',     x: 920, y: 330, owner: 'demon',   terrain: 'castle', home: 'yagyu' },
  { id: 29, name: '竜の巣',       size: 'village',    x: 910, y: 530, owner: 'demon',   terrain: 'mountain', specialty: 'dragonNest' },
  // あとから増やした中立の町
  { id: 30, name: '月見の町',     size: 'town',       x: 660, y: 335, owner: 'neutral', terrain: 'plain' },
  { id: 31, name: '霧の町',       size: 'town',       x: 660, y: 600, owner: 'neutral', terrain: 'river' },
  { id: 32, name: '北浜の町',     size: 'town',       x: 70,  y: 150, owner: 'neutral', terrain: 'plain' },
  { id: 33, name: '南浜の町',     size: 'town',       x: 70,  y: 520, owner: 'neutral', terrain: 'river' },
  { id: 34, name: '星見の城塞',   size: 'fortress',   x: 420, y: 310, owner: 'neutral', terrain: 'hill' },
];

// ふつうの道
const ROADS = [
  [0, 2], [0, 3],
  [1, 2], [2, 3], [3, 4], [1, 5], [2, 6], [2, 7], [3, 7], [3, 8], [4, 8], [4, 9],
  [5, 6], [6, 7], [7, 8], [8, 9], [5, 10], [5, 11], [6, 11], [7, 12], [8, 12], [9, 13], [8, 13],
  [10, 11], [11, 34], [34, 12], [7, 34], [34, 16], [12, 13], [10, 14], [11, 15], [11, 16], [12, 16], [12, 17], [13, 17], [13, 18],
  [14, 15], [15, 16], [16, 17], [17, 18], [14, 19], [15, 20], [16, 20], [16, 21], [17, 21], [18, 21],
  [19, 20], [20, 30], [30, 21], [16, 30], [30, 24], [18, 31], [21, 31], [31, 26], [0, 32], [1, 32], [0, 33], [4, 33], [19, 22], [20, 23], [20, 24], [21, 24], [21, 25], [21, 26],
  [22, 23], [23, 24], [24, 25], [25, 26], [22, 27], [23, 27], [23, 28], [24, 28], [25, 28], [25, 29], [26, 29],
  [27, 28], [28, 29],
];
// 魔族だけが通れる崖の山道（王国の裏に回り込める）
const CLIFFS = [[22, 10], [10, 1], [18, 9]];

export const EDGES = [
  ...ROADS.map(([a, b]) => ({ a, b, cliff: false })),
  ...CLIFFS.map(([a, b]) => ({ a, b, cliff: true })),
];

export const edgeKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// となりの陣地。closed＝大雨・大雪で通れなくなっている道（{ "a-b": 何日目まで }）
export function neighbors(tid, side, closed) {
  const out = [];
  for (const e of EDGES) {
    if (e.cliff && side !== 'demon') continue;
    if (closed && closed[edgeKey(e.a, e.b)]) continue;
    if (e.a === tid) out.push(e.b);
    else if (e.b === tid) out.push(e.a);
  }
  return out;
}

// ---- 兵種 ----
// tri: heavy → fast → ranged → heavy（矢印の先に強い）
export const UNIT_TYPES = {
  // 11/5の表。range: 槍・騎・オークは隣、弓は2〜3マス、ハーピーは1〜2マス
  spear:    { name: '槍兵',     label: '槍', side: 'kingdom', tri: 'heavy',  atk: 10, def: 12, mag: 0, mdef: 5, spd: 8,  move: 3, range: 'adj8',      dmg: 'phys' },
  cavalry:  { name: '騎兵',     label: '騎', side: 'kingdom', tri: 'fast',   atk: 12, def: 9,  mag: 0, mdef: 5, spd: 14, move: 5, range: 'adj8',      dmg: 'phys' },
  archer:   { name: '弓兵',     label: '弓', side: 'kingdom', tri: 'ranged', atk: 11, def: 7,  mag: 0, mdef: 8, spd: 10, move: 3, range: 'line8:2-3', dmg: 'phys' },
  orc:      { name: 'オーク',   label: 'オ', side: 'demon',   tri: 'heavy',  atk: 9,  def: 11, mag: 0, mdef: 4, spd: 7,  move: 3, range: 'adj8',      dmg: 'phys' },
  goat:     { name: '山羊騎兵', label: '山', side: 'demon',   tri: 'fast',   atk: 11, def: 8,  mag: 0, mdef: 4, spd: 13, move: 5, range: 'adj8',      dmg: 'phys', climber: true },
  harpy:    { name: 'ハーピー', label: 'ハ', side: 'demon',   tri: 'ranged', atk: 10, def: 6,  mag: 0, mdef: 7, spd: 12, move: 4, range: 'line8:1-2', dmg: 'phys', flyer: true },
  // たけるだけの兵種（大都市でしか補充できない）
  tank:     { name: '戦車',     label: '戦', side: 'neutral', tri: 'heavy',  atk: 15, def: 18, mag: 0, mdef: 8, spd: 8,  move: 4, range: 'line8:1-2', dmg: 'phys', special: true },
  fighter:  { name: '戦闘機',   label: '機', side: 'neutral', tri: 'fast',   atk: 15, def: 10, mag: 0, mdef: 8, spd: 16, move: 6, range: 'line8:1-2', dmg: 'phys', flyer: true, special: true },
  gunner:   { name: '銃兵',     label: '銃', side: 'neutral', tri: 'ranged', atk: 15, def: 9,  mag: 0, mdef: 6, spd: 10, move: 3, range: 'line8:2-3', dmg: 'phys', special: true },
};
export const TRI_ADV = { heavy: 'fast', fast: 'ranged', ranged: 'heavy' };

// 部隊の質（数の王国、質の魔族）：幹部の部隊とヤギューの親衛は×1.3
export const QUALITY = { kingdom: 1.0, zako: 1.0, officer: 1.3, guard: 1.3 };

// 1部隊の兵の上限：王国は統率×5人、魔族は統率×3.5人（兵1人＝HP1）
export const unitCap = (side, lead) => Math.round(lead * (side === 'demon' ? 3.5 : 5));
export const UNIT_MAX = 350; // 武将のいない部隊（守備隊など）の目安
// 一般の武将・魔将の統率（下級・中級・上級）
export const GRADE_LEAD = { low: 40, mid: 55, high: 65 };

// ---- キャラクター ----
// 11/5の表：Lv1 → Lv30 の値。そのあいだはまっすぐ増える。
// hp は本人のHP。本隊（勇者や幹部本人がいる部隊）は、先に護衛の兵が減り、兵が0になったら本人のHPが減る。ヤギューは単騎
const T = (hp, mp, atk, def, mag, mdef, spd, lead, pol) => ({ hp, mp, atk, def, mag, mdef, spd, lead, pol });
const CHAR_TABLE = {
  //          Lv1                                   Lv30
  yagyu:   [T(440, 40, 30, 26, 14, 20, 30, 80, 30), T(1400, 100, 132, 113, 58, 78, 87, 95, 45)],
  sumire:  [T(220, 20, 15, 15, 6, 10, 14, 70, 40),  T(540, 50, 53, 50, 15, 27, 31, 85, 50)],
  noguchi: [T(170, 35, 5, 9, 16, 15, 15, 45, 80),   T(400, 95, 14, 26, 54, 47, 35, 60, 95)],
  nanase:  [T(160, 30, 5, 7, 19, 13, 16, 55, 50),   T(390, 90, 14, 22, 65, 39, 36, 70, 60)],
  nozomi:  [T(200, 40, 6, 12, 18, 14, 10, 60, 95),  T(490, 100, 20, 35, 55, 40, 26, 75, 99)],
  horie:   [T(200, 25, 12, 12, 12, 12, 12, 70, 70), T(490, 80, 35, 35, 35, 35, 36, 85, 80)],
  kkb:     [T(200, 20, 16, 13, 3, 8, 8, 75, 45),    T(430, 60, 54, 42, 6, 22, 17, 90, 55)],
  oh:      [T(180, 25, 11, 10, 10, 9, 8, 65, 55),   T(410, 70, 31, 30, 30, 26, 23, 80, 65)],
  car:     [T(150, 25, 6, 7, 15, 10, 10, 60, 30),   T(380, 70, 12, 19, 56, 27, 27, 75, 40)],
  yuki:    [T(120, 15, 9, 8, 5, 6, 8, 40, 35),      T(300, 40, 25, 22, 15, 18, 26, 55, 45)],
  // 追加武将（11/5）。上級：合計50→140・HP160→380、中級：合計40→120・HP130→320
  takeru:  [T(160, 25, 14, 11, 6, 9, 10, 65, 40),   T(380, 70, 40, 31, 17, 25, 27, 75, 50)],
  jack:    [T(150, 20, 13, 8, 4, 7, 18, 50, 35),    T(360, 60, 37, 22, 12, 20, 49, 60, 45)],
  kotaro:  [T(130, 15, 8, 6, 3, 5, 18, 50, 40),     T(320, 40, 24, 18, 9, 15, 54, 60, 50)],
  takumi:  [T(130, 20, 8, 14, 2, 10, 6, 50, 30),    T(320, 50, 24, 42, 6, 30, 18, 60, 40)],
  sakuya:  [T(130, 30, 5, 7, 12, 10, 6, 50, 50),    T(320, 80, 15, 21, 36, 30, 18, 60, 60)],
  kotone:  [T(160, 25, 12, 11, 10, 9, 8, 60, 55),   T(380, 70, 34, 31, 28, 25, 22, 70, 65)],
};
const MOVE = { yagyu: 5, nozomi: 3, kotaro: 5, jack: 5 };
function fromTable(id) {
  const [a, b] = CHAR_TABLE[id];
  const base = { ...a, move: MOVE[id] ?? 4 };
  const grow = {};
  for (const k of Object.keys(a)) grow[k] = (b[k] - a[k]) / 29;
  return { base, grow };
}
export const CHARACTERS = {
  sumire:  { name: 'スミレ', title: '勇者',       side: 'kingdom', label: '菫', units: 5, range: 'adj8',      dmg: 'phys', ...fromTable('sumire') },
  noguchi: { name: '野口',   title: '賢者',       side: 'kingdom', label: '野', units: 5, range: 'line8:2-2', dmg: 'mag',  ...fromTable('noguchi') },
  nanase:  { name: '七星',   title: '魔法使い',   side: 'kingdom', label: '七', units: 5, range: 'line8:1-3', dmg: 'mag',  ...fromTable('nanase') },
  nozomi:  { name: 'のぞちち', title: '絶対女王', side: 'kingdom', label: '女', units: 1, range: 'line8:1-3', dmg: 'mag',  ...fromTable('nozomi') },
  yagyu:   { name: 'ヤギュー', title: '魔王',     side: 'demon',   label: '魔', units: 5, range: 'line8:1-2', dmg: 'phys', solo: true, ...fromTable('yagyu') },
  car:     { name: 'CAR', title: '幹部',          side: 'demon',   label: 'C', units: 3, range: 'line8:1-3', dmg: 'mag',  ...fromTable('car') },
  oh:      { name: 'OH', title: '幹部',           side: 'demon',   label: 'O', units: 3, range: 'orth:1-2',  dmg: 'best', ...fromTable('oh') },
  kkb:     { name: 'KKB', title: '幹部',          side: 'demon',   label: 'K', units: 3, range: 'orth:1-1',  dmg: 'phys', ...fromTable('kkb') },
  horie:   { name: '堀江', title: '武将',         side: 'neutral', label: '堀', units: 5, range: 'line8:1-2', dmg: 'best', ...fromTable('horie') },
  yuki:    { name: 'ゆきちゃん', title: '町の娘', side: 'kingdom', label: 'ゆ', units: 1, range: 'adj8',      dmg: 'phys', ...fromTable('yuki') },
  takeru:  { name: 'たける', title: '進軍の将',   side: 'neutral', label: '武', units: 4, range: 'line8:1-3', dmg: 'phys', extra: true, quote: '他の国を陛下の物とし、我々は進軍し続ける！', ...fromTable('takeru') },
  jack:    { name: 'ジャックナイフ', title: '自撮りの剣士', side: 'neutral', label: 'J', units: 1, range: 'adj8', dmg: 'phys', extra: true, quote: '自撮り？ スーパーで撮ってるよ？', ...fromTable('jack') },
  kotaro:  { name: 'こうたろ', title: '従者',     side: 'neutral', label: 'こ', units: 2, range: 'adj8',      dmg: 'phys', extra: true, quote: '全ては主の思うままに', ...fromTable('kotaro') },
  takumi:  { name: 'たくみ', title: '屋台の主',   side: 'neutral', label: 'た', units: 2, range: 'adj8',      dmg: 'phys', extra: true, quote: 'うほっ、もっと食べるでぶー', ...fromTable('takumi') },
  sakuya:  { name: 'さくや', title: '流れ者',     side: 'neutral', label: 'さ', units: 2, range: 'line8:1-2', dmg: 'mag',  extra: true, quote: '照らすよ？ はげさすよ？', ...fromTable('sakuya') },
  kotone:  { name: 'ことね', title: '流れ者',     side: 'neutral', label: '琴', units: 3, range: 'line8:1-2', dmg: 'best', extra: true, quote: 'えー、みんなすごーい', ...fromTable('kotone') },
};
// 追加武将（一般の武将なので個人スキルだけ。たくみだけ技も1つ）
export const EXTRA_CHARS = ['takeru', 'jack', 'kotaro', 'takumi', 'sakuya', 'kotone'];

export const HERO_ROLES = ['sumire', 'noguchi', 'nanase'];
export const ROLES = ['yagyu', 'sumire', 'noguchi', 'nanase'];

// レベル上げ：魔族は魔力で、勇者たちは合戦の経験で
// 魔力でのレベル上げ。ヤギューは強いので1.5倍かかる
export const levelUpCost = (lv, charId) => Math.round((15 + 5 * lv) * (charId === 'yagyu' ? 1.5 : 1));
// 勇者が次のレベルまでに必要な経験
export const expToNext = (lv) => 35 + lv * 18;

// ---- 素材と装備（王国だけ。魔族は装備を作らない） ----
export const MATERIALS = {
  iron:          { name: '鉄',         rare: false },
  mithril:       { name: 'ミスリル',   rare: true },
  wood:          { name: '木材',       rare: false },
  ancientBranch: { name: '古代樹の枝', rare: true },
  leather:       { name: '革',         rare: false },
  dragonLeather: { name: '竜の革',     rare: true },
  magicStone:    { name: '魔石',       rare: false },
  starStone:     { name: '星の魔石',   rare: true },
  monster:       { name: '魔物の素材', rare: false },
  officer:       { name: '幹部の素材', rare: true },
};
export const emptyMaterials = () => Object.fromEntries(Object.keys(MATERIALS).map(k => [k, 0]));

// 勇者の装備。武器はスミレなら攻撃、野口・七星なら魔力が上がる
export const RECIPES = {
  w1: { slot: 'weapon', tier: 1, names: { sumire: '鉄の剣', noguchi: '樫の杖', nanase: '星見の杖' },       power: 4,  cost: { gold: 60, iron: 4, wood: 2 } },
  w2: { slot: 'weapon', tier: 2, names: { sumire: '魔狩りの剣', noguchi: '魔石の杖', nanase: '流星の杖' },  power: 8,  cost: { gold: 120, iron: 6, wood: 3, monster: 4, magicStone: 2 } },
  w3: { slot: 'weapon', tier: 3, names: { sumire: 'ミスリルの剣', noguchi: '賢者の杖', nanase: '銀河の杖' }, power: 14, cost: { gold: 200, mithril: 4, magicStone: 3, monster: 6 } },
  w4: { slot: 'weapon', tier: 4, names: { sumire: '勇者の大剣', noguchi: '古代樹の大杖', nanase: '七つ星の杖' }, power: 22, cost: { gold: 320, mithril: 6, ancientBranch: 3, starStone: 3, officer: 2 } },
  a1: { slot: 'armor', tier: 1, name: '革の鎧',   bonus: { def: 3, mdef: 2, hp: 20 },    cost: { gold: 50, leather: 4 } },
  a2: { slot: 'armor', tier: 2, name: '鉄の鎧',   bonus: { def: 6, mdef: 3, hp: 40 },    cost: { gold: 100, iron: 5, leather: 3 } },
  a3: { slot: 'armor', tier: 3, name: '魔石の衣', bonus: { def: 6, mdef: 9, hp: 60 },    cost: { gold: 180, magicStone: 4, leather: 4, monster: 3 } },
  a4: { slot: 'armor', tier: 4, name: '竜の鎧',   bonus: { def: 12, mdef: 10, hp: 110 }, cost: { gold: 300, dragonLeather: 4, mithril: 3, officer: 2 } },
};
export const recipeName = (id, charId) => RECIPES[id].name || RECIPES[id].names[charId];

// 兵の装備（王国の兵全体）。レベルが上がるほど高くなる
export const GEAR_MAX = 10;
export function troopGearCost(kind, n) {
  const c = { gold: 100 + 30 * n };
  if (kind === 'weapon') { c.iron = 3 + n; c.wood = 2 + Math.floor(n / 2); if (n >= 5) c.mithril = n - 4; }
  else { c.leather = 3 + n; c.iron = 2 + Math.floor(n / 2); if (n >= 5) c.dragonLeather = n - 4; }
  return c;
}

export function charStats(charId, level) {
  const c = CHARACTERS[charId];
  const s = {};
  for (const k of Object.keys(c.base)) {
    s[k] = Math.round(c.base[k] + (c.grow[k] || 0) * (level - 1));
  }
  return s;
}

// ---- 戦場の地形 ----
export const TERRAIN = {
  '.': { name: '平地' },
  F:   { name: '森',     defMod: 1.25 },
  R:   { name: '川',     defMod: 0.83 },
  C:   { name: '崖・岩場' },
  H:   { name: '高台',   atkMod: 1.2 },
  W:   { name: '城壁' },
  G:   { name: '門' },
  T:   { name: '櫓' },
  S:   { name: '聖なる石畳' },
};

export const BATTLE_W = 16;
export const BATTLE_H = 11;
export const MAX_ROUNDS = 30; // これを超えたら守る側の勝ち

// ---- 内政コマンド ----
export const KINGDOM_ACTIONS = {
  farm:      { name: '開墾',       cost: { gold: 80 },             desc: '畑+4（食料が増える）' },
  commerce:  { name: '商業',       cost: { gold: 80 },             desc: '商業+4（お金が増える）' },
  people:    { name: '民を増やす', cost: { gold: 60, food: 40 },   desc: '民+200' },
  conscript: { name: '徴兵',       cost: { gold: 40, food: 30 },   desc: '民150人を兵にする（兵が強いほど高い）' },
  fortify:   { name: '築城',       cost: { gold: 120 },            desc: '守り+10' },
  alms:      { name: '施し',       cost: { food: 60 },             desc: '民の忠誠+12' },
  train:     { name: '訓練',       cost: { gold: 200 },            desc: '王国の兵全体が強くなる（女王のみ）', queenOnly: true },
  gearWeapon: { name: '兵の武器づくり', cost: {}, desc: '王国の兵全体の攻撃+5%', workshop: true },
  gearArmor:  { name: '兵の防具づくり', cost: {}, desc: '王国の兵全体の防御+5%', workshop: true },
  craft:      { name: '勇者の装備づくり', cost: {}, desc: '勇者の武器・防具を作る', workshop: true },
  build:      { name: '作り変え', cost: {}, desc: 'いる陣地を、畑・市場・砦・兵舎・見張り台に作り変える', build: true },
  hire:       { name: '武将を雇う', cost: { gold: 250, food: 60 }, desc: 'この陣地の兵300人をまとめる、新しい兵の武将が来る（陣地に兵が300人以上いるとき）' },
};
export const DEMON_ACTIONS = {
  farm:    { name: '開墾',         cost: { magic: 10 },  desc: '畑+4' },
  people:  { name: '民を増やす',   cost: { food: 40 },   desc: '民+200' },
  terror:  { name: '恐怖を与える', cost: {},             desc: '恐怖+15（民が少し減る）' },
  spawn:   { name: '手下を生む',   cost: { magic: 20 },  desc: '陣地の兵+200' },
  levelup: { name: 'レベル上げ',   cost: { magic: 0 },   desc: '魔力でキャラのレベルを上げる', global: true },
  build:       { name: '作り変え',         cost: {},            desc: '魔族の陣地を、恐怖の塔・魔物の巣・岩の砦に作り変える', build: true },
  darkFortify: { name: '闇の儀式：陣地の強化', cost: { magic: 20 }, desc: '陣地の守り+15' },
  curse:       { name: '闇の儀式：勇者を呪う', cost: { magic: 40 }, desc: '勇者1人を3日のあいだ呪う（怪我と同じくステータスが下がる）', heroTarget: true },
  monsters:    { name: '魔物を送る',       cost: { magic: 30 }, desc: '王国の陣地に魔物（強さ250）を送りこむ', enemy: true },
  monstersBig: { name: '強い魔物を送る',   cost: { magic: 60 }, desc: '王国の陣地に強い魔物（強さ500）を送りこむ', enemy: true },
  summon:      { name: '魔将を呼ぶ',       cost: { magic: 30 }, desc: 'この陣地の手下300をまとめる、新しい魔将が来る（陣地に手下が300以上いるとき）' },
};


// レベルと装備を合わせた、今のステータス
// 同じレベルなら、だれでも基本の強さは同じ（ちがいは技）。バトルロワイヤル・群雄割拠で使う
export function evenStats(charId, level) {
  const st = charStats(charId, level);
  const L = level - 1;
  const main = Math.max(st.atk, st.mag);
  const f = (16 + 1.38 * L) / main;
  const g = (12 + 0.9 * L) / ((st.def + st.mdef) / 2);
  return {
    ...st,
    // 単騎のヤギューは護衛の兵がいないぶん、HPを多めに
    hp: Math.round((210 + 11 * L) * (CHARACTERS[charId].solo ? 1.4 : 1)),
    atk: Math.round(st.atk * f), mag: Math.round(st.mag * f), def: Math.round(st.def * g), mdef: Math.round(st.mdef * g),
    spd: Math.min(st.spd, Math.round(14 + 0.6 * L)), move: 4, lead: 70,
  };
}

// 武将の統率（キャラはステータスから、一般の武将は格から）
export function genLead(game, gen) {
  if (gen.charId) return gameStats(game, gen.charId).lead;
  return gen.lead || GRADE_LEAD[gen.grade || 'low'];
}
// その部隊に入れられる兵の上限（魔族の兵種は統率×3.5、それ以外は×5）
export function troopCap(game, gen, type) {
  if (UNIT_TYPES[type]?.special) return 150; // たけるの兵種は各150人まで
  return unitCap(UNIT_TYPES[type]?.side === 'demon' ? 'demon' : 'kingdom', genLead(game, gen));
}
// 本隊の護衛の兵の上限（ヤギューは単騎なので0）
export function guardCap(game, gen) {
  if (!gen.charId || CHARACTERS[gen.charId].solo) return 0;
  const demonish = CHARACTERS[gen.charId].side === 'demon';
  return unitCap(demonish ? 'demon' : 'kingdom', genLead(game, gen));
}

export function gameStats(game, charId) {
  const st = game.mode === 'conquest' ? evenStats(charId, game.chars[charId]?.level || 1) : charStats(charId, game.chars[charId]?.level || 1);
  const gear = game.gear?.[charId];
  if (gear?.weapon) {
    const r = RECIPES[gear.weapon];
    if (CHARACTERS[charId].dmg === 'mag') st.mag += r.power; else st.atk += r.power;
  }
  if (gear?.armor) for (const [k, v] of Object.entries(RECIPES[gear.armor].bonus)) st[k] += v;
  // 怪我：数日ステータスが下がる（野口の「無感情」なら下がらない）
  if (isInjured(game, charId) && !(charId === 'noguchi' && (game.chars.noguchi?.level || 1) >= 10)) {
    for (const k of ['atk', 'def', 'mag', 'mdef', 'spd']) st[k] = Math.floor(st[k] * 0.85);
  }
  return st;
}

export const isInjured = (game, charId) => !!game.injuries?.[charId] && game.day <= game.injuries[charId];

// ---- 陣地の作り変え（1つの陣地に1つ。奪われるとこわされる） ----
export const FACILITIES = {
  farm:     { name: '畑',       label: '畑', side: 'kingdom', cost: { gold: 150 }, desc: '食料の収穫が1.5倍' },
  market:   { name: '市場',     label: '市', side: 'kingdom', cost: { gold: 150 }, desc: 'お金の収入が1.5倍' },
  fort:     { name: '砦',       label: '砦', side: 'kingdom', cost: { gold: 250 }, desc: '守り+30。ここでの合戦に城壁が出る' },
  barracks: { name: '兵舎',     label: '舎', side: 'kingdom', cost: { gold: 200 }, desc: '徴兵で集まる兵が多く、置ける兵の上限+1000。兵の補充も早い' },
  tower:    { name: '見張り台', label: '見', side: 'kingdom', cost: { gold: 120 }, desc: 'ここととなりの陣地で、盗賊・魔物の強さが半分。ここで守る合戦では、守る側の速さ+2' },
  fear:     { name: '恐怖の塔', label: '塔', side: 'demon',   cost: { magic: 40 }, desc: '毎日、恐怖+3（となりの魔族の陣地も+1）。魔力が1.3倍' },
  nest:     { name: '魔物の巣', label: '巣', side: 'demon',   cost: { magic: 40 }, desc: '毎日、手下（陣地の兵）が60ずつ生まれる' },
  rock:     { name: '岩の砦',   label: '岩', side: 'demon',   cost: { magic: 50 }, desc: '守り+30。ここでの合戦に城壁が出る' },
};
export const canRemodel = (tid) => tid !== 0 && tid !== 28; // 王都と魔王城は作り変えられない

// 置ける兵の上限（兵舎で増える）
export const garrisonCap = (t) => SIZES[TERRITORIES[t.id].size].cap + (t.facility === 'barracks' ? 1000 : 0);

// バトルロワイヤルで選べるキャラ
export const ROYALE_CHARS = ['sumire', 'noguchi', 'nanase', 'nozomi', 'yagyu', 'car', 'oh', 'kkb', 'horie', 'yuki'];

// ---- 群雄割拠（いろんな勢力の国取り） ----
export const CONQUEST_WIN = 22; // 35陣地のうち22を取れば天下統一
export const CONQUEST_ACTIONS = {
  farm:      { name: '開墾',       cost: { gold: 60 },            desc: '畑+4（食料が増える）' },
  commerce:  { name: '商業',       cost: { gold: 60 },            desc: '商業+4（お金が増える）' },
  conscript: { name: '徴兵',       cost: { gold: 50, food: 30 },  desc: '民150人を兵にする' },
  fortify:   { name: '築城',       cost: { gold: 100 },           desc: '守り+10' },
  alms:      { name: '施し',       cost: { food: 60 },            desc: '民の忠誠+12（反乱を防ぐ）' },
  train:     { name: '訓練',       cost: { gold: 200 },           desc: '自分の兵みんなが少し強くなる', global: true },
  hire:      { name: '武将を雇う', cost: { gold: 200, food: 60 },  desc: 'この陣地に新しい武将（兵2部隊）が来る。何人でも雇える' },
};
