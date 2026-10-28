// ゲームの基本データ（地図・キャラ・兵種・地形）。サーバーとブラウザの両方で使う。

export const MAJORITY = 18; // 「陣地の大半」= 30個中18個

// ---- 都市の大きさ ----
export const SIZES = {
  village:    { name: '村',       pop: 1000,  farm: 30,  commerce: 20,  garrison: 300,  defense: 0,  cap: 1500 },
  town:       { name: '町',       pop: 3000,  farm: 50,  commerce: 50,  garrison: 600,  defense: 10, cap: 3000 },
  fortress:   { name: '城塞都市', pop: 5000,  farm: 60,  commerce: 70,  garrison: 1200, defense: 40, cap: 5000 },
  metropolis: { name: '大都市',   pop: 10000, farm: 100, commerce: 150, garrison: 1500, defense: 30, cap: 8000 },
  capital:    { name: '王都',     pop: 8000,  farm: 80,  commerce: 120, garrison: 2000, defense: 60, cap: 8000 },
  castle:     { name: '魔王城',   pop: 3000,  farm: 50,  commerce: 0,   garrison: 1500, defense: 60, cap: 8000 },
};

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

// ---- 陣地30個 ----
// x,y は地図上の位置（1000×660）。terrain は戦場の形のもと。
export const TERRITORIES = [
  { id: 0,  name: '王都',         size: 'capital',    x: 70,  y: 330, owner: 'kingdom', terrain: 'capital' },
  { id: 1,  name: '麦穂の村',     size: 'village',    x: 180, y: 120, owner: 'kingdom', terrain: 'plain' },
  { id: 2,  name: '近衛の砦',     size: 'fortress',   x: 180, y: 250, owner: 'kingdom', terrain: 'plain' },
  { id: 3,  name: '白百合の城塞', size: 'fortress',   x: 180, y: 410, owner: 'kingdom', terrain: 'hill' },
  { id: 4,  name: '港の村',       size: 'village',    x: 180, y: 545, owner: 'kingdom', terrain: 'river' },
  { id: 5,  name: 'スミレの町',   size: 'town',       x: 300, y: 110, owner: 'kingdom', terrain: 'plain', home: 'sumire' },
  { id: 6,  name: '牧場の村',     size: 'village',    x: 300, y: 225, owner: 'kingdom', terrain: 'plain', specialty: 'ranch' },
  { id: 7,  name: '野口の町',     size: 'town',       x: 300, y: 340, owner: 'kingdom', terrain: 'forest', home: 'noguchi' },
  { id: 8,  name: '七星の町',     size: 'town',       x: 300, y: 465, owner: 'kingdom', terrain: 'hill', home: 'nanase' },
  { id: 9,  name: '湖の村',       size: 'village',    x: 300, y: 590, owner: 'kingdom', terrain: 'river' },
  { id: 10, name: '鉄床の村',     size: 'village',    x: 420, y: 60,  owner: 'kingdom', terrain: 'hill', specialty: 'mine' },
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
];

// ふつうの道
const ROADS = [
  [0, 2], [0, 3],
  [1, 2], [2, 3], [3, 4], [1, 5], [2, 6], [2, 7], [3, 7], [3, 8], [4, 8], [4, 9],
  [5, 6], [6, 7], [7, 8], [8, 9], [5, 10], [5, 11], [6, 11], [7, 12], [8, 12], [9, 13], [8, 13],
  [10, 11], [11, 12], [12, 13], [10, 14], [11, 15], [11, 16], [12, 16], [12, 17], [13, 17], [13, 18],
  [14, 15], [15, 16], [16, 17], [17, 18], [14, 19], [15, 20], [16, 20], [16, 21], [17, 21], [18, 21],
  [19, 20], [20, 21], [19, 22], [20, 23], [20, 24], [21, 24], [21, 25], [21, 26],
  [22, 23], [23, 24], [24, 25], [25, 26], [22, 27], [23, 27], [23, 28], [24, 28], [25, 28], [25, 29], [26, 29],
  [27, 28], [28, 29],
];
// 魔族だけが通れる崖の山道（王国の裏に回り込める）
const CLIFFS = [[22, 10], [10, 1], [26, 18], [18, 9]];

export const EDGES = [
  ...ROADS.map(([a, b]) => ({ a, b, cliff: false })),
  ...CLIFFS.map(([a, b]) => ({ a, b, cliff: true })),
];

export function neighbors(tid, side) {
  const out = [];
  for (const e of EDGES) {
    if (e.cliff && side !== 'demon') continue;
    if (e.a === tid) out.push(e.b);
    else if (e.b === tid) out.push(e.a);
  }
  return out;
}

