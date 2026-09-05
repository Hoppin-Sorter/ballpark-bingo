# Next push — read before you deploy

## The one rule that matters on game day

**Every push to `main` auto-deploys, and every deploy wipes all in-memory state.**
Players, cards, marks, accusations and the day's win tally all reset. There is no
database and no undo.

That is fine on Saturday and fatal on Sunday.

**Freeze `main` once it works Saturday night.** If something has to change during the
game, know that everyone will be dealt fresh cards and lose their scores the moment
you push. Usually the right answer mid-game is to leave it broken and fix it after.

## What went out in this push

- **The real square pool** — 54 squares, mixed 14 near-certain / 30 medium / 10 rare,
  matching §8. Nothing tied to a specific inning, since cards are dealt fresh every
  round and a seventh-inning-stretch square would be dead in eight rounds of nine.
  A few are Citi Field specific: the Home Run Apple, the 7 Line Army, Mr. Met, planes
  out of LaGuardia. **Sanity-check those on the day** — a square nobody can ever hit
  is worse than no square.
- **Rules page cut from seven items to four.** Bingo and how to win, the accusation,
  the fact that nobody's score is visible, and that anyone can start an inning.
  Everything else people work out by playing.

## Still unwritten

- **The stale-round guard**, marked in place in both `/mark` and `/accuse` in
  `server.js`. Same three lines in each. Compare the client's `round` to `game.round`
  and reject a mismatch. Reproduce it first: POST a `/mark` with an old `round` while
  a newer inning is open, and watch it land on the fresh card.

## Sunday morning checklist

1. Load the URL on your phone **with wifi off**, on cellular.
2. Have someone who has not seen it join cold and read the rules page — no coaching.
3. Screenshot the QR and AirDrop it round pregame. Also text the URL, in case a phone
   cannot scan.
4. Start inning 1 from the app, not from curl, and confirm everyone sees it.
5. **Then stop pushing.**

## Tuning levers, if the game feels off

| Symptom | Lever |
|---|---|
| Innings end in four minutes | Harder square mix — grow the rare tier in `squares.js` |
| Nobody ever accuses | §9's fix: wipe only half the accuser's marks on a miss |
| The card border sits on `ONE_AWAY` all round | Widen `ROOM_BANDS` in `server.js` |
| Accusing feels like a coin flip | It is meant to be a read of the room, not of a number — give it two innings before changing anything |

## Rollback

The last known-good commit before the redesign is `469b90b`. Deploying it is
`git revert` plus a push, which is itself a state wipe — so it is a between-innings
move, not a mid-inning one.
