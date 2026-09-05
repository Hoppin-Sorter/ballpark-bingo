'use strict';

/* Game logic and rendering. Presentation lives in styles.css — this file should
   not contain colours. See DESIGN.md before changing anything here. */

const $ = (id) => document.getElementById(id);

// --- client state ----------------------------------------------------------
// `serverMarks` is the truth. `pending` is what this phone believes it just
// did but the server has not confirmed. What you see is server + pending
// laid on top; when the server disagrees, the overlay is dropped and the
// square visibly snaps back.
let playerId = localStorage.getItem('bb.playerId');
let snap = null;
let serverMarks = [];
const pending = new Map(); // cardIndex -> { value, seq, sending }
let seq = 0;
let lastVersion = -1;
let lastRound = null;
let lastCardIds = null;
let cells = null;
let polling = false;

function effectiveMarks() {
  const m = serverMarks.slice();
  for (const [i, p] of pending) m[i] = p.value;
  return m;
}

const isOpen = () => snap && snap.phase === 'OPEN';

// --- screens ---------------------------------------------------------------
// join -> rules -> game on a fresh join. A reload with a stored playerId goes
// straight to the game; the Rules button reopens the explainer any time.
function showRules() {
  $('join').classList.add('hide');
  $('game').classList.add('hide');
  $('rules').classList.remove('hide');
  window.scrollTo(0, 0);
}

function showGame() {
  $('join').classList.add('hide');
  $('rules').classList.add('hide');
  $('game').classList.remove('hide');
}

function showJoin() {
  $('rules').classList.add('hide');
  $('game').classList.add('hide');
  $('join').classList.remove('hide');
}

// --- joining ---------------------------------------------------------------
async function join() {
  const name = $('name').value.trim();
  if (!name) return;
  $('go').disabled = true;
  try {
    const r = await fetch('/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'join failed');
    playerId = data.playerId;
    localStorage.setItem('bb.playerId', playerId);
    enterGame(data.snapshot, true);
  } catch (e) {
    alert(e.message);
    $('go').disabled = false;
  }
}

function enterGame(first, fromJoin) {
  $('rulesBtn').classList.remove('hide');
  buildGrid();
  applySnapshot(first);
  if (!polling) { polling = true; setInterval(poll, 3000); }
  if (fromJoin) showRules(); else showGame();
}

function handleGone() {
  localStorage.removeItem('bb.playerId');
  location.reload();
}

// --- grid ------------------------------------------------------------------
// Measured on a 375px phone against the tile size the card frame leaves.
// The longest square that fits is what caps square length in squares.js.
function fontFor(text) {
  if (text.length <= 14) return '11px';
  if (text.length <= 24) return '10px';
  if (text.length <= 38) return '9px';
  if (text.length <= 52) return '8px';
  return '7.5px';
}

function buildGrid() {
  const grid = $('grid');
  grid.innerHTML = '';
  cells = new Array(24);
  for (let cell = 0; cell < 25; cell++) {
    const el = document.createElement('button');
    if (cell === 12) {
      el.className = 'sq free';
      el.textContent = 'FREE';
      el.disabled = true;
      grid.appendChild(el);
      continue;
    }
    const index = cell < 12 ? cell : cell - 1;
    el.className = 'sq';
    const label = document.createElement('span');
    label.className = 't';
    el.appendChild(label);
    el.addEventListener('click', () => tap(index));
    grid.appendChild(el);
    el._label = label;
    cells[index] = el;
  }
}

// --- optimistic marking ----------------------------------------------------
function tap(index) {
  if (!isOpen()) return; // the server refuses too; this just avoids the round trip
  const next = !effectiveMarks()[index];
  // Capture the round the tap was aimed at, not the round at send time. A
  // queued mark that flushes after a rollover must still carry its original
  // round so the server's stale-round guard can reject it.
  pending.set(index, { value: next, seq: ++seq, sending: false, round: snap.round });
  paint();            // immediate, before the network knows anything
  sendMark(index);
}

async function sendMark(index) {
  const p = pending.get(index);
  if (!p || p.sending) return;
  p.sending = true;

  try {
    const r = await fetch('/mark', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId, index, value: p.value, round: p.round }),
    });
    if (r.status === 404) return handleGone();

    const body = await r.json();
    const before = effectiveMarks();

    // Whether the server agreed or refused, this attempt is resolved: drop the
    // optimistic value and let the authoritative state show through.
    if (pending.get(index) === p) pending.delete(index);

    if (r.ok) applySnapshot(body, before);
    else { paint(); flashIfChanged(before); }

    // The fetch succeeded, so we are online. Say so now rather than letting the
    // pill read "syncing" until the next poll three seconds from now.
    if (!pending.size) setConn('live');
  } catch {
    // Network died. Keep the optimistic value and re-send on the next poll,
    // so a dead spot in the stands doesn't silently eat a mark.
    p.sending = false;
    setConn('down');
  }
}

