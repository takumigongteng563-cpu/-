// ブラウザ側：ロビー・地図・合戦・イベントの画面
import {
  TERRITORIES, EDGES, SIZES, SPECIALTIES, CHARACTERS, UNIT_TYPES, ROLES, HERO_ROLES,
  BATTLE_W, BATTLE_H, TERRAIN, MAJORITY, MAX_ROUNDS, KINGDOM_ACTIONS, DEMON_ACTIONS, neighbors, gameStats, levelUpCost, expToNext,
  MATERIALS, RECIPES, GEAR_MAX, troopGearCost, recipeName, edgeKey, isInjured, FACILITIES, canRemodel,
} from '/shared/data.js';
import { reachable, targetsFrom, damage, getStat, getMove, isTargetable, inDarkness } from '/shared/battlecore.js';
import { SKILLS, skillOf, skillList, skillTargets, areaTiles } from '/shared/skills.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SIDE_NAME = { kingdom: '王国', demon: '魔族', neutral: '中立' };
const SIDE_COLOR = { kingdom: '#3f6fc4', demon: '#8a3fa8', neutral: '#9a958b' };
const SIDE_SOFT = { kingdom: '#dbe6fa', demon: '#efdcf5', neutral: '#ebe8e1' };
const ROLE_SIDE = { yagyu: 'demon', sumire: 'kingdom', noguchi: 'kingdom', nanase: 'kingdom' };
// キャラごとの色（地図のコマ）
const CHAR_COLOR = { sumire: '#4a62c9', noguchi: '#2f8a8a', nanase: '#6a5acd', nozomi: '#c49a1a', horie: '#8a6a2a', yuki: '#5a9ad8', yagyu: '#5a1f6e', car: '#7a3f9a', oh: '#3f7a5a', kkb: '#9a3f5a' };
const TILE_COLOR = { '.': '#d6e6b0', F: '#6fa35a', R: '#7fb5e0', C: '#8f7c69', H: '#d2bb7f', W: '#6e6a66', S: '#ece4cf' };

const S = {
  game: null, gameId: null, me: null, es: null,
  draft: null, draftDay: null, sendTimer: null,
  selGen: null, selTerr: null, selUnit: null,
  modalOpen: false,
};

// ---------- 通信 ----------
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存できなくても動く */ } },
};

async function api(path, data) {
  const res = await fetch(path, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || 'エラー');
  return j;
}

async function act(action) {
  if (!S.me) return toast('見ているだけです（参加していません）');
  try { await api(`/api/games/${S.gameId}/action`, { token: S.me.token, action }); }
  catch (e) { toast(e.message); }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}

// ---------- ロビー ----------
async function showLobby() {
  if (S.es) { S.es.close(); S.es = null; }
  S.game = null; S.gameId = null;
  $('#lobby').classList.remove('hidden');
  $('#game').classList.add('hidden');
  $('#playerName').value = store.get('yagyu:name') || '';
  await refreshList();
}

// インターネットで遊んでいるとき：友だちに送るURLを出す
async function refreshOnline() {
  const box = $('#onlineBox');
  try {
    const info = await api('/api/info');
    if (!info.online) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    if (info.url) {
      box.innerHTML = `<h2>インターネットで遊べます</h2><div class="hint">このURLを友だちに送ってください（このパソコンでゲームを動かしているあいだだけ使えます）</div>
        <div class="row" style="margin-top:6px"><input id="onlineUrl" value="${esc(info.url)}" readonly style="flex:1;min-width:0"><button id="copyUrl" class="primary">コピー</button></div>
        <div class="hint">URLは起動するたびに変わります。友だちが自分の役に戻るときは、役のボタン（🔑）を押して「あいことば」を入れます。</div>`;
      $('#copyUrl').onclick = async () => { try { await navigator.clipboard.writeText(info.url); toast('コピーしました'); } catch { $('#onlineUrl').select(); } };
    } else {
      box.innerHTML = `<h2>インターネットにつないでいます…</h2><div class="hint">${esc(info.message || '少し待ってください')}</div>`;
      setTimeout(refreshOnline, 2000);
    }
  } catch { box.classList.add('hidden'); }
}

async function refreshList() {
  refreshOnline();
  const list = await api('/api/games');
  const box = $('#gameList');
  if (!list.length) { box.innerHTML = '<p class="muted">まだゲームがありません。</p>'; return; }
  box.innerHTML = list.map(g => {
    const mine = store.get('yagyu:seat:' + g.id);
    const phase = (g.phase === 'lobby' ? '参加者を募集中' : g.phase === 'ended' ? '決着' : `${g.day}日目`) + (g.trial ? '・お試し（Lv30）' : '') + (g.solo ? '・ひとり用' : '');
    const roles = ROLES.map(r => {
      const taken = g.players[r];
      if (taken) return `<button class="roleBtn taken" data-rejoin="${g.id}" data-role="${r}" title="あいことばで、この役に戻る">${CHARACTERS[r].title}${CHARACTERS[r].name}：${esc(taken)} 🔑</button>`;
      return `<button class="roleBtn" data-join="${g.id}" data-role="${r}" ${g.phase !== 'ended' ? '' : 'disabled'}>
        ${CHARACTERS[r].title}${CHARACTERS[r].name}：${g.phase === 'lobby' ? '空き' : '空き（今はAI）'}</button>`;
    }).join('');
    return `<div class="gameItem">
      <div class="row"><span class="title">${esc(g.name)}</span><span class="muted">${phase}</span>
        <span style="flex:1"></span>
        ${mine ? `<button class="primary" data-open="${g.id}">続きから（${CHARACTERS[mine.role].name}）</button>` : ''}
        <button data-watch="${g.id}" class="ghost">見る</button></div>
      <div class="roles">${roles}</div></div>`;
  }).join('');
}

$('#refreshList').onclick = refreshList;

// ひとりで遊ぶ：ゲームを作って、選んだ側で参加して、すぐ始める
document.querySelector('.solo').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-solo]');
  if (!b) return;
  const role = b.dataset.solo;
  const name = $('#playerName').value.trim();
  store.set('yagyu:name', name);
  try {
    const { id } = await api('/api/games', { name: `${name || 'ひとり'}の${role === 'yagyu' ? '魔族' : '王国'}`, trial: $('#soloTrial').checked, difficulty: $('#soloDifficulty').value, solo: true });
    const r = await api(`/api/games/${id}/join`, { role, name });
    store.set('yagyu:seat:' + id, { role: r.role, token: r.token });
    await api(`/api/games/${id}/action`, { token: r.token, action: { type: 'start' } });
    openGame(id);
  } catch (err) { toast(err.message); }
});
$('#btnHowto').onclick = () => showHowto();
$('#createGame').onclick = async () => {
  const { id } = await api('/api/games', { name: $('#newGameName').value, trial: $('#trialMode').checked });
  $('#newGameName').value = '';
  await refreshList();
  toast('ゲームを作りました。役を選んで参加してください');
  void id;
};
$('#gameList').onclick = async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.join) {
    const name = $('#playerName').value.trim();
    store.set('yagyu:name', name);
    try {
      const r = await api(`/api/games/${b.dataset.join}/join`, { role: b.dataset.role, name });
      store.set('yagyu:seat:' + b.dataset.join, { role: r.role, token: r.token });
      openGame(b.dataset.join);
    } catch (err) { toast(err.message); refreshList(); }
  } else if (b.dataset.rejoin) {
    const code = prompt(`${CHARACTERS[b.dataset.role].name}のあいことば（4けたの数字）を入れてください`);
    if (!code) return;
    try {
      const r = await api(`/api/games/${b.dataset.rejoin}/rejoin`, { role: b.dataset.role, code });
      store.set('yagyu:seat:' + b.dataset.rejoin, { role: r.role, token: r.token });
      openGame(b.dataset.rejoin);
    } catch (err) { toast(err.message); }
  } else if (b.dataset.open) openGame(b.dataset.open);
  else if (b.dataset.watch) openGame(b.dataset.watch, true);
};

function openGame(id, watchOnly) {
  S.gameId = id;
  S.me = watchOnly ? null : store.get('yagyu:seat:' + id);
  S.draft = null; S.draftDay = null; S.selGen = null; S.selTerr = null;
  location.hash = 'g=' + id;
  $('#lobby').classList.add('hidden');
  $('#game').classList.remove('hidden');
  if (S.es) S.es.close();
  S.es = new EventSource(`/api/games/${id}/stream${S.me ? '?token=' + S.me.token : ''}`);
  S.es.onmessage = (ev) => { S.game = JSON.parse(ev.data); onState(); };
  S.es.onerror = () => { /* 自動で再接続される */ };
}

// ---------- 状態が届いたら ----------
function onState() {
  const g = S.game;
  const activeId = g.battle?.active?.unitId + ':' + g.battle?.round + ':' + !!g.battle?.active?.extra;
  if (activeId !== S.lastActive) { S.aim = null; S.lastActive = activeId; }
  if (S.me && g.phase === 'day' && S.draftDay !== g.day) {
    const o = g.orders[S.me.role];
    S.draft = o ? JSON.parse(JSON.stringify(o)) : { moves: {}, acts: {}, globals: [] };
    S.draftDay = g.day;
  }
  render();
  maybeShowEvents();
}

function render() {
  const g = S.game;
  if (!g) return;
  renderTopbar(g);
  const inBattle = g.phase === 'battle' && g.battle;
  $('#main').classList.toggle('hidden', !!inBattle);
  $('#battleScreen').classList.toggle('hidden', !inBattle);
  if (inBattle) renderBattle(g);
  else { renderMap(g); renderPanel(g); }
}

const mySide = () => (S.me ? ROLE_SIDE[S.me.role] : null);
const owned = (g, s) => g.territories.filter(t => t.owner === s).length;

function renderTopbar(g) {
  const side = mySide();
  let res = '';
  if (g.phase !== 'lobby') {
    const k = g.resources.kingdom, d = g.resources.demon;
    if (side !== 'demon') res += `<span class="k">💰${k.gold} 🌾${k.food} 訓練${k.training}</span>`;
    if (side !== 'kingdom') res += `<span class="d">🌾${d.food} 🔮${d.magic}</span>`;
  }
  const chips = ROLES.map(r => {
    const p = g.players[r];
    if (!p) return `<span class="chip">${CHARACTERS[r].name}:AI</span>`;
    const ready = g.phase === 'day' && g.ready[r];
    return `<span class="chip ${ready ? 'ready' : ''}" title="${esc(p.name)}">${CHARACTERS[r].name}${S.me?.role === r ? '（あなた）' : ''}${ready ? ' ✓' : ''}</span>`;
  }).join('');
  const dayText = g.phase === 'lobby' ? '準備中' : g.phase === 'ended' ? `決着（${g.day}日目）` : `${g.day}日目${g.phase === 'battle' ? '・合戦中' : ''}`;
  $('#topbar').innerHTML = `
    <span class="day">${dayText}</span>
    <span>陣地 <b class="k">王国${owned(g, 'kingdom')}</b> / <b class="d">魔族${owned(g, 'demon')}</b> / 中立${owned(g, 'neutral')}（大半=${MAJORITY}）</span>
    <span class="res">${res}</span>
    <span class="spacer"></span>${chips}
    <button id="btnHowto2" class="small">遊び方</button>
    <button id="btnEvents" class="small">イベント</button>
    <button id="btnLobby" class="small">ロビーへ</button>`;
  $('#btnLobby').onclick = () => { location.hash = ''; showLobby(); };
  $('#btnEvents').onclick = showEventHistory;
  $('#btnHowto2').onclick = () => showHowto();
}

