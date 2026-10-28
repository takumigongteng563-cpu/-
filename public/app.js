// ブラウザ側：ロビー・地図・合戦・イベントの画面
import {
  TERRITORIES, EDGES, SIZES, SPECIALTIES, CHARACTERS, UNIT_TYPES, ROLES, HERO_ROLES, REQUIRED_ROLES,
  BATTLE_W, BATTLE_H, TERRAIN, MAJORITY, KINGDOM_ACTIONS, DEMON_ACTIONS, neighbors, charStats,
} from '/shared/data.js';
import { reachable, targetsFrom, damage } from '/shared/battlecore.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SIDE_NAME = { kingdom: '王国', demon: '魔族', neutral: '中立' };
const SIDE_COLOR = { kingdom: '#3f6fc4', demon: '#8a3fa8', neutral: '#9a958b' };
const SIDE_SOFT = { kingdom: '#dbe6fa', demon: '#efdcf5', neutral: '#ebe8e1' };
const ROLE_SIDE = { yagyu: 'demon', sumire: 'kingdom', noguchi: 'kingdom', nanase: 'kingdom' };
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

async function refreshList() {
  const list = await api('/api/games');
  const box = $('#gameList');
  if (!list.length) { box.innerHTML = '<p class="muted">まだゲームがありません。</p>'; return; }
  box.innerHTML = list.map(g => {
    const mine = store.get('yagyu:seat:' + g.id);
    const phase = g.phase === 'lobby' ? '参加者を募集中' : g.phase === 'ended' ? '決着' : `${g.day}日目`;
    const roles = ROLES.map(r => {
      const taken = g.players[r];
      const canJoin = !taken && (g.phase === 'lobby' || r === 'noguchi' || r === 'nanase');
      const need = REQUIRED_ROLES.includes(r) ? '（必須）' : '';
      return `<button class="roleBtn ${taken ? 'taken' : ''}" data-join="${g.id}" data-role="${r}" ${canJoin ? '' : 'disabled'}>
        ${CHARACTERS[r].title}${CHARACTERS[r].name}${need}：${taken ? esc(taken) : '空き'}</button>`;
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
$('#createGame').onclick = async () => {
  const { id } = await api('/api/games', { name: $('#newGameName').value });
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
    if (!p) return HERO_ROLES.includes(r) ? `<span class="chip">${CHARACTERS[r].name}:AI</span>` : '';
    const ready = g.phase === 'day' && g.ready[r];
    return `<span class="chip ${ready ? 'ready' : ''}" title="${esc(p.name)}">${CHARACTERS[r].name}${S.me?.role === r ? '（あなた）' : ''}${ready ? ' ✓' : ''}</span>`;
  }).join('');
  const dayText = g.phase === 'lobby' ? '準備中' : g.phase === 'ended' ? `決着（${g.day}日目）` : `${g.day}日目${g.phase === 'battle' ? '・合戦中' : ''}`;
  $('#topbar').innerHTML = `
    <span class="day">${dayText}</span>
    <span>陣地 <b class="k">王国${owned(g, 'kingdom')}</b> / <b class="d">魔族${owned(g, 'demon')}</b> / 中立${owned(g, 'neutral')}（大半=${MAJORITY}）</span>
    <span class="res">${res}</span>
    <span class="spacer"></span>${chips}
    <button id="btnEvents" class="small">イベント</button>
    <button id="btnLobby" class="small">ロビーへ</button>`;
  $('#btnLobby').onclick = () => { location.hash = ''; showLobby(); };
  $('#btnEvents').onclick = showEventHistory;
}

// ---------- 地図 ----------
const R_SIZE = { village: 15, town: 19, fortress: 23, metropolis: 28, capital: 28, castle: 28 };
const SIZE_MARK = { village: '村', town: '町', fortress: '城', metropolis: '都', capital: '王', castle: '魔' };

function genLabel(gen) {
  if (gen.charId) return CHARACTERS[gen.charId].label;
  return { soldier: '兵', majo: '将', garrison: '守' }[gen.kind] || '?';
}

function activeGens(g) { return Object.values(g.generals).filter(x => x.status === 'active' && !x.temp); }

function renderMap(g) {
  const svg = $('#map');
  const T = TERRITORIES;
  const sel = S.selGen && g.generals[S.selGen];
  const moveTargets = sel && canOrder(sel) && sel.kind !== 'queen' ? neighbors(sel.location, sel.side) : [];
  let h = '';
  h += `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#d99a1e"/></marker></defs>`;
  for (const e of EDGES) {
    const a = T[e.a], b = T[e.b];
    if (e.cliff) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + (a.y < 330 ? -45 : 40);
      h += `<path d="M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}" fill="none" stroke="#8b5a2b" stroke-width="2.5" stroke-dasharray="6 5" opacity=".8"/>`;
    } else h += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#b5aa93" stroke-width="3"/>`;
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
      h += `<line x1="${a.x + dx / L * r1}" y1="${a.y + dy / L * r1}" x2="${b.x - dx / L * r2}" y2="${b.y - dy / L * r2}" stroke="#d99a1e" stroke-width="4" marker-end="url(#arrow)" opacity=".9"/>`;
    }
  }
  for (const t of T) {
    const st = g.territories[t.id];
    const r = R_SIZE[t.size];
    const isSel = S.selTerr === t.id;
    const target = moveTargets.includes(t.id);
    h += `<g class="terr" data-terr="${t.id}">`;
    if (target) h += `<circle cx="${t.x}" cy="${t.y}" r="${r + 7}" fill="none" stroke="#d99a1e" stroke-width="3" stroke-dasharray="4 3"/>`;
    h += `<circle cx="${t.x}" cy="${t.y}" r="${r}" fill="${SIDE_SOFT[st.owner]}" stroke="${SIDE_COLOR[st.owner]}" stroke-width="${isSel ? 5 : 3}"/>`;
    h += `<text x="${t.x}" y="${t.y + 5}" text-anchor="middle" font-size="${r > 20 ? 15 : 13}" font-weight="bold" fill="${SIDE_COLOR[st.owner]}">${SIZE_MARK[t.size]}</text>`;
    h += `<text x="${t.x}" y="${t.y + r + 14}" text-anchor="middle" font-size="12" fill="#3a352d">${t.name}</text>`;
    h += `<text x="${t.x}" y="${t.y + r + 27}" text-anchor="middle" font-size="10" fill="#7a725f">兵${st.garrison}${t.specialty ? '・' + SPECIALTIES[t.specialty].name : ''}</text>`;
    if (st.damaged > 0) h += `<text x="${t.x - r - 2}" y="${t.y - r + 4}" font-size="12" fill="#c43f3f" font-weight="bold">荒${st.damaged}</text>`;
    h += `</g>`;
  }
  // 武将のコマ
  const byLoc = {};
  for (const gen of activeGens(g)) (byLoc[gen.location] ||= []).push(gen);
  for (const [loc, gens] of Object.entries(byLoc)) {
    const t = T[loc];
    const r = R_SIZE[t.size];
    gens.forEach((gen, i) => {
      const x = t.x + r - 4 + (i % 4) * 19, y = t.y - r - 10 + Math.floor(i / 4) * 19;
      const mine = canOrder(gen);
      const isSel = S.selGen === gen.id;
      h += `<g class="gen" data-gen="${gen.id}">
        <rect x="${x - 9}" y="${y - 9}" width="18" height="18" rx="4" fill="${SIDE_COLOR[gen.side]}" stroke="${isSel ? '#ffcf4a' : mine ? '#f5d58a' : '#fff'}" stroke-width="${isSel ? 3 : mine ? 2 : 1}"/>
        <text x="${x}" y="${y + 4.5}" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff" pointer-events="none">${genLabel(gen)}</text></g>`;
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
  if (sel && canOrder(sel) && g.phase === 'day' && sel.kind !== 'queen' && neighbors(sel.location, sel.side).includes(tid)) {
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
    ${st.damaged ? `<div class="hint" style="color:#c43f3f">戦で荒れている：あと${st.damaged}日は収穫が半分</div>` : ''}
    ${here.length ? `<div style="margin-top:6px">${here.map(x => genRow(g, x)).join('')}</div>` : ''}
  </div>`;
}

function genHp(g, gen) {
  const lead = gen.charId ? `${gen.hp}/${charStats(gen.charId, g.chars[gen.charId].level).hp}` : '';
  const troops = gen.troops.map(t => `${UNIT_TYPES[t.type].label}${t.hp}`).join(' ');
  return [lead && (gen.charId === 'yagyu' ? 'HP' : '本隊') + lead, troops].filter(Boolean).join('　');
}

function orderText(g, gen) {
  if (!S.draft || !canOrder(gen)) return '';
  const m = S.draft.moves[gen.id];
  if (m !== undefined) return '→' + TERRITORIES[m].name;
  const a = S.draft.acts[gen.id];
  if (a) return KINGDOM_ACTIONS[a.type].name;
  return '';
}

function genRow(g, gen) {
  const lv = gen.charId ? ` Lv${g.chars[gen.charId].level}` : '';
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
    const st = charStats(gen.charId, g.chars[gen.charId].level);
    h += `<div class="stats">
      <span class="l">Lv</span><span>${g.chars[gen.charId].level}</span><span class="l">${gen.charId === 'yagyu' ? 'HP' : '本隊'}</span><span>${gen.hp}/${st.hp}</span>
      <span class="l">攻撃</span><span>${st.atk}</span><span class="l">防御</span><span>${st.def}</span>
      <span class="l">魔力</span><span>${st.mag}</span><span class="l">魔防</span><span>${st.mdef}</span>
      <span class="l">速さ</span><span>${st.spd}</span><span class="l">移動</span><span>${st.move}</span>
      <span class="l">統率</span><span>${st.lead}</span><span class="l">政治</span><span>${st.pol}</span></div>`;
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
        Object.entries(KINGDOM_ACTIONS).filter(([, a]) => !a.queenOnly).map(([k, a]) =>
          `<button class="small ${cur === k ? 'primary' : ''}" data-kact="${k}" title="${esc(a.desc)}">${a.name}</button>`).join('') + `</div>`;
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
  h += acts.map(([k, a]) => `<div class="row"><span>${DEMON_ACTIONS[a.type].name}：${TERRITORIES[a.tid].name}</span><span style="flex:1"></span><button class="small" data-rmact="${k}">やめる</button></div>`).join('');
  h += S.draft.globals.map((a, i) => `<div class="row"><span>レベル上げ：${CHARACTERS[a.charId].name}（今Lv${g.chars[a.charId].level}・魔力${20 + 10 * g.chars[a.charId].level}）</span><span style="flex:1"></span><button class="small" data-rmglobal="${i}">やめる</button></div>`).join('');
  if (used < max) {
    const tsel = S.selTerr != null && g.territories[S.selTerr].owner === 'demon' ? S.selTerr : mine[0]?.id;
    h += `<div class="row" style="margin-top:6px">
      <select id="dType">${Object.entries(DEMON_ACTIONS).map(([k, a]) => `<option value="${k}">${a.name}（${a.desc}）</option>`).join('')}</select>
      <select id="dTarget"></select>
      <button class="small primary" id="dAdd">追加</button></div>`;
    S._demonDefault = tsel;
  }
  h += `<div class="hint">恐怖が下がりすぎると反乱が起きます。恐怖から魔力が生まれます。</div></div>`;
  return h;
}

function fillDemonTarget(g) {
  const typeSel = $('#dType'), tSel = $('#dTarget');
  if (!typeSel) return;
  const fill = () => {
    if (DEMON_ACTIONS[typeSel.value].global) {
      tSel.innerHTML = ['yagyu', 'car', 'oh', 'kkb'].map(c => `<option value="${c}">${CHARACTERS[c].name}（Lv${g.chars[c].level}・魔力${20 + 10 * g.chars[c].level}）</option>`).join('');
    } else {
      tSel.innerHTML = g.territories.filter(t => t.owner === 'demon').map(t => `<option value="${t.id}" ${t.id === S._demonDefault ? 'selected' : ''}>${TERRITORIES[t.id].name}（恐怖${t.fear}・兵${t.garrison}）</option>`).join('');
    }
  };
  typeSel.onchange = fill;
  fill();
  $('#dAdd').onclick = () => {
    const type = typeSel.value;
    if (DEMON_ACTIONS[type].global) S.draft.globals.push({ type, charId: tSel.value });
    else S.draft.acts['a' + Date.now()] = { type, tid: Number(tSel.value) };
    sendDraft(); render();
  };
}

function renderPanel(g) {
  let h = '';
  if (g.phase === 'lobby') {
    const ok = REQUIRED_ROLES.every(r => g.players[r]);
    h += `<div class="sec"><h3>参加者を待っています</h3>
      ${ROLES.map(r => `<div>${CHARACTERS[r].title}${CHARACTERS[r].name}：${g.players[r] ? esc(g.players[r].name) : '<span class="muted">' + (HERO_ROLES.includes(r) && !REQUIRED_ROLES.includes(r) ? '空き（AIが動かす）' : '空き（必須）') + '</span>'}</div>`).join('')}
      <p class="hint">ヤギューとスミレがそろったら始められます。野口・七星はあとからでも参加できます。</p>
      <button class="primary big" id="btnStart" ${ok && S.me ? '' : 'disabled'}>ゲームを始める</button></div>`;
  } else if (g.phase === 'ended') {
    h += `<div class="sec"><h3>決着！ ${SIDE_NAME[g.winner]}の勝利</h3><button id="btnEnding" class="primary">エンディングを見る</button></div>`;
  }
  if (g.phase === 'day' && S.me) {
    const readyNow = g.ready[S.me.role];
    const waiting = ROLES.filter(r => g.players[r] && !g.ready[r]).map(r => CHARACTERS[r].name);
    h += `<div class="sec"><button class="${readyNow ? '' : 'primary'} big" id="btnReady">${readyNow ? '準備完了を取り消す' : '準備完了'}</button>
      <div class="hint">${waiting.length ? `まだ考え中：${waiting.join('、')}` : ''}　全員そろうと、その日の結果がまとめて反映されます。</div></div>`;
  }
  if (g.phase !== 'lobby') {
    h += selGenSection(g);
    if (S.selTerr != null) h += terrInfo(g, S.selTerr);
    h += demonSection(g);
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
  if (b.dataset.kact) {
    const gid = S.selGen;
    if (S.draft.acts[gid]?.type === b.dataset.kact) delete S.draft.acts[gid];
    else { S.draft.acts[gid] = { type: b.dataset.kact }; delete S.draft.moves[gid]; }
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

function renderBattle(g) {
  const b = g.battle;
  const svg = $('#field');
  svg.setAttribute('viewBox', `0 0 ${BATTLE_W * CELL} ${BATTLE_H * CELL}`);
  const active = b.active && b.units.find(x => x.id === b.active.unitId);
  const mine = myActive(b);
  let h = '';
  for (let y = 0; y < BATTLE_H; y++) for (let x = 0; x < BATTLE_W; x++) {
    const tile = b.grid[y][x];
    h += `<rect x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}" fill="${TILE_COLOR[tile]}" stroke="rgba(0,0,0,.08)" data-cell="${x},${y}"/>`;
    if (tile === 'F') h += `<text x="${x * CELL + CELL / 2}" y="${y * CELL + CELL / 2 + 6}" text-anchor="middle" font-size="18" fill="#3f6f33" pointer-events="none">♣</text>`;
    if (tile === 'C') h += `<text x="${x * CELL + CELL / 2}" y="${y * CELL + CELL / 2 + 6}" text-anchor="middle" font-size="16" fill="#5e4e3f" pointer-events="none">▲</text>`;
    if (tile === 'H') h += `<text x="${x * CELL + CELL / 2}" y="${y * CELL + CELL / 2 + 5}" text-anchor="middle" font-size="13" fill="#8c7543" pointer-events="none">⌒</text>`;
    if (tile === 'W') h += `<text x="${x * CELL + CELL / 2}" y="${y * CELL + 14}" text-anchor="middle" font-size="10" fill="#ddd" pointer-events="none">${b.wallHp[x + ',' + y] ?? ''}</text>`;
  }
  // 動けるマス・攻撃できる相手
  let targets = { units: [], walls: [] };
  if (mine) {
    if (!b.active.moved) for (const [x, y] of reachable(b, mine)) {
      h += `<rect x="${x * CELL + 2}" y="${y * CELL + 2}" width="${CELL - 4}" height="${CELL - 4}" fill="rgba(60,120,230,.28)" stroke="rgba(60,120,230,.7)" data-cell="${x},${y}" style="cursor:pointer"/>`;
    }
    targets = targetsFrom(b, mine, mine.x, mine.y);
    for (const [x, y] of targets.walls) h += `<rect x="${x * CELL + 3}" y="${y * CELL + 3}" width="${CELL - 6}" height="${CELL - 6}" fill="none" stroke="#e04040" stroke-width="3" data-wall="${x},${y}" style="cursor:pointer"/>`;
  }
  for (const u of b.units) {
    if (!u.alive) continue;
    const cx = u.x * CELL + CELL / 2, cy = u.y * CELL + CELL / 2;
    const isActive = active && active.id === u.id;
    const isTarget = targets.units.some(t => t.id === u.id);
    const big = u.kind !== 'troop';
    h += `<g data-unit="${u.id}" style="cursor:pointer">`;
    if (isActive) h += `<circle cx="${cx}" cy="${cy}" r="21" fill="none" stroke="#ffcf4a" stroke-width="4"><animate attributeName="r" values="19;22;19" dur="1.2s" repeatCount="indefinite"/></circle>`;
    if (isTarget) h += `<circle cx="${cx}" cy="${cy}" r="21" fill="rgba(224,64,64,.25)" stroke="#e04040" stroke-width="3"/>`;
    h += big
      ? `<rect x="${cx - 16}" y="${cy - 16}" width="32" height="32" rx="7" fill="${SIDE_COLOR[u.side]}" stroke="${u.isCommander ? '#ffcf4a' : '#fff'}" stroke-width="${u.isCommander ? 3 : 1.5}"/>`
      : `<circle cx="${cx}" cy="${cy}" r="15" fill="${SIDE_COLOR[u.side]}" stroke="${u.isCommander ? '#ffcf4a' : '#fff'}" stroke-width="${u.isCommander ? 3 : 1.5}" opacity=".92"/>`;
    h += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="#fff" pointer-events="none">${u.label}</text>`;
    if (u.isCommander) h += `<text x="${cx - 17}" y="${cy - 10}" font-size="12" fill="#e3a500" pointer-events="none">★</text>`;
    h += `<rect x="${cx - 17}" y="${cy + 17}" width="34" height="4" fill="#00000040"/><rect x="${cx - 17}" y="${cy + 17}" width="${34 * u.hp / u.max}" height="4" fill="${u.hp / u.max > 0.5 ? '#3c9a5f' : u.hp / u.max > 0.25 ? '#d99a1e' : '#c43f3f'}"/>`;
    h += `</g>`;
    if (b.lastHit && b.lastHit.to === u.id) h += `<text x="${cx}" y="${cy - 20}" text-anchor="middle" font-size="14" font-weight="bold" fill="#c43f3f" stroke="#fff" stroke-width="3" paint-order="stroke" pointer-events="none">-${b.lastHit.dmg}</text>`;
  }
  svg.innerHTML = h;
  renderBattlePanel(g, b, active, mine, targets);
}

function unitCard(b, u, attacker) {
  const terr = TERRAIN[b.grid[u.y][u.x]].name;
  const pred = attacker && attacker.side !== u.side ? damage(b, attacker, u) : null;
  return `<div class="unitInfo"><b style="color:${SIDE_COLOR[u.side]}">${esc(u.name)}</b>${u.isCommander ? ' ★大将' : ''}
    <div class="bar" style="margin:4px 0"><i style="width:${u.hp / u.max * 100}%"></i></div>
    <div class="stats"><span class="l">${u.solo || u.isLeaderUnit ? 'HP' : '兵'}</span><span>${u.hp}/${u.max}</span><span class="l">地形</span><span>${terr}</span>
    <span class="l">攻撃</span><span>${u.atk}</span><span class="l">防御</span><span>${u.def}</span>
    <span class="l">魔力</span><span>${u.mag}</span><span class="l">魔防</span><span>${u.mdef}</span>
    <span class="l">速さ</span><span>${u.spd}</span><span class="l">移動</span><span>${u.move}</span></div>
    ${pred != null ? `<div style="margin-top:4px">予想ダメージ：<b>${pred}</b></div>` : ''}</div>`;
}

function renderBattlePanel(g, b, active, mine, targets) {
  const T = TERRITORIES[b.territoryId];
  let h = `<div class="sec"><h3>${T.name}の合戦　${b.round}ターン目</h3>
    <div class="hint">攻め：<span class="${b.attackerSide[0]}">${SIDE_NAME[b.attackerSide]}</span>　守り：<span class="${b.defenderSide[0]}">${SIDE_NAME[b.defenderSide]}</span>　★の大将を倒せば勝ち（${30}ターンで守り側の勝ち）</div></div>`;
  if (b.result) {
    h += `<div class="result">${SIDE_NAME[b.result.winner]}の勝ち！（${esc(b.result.reason)}）</div><button class="primary big" id="btnConclude">地図に戻る</button>`;
  } else if (active) {
    h += `<div class="sec"><h3>${mine ? 'あなたの番' : `${active.controller === 'ai' ? 'AI' : CHARACTERS[active.controller]?.name || ''}の番`}</h3>${unitCard(b, active)}`;
    if (mine) {
      h += `<div class="hint">${b.active.moved ? '攻撃する相手を選ぶか、待機。' : '青いマスをクリックで移動。赤い相手をクリックで攻撃。'}</div>`;
      if (targets.units.length) h += `<div class="acts">${targets.units.map(t => `<button class="small" data-atk="${t.id}">${esc(t.name)}に攻撃（${damage(b, mine, t)}）</button>`).join('')}</div>`;
      h += `<div class="acts" style="margin-top:6px">${b.active.moved ? '<button id="bUndo">移動を戻す</button>' : ''}<button id="bWait">待機</button></div>`;
    }
    h += '</div>';
  }
  const sel = S.selUnit && b.units.find(u => u.id === S.selUnit && u.alive);
  if (sel && sel !== active) h += `<div class="sec"><h3>えらんだ部隊</h3>${unitCard(b, sel, mine)}</div>`;
  if (b.order.length) {
    const upcoming = b.order.slice(b.idx).map(id => b.units.find(u => u.id === id)).filter(u => u && u.alive).slice(0, 14);
    h += `<div class="sec"><h3>行動の順番（速い順）</h3><div class="turnList">${upcoming.map(u => `<span style="background:${SIDE_COLOR[u.side]}">${u.label}${u.spd}</span>`).join('')}</div></div>`;
  }
  h += `<div class="sec"><h3>戦いの記録</h3><div class="log">${b.log.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div></div>`;
  $('#battlePanel').innerHTML = h;
}

$('#battlePanel').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'btnConclude') return act({ type: 'battle', action: { type: 'conclude' } });
  if (b.id === 'bWait') return act({ type: 'battle', action: { type: 'wait' } });
  if (b.id === 'bUndo') return act({ type: 'battle', action: { type: 'undo' } });
  if (b.dataset.atk) return act({ type: 'battle', action: { type: 'attack', targetId: b.dataset.atk } });
});

$('#field').addEventListener('click', (e) => {
  const b = S.game?.battle;
  if (!b) return;
  const mine = myActive(b);
  const uEl = e.target.closest('[data-unit]');
  if (uEl) {
    const u = b.units.find(x => x.id === uEl.dataset.unit);
    if (mine && u.side !== mine.side && targetsFrom(b, mine, mine.x, mine.y).units.some(t => t.id === u.id)) {
      return act({ type: 'battle', action: { type: 'attack', targetId: u.id } });
    }
    S.selUnit = u.id; render(); return;
  }
  const wEl = e.target.closest('[data-wall]');
  if (wEl && mine) { const [x, y] = wEl.dataset.wall.split(',').map(Number); return act({ type: 'battle', action: { type: 'attackWall', x, y } }); }
  const cEl = e.target.closest('[data-cell]');
  if (cEl && mine && !b.active.moved) {
    const [x, y] = cEl.dataset.cell.split(',').map(Number);
    if (reachable(b, mine).some(([a, c]) => a === x && c === y)) act({ type: 'battle', action: { type: 'move', x, y } });
  }
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
