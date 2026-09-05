# Design brief — Ballpark Bingo

A live multiplayer bingo game played by a group sitting together at a ballgame.
Everyone is on a phone, outdoors, in daylight, one-handed, holding a beer.

**Read this before changing the front end.**

## What you can and cannot touch

| File | Status |
|---|---|
| `public/styles.css` | **Yours.** All presentation. |
| `public/index.html` | **Yours,** but keep every `id` — `app.js` binds to them. |
| `public/app.js` | Logic. Change rendering only if you know what you're doing; it holds the optimistic-marking and polling behaviour. No colours belong here. |
| `server.js`, `bingo.js`, `squares.js` | **Do not touch.** Game rules and the state machine. |

The client polls `GET /state/:playerId?since=N` every 3 seconds and re-renders from
a full snapshot. Never compute game truth in the browser — the server is
authoritative for marks, bingo, accusations and who is winning.

## Running it

```bash
npm install && npm start
```

Then open `http://localhost:3000`. No build step. Edit a file, reload.

To see anything interesting you need two players: open a second browser profile, or
`curl -X POST localhost:3000/join -H 'content-type: application/json' -d '{"name":"Test"}'`,
then `curl -X POST localhost:3000/next-inning` to open a round.

## Tokens

Every colour, radius and spacing is a custom property in the `:root` block at the top
of `styles.css`. **Nothing below that block should contain a raw hex value.** Re-theming
the entire app should be an edit to that one block.

| Group | Tokens |
|---|---|
| Brand | `--mets-blue`, `--mets-blue-deep`, `--mets-orange` |
| Surfaces | `--bg`, `--surface`, `--surface-sunk`, `--border`, `--border-strong` |
| Text | `--text`, `--text-dim`, `--text-invert` |
| Tiles | `--tile-bg`, `--tile-border`, `--tile-text`, `--tile-marked-bg`, `--tile-marked-text`, `--tile-marked-pip`, `--tile-free-bg`, `--tile-free-text`, `--tile-pending-border`, `--tile-win-ring`, `--tile-revert-ring` |
| Room bands | `--room-{quiet,warming,close,oneaway}-{bg,border}` |
| Feedback | `--ok`, `--danger`, `--warn` and their `-bg` / `-border` pairs |
| Geometry | `--radius`, `--radius-sm`, `--radius-pill`, `--gap`, `--tap`, `--pad` |

## States that must survive a re-skin

Every one of these is reachable in play. If a redesign makes any of them
indistinguishable from another, the game breaks.

**Screens** — `#join` → `#rules` → `#game`. Rules appear once after joining and reopen
from the header button. A reload with a stored `playerId` goes straight to the game.

**Phase** (`#banner`, and `#grid` gets `.locked` / `.dim`)

When no inning is open the grid is `pointer-events: none`. The banner must therefore
carry a `#bannerStart` button and the card must say it is locked — without both,
players tap a dead card and conclude the app is broken. Do not remove either.
- `IDLE` — no inning open, grid dimmed and inert
- `OPEN` — banner hidden so the card gets the whole screen
- `RESOLVED` — deliberately loud. This is the cue to put the phone down and talk.
  `.resolved.mine` is the you-won variant.

**Tile** (`.sq`)
- default — unmarked
- `.on` — marked. **Must be an opaque fill.** This is what guarantees the room band
  can never wash out a square the player selected.
- `.pending` — tapped but not yet confirmed by the server
- `.win` — part of the winning line, shown only to the winner
- `.free` — the centre square, never tappable
- `.reverted` — brief flash when the server overrules a tap. Must be noticeable;
  watching your own tap bounce is how players learn the server decides.

**Room proximity** (`#card` gets `WARMING` / `CLOSE` / `ONE_AWAY`, or no class for quiet)

How close the nearest *other* player is to a bingo. It must **never** identify who —
that is the whole design. Render it on the card frame, never on tiles.

**Connection** (`#conn`) — `.live` / `.syncing` / `.down`. Offline has to read as
offline rather than broken; stadium wifi drops constantly.

**Accusation** — button reads `Call the leader` → `Never mind` → `Accusation spent`.
`.accuseRow.armed` is the two-tap confirm. `#accuseResult` has `.hit`, `.miss`,
`.wiped`. Players show `.wins` and `.spent`; **there is deliberately no per-player
heat indicator anywhere** — the server does not send one.

**Feed** (`.fe` with `.open`, `.hit`, `.miss`, `.bingo`, `.push`) — newest first.

## Hard constraints

- **Tap targets ≥ 44px.** Tiles are currently 63px at 375px wide; `--tap` is the floor
  for buttons. One-handed use with a drink in the other hand.
- **Contrast ≥ 4.5:1** for every label against its actual painted background,
  including a marked tile and anything layered over it. This is not decorative —
  the game is played in direct afternoon sun. An earlier dark theme failed here at
  4.26:1 and had to be rebuilt.
- **No horizontal scroll at 375px.**
- **Square text can reach ~65 characters.** Verified to fit at the smallest font step;
  `fontFor()` in `app.js` steps the size down by length.
- **Nothing may reveal how far along an individual player is.** Not in the UI, not in
  a tooltip, not in the DOM.

## Verifying a change

Check every tile state and every phase at 375px, confirm contrast on the marked tile
while the card is in `ONE_AWAY`, and run one full loop: join → rules → start inning →
mark → accuse → bingo → next inning.
