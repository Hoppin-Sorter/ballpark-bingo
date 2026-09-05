'use strict';

const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');

const SQUARE_POOL = require('./squares');
const { CARD_SIZE, LINES, findBingo, dealCard, freshMarks } = require('./bingo');

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

function pushFeed(text, kind) {
  game.feed.push({ round: game.round, text, ts: Date.now(), kind });
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
  pushFeed(`Inning ${game.round} is open.`, 'open');
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
    pushFeed(`${winner.name} hit bingo and took inning ${game.round}.`, 'bingo');
  } else {
    game.winner = null;
    pushFeed(`Inning ${game.round} ended with no bingo. Push.`, 'push');
  }
  bump();
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

const markCount = (player) => player.marks.reduce((n, m) => n + (m ? 1 : 0), 0);

/**
 * How close the room is to a bingo, in squares still needed on the best line
 * anyone holds.
 *
 * The viewer is excluded: from your seat "the room" means everyone else, and a
 * signal that lit up because of your own card would tell you nothing while
 * reading as somebody else closing in.
 */
function roomProximity(exceptPlayerId) {
  let fewest = Infinity;
  for (const p of Object.values(game.players)) {
    if (p.id === exceptPlayerId) continue;
    for (const line of LINES) {
      const remaining = line.reduce((n, i) => n + (p.marks[i] ? 0 : 1), 0);
      if (remaining < fewest) fewest = remaining;
    }
  }
  return fewest;
}

/**
 * Banded, and only the band ever leaves the server — the same discipline the
 * old per-player heat badges followed, and the reason those were removed. This
 * one is safe to show because it is a maximum across everybody: it says someone
 * is closing in, never who.
 *
 * Banding is on absolute squares remaining rather than a fraction, because
 * LINES mixes four- and five-square lines around the free centre and 3/4 and
 * 4/5 are both "one away".
 */
// Squares-remaining -> band. Measured over 3000 simulated rooms of six with
// random marks: 1 mark each already reads WARMING, 4 reads CLOSE, 7 reads
// ONE_AWAY, and bingo lands around 9-11. Real marking is far more correlated
// than random — the room mostly sees the same events — so in play this tracks
// the inning rather than one runaway card. Widen these if the signal sits on
// ONE_AWAY too long to be worth looking at.
const ROOM_BANDS = [
  [1, 'ONE_AWAY'],
  [2, 'CLOSE'],
  [3, 'WARMING'],
];

function roomBand(exceptPlayerId) {
  const fewest = roomProximity(exceptPlayerId);
  for (const [remaining, band] of ROOM_BANDS) {
    if (fewest <= remaining) return band;
  }
  return 'QUIET';
}

/**
 * How hot a square is across the room, as a 0-1 fraction.
 *
 * The denominator is players *holding* the square, not total players (§6).
 * Dividing by everyone would make a rare square that only three people have
 * read as permanently cold no matter how many of those three hit it.
 */
const MIN_HOLDERS_FOR_HEAT = 2;

