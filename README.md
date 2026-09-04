# Ballpark Bingo

Live multiplayer bingo for a group sitting at a ballpark together.
Design doc: [ballpark-bingo-spec.md](ballpark-bingo-spec.md) (rev 6).

## Run

```
npm install
npm start          # http://localhost:3000
npm test           # bingo geometry + card generation
```

## Built so far — spec §7 steps 1-5, 7 and 8

| File | What |
|---|---|
| `server.js` | State, version counter, phase machine, all endpoints below |
| `bingo.js` | Card geometry, `findBingo`, `dealCard` |
| `squares.js` | Starter pool, 32 squares — **rewrite Saturday night (§8)** |
| `public/index.html` | The client: grid, optimistic marking, poll loop, phase UI |
| `test-bingo.js` | 12 tests over bingo geometry and card generation |

| Endpoint | State |
|---|---|
| `POST /join` | done |
| `GET /state/:playerId?since=N` | done |
| `POST /mark` | done, **minus the stale-round guard** |
| `POST /next-inning` | done, refuses while `phase === OPEN` |
| `POST /accuse` | done, **minus the stale-round guard** |
| `POST /force-resolve` | done, refuses outside `OPEN`, confirm step on the client |

The phase machine:

```
IDLE ──next-inning──▶ OPEN ──bingo──▶ RESOLVED
                       ▲                  │
                       └───next-inning────┘
```

`OPEN ▶ OPEN` is refused, which is what makes a host key unnecessary (§5).

### Still to do

- **The stale-round guard in `/mark`** — deliberately unwritten, marked in
  place. The bug is live and reproducible: POST a `/mark` with an old `round`
  while a newer round is open and it lands on the fresh card.
- The anonymized feed is written server-side but not yet rendered (step 10).
- Square heat layer (step 11).
- **Write the square pool.** Keep each square under ~60 characters; measured
  on a 375px phone, longer text clips inside a cell.

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
