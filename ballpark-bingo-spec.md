# Ballpark Bingo — v1 Spec (rev 6)
**Target:** Giants at Mets, Citi Field, Sunday Sept 6, 1:40 PM
**Build window:** ~2 days, solo

**Changes from rev 5:** Round controls moved onto the main page for everyone, no separate host page or key. Start Next Inning is guarded by phase instead.

**Changes from rev 4:** A correct accusation no longer wins the round. Accusation is now purely a sabotage mechanic — guess right and the target's card wipes, guess wrong and yours does. Bingo is the only win condition and the only thing that ends a round.

---

## 1. What it is

A live multiplayer bingo game played by people sitting in a ballpark together. Players scan a QR code, enter a name, and get a randomly generated 5×5 card of observable game-day events.

One way to win, one way to interfere:

- **Fill five in a row.** Bingo is the only win condition, and it ends the round on the spot.
- **Call the leader.** Correctly name whoever is furthest along and their card wipes to a fresh one. You win nothing directly — you've just knocked the frontrunner back to zero and bought yourself room. Guess wrong and your own card wipes instead.

The tension is that racing to bingo makes you conspicuous, and being conspicuous gets you knocked down.

---

## 2. Round structure

**One round per inning. It ends the moment somebody hits bingo.**

```
Someone presses "Start Next Inning"
  → fresh cards dealt to everyone
  → OPEN: mark squares, accuse at will
      (accusations reset cards; they never end the round)
  → someone hits bingo
  → RESOLVED: winner announced, round over
  → hang out, drink beer, argue
  → Someone presses "Start Next Inning"
```

**Round outcomes:**
- First bingo → **that player wins the round**
- Inning ends with no bingo → **push**, someone rolls to the next one

No timers anywhere. Rounds end when someone earns it.

---

## 3. The accusation mechanic

**One accusation per player per round, available any time during OPEN play.** You pick a name and submit. It resolves instantly against the server's current state.

**Target definition: who has the most squares marked right now.** If several players are tied at the top, naming any of them counts as correct — be generous here, ties are frequent and losing on a technicality is infuriating.

| Outcome | Effect |
|---|---|
| **Correct** | **Their** card resets to a fresh one. You win nothing directly. |
| **Wrong** | **Your** card resets to a fresh one. |

Either way the accusation is spent and the round rolls on. This is sabotage, not a second win condition — you call out the leader to knock them back so *you* have room to reach bingo first.

The reset genuinely bites here. A round can run ten minutes, so losing your board is a real setback for whoever eats it.

A useful side effect of the anonymized feed: when your card suddenly wipes, you know exactly what happened and nobody else does. The room sees "Rania accused someone and got it right" and has to work out who went quiet.

### The feed is anonymized on the target

> **"Ethan accused someone and got it wrong."**
> **"Rania accused someone and got it right!"**

Accuser named, target never named. A named target would clear that person for the whole room for free — one player spends their shot and everybody benefits. Anonymized, a miss tells you only that a shot was fired, and the accuser is the only one who learns anything.

### What players actually have to go on

This is the design's load-bearing question. Exact per-player mark counts would make accusing trivial — you'd just read a leaderboard. Nothing at all makes it a coin flip.

**Proposal: a fuzzy heat badge per player.** The player list shows each person as one of four bands, no numbers:

| Badge | Marks |
|---|---|
| Cold | 0–4 |
| Warm | 5–9 |
| Hot | 10–14 |
| Blazing | 15+ |

Three people show Blazing; only one of them is actually leading. You break the tie by watching who's tapping, who went quiet, who's suddenly very interested in their phone. That's the Clue read, and the badges give it something to work from.