function squareHeat(squareId) {
  let holding = 0;
  let marked = 0;
  for (const p of Object.values(game.players)) {
    const i = p.card.indexOf(squareId);
    if (i === -1) continue;
    holding++;
    if (p.marks[i]) marked++;
  }
  // With a single holder the fraction is only ever 0 or 1 and it is describing
  // you, not the room. Heat is a reading of what everyone else has seen, so it
  // needs at least two holders to say anything.
  if (holding < MIN_HOLDERS_FOR_HEAT) return 0;
  return marked / holding;
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
    now: Date.now(),
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
    room: roomBand(playerId),
    players: Object.values(game.players).map((p) => ({
      id: p.id,
      name: p.name,
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

  // Two players called Mike would be indistinguishable in the accuse picker, and
  // naming a person is the entire mechanic. Cheaper to refuse than to disambiguate.
  const taken = Object.values(game.players)
    .some((p) => p.name.toLowerCase() === name.toLowerCase());
  if (taken) return res.status(409).json({ error: `"${name}" is taken — add an initial` });

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

  // Stale-round guard (§4). The client says which round its tap was aimed at.
  // If the round has rolled since, that card no longer exists and the mark
  // would land on the *fresh* card at the same index — the player would watch
  // a square light up on a board they have never seen.
  //
  // The phase gate above does not cover this. After a rollover the new round is
  // OPEN too, so a late tap sails straight through it.
  //
  // Rejecting is enough on its own: the client's next snapshot is authoritative
  // and its optimistic mark reverts on the spot.
  if (round !== game.round) {
    return res.status(409).json({ error: 'stale round', round: game.round });
  }

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

app.post('/force-resolve', (req, res) => {
  // The escape hatch for a stuck round (§5). Only meaningful mid-round: there
  // is nothing to end in IDLE, and RESOLVED is already over. Unlike Start Next
  // Inning this stays live during OPEN by definition, which is why the confirm
  // step lives on the client.
  if (game.phase !== PHASE.OPEN) {
    return res.status(409).json({ error: 'no round to resolve', phase: game.phase });
  }
  resolveRound(null);
  res.json({ ok: true, round: game.round, phase: game.phase, version: game.version });
});

app.post('/accuse', (req, res) => {
  const { playerId, targetId, round } = req.body ?? {};

  const accuser = game.players[playerId];
  if (!accuser) return res.status(404).json({ error: 'unknown player', rejoin: true });

  // Phase first. This is also the ruling for an accusation that lands the
  // instant somebody bingos (§3): the bingo already flipped the phase, so the
  // late accusation is refused here rather than resolving against a dead round.
  if (game.phase !== PHASE.OPEN) {
    return res.status(409).json({ error: 'round is not open', phase: game.phase });
  }

  const target = game.players[targetId];
  if (!target) return res.status(400).json({ error: 'unknown target' });
  if (targetId === playerId) {
    return res.status(400).json({ error: 'you cannot accuse yourself' });
  }
  if (accuser.accusationUsed) {
    return res.status(409).json({ error: 'accusation already spent this round' });
  }

  // Same stale-round guard as /mark (§4). An accusation aimed at the previous
  // inning must not resolve against this one's marks — the leader it was
  // pointed at is not necessarily the leader any more.
  if (round !== game.round) {
    return res.status(409).json({ error: 'stale round', round: game.round });
  }

  // Resolved against state as it stands the moment this request arrives (§4).
  // Node handles requests in arrival order, so two accusations in the same tick
  // resolve one after the other, the second seeing whatever the first did.
  //
  // Ties count as correct for every player at the top (§3). Losing your shot on
  // a technicality when two people are level is infuriating, so be generous.
  //
  // With nobody marked yet the whole room is tied at zero, so the accusation is
  // technically correct and wipes an empty card. That is the "wasted shot" §3
  // describes — it costs the accuser their one shot and achieves nothing.
  const lead = Math.max(...Object.values(game.players).map(markCount));
  const correct = markCount(target) === lead;

  accuser.accusationUsed = true;

  // Sabotage, not a second win condition (§3). A correct call knocks the
  // frontrunner back; it wins the accuser nothing directly.
  const wiped = correct ? target : accuser;
  wiped.card = dealCard(game.squarePool);
  wiped.marks = freshMarks();

  // Named accuser, never a named target (§3). Naming the target would clear
  // that person for the whole room for free — one player spends their shot and
  // everybody benefits. Anonymized, a miss tells you only that a shot was fired.
  pushFeed(
    `${accuser.name} accused someone and got it ${correct ? 'right!' : 'wrong.'}`,
    correct ? 'hit' : 'miss'
  );
  bump();

  res.json({ ...snapshot(playerId), accusation: { correct, wipedYou: !correct } });
});

// ---------------------------------------------------------------------------
// Everything in §7 is now built except the stale-round guard (step 6), which
// is marked in place in /mark and /accuse.
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ballpark-bingo listening on 0.0.0.0:${PORT}`);
  console.log(`square pool: ${SQUARE_POOL.length} squares`);
});
