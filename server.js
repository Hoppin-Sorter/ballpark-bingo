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

const game = {
  version: 0,
  round: 0,
  phase: 'IDLE', // IDLE | OPEN | RESOLVED
  squarePool: SQUARE_POOL,
  players: Object.create(null),
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
  res.json({ ok: true, version: game.version, players: Object.keys(game.players).length });
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

// ---------------------------------------------------------------------------
// Not built yet — Saturday, in this order (§7):
//   POST /mark           steps 4+6, carries `round`, rejects stale writes
//   POST /accuse         step 8, resolves against state as it stands
//   POST /next-inning    step 7, rejects if phase is OPEN
//   POST /force-resolve  step 7, confirm step on the client
// findBingo is imported and ready for /mark to call.
// ---------------------------------------------------------------------------

void findBingo;
void CARD_SIZE;

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ballpark-bingo listening on 0.0.0.0:${PORT}`);
  console.log(`square pool: ${SQUARE_POOL.length} squares`);
});