// ---------- 地図 ----------
const R_SIZE = { village: 15, town: 19, fortress: 23, metropolis: 28, capital: 28, castle: 28 };
const SIZE_MARK = { village: '村', town: '町', fortress: '城', metropolis: '都', capital: '王', castle: '魔' };

function genLabel(gen) {
  if (gen.charId) return CHARACTERS[gen.charId].label;
  return { soldier: '兵', majo: '将', garrison: '守' }[gen.kind] || '?';
}

function activeGens(g) { return Object.values(g.generals).filter(x => x.status === 'active' && !x.temp); }

// ---------- 地図の背景（古い地図ふう。一度だけ作る） ----------
let MAP_BG = null;
function mapBackground() {
  if (MAP_BG) return MAP_BG;
  const T = TERRITORIES;
  let h = `<defs>
    <radialGradient id="paper" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#f6ecd2"/><stop offset="70%" stop-color="#ead9b3"/><stop offset="100%" stop-color="#d2b98a"/></radialGradient>
    <radialGradient id="landK" cx="20%" cy="50%" r="45%"><stop offset="0%" stop-color="#9dbf8f" stop-opacity=".45"/><stop offset="100%" stop-color="#9dbf8f" stop-opacity="0"/></radialGradient>
    <radialGradient id="landD" cx="85%" cy="50%" r="35%"><stop offset="0%" stop-color="#5b4462" stop-opacity=".45"/><stop offset="100%" stop-color="#5b4462" stop-opacity="0"/></radialGradient>
    <radialGradient id="landM" cx="54%" cy="50%" r="22%"><stop offset="0%" stop-color="#d9b46a" stop-opacity=".35"/><stop offset="100%" stop-color="#d9b46a" stop-opacity="0"/></radialGradient>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c9861a"/></marker>
    <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" result="n"/><feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" in2="n" mode="multiply"/></filter>
  </defs>`;
  h += `<rect width="1000" height="660" fill="url(#paper)"/>`;
  h += `<rect width="1000" height="660" fill="url(#landK)"/><rect width="1000" height="660" fill="url(#landD)"/><rect width="1000" height="660" fill="url(#landM)"/>`;
  h += `<rect width="1000" height="660" fill="#7a5a30" opacity=".06" filter="url(#rough)"/>`;
  h += `<rect x="6" y="6" width="988" height="648" fill="none" stroke="#8a6a3e" stroke-width="2"/><rect x="12" y="12" width="976" height="636" fill="none" stroke="#8a6a3e" stroke-width=".8"/>`;
  // 大きな川（北の峠から南の港へ）
  h += `<path d="M640,14 C620,120 700,170 650,250 S560,330 590,400 S520,500 470,520 S300,640 230,650" fill="none" stroke="#7fa8c9" stroke-width="7" opacity=".45" stroke-linecap="round"/>`;
  // 地形の絵（陣地のまわりに少し）
  const rand = (i) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const mount = (x, y, s, c) => `<path d="M${x - 9 * s},${y + 6 * s} L${x},${y - 8 * s} L${x + 9 * s},${y + 6 * s} Z" fill="${c}" opacity=".55"/><path d="M${x - 3 * s},${y - 3 * s} L${x},${y - 8 * s} L${x + 3 * s},${y - 3 * s}" fill="#fff" opacity=".5"/>`;
  const tree = (x, y, s) => `<circle cx="${x}" cy="${y - 4 * s}" r="${5 * s}" fill="#5f8a4a" opacity=".55"/><rect x="${x - 1}" y="${y}" width="2" height="${4 * s}" fill="#6b4f2a" opacity=".5"/>`;
  const wave = (x, y) => `<path d="M${x - 8},${y} q4,-4 8,0 t8,0" fill="none" stroke="#5f8fb8" stroke-width="1.6" opacity=".6"/>`;
  const hill = (x, y) => `<path d="M${x - 10},${y + 3} q10,-12 20,0" fill="none" stroke="#9a7a45" stroke-width="1.6" opacity=".6"/>`;
  T.forEach((t, i) => {
    for (let k = 0; k < 4; k++) {
      const ang = rand(i * 7 + k) * Math.PI * 2, dist = 34 + rand(i * 13 + k) * 18;
      const x = t.x + Math.cos(ang) * dist, y = t.y + Math.sin(ang) * dist * 0.8;
      if (x < 24 || x > 976 || y < 24 || y > 636) continue;
      if (t.terrain === 'mountain' || t.terrain === 'castle') h += mount(x, y, 1 + rand(i + k) * 0.5, t.x > 700 ? '#5d4a5f' : '#8a7356');
      else if (t.terrain === 'forest') h += tree(x, y, 1 + rand(i + k) * 0.4);
      else if (t.terrain === 'river') h += wave(x, y);
      else if (t.terrain === 'hill') h += hill(x, y);
      else if (k < 2) h += `<path d="M${x},${y} l2,-5 M${x + 4},${y} l1,-4" stroke="#8aa06a" stroke-width="1.2" opacity=".5"/>`;
    }
  });
  // 方位と題字
  h += `<g transform="translate(962,618)" opacity=".7"><circle r="15" fill="none" stroke="#8a6a3e"/><path d="M0,-19 L4,0 L0,19 L-4,0 Z" fill="#8a6a3e"/><path d="M-19,0 L0,3 L19,0 L0,-3 Z" fill="#b89b6a"/><text x="-26" y="4" text-anchor="middle" font-size="10" fill="#6b5030" class="serif">北↑</text></g>`;
  h += `<text x="40" y="44" font-size="22" fill="#6b5030" class="serif" opacity=".75" letter-spacing="4">山羊の野望</text>`;
  h += `<text x="60" y="636" font-size="12" fill="#4f6e8a" class="serif" opacity=".7">王国</text><text x="900" y="40" font-size="12" fill="#5d3f66" class="serif" opacity=".8">魔族の山々</text>`;
  MAP_BG = h;
  return h;
}

// 陣地の大きさごとの絵（村は家、町は家なみ、城塞・王都・魔王城は城）
function nodeIcon(size, x, y, color) {
  const c = color;
  switch (size) {
    case 'village': return `<path d="M${x - 6},${y + 5} V${y - 1} L${x},${y - 6} L${x + 6},${y - 1} V${y + 5} Z" fill="${c}"/>`;
    case 'town': return `<path d="M${x - 10},${y + 6} V${y} L${x - 5},${y - 5} L${x},${y} V${y + 6} Z M${x},${y + 6} V${y - 3} L${x + 5},${y - 8} L${x + 10},${y - 3} V${y + 6} Z" fill="${c}"/>`;
    case 'fortress': return `<path d="M${x - 11},${y + 8} V${y - 4} h3 v-4 h3 v4 h4 v-4 h2 v4 h4 v-4 h3 v4 h3 V${y + 8} Z" fill="${c}"/><rect x="${x - 2.5}" y="${y + 1}" width="5" height="7" fill="#fff" opacity=".6"/>`;
    case 'metropolis': return `<path d="M${x - 13},${y + 9} V${y - 2} h4 V${y - 8} h4 V${y - 2} h2 a4,4 0 0 1 6,0 h2 V${y - 8} h4 V${y - 2} h4 V${y + 9} Z" fill="${c}"/><circle cx="${x}" cy="${y - 4}" r="4" fill="${c}"/>`;
    case 'capital': return `<path d="M${x - 13},${y + 10} V${y - 2} h4 v-4 h3 v4 h3 V${y - 10} h6 V${y - 2} h3 v-4 h3 v4 h4 V${y + 10} Z" fill="${c}"/><path d="M${x - 5},${y - 13} l2,-5 l3,3 l3,-3 l2,5 Z" fill="#d9a520"/>`;
    case 'castle': return `<path d="M${x - 12},${y + 10} L${x - 8},${y - 4} L${x - 4},${y + 2} L${x},${y - 12} L${x + 4},${y + 2} L${x + 8},${y - 4} L${x + 12},${y + 10} Z" fill="${c}"/><path d="M${x - 6},${y - 10} q-6,-6 -2,-10 M${x + 6},${y - 10} q6,-6 2,-10" stroke="${c}" stroke-width="2.5" fill="none"/>`;
    default: return '';
  }
}

// 武将のコマ（盾の形）
const shield = (x, y) => `M${x - 9},${y - 9} h18 v8 q0,8 -9,11 q-9,-3 -9,-11 Z`;

