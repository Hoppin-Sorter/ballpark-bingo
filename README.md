# Ballpark Bingo

Live multiplayer bingo for a group sitting at a ballpark together.
Design doc: [ballpark-bingo-spec.md](ballpark-bingo-spec.md) (rev 6).

## Run

```
npm install
npm start          # http://localhost:3000
npm test           # bingo geometry + card generation
```

## Built so far — spec §7 steps 1-3

| File | What |
|---|---|
| `server.js` | State object, version counter, `/join`, `/state/:playerId?since=N` |
| `bingo.js` | Card geometry, `findBingo`, `dealCard` |
| `squares.js` | Starter pool, 32 squares — **rewrite Saturday night (§8)** |
| `public/index.html` | Throwaway deploy smoke test — step 4 replaces it |

Not built yet: `/mark`, `/accuse`, `/next-inning`, `/force-resolve`, and the
real client. Phase stays `IDLE` until the round controls exist.

## Deploy

Railway auto-detects Node and runs `npm start`. The server reads `process.env.PORT`
and binds `0.0.0.0`.

**Do not use a free tier that spins down** — a 50-second cold start mid-round
kills the game (§9).

Freeze pushes to `main` on Sunday. Auto-deploy means a bad push takes the app
down mid-game.