function retryPending() {
  for (const [index, p] of pending) if (!p.sending) sendMark(index);
}

// --- polling ---------------------------------------------------------------
async function poll() {
  try {
    const r = await fetch(`/state/${playerId}?since=${lastVersion}`);
    if (r.status === 404) return handleGone();
    const data = await r.json();
    if (data.changed !== false) applySnapshot(data);
    setConn(pending.size ? 'syncing' : 'live');
    if (snap) renderFeed();   // ages drift even when nothing else moves
    retryPending();
  } catch {
    setConn('down');
  }
}

// --- rendering -------------------------------------------------------------
function applySnapshot(next, beforeDisplay) {
  // A rollover invalidates anything this phone still had in flight — those
  // taps were aimed at a card that no longer exists. Dropping them here is the
  // client half; the server half is the stale-round guard in /mark.
  if (lastRound !== null && next.round !== lastRound) {
    pending.clear();
    accuseResult = null;
    wipedNotice = false;
  } else if (lastCardIds && next.card.map((c) => c.id).join(',') !== lastCardIds && !applyingOwnCall) {
    // The card was replaced without the round changing. Only an accusation
    // does that, so somebody called you — which you can see and nobody else can.
    // This supersedes the result of our own earlier call: it is newer news,
    // and otherwise a player who accused early would never learn they were hit.
    wipedNotice = true;
    accuseResult = null;
    pending.clear();
  }
  if (typeof next.now === 'number') serverOffset = Date.now() - next.now;
  lastRound = next.round;
  lastCardIds = next.card.map((c) => c.id).join(',');

  const before = beforeDisplay || (snap ? effectiveMarks() : null);
  snap = next;
  serverMarks = next.marks;
  lastVersion = next.version;
  paint();
  if (before) flashIfChanged(before);
}

function flashIfChanged(before) {
  const after = effectiveMarks();
  for (let i = 0; i < after.length; i++) {
    if (before[i] !== after[i] && cells[i]) {
      cells[i].classList.remove('reverted');
      void cells[i].offsetWidth; // restart the animation
      cells[i].classList.add('reverted');
    }
  }
}

function paint() {
  if (!snap || !cells) return;
  $('round').textContent = snap.round;
  $('phase').textContent = snap.phase;

  const open = isOpen();
  $('grid').classList.toggle('locked', !open);
  $('grid').classList.toggle('dim', snap.phase === 'IDLE');
  renderBanner();
  renderRoom();
  renderAccuse();
  renderControls();
  renderFeed();

  const marks = effectiveMarks();
  const winLine = snap.winner && snap.winner.isYou ? snap.winner.line : null;

  for (let i = 0; i < 24; i++) {
    const el = cells[i];
    const text = snap.card[i].text;
    if (el.dataset.text !== text) {
      el._label.textContent = text;
      el.dataset.text = text;
      el.style.fontSize = fontFor(text);
    }
    el.classList.toggle('on', !!marks[i]);
    el.classList.toggle('pending', pending.has(i));
    el.classList.toggle('win', !!winLine && winLine.includes(i));
  }

  const q = $('queue');
  if (pending.size) {
    q.textContent = pending.size + ' unsent';
    q.classList.remove('hide');
  } else {
    q.classList.add('hide');
  }

  // Names only. Per-player heat is deliberately not sent by the server at all:
  // hiding it here would be cosmetic, since anyone could read /state directly.
  $('players').innerHTML = snap.players.map((p) =>
    `<div class="row"><span>${esc(p.name)}${p.isYou ? ' (you)' : ''}` +
    `${p.roundWins ? `<span class="wins">${p.roundWins}W</span>` : ''}` +
    `${p.accusationUsed ? '<span class="spent">shot spent</span>' : ''}</span></div>`
  ).join('');
}

/**
 * How close the room is to a bingo, never who (§3). Rendered on the card frame
 * rather than on tiles, so it structurally cannot wash out a square you have
 * marked — a marked tile is an opaque fill with nothing translucent over it.
 */
const ROOM_COPY = {
  QUIET:    ['Quiet out there', 'nobody near a line'],
  WARMING:  ["Somebody's building", 'three squares off'],
  CLOSE:    ['Someone is close', 'two squares off'],
  ONE_AWAY: ['Someone is one away', 'the next square could end it'],
};

