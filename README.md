# Ballpark Bingo

Live multiplayer bingo for a group sitting at a ballpark together.
Design doc: [ballpark-bingo-spec.md](ballpark-bingo-spec.md) (rev 6).

## Run

```
npm install
npm start          # http://localhost:3000
npm test           # bingo geometry + card generation
```

## Built so far — spec §7 steps 1-5 and 7-10, plus a front-end redesign

| File | What |
|---|---|
| `server.js` | State, version counter, phase machine, all endpoints below |
| `bingo.js` | Card geometry, `findBingo`, `dealCard` |
| `squares.js` | The square pool — 60 squares, 15 certain / 34 medium / 11 rare |
| `public/index.html` | Markup only |
| `public/styles.css` | Design tokens + the light Mets theme |
| `public/app.js` | Grid, optimistic marking, poll loop, phase UI |
| `DESIGN.md` | Token contract and state inventory — read before touching the front end |
| `NEXT-PUSH.md` | Deploy note, game-day checklist and tuning levers |
| `test-bingo.js` | 12 tests over bingo geometry and card generation |

| Endpoint | State |
|---|---|
| `POST /join` | done |
| `GET /state/:playerId?since=N` | done |
| `POST /mark` | done, with the stale-round guard |
| `POST /next-inning` | done, refuses while `phase === OPEN` |
| `POST /accuse` | done, with the stale-round guard |
| `POST /force-resolve` | done, refuses outside `OPEN`, confirm step on the client |
| `POST /reset` | done, wipes players/scores/feed back to a new game |

The phase machine:

```
IDLE ──next-inning──▶ OPEN ──bingo──▶ RESOLVED
                       ▲                  │
                       └───next-inning────┘
```

`OPEN ▶ OPEN` is refused, which is what makes a host key unnecessary (§5).

### Design changes from the spec

Two deliberate departures from rev 6, both anticipated by the spec itself:

- **Per-player heat badges are gone.** §9 listed "heat badges make accusing too easy"
  as a live risk. They are not hidden in the client — the server no longer computes or
  sends them at all, because a client-side hide is readable by anyone who opens
  `/state` in a phone browser.
- **The card frame carries a room-proximity band instead.** It says how close the
  nearest *other* player is to a bingo — `QUIET`, `WARMING`, `CLOSE`, `ONE_AWAY` —
  and never who. The read moves from a leaderboard to watching people, which is the
  Clue-style read §3 was after.

Thresholds live in `ROOM_BANDS` in `server.js`. Measured over simulated rooms of six
with random marks: one mark each already reads `WARMING`, four reads `CLOSE`, seven
reads `ONE_AWAY`, and bingo lands around nine to eleven. Real marking is far more
correlated than random, so in play this tracks the inning. Widen the bands if
`ONE_AWAY` sits on for too much of a round to be worth looking at.

### Still to do

- Per-square heat (step 11) is computed server-side but not rendered. The card
  frame's room-proximity band replaced it; running both would put two competing
  heat signals on one small screen.
- Sanity-check the Citi Field squares on the day — the Home Run Apple, the 7 Line
  Army, Mr. Met, planes out of LaGuardia. A square nobody can hit is worse than
  no square at all.
- The Chris squares are one-off, written for his 36th, and assume he is at the
  game. Pull them if he is not, or a handful of cards carry a dead square.

## Deploy

**Live:** https://ballpark-bingo-production.up.railway.app

Railway deploys from `main` on every push. It auto-detects Node and runs
`npm start`; the server reads `process.env.PORT` and binds `0.0.0.0`.

State is in memory, so **every deploy wipes all players, cards and scores.**
That is fine on Saturday and fatal on Sunday.

- **Freeze pushes to `main` once it works Saturday night.** A push mid-game
  resets everyone's card with no undo.
- Do not use a tier that spins down. A 50-second cold start mid-inning kills
  the game (spec §9).