// ---- 兵種 ----
// tri: heavy → fast → ranged → heavy（矢印の先に強い）
export const UNIT_TYPES = {
  spear:    { name: '槍兵',     label: '槍', side: 'kingdom', tri: 'heavy',  atk: 22, def: 18, mag: 4, mdef: 10, spd: 5, move: 4, range: 'adj8',    dmg: 'phys' },
  cavalry:  { name: '騎兵',     label: '騎', side: 'kingdom', tri: 'fast',   atk: 20, def: 12, mag: 4, mdef: 8,  spd: 9, move: 6, range: 'adj8',    dmg: 'phys' },
  archer:   { name: '弓兵',     label: '弓', side: 'kingdom', tri: 'ranged', atk: 19, def: 10, mag: 4, mdef: 10, spd: 6, move: 4, range: 'line8:2-2', dmg: 'phys' },
  orc:      { name: 'オーク',   label: 'オ', side: 'demon',   tri: 'heavy',  atk: 21, def: 17, mag: 4, mdef: 8,  spd: 4, move: 4, range: 'adj8',    dmg: 'phys' },
  goat:     { name: '山羊騎兵', label: '山', side: 'demon',   tri: 'fast',   atk: 18, def: 11, mag: 4, mdef: 8,  spd: 9, move: 6, range: 'adj8',    dmg: 'phys', climber: true },
  harpy:    { name: 'ハーピー', label: 'ハ', side: 'demon',   tri: 'ranged', atk: 16, def: 9,  mag: 8, mdef: 12, spd: 7, move: 5, range: 'line8:1-2', dmg: 'phys', flyer: true },
};
export const TRI_ADV = { heavy: 'fast', fast: 'ranged', ranged: 'heavy' };

// 部隊の質（数の王国、質の魔族）
export const QUALITY = { kingdom: 1.0, zako: 0.9, officer: 1.25, guard: 1.25 };

export const UNIT_MAX = 300; // 1部隊の最大兵数