function renderRoom() {
  const open = isOpen();
  const band = open ? (snap.room || 'QUIET') : 'QUIET';
  // Toggle rather than assign, so styling classes added here survive.
  const card = $('card');
  card.classList.remove('WARMING', 'CLOSE', 'ONE_AWAY');
  if (band !== 'QUIET') card.classList.add(band);

  // A dimmed grid on its own reads as broken rather than as waiting, so the
  // card says what it is doing between innings.
  const label = document.querySelector('.roomLabel');
  label.classList.toggle('locked', !open);
  if (!open) {
    $('roomTitle').textContent = 'Card locked';
    $('roomSub').textContent = snap.phase === 'IDLE'
      ? 'nothing to mark until an inning starts'
      : 'start the next inning for a fresh card';
    return;
  }
  const [title, sub] = ROOM_COPY[band] || ROOM_COPY.QUIET;
  $('roomTitle').textContent = title;
  $('roomSub').textContent = sub;
}

/**
 * The phase machine is the whole UI (§6). OPEN says nothing so the grid gets
 * the screen; RESOLVED is deliberately loud, because it is the cue to put the
 * phone down and argue about the call.
 */
function renderBanner() {
  const b = $('banner');
  const w = snap.winner;

  const setClasses = (...names) => {
    b.className = '';
    names.filter(Boolean).forEach((n) => b.classList.add(n));
  };

  if (snap.phase === 'OPEN') { setClasses('hide'); return; }

  // Nothing is markable until an inning is open, so the banner has to carry the
  // way out. Before this, the only Start button was below the card, the player
  // list and the accuse control — people tapped a dead card and assumed it was
  // broken.
  const start = `<button id="bannerStart" class="ctrl primary bannerBtn">` +
    `Start inning ${snap.round + 1}</button>`;

  if (snap.phase === 'IDLE') {
    setClasses('idle');
    b.innerHTML = '<div class="bt">No inning open</div>' +
      '<div class="bs">Anyone can start it — including you.</div>' + start;
    return;
  }

  setClasses('resolved', w && w.isYou ? 'mine' : null);
  if (!w) {
    b.innerHTML = `<div class="bt">Push</div>` +
      `<div class="bs">Inning ${snap.round} ended with no bingo.</div>` + start;
  } else if (w.isYou) {
    b.innerHTML = `<div class="bt">BINGO</div>` +
      `<div class="bs">You took inning ${snap.round}. ${snap.you.roundWins} on the day.</div>` + start;
  } else {
    b.innerHTML = `<div class="bt">${esc(w.name)} got bingo</div>` +
      `<div class="bs">Inning ${snap.round} is over.</div>` + start;
  }
}

// --- feed ------------------------------------------------------------------
// Anonymized on the target (§3): the accuser is named, the target never is.
// A named target would clear that person for the whole room for free.
let serverOffset = 0;   // clientNow - serverNow, so ages survive a wrong phone clock

function ago(ts) {
  const age = Date.now() - serverOffset - ts;
  if (age < 10000) return 'just now';
  if (age < 60000) return Math.round(age / 1000) + 's ago';
  if (age < 3600000) return Math.round(age / 60000) + 'm ago';
  return Math.round(age / 3600000) + 'h ago';
}

function renderFeed() {
  const el = $('feed');
  if (!snap || !snap.feed.length) {
    el.innerHTML = '<div class="feedEmpty">Nothing has happened yet.</div>';
    return;
  }
  // Newest first: on a phone the latest line should not need a scroll.
  el.innerHTML = snap.feed.slice().reverse().map((f) =>
    '<div class="fe ' + (f.kind || '') + '">' +
      '<span class="ft">' + esc(f.text) + '</span>' +
      '<span class="fm">inning ' + f.round + ' · ' + ago(f.ts) + '</span>' +
    '</div>'
  ).join('');
}

// --- accusation ------------------------------------------------------------
// One shot per player per round (§3). Sabotage, not a second win condition:
// a correct call knocks the frontrunner back and wins the accuser nothing.
let panelOpen = false;
let armedTarget = null;
let accuseTimer = null;
let accuseResult = null;  // { correct, wipedYou } from our own call
let wipedNotice = false;  // our card was replaced by somebody else's call
let applyingOwnCall = false;

function disarmAccuse() {
  armedTarget = null;
  clearTimeout(accuseTimer);
}

async function sendAccuse(targetId) {
  disarmAccuse();
  panelOpen = false;
  try {
    const r = await fetch('/accuse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId, targetId, round: snap.round }),
    });
    if (r.status === 404) return handleGone();
    const body = await r.json();
    if (r.ok) {
      accuseResult = body.accusation;
      wipedNotice = false;
      applyingOwnCall = true;
      applySnapshot(body);
      applyingOwnCall = false;
    } else {
      await poll();   // refused; the fresh snapshot explains why
    }
  } catch {
    setConn('down');
  }
}

