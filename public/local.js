// ブラウザの中だけで動く「サーバー」（ひとりで遊ぶ版）。
// server.js と同じ仕事（ゲームを持つ・保存する・画面に知らせる・AIの手を少し待って進める）をここでする。
// セーブはこのブラウザの中（localStorage）に残る。
import * as G from './server/game.js';

const AI_DELAY = 450;
const KEY = 'yagi:game:';
const games = new Map();
const subs = new Map(); // gameId -> Set({ token, cb })
const timers = new Map();

function storageKeys() {
  try { return Object.keys(localStorage).filter(k => k.startsWith(KEY)); } catch { return []; }
}
for (const k of storageKeys()) {
  try {
    const g = G.migrate(JSON.parse(localStorage.getItem(k)));
    games.set(g.id, g);
  } catch { /* 読めないセーブはとばす */ }
}

function save(game) {
  try { localStorage.setItem(KEY + game.id, JSON.stringify(game)); } catch { /* 保存できなくても遊べる */ }
}

function viewFor(game, token) {
  return JSON.parse(JSON.stringify(G.publicView(game, G.roleOf(game, token))));
}

function broadcast(game) {
  for (const s of subs.get(game.id) || []) s.cb(viewFor(game, s.token));
}

function changed(game) {
  save(game);
  broadcast(game);
  schedule(game);
}

// AIの番なら少し待って1手進める。決着していたら、結果を少し見せてから地図へ戻す
function schedule(game) {
  if (timers.has(game.id)) return;
  const b = game.battle;
  if (!b) return;
  if (!G.battleDone(game)) {
    if (!G.aiTurn(game)) return;
    timers.set(game.id, setTimeout(() => {
      timers.delete(game.id);
      G.advance(game);
      changed(game);
    }, AI_DELAY));
  } else {
    const id = b.id;
    timers.set(game.id, setTimeout(() => {
      timers.delete(game.id);
      if (game.battle?.id === id) { G.battleAction(game, null, { type: 'conclude' }); changed(game); }
      else schedule(game);
    }, b.auto ? 1200 : 4000));
  }
}

for (const g of games.values()) schedule(g);

// server.js の /api/... と同じ形で答える
export async function api(path, data) {
  if (path === '/api/info') return { online: false };
  if (path === '/api/games' && !data) {
    return [...games.values()].sort((a, b) => b.createdAt - a.createdAt).map(g => ({
      id: g.id, name: g.name, phase: g.phase, day: g.day, trial: !!g.trial, solo: !!g.solo, mode: g.mode || 'war', royale: (g.royale || g.conquest) ? { level: (g.royale || g.conquest).level, bots: (g.royale || g.conquest).bots } : null,
      players: Object.fromEntries(Object.entries(g.players).map(([r, v]) => [r, v ? v.name : null])),
    }));
  }
  if (path === '/api/games') {
    const g = G.createGame(data.name, { trial: !!data.trial, difficulty: data.difficulty, solo: !!data.solo, mode: data.mode, level: data.level, bots: data.bots });
    games.set(g.id, g);
    save(g);
    return { id: g.id };
  }
  const m = path.match(/^\/api\/games\/([0-9a-f]+)\/(join|rejoin|action|delete)$/);
  const game = m && games.get(m[1]);
  if (!game) throw new Error('ゲームが見つかりません');
  if (m[2] === 'delete') {
    games.delete(game.id);
    try { localStorage.removeItem(KEY + game.id); } catch { /* なし */ }
    return { ok: true };
  }
  if (m[2] === 'join') {
    const token = G.join(game, data.role, data.name);
    changed(game);
    return { token, role: data.role };
  }
  if (m[2] === 'rejoin') return { token: G.rejoin(game, data.role, data.code), role: data.role };
  const role = G.roleOf(game, data.token);
  if (!role) throw new Error('参加していません');
  const a = data.action || {};
  switch (a.type) {
    case 'start': G.start(game); break;
    case 'orders': G.setOrders(game, role, a.orders || {}); break;
    case 'ready': G.setReady(game, role, a.ready); break;
    case 'incident': G.incidentChoice(game, role, a.id, a.choice); break;
    case 'battle': G.battleAction(game, role, a.action || {}); break;
    default: throw new Error('知らない操作です');
  }
  changed(game);
  return { ok: true };
}

// EventSource のかわり：変化があるたびに cb(画面用の状態) を呼ぶ。やめるときは戻り値を呼ぶ
export function subscribe(id, token, cb) {
  const game = games.get(id);
  if (!game) return () => {};
  if (!subs.has(id)) subs.set(id, new Set());
  const s = { token, cb };
  subs.get(id).add(s);
  setTimeout(() => cb(viewFor(game, token)), 0);
  return () => subs.get(id)?.delete(s);
}
