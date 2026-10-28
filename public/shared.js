// みんなで遊ぶ版：Claude のページの「共有データ（db）」にゲームを置いて、このページを開いている人どうしで遊ぶ。
// server.js と同じ形の api / subscribe を用意する。
//
// しくみ
// - games/<id>       ゲーム1つ（state にゲームの状態を JSON 文字列で入れる。一覧用に名前や参加者も持つ）
// - locks/<id>       書きこむ前に取る「短いカギ」。同時に2人が書いて片方が消えるのを防ぐ
// - drivers/<id>     AIの手を進める係のカギ。開いている人のうち1人だけがAIを動かす
// 席は Claude のアカウント（user.id）で覚えるので、別の端末からでも自分の役に戻れる。
import * as G from './server/game.js';

const AI_DELAY = 500;
let db = null, me = null;
const tab = Math.random().toString(36).slice(2);

export const ready = (async () => {
  if (!window.claude?.use) return false;
  try {
    const [d, u] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!d || !u) return false;
    const uid = await u.id();
    if (!uid) return false;
    // 書きこめない人（閲覧だけの人）は、みんなで遊ぶ機能を使えない
    const canWrite = u.can ? await u.can('data.write') : null;
    if (canWrite === false) return false;
    db = d; me = uid;
    return true;
  } catch { return false; }
})();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const decode = (snap) => (snap.exists ? G.migrate(JSON.parse(snap.data().state)) : null);

function meta(game) {
  return {
    id: game.id, name: game.name, phase: game.phase, day: game.day, trial: !!game.trial, createdAt: game.createdAt,
    players: Object.fromEntries(Object.entries(game.players).map(([r, v]) => [r, v ? { name: v.name, uid: v.token } : null])),
  };
}

async function write(game) {
  await db.doc('games/' + game.id).set({ ...meta(game), state: JSON.stringify(game), updatedAt: Date.now() });
}

// カギを取って、最新の状態に fn を当てて書き戻す（取れなければ少し待ってやり直す）
async function mutate(id, fn) {
  const lock = db.doc('locks/' + id);
  for (let i = 0; i < 40; i++) {
    const r = await lock.acquire({ holder: tab, ttlMs: 8000 });
    if (r.acquired) {
      const game = decode(await db.doc('games/' + id).get());
      if (!game) throw new Error('ゲームが見つかりません');
      const out = fn(game);
      if (out === false) return null; // 何も変わらなかった
      await write(game);
      return out;
    }
    await sleep(150 + Math.random() * 250);
  }
  throw new Error('ほかの人の操作と重なりました。もう一度押してください');
}

// ---------- 一覧 ----------
let list = [];
let listSub = null;
const listListeners = new Set();
export function watchList(cb) {
  listListeners.add(cb);
  if (!listSub) {
    listSub = db.collection('games').orderBy('createdAt', 'desc').limit(30).onSnapshot(snap => {
      list = snap.docs.map(d => d.data()).filter(Boolean);
      for (const f of listListeners) f(list);
    }, () => {});
  } else cb(list);
  return () => listListeners.delete(cb);
}
export const myUid = () => me;
export const isShared = (id) => list.some(g => g.id === id) || subs.has(id);

// ---------- server.js と同じ形の api ----------
export async function api(path, data) {
  if (path === '/api/games' && !data) {
    return list.map(g => ({ ...g, players: Object.fromEntries(Object.entries(g.players).map(([r, v]) => [r, v ? v.name : null])), shared: true }));
  }
  if (path === '/api/games') {
    const g = G.createGame(data.name, { trial: !!data.trial, difficulty: data.difficulty });
    await write(g);
    return { id: g.id };
  }
  const m = path.match(/^\/api\/games\/([0-9a-f]+)\/(join|action|delete)$/);
  if (!m) throw new Error('知らない操作です');
  const id = m[1];
  if (m[2] === 'delete') { await db.doc('games/' + id).delete(); return { ok: true }; }
  if (m[2] === 'join') {
    await mutate(id, g => {
      G.join(g, data.role, data.name);
      g.players[data.role].token = me; // 席は Claude のアカウントで覚える
    });
    return { token: me, role: data.role };
  }
  const a = data.action || {};
  await mutate(id, g => {
    const role = G.roleOf(g, me);
    if (!role) throw new Error('参加していません');
    switch (a.type) {
      case 'start': G.start(g); break;
      case 'orders': G.setOrders(g, role, a.orders || {}); break;
      case 'ready': G.setReady(g, role, a.ready); break;
      case 'incident': G.incidentChoice(g, role, a.id, a.choice); break;
      case 'battle': G.battleAction(g, role, a.action || {}); break;
      default: throw new Error('知らない操作です');
    }
  });
  return { ok: true };
}

// ---------- 見る（状態が変わるたびに cb） ----------
const subs = new Map();
export function subscribe(id, _token, cb) {
  let timer = null;
  const unsub = db.doc('games/' + id).onSnapshot(snap => {
    const game = decode(snap);
    if (!game) return;
    cb(JSON.parse(JSON.stringify(G.publicView(game, G.roleOf(game, me)))));
    clearTimeout(timer);
    timer = drive(id, game);
  }, () => {});
  subs.set(id, unsub);
  return () => { clearTimeout(timer); unsub(); subs.delete(id); };
}

// AIの番・決着のあと：開いている人のうち1人（係のカギを取れた人）が、少し待って進める。
// 係の人がページを閉じたら、カギが切れたあとで別の人が引きつぐ
const latest = new Map();
function drive(id, game) {
  const b = game.battle;
  if (!b) { latest.delete(id); return null; }
  const done = G.battleDone(game);
  if (!done && !G.aiTurn(game)) { latest.delete(id); return null; }
  const key = `${b.id}:${b.round}:${b.idx}:${b.stage}:${!!b.result}`;
  latest.set(id, key);
  const attempt = async () => {
    if (latest.get(id) !== key) return;
    try {
      const r = await db.doc('drivers/' + id).acquire({ holder: tab, ttlMs: 15000 });
      if (!r.acquired) { setTimeout(attempt, 4000); return; }
      await mutate(id, g => {
        const nb = g.battle;
        if (!nb || `${nb.id}:${nb.round}:${nb.idx}:${nb.stage}:${!!nb.result}` !== key) return false; // もうだれかが進めた
        if (G.battleDone(g)) G.battleAction(g, null, { type: 'conclude' });
        else if (!G.advance(g)) return false;
      });
    } catch { setTimeout(attempt, 4000); }
  };
  return setTimeout(attempt, done ? (b.auto ? 1200 : 4000) : AI_DELAY);
}
