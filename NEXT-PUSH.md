# Next push — read before you deploy

## The one rule that matters on game day

**Every push to `main` auto-deploys, and every deploy wipes all in-memory state.**
Players, cards, marks, accusations and the day's win tally all reset. There is no
database and no undo.

That is fine on Saturday and fatal on Sunday.

**You no longer need a push to reset.** There is a Reset control at the very bottom of
the page, below the feed — type `reset` to confirm. It removes every player, clears the
scores and the feed, and puts the game back to inning 0. Every phone notices within one
3-second poll and drops to the join screen by itself. Use it to clear out test players
before first pitch. If the app is ever wedged badly enough that the button cannot help,
Railway's Restart button does the same thing with no push and no code change.

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

## Nothing is unwritten now

The stale-round guard is in, in both `/mark` and `/accuse`. A write carrying a
round number that is not the live one is refused with a 409, and the client's
optimistic mark reverts on the spot. The phase gate alone did not cover this:
after a rollover the new inning is OPEN too, so a late tap sailed straight
through it onto a fresh card.

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
