'use strict';

/**
 * The square pool (spec §8).
 *
 * Rules these were written against:
 *
 * - **Observable from a seat.** If confirming it needs a replay or a stat line,
 *   it is a bad square. Nothing here requires knowing an ERA or a launch angle.
 * - **Nothing tied to a specific inning.** Cards are dealt fresh every inning,
 *   so "Lazy Mary in the eighth" or the seventh-inning stretch would be a dead
 *   square in eight rounds out of nine. Everything here can happen any inning.
 * - **Mix the on-field with the petty.** The baseball ones make it feel like a
 *   ballgame; the crowd ones carry the humour.
 * - **Lean hard.** A bingo closes the inning, so cards get consumed fast. If
 *   the mix feels slightly too difficult, it is about right.
 * - **Under ~65 characters.** Measured in the browser at 375px, where a tile is
 *   63px inside the card frame. Longer text clips.
 *
 * A handful are specific to Citi Field. Sanity-check them on the day — traditions
 * move around, and a square nobody can ever hit is worse than no square at all.
 */

// ~15 near-certainties: most innings will produce these.
const CERTAIN = [
  'Strikeout swinging',
  'Walk',
  'Pitching change',
  'Foul ball lands in the stands',
  'A full count',
  'Groundout to the left side',
  'Vendor yells within earshot',
  'Someone near you checks their phone mid-pitch',
  'A plane out of LaGuardia crosses overhead',
  'Kid on the jumbotron',
  'Someone in your row leaves for food',
  'Mets jersey with a name no longer on the roster',
  'Batter steps out and resets his gloves',
  'Catcher goes out to the mound',
];

// ~30 medium: plausible in any inning, not guaranteed. The bulk of the pool.
const MEDIUM = [
  'Home run',
  'Double',
  'Stolen base attempt',
  'Double play turned',
  'Wild pitch or passed ball',
  'Manager comes out to argue',
  'Diving catch in the outfield',
  'Batter fouls one off his own foot',
  'Pitcher shakes off the sign twice in one at-bat',
  'Infield visibly repositions for a hitter',
  'Runner thrown out at home',
  'Someone spills a full beer',
  'A chant starts and dies within five seconds',
  'Reliever warms up but never comes in',
  'The Home Run Apple goes up',
  'Mr. Met turns up somewhere in the park',
  'The 7 Line Army makes itself heard',
  'Somebody in Giants orange gets heckled',
  'Beach ball loose in the stands',
  'An at-bat runs eight pitches or more',
  'Broken bat',
  'Pop-up caught in the infield',
  'Pitcher covers first on a grounder',
  'Ball played off the outfield wall',
  'Umpire dusts off the plate',
  'Sunscreen gets passed down your row',
  'Someone films an entire pitch on their phone',
  'A kid in your section falls asleep',
  'Outfielder loses one in the sun',
  'Someone arrives late and blocks the row',
];

// ~10 rare: one per card that nobody expects to hit. This is where the fun is.
const RARE = [
  'Triple',
  'Balk called',
  'Ejection',
  'Fan interference on a live ball',
  'Bare-handed foul ball catch',
  'Anything inside-the-park',
  'Grand slam',
  'Replay review overturns the call',
  'Foul ball lands in somebody\'s beer',
  'Back-to-back home runs',
];

function tier(texts, difficulty, offset) {
  return texts.map((text, i) => ({ id: `s${offset + i}`, text, difficulty }));
}

const SQUARE_POOL = [
  ...tier(CERTAIN, 'certain', 0),
  ...tier(MEDIUM, 'medium', CERTAIN.length),
  ...tier(RARE, 'rare', CERTAIN.length + MEDIUM.length),
];

module.exports = SQUARE_POOL;