*(This banding is my suggestion, not from your notes — swap or drop it if you'd rather people fly blind.)*

### Rules that need to be explicit

| Case | Ruling |
|---|---|
| Can you accuse yourself? | No. |
| Can you accuse before anyone has marks? | Technically yes. It's a wasted shot; self-regulating. |
| Can a reset player still accuse? | Their shot is already spent — no. |
| Can a reset player still win by bingo? | Yes, if they can rebuild in time. |
| Two players tied for the lead? | Naming either is correct. |
| Accusation lands the instant someone bingos? | Bingo ends the round first. Server resolves in arrival order and rejects the late accusation on phase. |
| Can you accuse someone whose card just got wiped? | Yes, but they're almost certainly not the leader anymore. Wasted shot. |

---

## 4. Live re-sync — the part you want to practice

**"Live re-sync" is not a transport problem.** It's server-authoritative state, versioning, and client reconciliation. Learn it over plain HTTP polling — more robust in a stadium than WebSockets, and every lesson transfers. If you want socket practice, build it on top of a working polling version, never as the only path.

### The pattern

**Server is authoritative.** Clients never compute game truth — not bingo detection, not who's leading, not accusation outcomes. A client that can decide it won is a client that can be lied to.

**Monotonic version counter.** Every mutation increments `state.version`.

```
GET /state/:playerId?since=N
  → state.version <= N: { version: N, changed: false }
  → else: full snapshot { version, round, phase, card, marks, heat, players, feed }
```

Snapshots, not diffs. Diffs are premature at this size and they're where sync bugs live.

**Optimistic local marks.** Tap paints immediately, then POSTs. If the next snapshot disagrees, the server wins and the UI corrects. Watching your own tap get reverted is exactly the lesson you're after.

### The race condition that matters

**Stale-round writes.** A player taps as the round rolls over, and the mark arrives for a card that no longer exists. Every `/mark` and `/accuse` carries the client's `round`; the server rejects any mismatch.

Three lines of code, and it's the same shape as every optimistic-write and stale-write bug you'll hit for the rest of your career. Test it deliberately: have someone hold their thumb on a square while you press Start Next Inning, and confirm the mark bounces and their UI corrects itself.

**Secondary:** two accusations landing in the same tick. Resolve them strictly in arrival order against the state as it stands when each arrives. If the first one is correct and ends the round, the second must be rejected on phase, not silently accepted.

### Poll cadence
3 seconds throughout. No window means no moment that needs sub-second precision.

---

## 5. Round control

No separate host page and no key. Two buttons live at the bottom of the main page, visible to everyone:

- **Start Next Inning** — deals fresh cards, opens the round, bumps the version
- **Force Resolve** — ends a stuck round, the escape hatch

Small group, everyone on one screen, scroll down and press. Anyone can roll the round; that's fine and it means you're not the single point of failure when you're in the beer line.

**Two guards worth the ten minutes:**

- **Disable Start Next Inning while `phase === OPEN`.** It should only light up in IDLE or RESOLVED. Otherwise one mis-scroll mid-round wipes everybody's card and there's no undo. This is the whole reason a key isn't needed — the state machine does the protecting.
- **Confirm step on Force Resolve.** It's the destructive one and it stays live during OPEN by definition.

Don't wire up a live MLB API for inning tracking. It's a dependency, a rate limit, and a failure mode you'd be debugging in Section 130 instead of watching the game.

---

## 6. Technical spec

### Stack
- **Server:** Node + Express, single process, in-memory state
- **Client:** Plain HTML/CSS/JS, no build step
- **Host:** Railway or Fly.io — **not a free tier that spins down.** A 50-second cold start mid-round will kill you. Pay the ~$7.
- **No database.** Optional JSON dump every 30s so a crash isn't fatal.

### Data model

```
Game {
  version: int,
  round: int,                  // = inning number
  phase: "IDLE" | "OPEN" | "RESOLVED",
  squarePool: [ {id, text} ],
  players: { playerId: Player },
  feed: [ {round, text, ts} ]  // anonymized accusation results, round outcomes
}

Player {
  id: uuid,
  name: string,
  card: [24 squareIds],        // free space implied at center
  marks: [24 bools],
  accusationUsed: bool,
  roundWins: int
}
```

`roundWins` is the only field persisting across rounds. Everything else is wiped each inning.

`phase` drives the entire client UI. Get it right and the frontend is nearly declarative.

### Endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/join` | `{name}` → `{playerId, snapshot}` |
| GET | `/state/:playerId?since=N` | Versioned snapshot |
| POST | `/mark` | `{playerId, index, value, round}` — rejects stale round |
| POST | `/accuse` | `{playerId, targetId, round}` — rejects if phase ≠ OPEN or round stale |
| POST | `/next-inning` | Deals cards, opens round — **rejects if phase is OPEN** |
| POST | `/force-resolve` | Escape hatch |

### Heat layer math
Square heat denominator is *players holding that square on their card*, not total players — otherwise rare squares read artificially cold. Background opacity, capped so a fully-hot square stays legible under an X.

Note this is separate from the per-player heat badges in Section 3. Square heat is about the room's progress; player badges are about individuals.

### Client requirements
- **Persist `playerId` in localStorage.** Phones reload constantly. Losing a card mid-round puts someone out.
- Thumb-tappable one-handed. Big targets, beer in the other hand.
- Visible sync state, so offline reads as offline rather than broken.
- Accusation needs a confirm step. Nobody should burn their one shot on a mis-tap.
- Feed at the bottom, anonymized on target.
- Round-end screen should be loud and obvious — it's the cue to put the phone down and talk.

---

## 7. Build order

**Friday night**
1. Express server, state object, versioning, `/join` and `/state`
2. Card generation + bingo detection
3. **Deploy to Railway. Load the public URL on your phone with wifi off.**

Deploy on night one. Connectivity and host behavior are where two-day projects die.

**Saturday morning**
4. Client grid, optimistic marking, poll loop
5. Phase machine: IDLE → OPEN → RESOLVED
6. Round rollover + stale-round guard
7. Round-control buttons at page bottom, with the OPEN-phase guard

**Saturday afternoon**
8. Accusation flow: resolve server-side, wipe the target on a hit, the accuser on a miss
9. Player list with fuzzy heat badges
10. Anonymized feed
11. Square heat layer
12. localStorage persistence

**Saturday night**
13. Write the square pool — 45–60 squares
14. **Live test with 2–3 people on separate phones over cellular.** Not your wifi. Fire a mark during a rollover and confirm it bounces cleanly.

**Sunday morning**
15. QR generated, screenshotted, AirDropped to the gang
16. Someone who isn't you joins cold with no instructions

### Cut lines if you're behind
Drop in this order: square heat layer → anonymized feed → heat badges → accusations entirely (leaving plain first-to-bingo). **Never drop** localStorage persistence or the stale-round guard. The first breaks the game for anyone who reloads; the second produces bugs you can't diagnose in the stands.

Rev 4 is meaningfully less work than rev 3 — no window, no countdown, no clock enforcement. You should have slack now.

---

## 8. Square content

45–60 squares minimum so cards differentiate across nine rounds.

- **Difficulty mix:** ~15 near-certainties, ~30 medium, ~10 rare
- **Observable from a seat.** If confirming it needs a replay or a stat line, it's a bad square.
- **Mix on-field baseball with petty crowd observation.** The petty ones carry the humor; the baseball ones make it feel like a baseball game.
- Rare squares are where the fun lives — one per card nobody expects to hit beats ten obvious ones.
- **Rounds end early now.** A bingo closes the inning, so cards get consumed fast. Lean harder than feels right, or round one is over in four minutes.

Write these Saturday night when the build is done and you're loose. It's the only part that can't be rushed Sunday morning.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Stadium connectivity | Polling + localStorage makes brief outages invisible |
| Host sleeps between scans | Paid tier, no spin-down |
| Rounds end too fast, game feels thin | Harder square mix; tune the pool between innings. Accusations now extend rounds rather than ending them, which helps. |
| Nobody ever accuses because it feels risky | Watch for this. The penalty is symmetric now, so a coin-flip guess is strictly bad and people may just sit on their shot. If round 3 has zero accusations, wipe only half the accuser's marks on a miss. |
| Heat badges make accusing too easy | Widen the bands, or drop badges entirely |
| You're in the beer line when a round ends | Anyone can press Start Next Inning |
| Your phone dies hosting the QR | Screenshot, AirDrop pregame, also text the URL |
| Someone fat-fingers Start Next Inning mid-round | Button is disabled while phase is OPEN |
| Ambiguous square starts an argument | Feature |
