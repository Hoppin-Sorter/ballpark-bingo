'use strict';

const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');

const SQUARE_POOL = require('./squares');
const { CARD_SIZE, findBingo, dealCard, freshMarks } = require('./bingo');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// State
//
// One process, one game, all in memory (§6). The only thing that survives a
// round is roundWins; everything else is wiped each inning.
// ---------------------------------------------------------------------------

/**
 * The phase machine (§2). Legal transitions, and nothing else:
 *
 *     IDLE ──next-inning──▶ OPEN ──bingo──▶ RESOLVED
 *                            ▲                  │
 *                            └───next-inning────┘
 *
 * OPEN ▶ OPEN is refused on purpose: that is the guard from §5 that removes
 * the need for a host key. One mis-scroll mid-round would otherwise deal
 * everybody a fresh card with no undo.
 */
const PHASE = { IDLE: 'IDLE', OPEN: 'OPEN', RESOLVED: 'RESOLVED' };

const game = {
  version: 0,
  round: 0,
  phase: PHASE.IDLE,
  squarePool: SQUARE_POOL,
  players: Object.create(null),
  winner: null, // { id, name, line } while phase is RESOLVED
  feed: [],
};

/**
 * Every mutation goes through here. The version counter is what lets clients
 * poll cheaply: if it hasn't moved, there is nothing to send (§4).
 */
function bump() {
  game.version++;
  return game.version;
}

const squareText = new Map(SQUARE_POOL.map((s) => [s.id, s.text]));

function pushFeed(text) {
  game.feed.push({ round: game.round, text, ts: Date.now() });
  if (game.feed.length > 100) game.feed.splice(0, game.feed.length - 100);
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * Deal a fresh inning. Everything except roundWins is wiped, including each
 * player's accusation, which is one per player per round (§3).
 */
function openRound() {
  game.round++;
  game.phase = PHASE.OPEN;
  game.winner = null;
  for (const p of Object.values(game.players)) {
    p.card = dealCard(game.squarePool);
    p.marks = freshMarks();
    p.accusationUsed = false;
  }
  pushFeed(`Inning ${game.round} is open.`);
  bump();
}

/**
 * End the round. `winner` is null for a push — an inning that ends with no
 * bingo, which is what Force Resolve produces (step 7).
 */
function resolveRound(winner, line) {
  game.phase = PHASE.RESOLVED;
  if (winner) {
    winner.roundWins++;
    game.winner = { id: winner.id, name: winner.name, line };
    pushFeed(`${winner.name} hit bingo and took inning ${game.round}.`);
  } else {
    game.winner = null;
    pushFeed(`Inning ${game.round} ended with no bingo. Push.`);
  }
  bump();
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

const markCount = (player) => player.marks.reduce((n, m) => n + (m ? 1 : 0), 0);

/**
 * Fuzzy band, never the number (§3). Exact per-player counts would turn
 * accusing into reading a leaderboard, so the count must not leave the server.
 */
function heatBadge(n) {
  if (n >= 15) return 'BLAZING';
  if (n >= 10) return 'HOT';
  if (n >= 5) return 'WARM';
  return 'COLD';
}

/**
 * How hot a square is across the room, as a 0-1 fraction.
 *
 * The denominator is players *holding* the square, not total players (§6).
 * Dividing by everyone would make a rare square that only three people have
 * read as permanently cold no matter how many of those three hit it.
 */
function squareHeat(squareId) {
  let holding = 0;
  let marked = 0;
  for (const p of Object.values(game.players)) {
    const i = p.card.indexOf(squareId);
    if (i === -1) continue;
    holding++;
    if (p.marks[i]) marked++;
  }
  return holding === 0 ? 0 : marked / holding;
}

/**
 * Full snapshot, not a diff (§4). At this size diffs are premature and they
 * are where sync bugs live.
 */
function snapshot(playerId) {
  const me = game.players[playerId];
  const w = game.winner;
  return {
    version: game.version,
    changed: true,
    round: game.round,
    phase: game.phase,
    you: {
      id: me.id,
      name: me.name,
      roundWins: me.roundWins,
      accusationUsed: me.accusationUsed,
    },
    // The winning line is card indices on the winner's own card, so it is only
    // meaningful — and only sent — to the winner.
    winner: w ? { name: w.name, isYou: w.id === playerId, line: w.id === playerId ? w.line : null } : null,
    card: me.card.map((id) => ({ id, text: squareText.get(id) })),
    marks: me.marks.slice(),
    heat: me.card.map(squareHeat),
    players: Object.values(game.players).map((p) => ({
      id: p.id,
      name: p.name,
      badge: heatBadge(markCount(p)), // band only — never the count
      roundWins: p.roundWins,
      accusationUsed: p.accusationUsed,
      isYou: p.id === playerId,
    })),
    feed: game.feed.slice(-25),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: game.version,
    round: game.round,
    phase: game.phase,
    players: Object.keys(game.players).length,
  });
});