// ---- キャラクター ----
// base: Lv1の値。grow: 1レベルごとに増える量。hp は本隊の兵数（ヤギューは本人のHP）
export const CHARACTERS = {
  sumire:  { name: 'スミレ', title: '勇者',       side: 'kingdom', label: '菫', units: 5, range: 'adj8',      dmg: 'phys',
             base: { hp: 320, mp: 30, atk: 28, def: 20, mag: 8,  mdef: 14, spd: 11, move: 5, lead: 70, pol: 40 },
             grow: { hp: 12,  mp: 2,  atk: 1.5, def: 1, mag: 0.3, mdef: 0.6, spd: 0.4 } },
  noguchi: { name: '野口',   title: '賢者',       side: 'kingdom', label: '野', units: 5, range: 'line8:2-2', dmg: 'mag',
             base: { hp: 280, mp: 50, atk: 10, def: 14, mag: 28, mdef: 22, spd: 8,  move: 4, lead: 60, pol: 75 },
             grow: { hp: 10,  mp: 3,  atk: 0.3, def: 0.7, mag: 1.5, mdef: 1, spd: 0.3 } },
  nanase:  { name: '七星',   title: '魔法使い',   side: 'kingdom', label: '七', units: 5, range: 'line8:1-3', dmg: 'mag',
             base: { hp: 270, mp: 45, atk: 8,  def: 12, mag: 30, mdef: 20, spd: 9,  move: 4, lead: 55, pol: 50 },
             grow: { hp: 10,  mp: 3,  atk: 0.3, def: 0.6, mag: 1.6, mdef: 0.9, spd: 0.35 } },
  nozomi:  { name: 'のぞちち', title: '絶対女王', side: 'kingdom', label: '女', units: 1, range: 'line8:1-3', dmg: 'mag',
             base: { hp: 400, mp: 60, atk: 18, def: 22, mag: 30, mdef: 28, spd: 9,  move: 3, lead: 80, pol: 90 },
             grow: { hp: 12, mp: 3, atk: 0.5, def: 1, mag: 1.5, mdef: 1, spd: 0.3 } },
  yagyu:   { name: 'ヤギュー', title: '魔王',     side: 'demon',   label: '魔', units: 5, range: 'line8:1-2', dmg: 'phys', solo: true,
             base: { hp: 700, mp: 60, atk: 52, def: 38, mag: 20, mdef: 30, spd: 12, move: 5, lead: 90, pol: 30 },
             grow: { hp: 40,  mp: 4,  atk: 2.4, def: 2.2, mag: 0.6, mdef: 1.8, spd: 0.5 } },
  car:     { name: 'CAR', title: '幹部',          side: 'demon',   label: 'C', units: 3, range: 'line8:1-3', dmg: 'mag',
             base: { hp: 300, mp: 35, atk: 14, def: 16, mag: 26, mdef: 18, spd: 10, move: 4, lead: 55, pol: 30 },
             grow: { hp: 7, mp: 2, atk: 0.4, def: 0.8, mag: 1.4, mdef: 0.9, spd: 0.4 } },
  oh:      { name: 'OH', title: '幹部',           side: 'demon',   label: 'O', units: 3, range: 'orth:1-2',  dmg: 'best',
             base: { hp: 320, mp: 35, atk: 24, def: 20, mag: 22, mdef: 20, spd: 9,  move: 4, lead: 65, pol: 60 },
             grow: { hp: 8, mp: 2, atk: 1, def: 1, mag: 1, mdef: 1, spd: 0.3 } },
  kkb:     { name: 'KKB', title: '幹部',          side: 'demon',   label: 'K', units: 3, range: 'orth:1-1',  dmg: 'phys',
             base: { hp: 360, mp: 30, atk: 32, def: 26, mag: 6,  mdef: 12, spd: 6,  move: 4, lead: 75, pol: 70 },
             grow: { hp: 10, mp: 2, atk: 1.6, def: 1.3, mag: 0.2, mdef: 0.5, spd: 0.2 } },
  horie:   { name: '堀江', title: '武将',         side: 'neutral', label: '堀', units: 5, range: 'line8:1-2', dmg: 'best',
             base: { hp: 320, mp: 40, atk: 24, def: 20, mag: 24, mdef: 20, spd: 10, move: 5, lead: 70, pol: 70 },
             grow: { hp: 7, mp: 2, atk: 1, def: 0.9, mag: 1, mdef: 0.9, spd: 0.35 } },
  yuki:    { name: 'ゆきちゃん', title: '町の娘', side: 'kingdom', label: 'ゆ', units: 1, range: 'adj8',      dmg: 'phys',
             base: { hp: 220, mp: 10, atk: 18, def: 14, mag: 10, mdef: 14, spd: 8,  move: 4, lead: 30, pol: 30 },
             grow: { hp: 0, mp: 0, atk: 0, def: 0, mag: 0, mdef: 0, spd: 0 } },
};

export const HERO_ROLES = ['sumire', 'noguchi', 'nanase'];
export const ROLES = ['yagyu', 'sumire', 'noguchi', 'nanase'];
export const REQUIRED_ROLES = ['yagyu', 'sumire'];

// レベル上げ：魔族は魔力で、勇者たちは合戦の経験で
export const levelUpCost = (lv) => 15 + 5 * lv;
export const expToNext = (lv) => 40 + lv * 20;

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
    s[k] = Math.floor(c.base[k] + (c.grow[k] || 0) * (level - 1));
  }
  return s;
}

// ---- 戦場の地形 ----
export const TERRAIN = {
  '.': { name: '平地' },
  F:   { name: '森',     defMod: 1.2 },
  R:   { name: '川',     defMod: 0.8 },
  C:   { name: '崖・岩場' },
  H:   { name: '高台',   atkMod: 1.2 },
  W:   { name: '城壁',   defMod: 1.5 },
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
};
export const DEMON_ACTIONS = {
  farm:    { name: '開墾',         cost: { magic: 10 },  desc: '畑+4' },
  people:  { name: '民を増やす',   cost: { food: 40 },   desc: '民+200' },
  terror:  { name: '恐怖を与える', cost: {},             desc: '恐怖+15（民が少し減る）' },
  spawn:   { name: '手下を生む',   cost: { magic: 25 },  desc: '陣地の兵+150' },
  levelup: { name: 'レベル上げ',   cost: { magic: 0 },   desc: '魔力でキャラのレベルを上げる', global: true },
};


// レベルと装備を合わせた、今のステータス
export function gameStats(game, charId) {
  const st = charStats(charId, game.chars[charId]?.level || 1);
  const gear = game.gear?.[charId];
  if (gear?.weapon) {
    const r = RECIPES[gear.weapon];
    if (CHARACTERS[charId].dmg === 'mag') st.mag += r.power; else st.atk += r.power;
  }
  if (gear?.armor) for (const [k, v] of Object.entries(RECIPES[gear.armor].bonus)) st[k] += v;
  return st;
}