function renderMap(g) {
  const svg = $('#map');
  const T = TERRITORIES;
  const sel = S.selGen && g.generals[S.selGen];
  const moveTargets = sel && canOrder(sel) && sel.kind !== 'queen' ? neighbors(sel.location, sel.side, g.closed) : [];
  let h = mapBackground();
  for (const e of EDGES) {
    const a = T[e.a], b = T[e.b];
    if (e.cliff) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + (a.y < 330 ? -45 : 40);
      h += `<path d="M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}" fill="none" stroke="#6b4a2a" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round" opacity=".85"/>`;
    } else {
      h += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#f3e6c8" stroke-width="6" stroke-linecap="round"/>`;
      h += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#a88a5c" stroke-width="2" stroke-dasharray="7 4" stroke-linecap="round"/>`;
    }
    if (g.closed?.[edgeKey(e.a, e.b)]) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      h += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#c43f3f" stroke-width="3" stroke-dasharray="3 4"/>
        <text x="${mx}" y="${my + 6}" text-anchor="middle" font-size="18" font-weight="bold" fill="#c43f3f" stroke="#fff" stroke-width="3" paint-order="stroke">×</text>`;
    }
  }
  // 自分（と仲間）の移動命令の矢印
  const allOrders = { ...(g.orders || {}) };
  if (S.me && S.draft) allOrders[S.me.role] = S.draft;
  for (const o of Object.values(allOrders)) {
    for (const [gid, tid] of Object.entries(o.moves || {})) {
      const gen = g.generals[gid];
      if (!gen || gen.location == null) continue;
      const a = T[gen.location], b = T[tid];
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
      const r1 = R_SIZE[a.size] + 4, r2 = R_SIZE[b.size] + 6;
      h += `<line x1="${a.x + dx / L * r1}" y1="${a.y + dy / L * r1}" x2="${b.x - dx / L * r2}" y2="${b.y - dy / L * r2}" stroke="#c9861a" stroke-width="4" marker-end="url(#arrow)" opacity=".9"/>`;
    }
  }
  for (const t of T) {
    const st = g.territories[t.id];
    const r = R_SIZE[t.size];
    const isSel = S.selTerr === t.id;
    const target = moveTargets.includes(t.id);
    h += `<g class="terr" data-terr="${t.id}">`;
    if (target) h += `<circle cx="${t.x}" cy="${t.y}" r="${r + 8}" fill="#f2c55c" opacity=".35"/><circle cx="${t.x}" cy="${t.y}" r="${r + 8}" fill="none" stroke="#c9861a" stroke-width="2.5" stroke-dasharray="4 3"/>`;
    h += `<circle cx="${t.x + 1.5}" cy="${t.y + 2}" r="${r}" fill="#000" opacity=".15"/>`;
    h += `<circle cx="${t.x}" cy="${t.y}" r="${r}" fill="${SIDE_SOFT[st.owner]}" stroke="${SIDE_COLOR[st.owner]}" stroke-width="${isSel ? 5 : 2.5}"/>`;
    h += nodeIcon(t.size, t.x, t.y, SIDE_COLOR[st.owner]);
    h += `<text x="${t.x}" y="${t.y + r + 14}" text-anchor="middle" font-size="12.5" fill="#3b2f22" class="serif label">${t.name}</text>`;
    h += `<text x="${t.x}" y="${t.y + r + 27}" text-anchor="middle" font-size="10" fill="#7a6648" class="label">兵${st.garrison}${t.specialty ? '・' + SPECIALTIES[t.specialty].name : ''}</text>`;
    if (st.facility) h += `<rect x="${t.x - r - 10}" y="${t.y + r - 14}" width="16" height="16" rx="3" fill="${st.owner === 'demon' ? '#5d2a70' : '#7a5a10'}" stroke="#fff" stroke-width="1"/><text x="${t.x - r - 2}" y="${t.y + r - 2}" text-anchor="middle" font-size="11" fill="#fff" font-weight="bold">${FACILITIES[st.facility].label}</text>`;
    if (st.damaged > 0) h += `<text x="${t.x - r - 4}" y="${t.y - r + 4}" font-size="11" fill="#b23a2a" font-weight="bold" class="label">🔥${st.damaged}</text>`;
    h += `</g>`;
  }
  // 武将のコマ
  const byLoc = {};
  for (const gen of activeGens(g)) (byLoc[gen.location] ||= []).push(gen);
  for (const [loc, gens] of Object.entries(byLoc)) {
    const t = T[loc];
    const r = R_SIZE[t.size];
    gens.forEach((gen, i) => {
      const x = t.x + r - 2 + (i % 4) * 20, y = t.y - r - 10 + Math.floor(i / 4) * 22;
      const mine = canOrder(gen);
      const isSel = S.selGen === gen.id;
      const color = gen.charId && CHAR_COLOR[gen.charId] ? CHAR_COLOR[gen.charId] : SIDE_COLOR[gen.side];
      h += `<g class="gen" data-gen="${gen.id}">
        <path d="${shield(x + 1, y + 1.5)}" fill="#000" opacity=".2"/>
        <path d="${shield(x, y)}" fill="${color}" stroke="${isSel ? '#ffcf4a' : mine ? '#f5d58a' : '#fff'}" stroke-width="${isSel ? 3 : mine ? 2 : 1}"/>
        <text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff" pointer-events="none">${genLabel(gen)}</text></g>`;
    });
  }
  svg.innerHTML = h;
}

$('#map').addEventListener('click', (e) => {
  const g = S.game;
  const gEl = e.target.closest('[data-gen]');
  if (gEl) { S.selGen = gEl.dataset.gen; S.selTerr = g.generals[S.selGen].location; render(); return; }
  const tEl = e.target.closest('[data-terr]');
  if (!tEl) return;
  const tid = Number(tEl.dataset.terr);
  const sel = S.selGen && g.generals[S.selGen];
  if (sel && canOrder(sel) && g.phase === 'day' && sel.kind !== 'queen' && neighbors(sel.location, sel.side, g.closed).includes(tid)) {
    if (S.draft.moves[sel.id] === tid) delete S.draft.moves[sel.id];
    else { S.draft.moves[sel.id] = tid; delete S.draft.acts[sel.id]; }
    sendDraft();
  }
  S.selTerr = tid;
  render();
});

function canOrder(gen) {
  return S.me && gen.controller === S.me.role && gen.status === 'active';
}

function sendDraft() {
  clearTimeout(S.sendTimer);
  S.sendTimer = setTimeout(flushDraft, 250);
}
async function flushDraft() {
  clearTimeout(S.sendTimer);
  S.sendTimer = null;
  if (S.draft) await act({ type: 'orders', orders: S.draft });
}

// ---------- 右のパネル ----------
function terrInfo(g, tid) {
  const t = TERRITORIES[tid], st = g.territories[tid];
  const here = activeGens(g).filter(x => x.location === tid);
  const sp = t.specialty ? SPECIALTIES[t.specialty].name : 'なし';
  const mood = st.owner === 'demon' ? `<span class="l">恐怖</span><span>${st.fear}</span>` : `<span class="l">忠誠</span><span>${st.loyalty}</span>`;
  return `<div class="sec"><h3>${t.name} <span class="${st.owner[0]}">［${SIDE_NAME[st.owner]}］</span></h3>
    <div class="stats">
      <span class="l">大きさ</span><span>${SIZES[t.size].name}</span><span class="l">特産</span><span>${sp}</span>
      <span class="l">民</span><span>${st.pop}</span><span class="l">兵</span><span>${st.garrison}</span>
      <span class="l">畑</span><span>${st.farm}</span><span class="l">商業</span><span>${st.commerce}</span>
      <span class="l">守り</span><span>${st.defense}</span>${mood}
    </div>
    ${st.facility ? `<div class="hint"><b>${FACILITIES[st.facility].name}</b>：${esc(FACILITIES[st.facility].desc)}</div>` : ''}
    ${st.damaged ? `<div class="hint" style="color:#c43f3f">戦で荒れている：あと${st.damaged}日は収穫が半分</div>` : ''}
    ${here.length ? `<div style="margin-top:6px">${here.map(x => genRow(g, x)).join('')}</div>` : ''}
  </div>`;
}

function genHp(g, gen) {
  const lead = gen.charId ? `${gen.hp}/${gameStats(g, gen.charId).hp}` : '';
  const troops = gen.troops.map(t => `${UNIT_TYPES[t.type].label}${t.hp}`).join(' ');
  return [lead && (gen.charId === 'yagyu' ? 'HP' : '本隊') + lead, troops].filter(Boolean).join('　');
}

function orderText(g, gen) {
  if (!S.draft || !canOrder(gen)) return '';
  const m = S.draft.moves[gen.id];
  if (m !== undefined) return '→' + TERRITORIES[m].name;
  const a = S.draft.acts[gen.id];
  if (a) return a.type === 'craft' ? `${recipeName(a.recipe, gen.owner)}づくり` : a.type === 'build' ? `${FACILITIES[a.facility].name}に作り変え` : KINGDOM_ACTIONS[a.type].name;
  return '';
}

function genRow(g, gen) {
  const lv = (gen.charId ? ` Lv${g.chars[gen.charId].level}` : '') + (gen.charId && isInjured(g, gen.charId) ? ' <span style="color:#c43f3f">怪我</span>' : '');
  return `<div class="genRow ${S.selGen === gen.id ? 'sel' : ''}" data-selgen="${gen.id}">
    <span class="badge" style="background:${SIDE_COLOR[gen.side]}">${genLabel(gen)}</span>
    <div><div>${esc(gen.name)}${lv}</div><div class="muted" style="font-size:11px">${genHp(g, gen)}</div></div>
    <span class="order">${orderText(g, gen)}</span></div>`;
}

function selGenSection(g) {
  const gen = S.selGen && g.generals[S.selGen];
  if (!gen || gen.status !== 'active') return '';
  let h = `<div class="sec"><h3>${esc(gen.name)}${gen.charId ? ` <span class="muted">${CHARACTERS[gen.charId].title}</span>` : ''}</h3>`;
  if (gen.charId) {
    const st = gameStats(g, gen.charId);
    h += `<div class="stats">
      <span class="l">Lv</span><span>${g.chars[gen.charId].level}</span><span class="l">${gen.charId === 'yagyu' ? 'HP' : '本隊'}</span><span>${gen.hp}/${st.hp}</span>
      <span class="l">攻撃</span><span>${st.atk}</span><span class="l">防御</span><span>${st.def}</span>
      <span class="l">魔力</span><span>${st.mag}</span><span class="l">魔防</span><span>${st.mdef}</span>
      <span class="l">速さ</span><span>${st.spd}</span><span class="l">移動</span><span>${st.move}</span>
      <span class="l">統率</span><span>${st.lead}</span><span class="l">政治</span><span>${st.pol}</span></div>`;
  }
  if (gen.charId && isInjured(g, gen.charId)) h += `<div class="hint" style="color:#c43f3f">怪我：${g.injuries[gen.charId]}日目まで、ステータスが下がっている${gen.charId === 'noguchi' && g.chars.noguchi.level >= 10 ? '（無感情で下がらない）' : ''}。野口と同じ陣地か、王都にいると早く治る。</div>`;
  if (gen.charId && g.gear?.[gen.charId]) h += gearLine(g, gen.charId);
  if (gen.charId) {
    const c = g.chars[gen.charId];
    if (HERO_ROLES.includes(gen.charId) || gen.charId === 'horie') h += `<div class="hint">経験 ${c.exp}/${expToNext(c.level)}</div>`;
    h += `<details style="margin-top:6px"><summary>技・スキル</summary>${skillBook(gen.charId, c.level)}</details>`;
  }
  if (gen.troops.length) {
    h += `<div style="margin-top:6px">${gen.troops.map(t => `<div class="row" style="gap:6px"><span style="width:64px">${UNIT_TYPES[t.type].name}</span>
      <div class="bar" style="flex:1"><i style="width:${t.hp / t.max * 100}%"></i></div><span class="muted" style="width:60px;text-align:right">${t.hp}/${t.max}</span></div>`).join('')}</div>`;
  }
  if (canOrder(gen) && g.phase === 'day') {
    if (gen.kind === 'queen') h += `<div class="hint">女王は王都から動きません。</div>`;
    else h += `<div class="hint">地図で、まわりの光っている陣地をクリックすると移動（もう一度で取り消し）。</div>`;
    if (gen.kind === 'soldier' && g.territories[gen.location].owner === 'kingdom') {
      const cur = S.draft.acts[gen.id]?.type;
      h += `<div class="hint">この兵に、いる陣地で内政をさせる（その日は動かない）：</div><div class="acts">` +
        Object.entries(KINGDOM_ACTIONS).filter(([, a]) => !a.queenOnly && !a.workshop && !a.build).map(([k, a]) =>
          `<button class="small ${cur === k ? 'primary' : ''}" data-kact="${k}" title="${esc(a.desc)}">${a.name}</button>`).join('') + `</div>`;
      if (canRemodel(gen.location)) {
        const curF = S.draft.acts[gen.id]?.type === 'build' ? S.draft.acts[gen.id].facility : null;
        const here = g.territories[gen.location].facility;
        h += `<div class="hint">この陣地を作り変える（今：${here ? FACILITIES[here].name : 'なし'}）：</div><div class="skills">` +
          Object.entries(FACILITIES).filter(([, F]) => F.side === 'kingdom').map(([f, F]) =>
            `<button class="small choice ${curF === f ? 'primary' : ''}" data-build="${f}" ${here === f ? 'disabled' : ''}><b>${F.name}（お金${F.cost.gold}）</b><span>${esc(F.desc)}</span></button>`).join('') + `</div>`;
      }
    }
  } else if (!canOrder(gen) && gen.side !== mySide()) {
    h += `<div class="hint">相手の武将です。</div>`;
  }
  return h + '</div>';
}