app.post('/join', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  if (name.length > 20) return res.status(400).json({ error: 'name too long' });

  const id = crypto.randomUUID();
  game.players[id] = {
    id,
    name,
    card: dealCard(game.squarePool),
    marks: freshMarks(),
    accusationUsed: false,
    roundWins: 0,
  };
  bump();

  res.json({ playerId: id, snapshot: snapshot(id) });
});

app.get('/state/:playerId', (req, res) => {
  const { playerId } = req.params;
  if (!game.players[playerId]) {
    // The process restarted (every Railway deploy does this) and the phone is
    // holding a dead id from localStorage. Tell it to join again rather than
    // leaving someone staring at a broken screen in the stands.
    return res.status(404).json({ error: 'unknown player', rejoin: true });
  }

  const since = Number(req.query.since);
  if (Number.isFinite(since) && game.version <= since) {
    return res.json({ version: game.version, changed: false });
  }

  res.json(snapshot(playerId));
});

app.post('/mark', (req, res) => {
  const { playerId, index, value, round } = req.body ?? {};

  const player = game.players[playerId];
  if (!player) return res.status(404).json({ error: 'unknown player', rejoin: true });

  if (!Number.isInteger(index) || index < 0 || index >= CARD_SIZE) {
    return res.status(400).json({ error: 'index out of range' });
  }
  if (typeof value !== 'boolean') {
    return res.status(400).json({ error: 'value must be a boolean' });
  }

  if (game.phase !== PHASE.OPEN) {
    return res.status(409).json({ error: 'round is not open', phase: game.phase });
  }

  // -------------------------------------------------------------------------
  // STALE-ROUND GUARD GOES HERE — step 6, yours to write (§4).
  //
  // The failure is now reproducible: rounds actually roll over as of this
  // step. A player taps a square just as somebody starts the next inning.
  // Their tap was aimed at a card that no longer exists, but it arrives after
  // the rollover, so the server writes it onto the *fresh* card at the same
  // index. They watch a square light up on a board they have never seen.
  //
  // `round` is already on the wire from the client for exactly this. Compare
  // it to game.round and reject the mismatch — the client's next poll will
  // correct its own UI, because the snapshot is authoritative.
  //
  // Reproduce it before you fix it: open two phones, start an inning, then
  // POST /mark with a stale round number while the round is open and watch it
  // land anyway.
  // -------------------------------------------------------------------------
  void round;

  // Only bump when something actually changed, so a repeat tap of the same
  // value doesn't wake every other client's poll for nothing.
  if (player.marks[index] !== value) {
    player.marks[index] = value;
    bump();

    // Bingo is the only win condition and it ends the round on the spot (§2).
    // Unmarking can never complete a line, so only check on the way up.
    if (value) {
      const line = findBingo(player.marks);
      if (line) resolveRound(player, line);
    }
  }

  res.json(snapshot(playerId));
});

app.post('/next-inning', (req, res) => {
  // The guard that replaces a host key (§5). Only legal from IDLE or RESOLVED.
  if (game.phase === PHASE.OPEN) {
    return res.status(409).json({ error: 'a round is already open', phase: game.phase });
  }
  openRound();
  res.json({ ok: true, round: game.round, phase: game.phase, version: game.version });
});

// ---------------------------------------------------------------------------
// Not built yet (§7):
//   POST /accuse         step 8, resolves against state as it stands
//   POST /force-resolve  step 7, calls resolveRound(null) for a push, and
//                        needs a confirm step on the client since it stays
//                        live during OPEN by definition
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ballpark-bingo listening on 0.0.0.0:${PORT}`);
  console.log(`square pool: ${SQUARE_POOL.length} squares`);
});
