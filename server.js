// サーバー：ブラウザに画面を配り、ゲームの状態を保存して、全員に知らせる
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from './server/game.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3000);
const AI_DELAY = Number(process.env.AI_DELAY ?? 450);

fs.mkdirSync(DATA, { recursive: true });

const games = new Map();
const streams = new Map(); // gameId -> Set(res)

for (const f of fs.readdirSync(DATA)) {
  if (!f.endsWith('.json')) continue;
  try {
    const g = G.migrate(JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')));
    games.set(g.id, g);
  } catch (e) { console.error('読み込み失敗', f, e.message); }
}

function save(game) {
  const file = path.join(DATA, game.id + '.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(game));
  fs.renameSync(file + '.tmp', file);
}

function broadcast(game) {
  const set = streams.get(game.id);
  if (!set) return;
  for (const res of set) res.write(`data: ${JSON.stringify(G.publicView(game, G.roleOf(game, res.token)))}\n\n`);
}

const timers = new Map();
// 変化があったら：保存して、全員に送って、次の自動の動きを予約する
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
    if (!G.aiTurn(game)) return; // 人の番・人の決定を待つ
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
    }, b.auto ? 1500 : 5000));
  }
}

for (const g of games.values()) changed(g);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function body(req) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 1e6) throw new Error('too large'); }
  return s ? JSON.parse(s) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/games' && req.method === 'GET') {
      return sendJson(res, 200, [...games.values()].sort((a, b) => b.createdAt - a.createdAt).map(g => ({
        id: g.id, name: g.name, phase: g.phase, day: g.day, trial: !!g.trial,
        players: Object.fromEntries(Object.entries(g.players).map(([r, v]) => [r, v ? v.name : null])),
      })));
    }
    if (p === '/api/games' && req.method === 'POST') {
      const b = await body(req);
      const g = G.createGame(b.name, { trial: !!b.trial });
      games.set(g.id, g);
      save(g);
      return sendJson(res, 200, { id: g.id });
    }
    const m = p.match(/^\/api\/games\/([0-9a-f]+)\/(stream|join|action)$/);
    if (m) {
      const game = games.get(m[1]);
      if (!game) return sendJson(res, 404, { error: 'ゲームが見つかりません' });
      if (m[2] === 'stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.token = url.searchParams.get('token');
        res.write(`data: ${JSON.stringify(G.publicView(game, G.roleOf(game, res.token)))}\n\n`);
        if (!streams.has(game.id)) streams.set(game.id, new Set());
        streams.get(game.id).add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 25000);
        req.on('close', () => { clearInterval(ping); streams.get(game.id)?.delete(res); });
        return;
      }
      const b = await body(req);
      if (m[2] === 'join') {
        const token = G.join(game, b.role, b.name);
        changed(game);
        return sendJson(res, 200, { token, role: b.role });
      }
      const role = G.roleOf(game, b.token);
      if (!role) return sendJson(res, 403, { error: '参加していません' });
      const a = b.action || {};
      switch (a.type) {
        case 'start': G.start(game); break;
        case 'orders': G.setOrders(game, role, a.orders || {}); break;
        case 'ready': G.setReady(game, role, a.ready); break;
        case 'battle': G.battleAction(game, role, a.action || {}); break;
        default: throw new Error('知らない操作です');
      }
      changed(game);
      return sendJson(res, 200, { ok: true });
    }
    // 静的ファイル
    let file = p === '/' ? '/index.html' : p;
    const base = file.startsWith('/shared/') ? ROOT : path.join(ROOT, 'public');
    const full = path.normalize(path.join(base, file));
    if (!full.startsWith(base) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(full).pipe(res);
  } catch (e) {
    sendJson(res, 400, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`魔王ヤギュー討伐戦: http://localhost:${PORT}`));