function demonSection(g) {
  if (S.me?.role !== 'yagyu' || g.phase !== 'day') return '';
  const max = g.meta.demonActions;
  const acts = Object.entries(S.draft.acts);
  const used = acts.length + S.draft.globals.length;
  const mine = g.territories.filter(t => t.owner === 'demon');
  let h = `<div class="sec"><h3>魔族の内政（${used}/${max}回）</h3>`;
  h += acts.map(([k, a]) => `<div class="row"><span>${a.type === 'build' ? `作り変え（${FACILITIES[a.facility].name}）` : DEMON_ACTIONS[a.type].name}：${TERRITORIES[a.tid].name}</span><span style="flex:1"></span><button class="small" data-rmact="${k}">やめる</button></div>`).join('');
  h += S.draft.globals.map((a, i) => `<div class="row"><span>${a.type === 'curse' ? `勇者を呪う：${CHARACTERS[a.charId].name}（魔力40）` : `レベル上げ：${CHARACTERS[a.charId].name}（今Lv${g.chars[a.charId].level}・魔力${levelUpCost(g.chars[a.charId].level)}）`}</span><span style="flex:1"></span><button class="small" data-rmglobal="${i}">やめる</button></div>`).join('');
  if (used < max) {
    const tsel = S.selTerr != null && g.territories[S.selTerr].owner === 'demon' ? S.selTerr : mine[0]?.id;
    h += `<div class="row" style="margin-top:6px">
      <select id="dType">${demonTypeOptions().map(([v, label]) => `<option value="${v}" ${S.dType === v ? 'selected' : ''}>${label}</option>`).join('')}</select>
      <select id="dTarget"></select>
      <button class="small primary" id="dAdd">追加</button></div>`;
    S._demonDefault = tsel;
  }
  h += `<div class="hint">恐怖が下がりすぎると反乱が起きます。恐怖から魔力が生まれます。</div></div>`;
  return h;
}

// 魔族の内政の選択肢（作り変えは施設ごとに分ける）
function demonTypeOptions() {
  const out = [];
  for (const [k, a] of Object.entries(DEMON_ACTIONS)) {
    if (k === 'build') {
      for (const [f, F] of Object.entries(FACILITIES)) if (F.side === 'demon') out.push([`build:${f}`, `作り変え：${F.name}（魔力${F.cost.magic}・${F.desc}）`]);
    } else out.push([k, `${a.name}（${a.desc}）`]);
  }
  return out;
}

function fillDemonTarget(g) {
  const typeSel = $('#dType'), tSel = $('#dTarget');
  if (!typeSel) return;
  const fill = () => {
    S.dType = typeSel.value;
    const [type, facility] = typeSel.value.split(':');
    const A = DEMON_ACTIONS[type];
    if (A.heroTarget) {
      tSel.innerHTML = HERO_ROLES.map(c => `<option value="${c}">${CHARACTERS[c].name}${g.generals[c]?.status === 'active' ? '' : '（倒れている）'}</option>`).join('');
    } else if (facility) {
      tSel.innerHTML = g.territories.filter(t => t.owner === 'demon' && canRemodel(t.id)).map(t => `<option value="${t.id}" ${t.id === S._demonDefault ? 'selected' : ''}>${TERRITORIES[t.id].name}（今：${t.facility ? FACILITIES[t.facility].name : 'なし'}）</option>`).join('');
    } else if (A.enemy) {
      tSel.innerHTML = g.territories.filter(t => t.owner === 'kingdom' && t.id !== 0).map(t => `<option value="${t.id}">${TERRITORIES[t.id].name}（王国・兵${t.garrison}）</option>`).join('');
    } else if (A.global) {
      tSel.innerHTML = ['yagyu', 'car', 'oh', 'kkb'].map(c => `<option value="${c}">${CHARACTERS[c].name}（Lv${g.chars[c].level}・魔力${levelUpCost(g.chars[c].level)}）</option>`).join('');
    } else {
      tSel.innerHTML = g.territories.filter(t => t.owner === 'demon').map(t => `<option value="${t.id}" ${t.id === S._demonDefault ? 'selected' : ''}>${TERRITORIES[t.id].name}（恐怖${t.fear}・兵${t.garrison}）</option>`).join('');
    }
  };
  typeSel.onchange = fill;
  fill();
  $('#dAdd').onclick = () => {
    const [type, facility] = typeSel.value.split(':');
    if (DEMON_ACTIONS[type].global || DEMON_ACTIONS[type].heroTarget) S.draft.globals.push({ type, charId: tSel.value });
    else S.draft.acts['a' + Date.now()] = { type, tid: Number(tSel.value), ...(facility ? { facility } : {}) };
    sendDraft(); render();
  };
}

// ---------- できごと（対応を選ぶ） ----------
function incidentSection(g) {
  const list = (g.incidents || []).filter(i => !i.resolved);
  const done = (g.incidents || []).filter(i => i.resolved && i.day === g.day - 1);
  if (!list.length && !done.length) return '';
  let h = `<div class="sec"><h3>できごと</h3>`;
  for (const inc of list) {
    const def = inc.choices.find(c => c.id === inc.def);
    h += `<div class="incident"><b>${esc(inc.title)}</b><div class="hint">${esc(inc.text)}</div>
      <div class="skills">${inc.choices.map(c => `<button class="small choice ${inc.choice === c.id ? 'primary' : ''}" data-inc="${inc.id}" data-choice="${c.id}"><b>${esc(c.label)}</b>${c.desc ? `<span>${esc(c.desc)}</span>` : ''}</button>`).join('')}</div>
      <div class="hint">${inc.choice ? `選んだ：${esc(inc.choices.find(c => c.id === inc.choice)?.label)}${inc.by && inc.by !== S.me?.role ? `（${CHARACTERS[inc.by].name}）` : ''}` : `選ばなければ「${esc(def?.label)}」`}。結果はその日の終わりに出ます。</div></div>`;
  }
  return h + `</div>`;
}

// ---------- 工房（王国：素材と装備づくり） ----------
const COST_NAME = { gold: 'お金', food: '食料', ...Object.fromEntries(Object.entries(MATERIALS).map(([k, v]) => [k, v.name])) };
const costText = (c) => Object.entries(c).map(([k, v]) => `${COST_NAME[k]}${v}`).join('・');
const canPayClient = (K, c) => Object.entries(c).every(([k, v]) => ((k in MATERIALS ? K.materials : K)[k] || 0) >= v);

// 手のあいている自分の兵の武将（その日の命令がまだないもの）
function freeSoldier(g) {
  return activeGens(g).find(x => canOrder(x) && x.kind === 'soldier' && S.draft.moves[x.id] === undefined && !S.draft.acts[x.id]);
}

function gearLine(g, hero) {
  const gear = g.gear?.[hero] || {};
  const w = gear.weapon ? `${recipeName(gear.weapon, hero)}（${CHARACTERS[hero].dmg === 'mag' ? '魔力' : '攻撃'}+${RECIPES[gear.weapon].power}）` : 'なし';
  const a = gear.armor ? `${RECIPES[gear.armor].name}（防御+${RECIPES[gear.armor].bonus.def}・魔防+${RECIPES[gear.armor].bonus.mdef}・HP+${RECIPES[gear.armor].bonus.hp}）` : 'なし';
  return `<div class="hint">武器：${esc(w)}<br>防具：${esc(a)}</div>`;
}

function workshopSection(g) {
  if (!S.me || mySide() !== 'kingdom' || g.phase !== 'day' || !S.draft) return '';
  const K = g.resources.kingdom;
  const hero = S.me.role;
  const free = freeSoldier(g);
  const btn = (type, extra, cost, disabled) => `<button class="small" data-craft="${type}" ${extra ? `data-recipe="${extra}"` : ''} ${!free || disabled || !canPayClient(K, cost) ? 'disabled' : ''}>作る</button>`;
  let h = `<div class="sec"><details ${S.openWorkshop ? 'open' : ''} id="workshopBox"><summary><b>工房（素材と装備）</b></summary>`;
  h += `<div class="mats">${Object.entries(MATERIALS).map(([k, m]) => `<span class="${m.rare ? 'rare' : ''}">${m.name} ${K.materials[k]}</span>`).join('')}</div>`;
  h += `<div class="hint">素材は特産のある陣地（鉱山・森・牧場・遺跡など）から毎日取れます。魔物の素材・幹部の素材は、合戦で魔族を倒すと手に入ります。</div>`;
  const orders = Object.entries(S.draft.acts).filter(([, a]) => KINGDOM_ACTIONS[a.type]?.workshop);
  if (orders.length) h += `<div class="aim">今日の注文：${orders.map(([gid, a]) => `<div class="row"><span>${a.type === 'craft' ? esc(recipeName(a.recipe, hero)) : KINGDOM_ACTIONS[a.type].name}（${esc(g.generals[gid]?.name || '')}）</span><span style="flex:1"></span><button class="small" data-rmact="${gid}">やめる</button></div>`).join('')}</div>`;
  h += free ? `<div class="hint">作るのは「${esc(free.name)}」に頼みます（その日は動きません）。</div>` : `<div class="hint" style="color:#c43f3f">手のあいている兵の武将がいません（兵の武将に、移動も内政もさせていないときに頼めます）。</div>`;
  h += `<h4>兵の装備（王国の兵全体）</h4>`;
  for (const [kind, label, cur] of [['gearWeapon', '武器', K.gearWeapon], ['gearArmor', '防具', K.gearArmor]]) {
    const cost = troopGearCost(kind === 'gearWeapon' ? 'weapon' : 'armor', cur);
    h += `<div class="row craft"><span>${label} Lv${cur}${cur < GEAR_MAX ? `→${cur + 1}` : '（最大）'}</span><span class="muted">${cur < GEAR_MAX ? costText(cost) : ''}</span>${btn(kind, null, cost, cur >= GEAR_MAX)}</div>`;
  }
  h += `<div class="hint">兵が強くなるほど、徴兵のお金も高くなります。</div>`;
  h += `<h4>${CHARACTERS[hero].name}の装備</h4>${gearLine(g, hero)}`;
  const gear = g.gear?.[hero] || {};
  for (const [id, r] of Object.entries(RECIPES)) {
    const cur = gear[r.slot] ? RECIPES[gear[r.slot]].tier : 0;
    if (r.tier <= cur) continue;
    const eff = r.slot === 'weapon' ? `${CHARACTERS[hero].dmg === 'mag' ? '魔力' : '攻撃'}+${r.power}` : `防御+${r.bonus.def}・魔防+${r.bonus.mdef}・HP+${r.bonus.hp}`;
    h += `<div class="row craft"><span>${esc(recipeName(id, hero))}<span class="muted">（${eff}）</span></span><span class="muted">${costText(r.cost)}</span>${btn('craft', id, r.cost)}</div>`;
  }
  return h + `</details></div>`;
}

