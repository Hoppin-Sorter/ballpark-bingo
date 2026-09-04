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

**Live:** https://ballpark-bingo-production.up.railway.app

Railway deploys from `main` on every push. It auto-detects Node and runs
`npm start`; the server reads `process.env.PORT` and binds `0.0.0.0`.

State is in memory, so **every deploy wipes all players, cards and scores.**
That is fine on Saturday and fatal on Sunday.

- **Freeze pushes to `main` once it works Saturday night.** A push mid-game
  resets everyone's card with no undo.
- Do not use a tier that spins down. A 50-second cold start mid-inning kills
  the game (spec §9).