function renderAccuse() {
  const btn = $('accuseBtn');
  const panel = $('accusePanel');
  const spent = snap.you.accusationUsed;
  const usable = isOpen() && !spent;

  btn.disabled = !usable;
  if (!usable) { panelOpen = false; disarmAccuse(); }
  btn.textContent = spent ? 'Accusation spent'
    : panelOpen ? 'Never mind'
    : 'Call the leader';

  if (!panelOpen) {
    panel.className = 'hide';
  } else {
    panel.className = 'panel';
    const others = snap.players.filter((p) => !p.isYou);
    // Bare names. No heat, no hint — the read has to come from watching people.
    panel.innerHTML = others.length
      ? others.map((p) => {
          const armed = armedTarget === p.id;
          const label = armed ? 'Tap again to accuse ' + esc(p.name) : esc(p.name);
          return '<button class="accuseRow' + (armed ? ' armed' : '') + '" data-id="' + p.id + '">' +
            '<span>' + label + '</span></button>';
        }).join('')
      : '<div class="note">Nobody else has joined yet.</div>';
  }

  const box = $('accuseResult');
  if (accuseResult) {
    box.className = accuseResult.correct ? 'hit' : 'miss';
    box.textContent = accuseResult.correct
      ? 'Right. Their card is gone, and only you know whose.'
      : 'Wrong. Your card is gone.';
  } else if (wipedNotice) {
    box.className = 'wiped';
    box.textContent = 'Your card was wiped. Somebody called you.';
  } else {
    box.className = 'hide';
  }
}

$('accuseBtn').addEventListener('click', () => {
  panelOpen = !panelOpen;
  disarmAccuse();
  paint();
});

$('accusePanel').addEventListener('click', (e) => {
  const row = e.target.closest('.accuseRow');
  if (!row) return;
  const id = row.dataset.id;
  if (armedTarget === id) return sendAccuse(id);   // confirm step (§6)
  armedTarget = id;
  clearTimeout(accuseTimer);
  accuseTimer = setTimeout(() => { armedTarget = null; paint(); }, 4000);
  paint();
});

/**
 * Anyone can roll the round — no host page, no key (§5). The state machine
 * does the protecting instead: exactly one of these two is live at any moment,
 * because Start Next Inning is illegal during OPEN and Force Resolve is
 * meaningless outside it.
 */
let armed = false;
let armTimer = null;

function arm() {
  armed = true;
  clearTimeout(armTimer);
  armTimer = setTimeout(() => { armed = false; paint(); }, 4000);
  paint();
}

function disarm() {
  armed = false;
  clearTimeout(armTimer);
}

function renderControls() {
  const next = $('nextInning');
  const force = $('forceResolve');
  const open = isOpen();

  // The whole reason a host key is unnecessary: one mis-scroll mid-round would
  // otherwise deal everybody a fresh card with no undo.
  next.disabled = open;
  next.textContent = open
    ? `Inning ${snap.round} in progress`
    : `Start inning ${snap.round + 1}`;

  if (!open) disarm();
  force.disabled = !open;
  force.classList.toggle('armed', armed);
  force.textContent = armed ? `Tap again to end inning ${snap.round}` : 'Force Resolve';

  $('ctrlNote').textContent = open
    ? 'Force Resolve ends the inning with no winner. Anyone can press it.'
    : 'Fresh cards for everyone. Anyone can press it.';
}

async function startNextInning(btn) {
  if (btn) btn.disabled = true;
  try { await fetch('/next-inning', { method: 'POST' }); } catch {}
  await poll();
}

$('nextInning').addEventListener('click', () => startNextInning($('nextInning')));

// Delegated: renderBanner rewrites its innerHTML, so the node is replaced.
$('banner').addEventListener('click', (e) => {
  const b = e.target.closest('#bannerStart');
  if (b) startNextInning(b);
});

$('forceResolve').addEventListener('click', async () => {
  if (!armed) return arm();   // confirm step: this one is destructive (§5)
  disarm();
  try { await fetch('/force-resolve', { method: 'POST' }); } catch {}
  await poll();
});

function setConn(kind) {
  const el = $('conn');
  el.className = 'pill ' + kind;
  el.innerHTML = '<span class="dot"></span>' +
    (kind === 'live' ? 'live' : kind === 'syncing' ? 'syncing' : 'offline');
}

function esc(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- boot ------------------------------------------------------------------
$('go').addEventListener('click', join);
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
$('rulesBtn').addEventListener('click', showRules);
$('rulesDone').addEventListener('click', () => (playerId ? showGame() : showJoin()));

if (playerId) {
  fetch(`/state/${playerId}?since=-1`)
    .then((r) => (r.ok ? r.json().then((s) => enterGame(s, false)) : localStorage.removeItem('bb.playerId')))
    .catch(() => {});
}