function renderPanel(g) {
  let h = '';
  if (g.phase === 'lobby') {
    const ok = ROLES.some(r => g.players[r]);
    h += `<div class="sec"><h3>参加者を待っています</h3>
      ${ROLES.map(r => `<div>${CHARACTERS[r].title}${CHARACTERS[r].name}：${g.players[r] ? esc(g.players[r].name) : '<span class="muted">空き（AIが動かす）</span>'}</div>`).join('')}
      <p class="hint">だれもいない役はAIが動かします。始まったあとからでも、空いている役に参加できます。</p>
      <button class="primary big" id="btnStart" ${ok && S.me ? '' : 'disabled'}>ゲームを始める</button></div>`;
  } else if (g.phase === 'ended') {
    h += `<div class="sec"><h3>決着！ ${SIDE_NAME[g.winner]}の勝利</h3><button id="btnEnding" class="primary">エンディングを見る</button></div>`;
  }
  if (S.me && g.players[S.me.role]?.code && g.phase !== 'ended') {
    h += `<div class="hint code">あなたのあいことば：<b>${esc(g.players[S.me.role].code)}</b>（ほかのパソコンやURLが変わったときに、自分の役へ戻るのに使います）</div>`;
  }
  if (g.phase === 'day' && S.me) {
    const readyNow = g.ready[S.me.role];
    const waiting = ROLES.filter(r => g.players[r] && !g.ready[r]).map(r => CHARACTERS[r].name);
    h += `<div class="sec"><button class="${readyNow ? '' : 'primary'} big" id="btnReady">${readyNow ? '準備完了を取り消す' : '準備完了'}</button>
      <div class="hint">${waiting.length ? `まだ考え中：${waiting.join('、')}` : ''}　全員そろうと、その日の結果がまとめて反映されます。</div></div>`;
  }
  if (g.phase === 'day') h += incidentSection(g);
  if (g.phase !== 'lobby') {
    h += selGenSection(g);
    if (S.selTerr != null) h += terrInfo(g, S.selTerr);
    h += demonSection(g);
    h += workshopSection(g);
    const mineGens = activeGens(g).filter(canOrder);
    if (mineGens.length) h += `<div class="sec"><h3>自分の武将</h3>${mineGens.map(x => genRow(g, x)).join('')}</div>`;
    const down = Object.values(g.generals).filter(x => x.status === 'down');
    if (down.length) h += `<div class="sec"><h3>倒れている</h3>${down.map(x => `<div class="muted">${esc(x.name)}（${x.respawnDay}日目以降に復活）</div>`).join('')}</div>`;
    if (g.lastBattle) h += `<div class="sec hint">前の合戦：${TERRITORIES[g.lastBattle.territoryId].name}（${g.lastBattle.day}日目）→ ${SIDE_NAME[g.lastBattle.winner]}の勝ち・${esc(g.lastBattle.reason)}</div>`;
    h += `<div class="sec"><h3>できごと</h3><div class="log">${g.log.slice(-40).reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div></div>`;
  }
  const panel = $('#panel');
  const scroll = panel.scrollTop;
  panel.innerHTML = h;
  panel.scrollTop = scroll;
  if (S.me?.role === 'yagyu' && g.phase === 'day') fillDemonTarget(g);
}

$('#panel').addEventListener('toggle', (e) => {
  if (e.target.id === 'workshopBox') S.openWorkshop = e.target.open;
}, true);

$('#panel').addEventListener('click', async (e) => {
  const g = S.game;
  const b = e.target.closest('button, [data-selgen]');
  if (!b) return;
  if (b.dataset.selgen) { S.selGen = b.dataset.selgen; S.selTerr = g.generals[S.selGen].location; render(); return; }
  if (b.id === 'btnStart') return act({ type: 'start' });
  if (b.id === 'btnEnding') return showEnding(true);
  if (b.id === 'btnReady') {
    if (S.sendTimer) await flushDraft();
    return act({ type: 'ready', ready: !g.ready[S.me.role] });
  }
  if (b.dataset.build) {
    const gid = S.selGen;
    if (S.draft.acts[gid]?.facility === b.dataset.build) delete S.draft.acts[gid];
    else { S.draft.acts[gid] = { type: 'build', facility: b.dataset.build }; delete S.draft.moves[gid]; }
    sendDraft(); render(); return;
  }
  if (b.dataset.kact) {
    const gid = S.selGen;
    if (S.draft.acts[gid]?.type === b.dataset.kact) delete S.draft.acts[gid];
    else { S.draft.acts[gid] = { type: b.dataset.kact }; delete S.draft.moves[gid]; }
    sendDraft(); render(); return;
  }
  if (b.dataset.inc) return act({ type: 'incident', id: b.dataset.inc, choice: b.dataset.choice });
  if (b.dataset.craft) {
    const free = freeSoldier(g);
    if (!free) return;
    S.draft.acts[free.id] = b.dataset.craft === 'craft' ? { type: 'craft', recipe: b.dataset.recipe } : { type: b.dataset.craft };
    sendDraft(); render(); return;
  }
  if (b.dataset.rmact) { delete S.draft.acts[b.dataset.rmact]; sendDraft(); render(); return; }
  if (b.dataset.rmglobal) { S.draft.globals.splice(Number(b.dataset.rmglobal), 1); sendDraft(); render(); }
});

// ---------- 合戦 ----------
const CELL = 46;

function myActive(b) {
  const u = b.active && b.units.find(x => x.id === b.active.unitId);
  return u && S.me && u.controller === S.me.role && !b.result ? u : null;
}

// 技を選んで狙っているとき：S.aim = { skillId, picks: [] }
function aimInfo(b, mine) {
  if (!S.aim || !mine) return null;
  const s = skillList(b, mine).find(x => x.id === S.aim.skillId);
  if (!s || !s.ok) { S.aim = null; return null; }
  return { s, ...skillTargets(b, mine, s) };
}

const pct = (m) => `${m > 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
const STAT_NAME = { atk: '攻撃', def: '防御', mag: '魔力', mdef: '魔防', spd: '速さ', all: '全部' };

// 部隊にかかっている強化・弱体・状態
function statusList(b, u) {
  const out = [];
  const r = b.round;
  for (const e of u.effects || []) {
    if (r > e.until) continue;
    if (e.tag === 'pacified') out.push('とりなし中（攻撃できない）');
    else if (e.stat === 'move') out.push(`移動${e.add}`);
    else if (e.stat) out.push(`${STAT_NAME[e.stat]}${pct(e.mult)}${e.until < 900 ? `（${e.until}ターン目まで）` : ''}`);
  }
  if (u.poisonUntil >= r) out.push('毒');
  if (u.sleepUntil >= r) out.push('眠り');
  if (u.markUntil >= r) out.push('印（受けるダメージ+20%）');
  if (u.stunFrom != null && r <= u.stunUntil) out.push(r >= u.stunFrom ? '動けない' : `${u.stunFrom}ターン目から動けない`);
  if (u.charge) out.push(`溜め中：${skillOf(u.charId, u.charge.id)?.name}`);
  if (u.instantCharge) out.push('次の溜め技は溜めなし');
  if (u.cover) out.push(`愛情魂 攻撃+${u.cover * 5}%`);
  if (u.charId === 'noguchi') out.push(isTargetable(b, { side: 'x' }, u) ? '気づかれている' : '存在感がない（狙われない）');
  if (u.charId === 'yagyu' && u.revived) out.push('始祖の力（使用済み）');
  if (inDarkness(b, u)) out.push('暗闇（射程1マス）');
  return out;
}

// 戦場の地形の模様
const TILE_ID = { '.': 'plain', F: 'forest', R: 'river', C: 'cliff', H: 'hill', W: 'wall', S: 'stone' };
const TILE_DEFS = `<defs>
  <pattern id="tplain" width="46" height="46" patternUnits="userSpaceOnUse"><rect width="46" height="46" fill="#cfe0a4"/><path d="M8,30 l2,-6 M11,30 l1,-5 M30,14 l2,-6 M33,14 l1,-5 M34,38 l2,-5" stroke="#9cb874" stroke-width="1.4"/></pattern>
  <pattern id="tforest" width="46" height="46" patternUnits="userSpaceOnUse"><rect width="46" height="46" fill="#8fb46e"/><circle cx="14" cy="16" r="9" fill="#4f7d3c"/><circle cx="32" cy="28" r="10" fill="#5a8a45"/><circle cx="16" cy="36" r="6" fill="#4f7d3c"/><rect x="31" y="36" width="2.5" height="6" fill="#6b4f2a"/></pattern>
  <pattern id="triver" width="46" height="46" patternUnits="userSpaceOnUse"><rect width="46" height="46" fill="#86b6dc"/><path d="M4,14 q6,-5 12,0 t12,0 t12,0 M-2,32 q6,-5 12,0 t12,0 t12,0 t12,0" fill="none" stroke="#e8f3fb" stroke-width="2" opacity=".8"/></pattern>
  <pattern id="tcliff" width="46" height="46" patternUnits="userSpaceOnUse"><rect width="46" height="46" fill="#8d7a68"/><path d="M4,40 L16,10 L28,40 Z" fill="#6f5e4f"/><path d="M22,42 L34,18 L46,42 Z" fill="#7a6857"/><path d="M12,20 L16,10 L20,20" fill="#c9bcae"/></pattern>
  <pattern id="thill" width="46" height="46" patternUnits="userSpaceOnUse"><rect width="46" height="46" fill="#d8c48a"/><path d="M4,34 q19,-26 38,0" fill="none" stroke="#a88a4a" stroke-width="2"/><path d="M12,34 q11,-14 22,0" fill="none" stroke="#a88a4a" stroke-width="1.5"/></pattern>
  <pattern id="twall" width="46" height="46" patternUnits="userSpaceOnUse"><rect width="46" height="46" fill="#7d776f"/><path d="M0,11.5 H46 M0,23 H46 M0,34.5 H46 M15,0 V11.5 M31,11.5 V23 M15,23 V34.5 M31,34.5 V46" stroke="#5a554e" stroke-width="2"/></pattern>
  <pattern id="tstone" width="46" height="46" patternUnits="userSpaceOnUse"><rect width="46" height="46" fill="#ece3cc"/><path d="M0,23 H46 M23,0 V23 M11,23 V46 M34,23 V46" stroke="#cdbf9c" stroke-width="1.5"/><circle cx="34" cy="10" r="2" fill="#e0c97a" opacity=".7"/></pattern>
</defs>`;

function renderBattle(g) {
  const b = g.battle;
  const svg = $('#field');
  svg.setAttribute('viewBox', `0 0 ${BATTLE_W * CELL} ${BATTLE_H * CELL}`);
  const active = b.active && b.units.find(x => x.id === b.active.unitId);
  const mine = myActive(b);
  const aim = aimInfo(b, mine);
  const C = (x) => x * CELL + CELL / 2;
  let h = TILE_DEFS;
  for (let y = 0; y < BATTLE_H; y++) for (let x = 0; x < BATTLE_W; x++) {
    const tile = b.grid[y][x];
    h += `<rect x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}" fill="url(#t${TILE_ID[tile]})" stroke="rgba(60,40,10,.12)" data-cell="${x},${y}"/>`;
    if (tile === 'W') h += `<text x="${C(x)}" y="${y * CELL + 14}" text-anchor="middle" font-size="10" fill="#fff" stroke="#333" stroke-width="2" paint-order="stroke" pointer-events="none">${b.wallHp[x + ',' + y] ?? ''}</text>`;
  }
  for (const d of b.dark || []) if (b.round <= d.until) h += `<rect x="${d.x * CELL}" y="${d.y * CELL}" width="${CELL}" height="${CELL}" fill="rgba(20,10,30,.45)" pointer-events="none"/>`;
  for (const sd of b.seeds || []) h += `<text x="${C(sd.x)}" y="${C(sd.y) + 6}" text-anchor="middle" font-size="18" pointer-events="none">🌱</text>`;
  if ((b.rain || []).some(r => b.round <= r.until)) h += `<rect x="0" y="0" width="${BATTLE_W * CELL}" height="${BATTLE_H * CELL}" fill="rgba(80,130,220,.12)" pointer-events="none"/>`;

  // 動けるマス・攻撃できる相手・技で狙えるもの
  let targets = { units: [], walls: [] };
  if (mine && !aim) {
    if (!b.active.moved) for (const [x, y] of reachable(b, mine)) {
      h += `<rect x="${x * CELL + 2}" y="${y * CELL + 2}" width="${CELL - 4}" height="${CELL - 4}" fill="rgba(60,120,230,.28)" stroke="rgba(60,120,230,.7)" data-cell="${x},${y}" style="cursor:pointer"/>`;
    }
    if (!hasPacified(b, mine)) targets = targetsFrom(b, mine, mine.x, mine.y);
    for (const [x, y] of targets.walls) h += `<rect x="${x * CELL + 3}" y="${y * CELL + 3}" width="${CELL - 6}" height="${CELL - 6}" fill="none" stroke="#e04040" stroke-width="3" data-wall="${x},${y}" style="cursor:pointer"/>`;
  }
  if (aim) {
    for (const [x, y] of aim.cells) h += `<rect x="${x * CELL + 2}" y="${y * CELL + 2}" width="${CELL - 4}" height="${CELL - 4}" fill="rgba(217,154,30,.3)" stroke="#d99a1e" stroke-width="2" data-aimcell="${x},${y}" style="cursor:pointer"/>`;
    h += `<g id="areaPreview" pointer-events="none"></g>`;
  }
  if (mine && mine.charge) {
    const [dx, dy] = mine.charge.dir;
    h += `<line x1="${C(mine.x)}" y1="${C(mine.y)}" x2="${C(mine.x + dx * 2)}" y2="${C(mine.y + dy * 2)}" stroke="#c43f3f" stroke-width="4" pointer-events="none"/>`;
  }
  const aimIds = new Set(aim ? aim.units.map(u => u.id) : []);
  for (const u of b.units) {
    if (!u.alive) continue;
    const cx = C(u.x), cy = C(u.y);
    const isActive = active && active.id === u.id;
    const isTarget = targets.units.some(t => t.id === u.id);
    const big = u.kind !== 'troop';
    h += `<g data-unit="${u.id}" style="cursor:pointer">`;
    if (isActive) h += `<circle cx="${cx}" cy="${cy}" r="21" fill="none" stroke="#ffcf4a" stroke-width="4"><animate attributeName="r" values="19;22;19" dur="1.2s" repeatCount="indefinite"/></circle>`;
    if (isTarget) h += `<circle cx="${cx}" cy="${cy}" r="21" fill="rgba(224,64,64,.25)" stroke="#e04040" stroke-width="3"/>`;
    if (aimIds.has(u.id)) h += `<circle cx="${cx}" cy="${cy}" r="21" fill="rgba(217,154,30,.3)" stroke="#d99a1e" stroke-width="3" ${S.aim.picks.includes(u.id) ? 'stroke-dasharray="0"' : 'stroke-dasharray="4 3"'}/>`;
    h += big
      ? `<rect x="${cx - 16}" y="${cy - 16}" width="32" height="32" rx="7" fill="${SIDE_COLOR[u.side]}" stroke="${u.isCommander ? '#ffcf4a' : '#fff'}" stroke-width="${u.isCommander ? 3 : 1.5}" opacity="${u.charId === 'noguchi' && !isTargetable(b, { side: 'x' }, u) ? 0.55 : 1}"/>`
      : `<circle cx="${cx}" cy="${cy}" r="15" fill="${SIDE_COLOR[u.side]}" stroke="${u.isCommander ? '#ffcf4a' : '#fff'}" stroke-width="${u.isCommander ? 3 : 1.5}" opacity=".92"/>`;
    h += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="#fff" pointer-events="none">${u.label}</text>`;
    if (u.isCommander) h += `<text x="${cx - 17}" y="${cy - 10}" font-size="12" fill="#e3a500" pointer-events="none">★</text>`;
    const marks = [];
    if (u.sleepUntil >= b.round) marks.push('💤');
    if (u.poisonUntil >= b.round) marks.push('☠');
    if (u.charge) marks.push('⚡');
    if ((u.effects || []).some(e => b.round <= e.until && e.mult > 1)) marks.push('▲');
    if ((u.effects || []).some(e => b.round <= e.until && (e.mult < 1 || e.add < 0))) marks.push('▼');
    if (marks.length) h += `<text x="${cx + 18}" y="${cy - 9}" font-size="11" text-anchor="end" fill="#2b2a28" stroke="#fff" stroke-width="2.5" paint-order="stroke" pointer-events="none">${marks.join('')}</text>`;
    h += `<rect x="${cx - 17}" y="${cy + 17}" width="34" height="4" fill="#00000040"/><rect x="${cx - 17}" y="${cy + 17}" width="${34 * Math.max(0, u.hp) / u.max}" height="4" fill="${u.hp / u.max > 0.5 ? '#3c9a5f' : u.hp / u.max > 0.25 ? '#d99a1e' : '#c43f3f'}"/>`;
    h += `</g>`;
  }
  // 今の行動で入ったダメージ
  const hitTotal = {};
  for (const hit of b.hits || []) hitTotal[hit.to] = (hitTotal[hit.to] || 0) + hit.dmg;
  for (const [id, dmg] of Object.entries(hitTotal)) {
    const u = b.units.find(x => x.id === id);
    if (u) h += `<text x="${C(u.x)}" y="${C(u.y) - 20}" text-anchor="middle" font-size="14" font-weight="bold" fill="#c43f3f" stroke="#fff" stroke-width="3" paint-order="stroke" pointer-events="none">-${dmg}</text>`;
  }
  svg.innerHTML = h;
  renderBattlePanel(g, b, active, mine, targets, aim);
}

function hasPacified(b, u) {
  return (u.effects || []).some(e => e.tag === 'pacified' && b.round <= e.until);
}

function unitCard(b, u, attacker) {
  const terr = TERRAIN[b.grid[u.y][u.x]].name;
  const pred = attacker && attacker.side !== u.side && isTargetable(b, attacker, u) ? damage(b, attacker, u) : null;
  const st = (k) => {
    const v = Math.round(getStat(b, u, k));
    return v === u[k] ? `${v}` : `<b style="color:${v > u[k] ? '#3c9a5f' : '#c43f3f'}">${v}</b>`;
  };
  const sl = statusList(b, u);
  return `<div class="unitInfo"><b style="color:${SIDE_COLOR[u.side]}">${esc(u.name)}</b>${u.level ? ` Lv${u.level}` : ''}${u.isCommander ? ' ★大将' : ''}
    <div class="bar" style="margin:4px 0"><i style="width:${Math.max(0, u.hp) / u.max * 100}%"></i></div>
    <div class="stats"><span class="l">${u.solo || u.isLeaderUnit ? 'HP' : '兵'}</span><span>${u.hp}/${u.max}</span>
    ${u.maxMp ? `<span class="l">MP</span><span>${u.mp}/${u.maxMp}</span>` : `<span class="l">地形</span><span>${terr}</span>`}
    <span class="l">攻撃</span><span>${st('atk')}</span><span class="l">防御</span><span>${st('def')}</span>
    <span class="l">魔力</span><span>${st('mag')}</span><span class="l">魔防</span><span>${st('mdef')}</span>
    <span class="l">速さ</span><span>${st('spd')}</span><span class="l">移動</span><span>${getMove(b, u)}</span></div>
    ${u.maxMp ? `<div class="hint">地形：${terr}</div>` : ''}
    ${sl.length ? `<div class="hint" style="color:#6b4a9a">${sl.map(esc).join('・')}</div>` : ''}
    ${pred != null ? `<div style="margin-top:4px">予想ダメージ：<b>${pred}</b></div>` : ''}</div>`;
}

function skillButtons(b, mine) {
  const list = skillList(b, mine);
  if (!list.length) return '';
  return `<div class="hint" style="margin-top:8px">技</div><div class="skills">` + list.map(s =>
    `<button class="small skill ${S.aim?.skillId === s.id ? 'primary' : ''}" data-skill="${s.id}" ${s.ok ? '' : 'disabled'} title="${esc(s.desc)}${s.why ? '（' + esc(s.why) + '）' : ''}">
      ${esc(s.name)}<span class="mp">MP${s.mp}${s.once ? '・1回' : ''}${s.why ? '・' + esc(s.why) : ''}</span></button>`).join('') + `</div>`;
}

function aimHint(aim) {
  const s = aim.s;
  const t = {
    enemy: 'オレンジの敵をクリック', ally: 'オレンジの味方をクリック', tile: 'オレンジのマスをクリック（範囲が出ます）',
    dir: '撃つ向き（となりのオレンジのマス）をクリック', enemy2: `敵を2つまでクリック（今${S.aim.picks.length}つ）`, ally2: `入れ替える味方を2つクリック（今${S.aim.picks.length}つ）`,
  }[s.target];
  const none = s.target !== 'self' && !aim.units.length && !aim.cells.length;
  return `<div class="aim"><b>${esc(s.name)}</b>：${esc(s.desc)}<div class="hint">${none ? '<span style="color:#c43f3f">今の位置からは届く相手がいません。「やめる」で戻って、移動してから使ってください。</span>' : (t || '')}</div>
    <div class="acts">${s.target === 'self' ? '<button class="primary" id="aimGo">使う</button>' : ''}
    ${s.target === 'enemy2' && S.aim.picks.length ? '<button class="primary" id="aimGo">これで使う</button>' : ''}
    <button id="aimCancel">やめる</button></div></div>`;
}

function renderBattlePanel(g, b, active, mine, targets, aim) {
  const T = TERRITORIES[b.territoryId];
  let h = b.kind === 'pursuit'
    ? `<div class="sec"><h3>${T.name}の追撃戦　${b.round}/${b.maxRounds}ターン</h3>
      <div class="hint"><span class="${b.attackerSide[0]}">${SIDE_NAME[b.attackerSide]}</span>が追う。★の逃げる大将を倒せば討ち取り（その武将は倒れる）。<span class="${b.defenderSide[0]}">${SIDE_NAME[b.defenderSide]}</span>は${b.maxRounds}ターン耐えれば逃げ切り。</div></div>`
    : `<div class="sec"><h3>${T.name}の合戦　${b.round}ターン目</h3>
      <div class="hint">攻め：<span class="${b.attackerSide[0]}">${SIDE_NAME[b.attackerSide]}</span>　守り：<span class="${b.defenderSide[0]}">${SIDE_NAME[b.defenderSide]}</span>　★の大将を倒せば勝ち（${MAX_ROUNDS}ターンで守り側の勝ち）</div></div>`;
  if (b.support) {
    const sp = b.support;
    const NAMES = { heal: '回復薬', boost: '強化薬', magic: '女王の魔法', reinforce: '兵の増援' };
    h += `<div class="sec queen"><b>👑 のぞちちの援護</b>　${sp.left > 0 ? `あと${sp.left}回（次は${sp.next}ターン目）` : 'もう来ない'}
      ${sp.history.length ? `<div class="hint">${sp.history.map(x => `${x.round}ターン目：${NAMES[x.kind]}`).join('　')}</div>` : ''}</div>`;
  }
  if (b.stage === 'commander') {
    h += commanderPanel(g, b);
  } else if (b.result) {
    h += `<div class="result">${SIDE_NAME[b.result.winner]}の勝ち！（${esc(b.result.reason)}）</div>`;
    if (b.pursuitResult) h += `<div class="hint">追撃戦：${b.pursuitResult.winner === b.result.winner ? '討ち取った' : '逃げ切られた'}（${esc(b.pursuitResult.reason)}）</div>`;
    if (b.stage === 'rearguard') h += rearguardPanel(b);
    else if (b.stage === 'pursue') h += pursuePanel(b);
    else h += `<button class="primary big" id="btnConclude">地図に戻る</button>`;
  } else if (active) {
    h += `<div class="sec"><h3>${mine ? 'あなたの番' + (b.active.extra ? '（もう一度行動）' : '') : `${active.controller === 'ai' ? 'AI' : CHARACTERS[active.controller]?.name || ''}の番`}</h3>${unitCard(b, active)}`;
    if (mine) {
      if (aim) h += aimHint(aim);
      else {
        h += `<div class="hint">${b.active.moved ? '攻撃・技を選ぶか、待機。' : '青いマスで移動。赤い相手をクリックで攻撃。技はボタンから。'}</div>`;
        if (targets.units.length) h += `<div class="acts">${targets.units.map(t => `<button class="small" data-atk="${t.id}">${esc(t.name)}に攻撃（${damage(b, mine, t)}）</button>`).join('')}</div>`;
        h += skillButtons(b, mine);
        h += `<div class="acts" style="margin-top:8px">${b.active.moved ? '<button id="bUndo">移動を戻す</button>' : ''}<button id="bWait">待機</button></div>`;
      }
    }
    h += '</div>';
  }
  const sel = S.selUnit && b.units.find(u => u.id === S.selUnit && u.alive);
  if (sel && sel !== active) {
    h += `<div class="sec"><h3>えらんだ部隊</h3>${unitCard(b, sel, mine)}`;
    if (sel.charId) h += skillBook(sel.charId, sel.level);
    h += '</div>';
  }
  if (b.order.length) {
    const upcoming = b.order.slice(b.idx).map(id => b.units.find(u => u.id === id)).filter(u => u && u.alive).slice(0, 16);
    h += `<div class="sec"><h3>行動の順番（速い順）</h3><div class="turnList">${upcoming.map(u => `<span style="background:${SIDE_COLOR[u.side]}">${u.label}${Math.round(getStat(b, u, 'spd'))}</span>`).join('')}</div></div>`;
  }
  h += `<div class="sec"><h3>戦いの記録</h3><div class="log">${b.log.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div></div>`;
  $('#battlePanel').innerHTML = h;
}

// 大将を選ぶ（戦う前）
function commanderPanel(g, b) {
  const mySide = Object.keys(b.pending).find(k => S.me && b.pending[k].includes(S.me.role));
  const waiting = Object.values(b.pending).flat().map(r => CHARACTERS[r].name).join('、');
  if (!mySide) return `<div class="sec"><h3>大将を選んでいます</h3><div class="hint">${esc(waiting)}が大将を選ぶのを待っています。</div></div>`;
  const cur = b.units.find(u => u.role === mySide && u.isCommander);
  const gens = b.generals[mySide].map(id => g.generals[id]).filter(Boolean);
  return `<div class="sec"><h3>大将を選ぶ</h3>
    <div class="hint">大将が倒されたら負け。今の大将：<b>${esc(cur?.name || '-')}</b>（金色の★）</div>
    <div class="skills">${gens.map(gen => `<button class="small skill" data-cmd="${gen.id}">${esc(gen.name)}${gen.charId ? ` Lv${g.chars[gen.charId].level}` : ''}<span class="mp">${cur?.genId === gen.id ? '今の大将' : '大将にする'}</span></button>`).join('')}</div>
    <div class="acts" style="margin-top:8px"><button class="primary" data-cmd="">このまま始める</button></div></div>`;
}

// 退却：しんがりを残す
function rearguardPanel(b) {
  if (!S.me || !b.pendingRoles.includes(S.me.role)) {
    return `<div class="sec"><h3>退却中</h3><div class="hint">${b.pendingRoles.map(r => CHARACTERS[r].name).join('、')}が、しんがりを選んでいます。</div></div>`;
  }
  const mine = b.units.filter(u => u.alive && u.controller === S.me.role && u.kind === 'troop' && u.side !== b.result.winner);
  return `<div class="sec"><h3>退却する：しんがりを残す？</h3>
    <div class="hint">しんがりに残した部隊は、追撃してくる敵の前に立ちはだかります（追撃戦でやられると兵を失う）。残さなくてもかまいません。</div>
    ${mine.map(u => `<label class="row"><input type="checkbox" data-rear="${u.id}" ${S.rearPicks?.has(u.id) ? 'checked' : ''}> ${esc(u.name)}（兵${u.hp}）</label>`).join('')}
    <div class="acts" style="margin-top:8px"><button class="primary" id="btnRetreat">退却する</button></div></div>`;
}

// 勝った側：追撃するか
function pursuePanel(b) {
  const i = b.pursueInfo || {};
  const info = `<div class="hint">速さ比べ：追う側 ${i.pursueSpd} ／ 逃げる側（${esc(i.leaderName || '-')}）${i.fleeSpd} → ${i.catchUp ? '<b style="color:#3c9a5f">追いつける</b>' : '<b style="color:#c43f3f">追いつけない</b>'}
    ${i.kkb ? '<br>KKBの猛追：速さ比べに必ず勝つ' : ''}${i.slipped?.length ? `<br>野口の隊は気づかれずに逃げる（くちかわき）` : ''}${i.rearIds?.length ? `<br>しんがりが${i.rearIds.length}部隊残っている` : ''}</div>`;
  if (!S.me || !b.pendingRoles.includes(S.me.role)) return `<div class="sec"><h3>追撃するか考えています</h3>${info}</div>`;
  return `<div class="sec"><h3>追撃する？</h3>${info}
    <div class="hint">追いつけたら追撃戦（${3}ターン）。逃げる大将を倒せば、その武将は倒れます。</div>
    <div class="acts"><button class="primary" data-pursue="1">追撃する</button><button data-pursue="0">追撃しない</button></div></div>`;
}

// キャラの技の一覧（覚えているものと、まだのもの）
function skillBook(charId, level) {
  const KIND = { personal: '個人', passive: 'パッシブ', active: '技', charge: '溜め技' };
  return `<div class="book">` + (SKILLS[charId] || []).map(s => {
    const got = (level || 1) >= s.lv;
    return `<div class="${got ? '' : 'muted'}"><b>${esc(s.name)}</b> <span class="tag">${KIND[s.kind]}${s.kind === 'personal' ? '' : ` Lv${s.lv}`}${s.mp ? `・MP${s.mp}` : ''}${s.once ? '・1合戦1回' : ''}</span><div class="desc">${esc(s.desc)}</div></div>`;
  }).join('') + `</div>`;
}

function sendSkill(extra) {
  const id = S.aim.skillId;
  S.aim = null;
  return act({ type: 'battle', action: { type: 'skill', skillId: id, ...extra } });
}

// 選んでいる途中のしんがりは、画面が更新されても消えないように覚えておく
$('#battlePanel').addEventListener('change', (e) => {
  if (!e.target.dataset.rear) return;
  S.rearPicks ||= new Set();
  if (e.target.checked) S.rearPicks.add(e.target.dataset.rear); else S.rearPicks.delete(e.target.dataset.rear);
});

$('#battlePanel').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'btnConclude') return act({ type: 'battle', action: { type: 'conclude' } });
  if (b.dataset.cmd !== undefined) return act({ type: 'battle', action: { type: 'commander', genId: b.dataset.cmd || null } });
  if (b.id === 'btnRetreat') {
    const unitIds = [...document.querySelectorAll('[data-rear]:checked')].map(x => x.dataset.rear);
    S.rearPicks = null;
    return act({ type: 'battle', action: { type: 'rearguard', unitIds } });
  }
  if (b.dataset.pursue !== undefined) return act({ type: 'battle', action: { type: 'pursue', yes: b.dataset.pursue === '1' } });
  if (b.id === 'bWait') return act({ type: 'battle', action: { type: 'wait' } });
  if (b.id === 'bUndo') return act({ type: 'battle', action: { type: 'undo' } });
  if (b.id === 'aimCancel') { S.aim = null; return render(); }
  if (b.id === 'aimGo') return sendSkill(S.aim.picks.length ? { targetIds: S.aim.picks } : {});
  if (b.dataset.skill) { S.aim = { skillId: b.dataset.skill, picks: [] }; return render(); }
  if (b.dataset.atk) return act({ type: 'battle', action: { type: 'attack', targetId: b.dataset.atk } });
});

$('#field').addEventListener('click', (e) => {
  const b = S.game?.battle;
  if (!b) return;
  const mine = myActive(b);
  const aim = aimInfo(b, mine);
  const uEl = e.target.closest('[data-unit]');
  const cEl = e.target.closest('[data-aimcell]') || e.target.closest('[data-cell]');
  if (aim) {
    const s = aim.s;
    if (uEl && aim.units.some(u => u.id === uEl.dataset.unit)) {
      const id = uEl.dataset.unit;
      if (s.target === 'enemy' || s.target === 'ally') return sendSkill({ targetId: id });
      const picks = S.aim.picks;
      if (picks.includes(id)) picks.splice(picks.indexOf(id), 1); else picks.push(id);
      if (picks.length >= 2) return sendSkill({ targetIds: picks.slice(0, 2) });
      return render();
    }
    // マスを狙う技（ユニットの上でもマスとして扱う）
    let xy = null;
    if (cEl) xy = (cEl.dataset.aimcell || cEl.dataset.cell).split(',').map(Number);
    else if (uEl) { const u = b.units.find(x => x.id === uEl.dataset.unit); xy = [u.x, u.y]; }
    if (xy && aim.cells.some(([x, y]) => x === xy[0] && y === xy[1])) return sendSkill({ x: xy[0], y: xy[1] });
    return;
  }
  if (uEl) {
    const u = b.units.find(x => x.id === uEl.dataset.unit);
    if (mine && u.side !== mine.side && !hasPacified(b, mine) && targetsFrom(b, mine, mine.x, mine.y).units.some(t => t.id === u.id)) {
      return act({ type: 'battle', action: { type: 'attack', targetId: u.id } });
    }
    S.selUnit = u.id; render(); return;
  }
  const wEl = e.target.closest('[data-wall]');
  if (wEl && mine) { const [x, y] = wEl.dataset.wall.split(',').map(Number); return act({ type: 'battle', action: { type: 'attackWall', x, y } }); }
  if (cEl && mine && !b.active.moved) {
    const [x, y] = cEl.dataset.cell.split(',').map(Number);
    if (reachable(b, mine).some(([a, c]) => a === x && c === y)) act({ type: 'battle', action: { type: 'move', x, y } });
  }
});

// 範囲の技で狙うとき、マウスの下に範囲を出す
$('#field').addEventListener('mousemove', (e) => {
  const prev = $('#areaPreview');
  if (!prev || !S.aim) return;
  const b = S.game.battle;
  const mine = myActive(b);
  const aim = aimInfo(b, mine);
  if (!aim) return;
  const cEl = e.target.closest('[data-aimcell], [data-cell]');
  const uEl = e.target.closest('[data-unit]');
  let xy = null;
  if (cEl) xy = (cEl.dataset.aimcell || cEl.dataset.cell).split(',').map(Number);
  else if (uEl) { const u = b.units.find(x => x.id === uEl.dataset.unit); xy = [u.x, u.y]; }
  if (!xy || !aim.cells.some(([x, y]) => x === xy[0] && y === xy[1])) { prev.innerHTML = ''; return; }
  let tiles;
  const s = aim.s;
  if (s.target === 'dir') {
    const dx = xy[0] - mine.x, dy = xy[1] - mine.y;
    const n = s.id === 'shogeki' ? 3 : 4;
    tiles = Array.from({ length: n }, (_, i) => [mine.x + dx * (i + 1), mine.y + dy * (i + 1)]);
  } else tiles = areaTiles(s.area || (s.id === 'tane' ? '3x3' : null), xy[0], xy[1]);
  prev.innerHTML = tiles.map(([x, y]) => `<rect x="${x * CELL + 1}" y="${y * CELL + 1}" width="${CELL - 2}" height="${CELL - 2}" fill="rgba(224,64,64,.35)"/>`).join('');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.aim) { S.aim = null; render(); }
});

// ---------- イベント ----------
const seenKey = () => 'yagyu:seen:' + S.gameId;

function maybeShowEvents() {
  const g = S.game;
  if (S.modalOpen || !g) return;
  const seen = store.get(seenKey()) || 0;
  if (g.eventLog.length > seen) {
    const ev = g.eventLog[seen];
    showStory(ev.title, `${ev.day}日目`, ev.lines, () => { store.set(seenKey(), seen + 1); maybeShowEvents(); });
    return;
  }
  if (g.phase === 'ended') showEnding(false);
}

function showEnding(force) {
  const g = S.game;
  const key = 'yagyu:ending:' + S.gameId;
  if (!force && store.get(key)) return;
  showStory(g.ending.title, `${g.day}日目`, g.ending.lines, () => store.set(key, true));
}

function showStory(title, when, lines, onClose) {
  S.modalOpen = true;
  let shown = 1;
  const box = $('#modalBox');
  const draw = () => {
    box.innerHTML = `<h2>${esc(title)}</h2><div class="when">${esc(when)}</div>` +
      lines.slice(0, shown).map(l => l.who ? `<div class="line"><span class="who">${esc(l.who)}</span>「${esc(l.text)}」</div>` : `<div class="line narr">${esc(l.text)}</div>`).join('') +
      `<div class="foot">${shown < lines.length ? '<button id="mAll" class="ghost">全部表示</button><button id="mNext" class="primary">次へ</button>' : '<button id="mClose" class="primary">閉じる</button>'}</div>`;
    box.scrollTop = box.scrollHeight;
  };
  box.onclick = (e) => {
    const id = e.target.id;
    if (id === 'mNext') { shown++; draw(); }
    else if (id === 'mAll') { shown = lines.length; draw(); }
    else if (id === 'mClose') { $('#modal').classList.add('hidden'); S.modalOpen = false; onClose && onClose(); }
  };
  draw();
  $('#modal').classList.remove('hidden');
}

// 遊び方
const HOWTO = [
  ['どんなゲーム？', '王国と魔族の戦争ゲーム。1日ずつ進み、地図の上で武将を動かして陣地を取りあう。敵とぶつかると合戦になる。'],
  ['勝ち方', '王国：魔王ヤギューを倒して、陣地の大半（18個）を取る。<br>魔族：勇者3人を全員倒して陣地の大半を取る。または、王都の女王のぞちちを倒す（すぐ勝ち）。'],
  ['ふだんの1日', '① 自分の武将（金色のふちのコマ）をクリック → 光っているとなりの陣地をクリックで移動。<br>② 右の「できごと」があれば対応を選ぶ。<br>③ 内政（勇者は兵の武将に、ヤギューは右の「魔族の内政」で）を決める。<br>④ 「準備完了」を押すと、その日の結果がまとめて出る。'],
  ['合戦', '速い部隊から順番に動く。自分の番は「移動（青いマス）＋攻撃か技を1回」。★の大将を倒せば勝ち。30ターンたつと守る側の勝ち。<br>三すくみ：槍兵・オーク → 騎兵・山羊騎兵 → 弓兵・ハーピー → 槍兵・オーク（矢印の先に強い）。<br>地形：森は守りが上がる、川は遅くて守りが下がる、高台から攻撃すると強い、崖は魔族だけ通れる。'],
  ['合戦のあと', '負けた側は退却する。しんがりを残すと、追ってくる敵を足止めできる。勝った側は追撃するか選べる。速さ比べで勝てば3ターンの追撃戦になり、逃げる大将を倒せばその武将は倒れる。'],
  ['戦争にはお金と食料がいる', '兵は毎日食料を食べる。食料が尽きると兵が逃げる。王都（魔王城）から自分の陣地だけでつながっていない所は補給が届かず、兵が減っていく。'],
  ['戦争は民の暮らしを壊す', '合戦があった陣地は、民が減って畑が荒れ、しばらく収穫が半分になる。勝っても負けても同じ。'],
  ['強くなるには', '勇者：合戦で経験を積んでレベルが上がる。工房で素材から装備を作る。特産のある陣地を取ると素材が手に入る。<br>魔族：魔力でレベルを上げる。恐怖から魔力が生まれる（恐怖が下がりすぎると反乱）。'],
  ['技', '合戦で自分のキャラの番に、右のボタンから使う。レベル5ごとに増える。地図でキャラを選ぶと「技・スキル」で一覧が見られる。'],
  ['歴史イベント', '何日目かになって条件がそろうと、物語が進む。条件がそろわないと起きないイベントもある。上の「イベント」でもう一度読める。'],
];
function showHowto() {
  S.modalOpen = true;
  const box = $('#modalBox');
  box.innerHTML = `<h2>遊び方</h2>` + HOWTO.map(([t, d]) => `<h4>${t}</h4><div class="line">${d}</div>`).join('') +
    `<div class="foot"><button id="mClose" class="primary">閉じる</button></div>`;
  box.onclick = (e) => { if (e.target.id === 'mClose') { $('#modal').classList.add('hidden'); S.modalOpen = false; if (S.game) maybeShowEvents(); } };
  $('#modal').classList.remove('hidden');
}

function showEventHistory() {
  const g = S.game;
  S.modalOpen = true;
  const box = $('#modalBox');
  box.innerHTML = `<h2>これまでのイベント</h2>` + (g.eventLog.length ? g.eventLog.map((e, i) => `<div class="row" style="margin:6px 0"><span class="muted">${e.day}日目</span><button class="small" data-ev="${i}">${esc(e.title)}</button></div>`).join('') : '<p class="muted">まだありません</p>') +
    `<div class="foot"><button id="mClose" class="primary">閉じる</button></div>`;
  box.onclick = (e) => {
    if (e.target.dataset.ev) {
      const ev = g.eventLog[Number(e.target.dataset.ev)];
      showStory(ev.title, `${ev.day}日目`, ev.lines, () => maybeShowEvents());
    } else if (e.target.id === 'mClose') { $('#modal').classList.add('hidden'); S.modalOpen = false; maybeShowEvents(); }
  };
  $('#modal').classList.remove('hidden');
}

// ---------- はじまり ----------
const m = location.hash.match(/g=([0-9a-f]+)/);
if (m) openGame(m[1], !store.get('yagyu:seat:' + m[1]));
else showLobby();
