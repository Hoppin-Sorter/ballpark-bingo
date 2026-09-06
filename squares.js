'use strict';

/**
 * The square pool (spec §8).
 *
 * Rules these were written against:
 *
 * - **Observable from a seat.** If confirming it needs a replay or a stat line,
 *   it is a bad square. Nothing here requires knowing an ERA or a launch angle,
 *   and nothing requires baseball literacy — you watch it happen, you do not
 *   have to know what it is called.
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
 * Two sets need checking before first pitch:
 *
 * - **Citi Field specifics** — the Home Run Apple, the 7 Line Army, Mr. Met,
 *   planes out of LaGuardia. Traditions move around, and a square nobody can
 *   ever hit is worse than no square at all.
 * - **The Chris squares** are one-off, written for his 36th, and assume he is
 *   at the game. If he is not, pull them; otherwise a handful of cards carry a
 *   dead square all afternoon. Deliberately kept to a light layer — personal
 *   squares only fire when the table is being itself, and the baseball has to
 *   carry the round when it is not.
 */

// ~15 near-certainties: most innings will produce these.
const CERTAIN = [
  'Strikeout swinging',
  'Walk',
  'Pitching change',
  'Foul ball lands in the stands',
  'A full count',
  'Vendor yells within earshot',
  'Someone near you checks their phone mid-pitch',
  'A plane out of LaGuardia crosses overhead',
  'Kid on the jumbotron',
  'Someone in your row leaves for food',
  'Mets jersey with a name no longer on the roster',
  'Batter steps out and resets his gloves',
  'Catcher goes out to the mound',
  'Someone in your row wishes Chris a happy birthday',
  'A dad explains a rule to a bored kid',
];

// ~30 medium: plausible in any inning, not guaranteed. The bulk of the pool.
const MEDIUM = [
  'Home run',
  'Double',
  'Stolen base attempt',
  'Double play turned',
  'Manager comes out to argue',
  'Diving catch in the outfield',
  'Batter fouls one off his own foot',
  'Runner thrown out at home',
  'Someone spills a full beer',
  'A chant starts and dies within five seconds',
  'The Home Run Apple goes up',
  'Mr. Met turns up somewhere in the park',
  'The 7 Line Army makes itself heard',
  'Somebody in Giants orange gets heckled',
  'Beach ball loose in the stands',
  'Broken bat',
  'Ball played off the outfield wall',
  'Umpire dusts off the plate',
  'Sunscreen gets passed down your row',
  'Someone films an entire pitch on their phone',
  'A kid in your section falls asleep',
  'Outfielder loses one in the sun',
  'Someone arrives late and blocks the row',
  'Chris calls the artist on the PA before the chorus',
  'Someone names the PA artist and gets it wrong',
  'Happy Birthday gets sung and dies halfway through',
  'Somebody tells Chris he looks good for 36',
  'A walk-up song nobody in your row recognises',
  'Two people disagree about who is on this track',
  'Someone in a Yankees hat',
  'A glove two decks from any possible foul ball',
  'Two people wearing the same jersey number',
  'Somebody asleep in direct sunlight',
  // Needs a second person to sign off, so it cannot be claimed solo.
  'Spot a celebrity look-alike and get someone to agree',
];

// ~10 rare: one per card that nobody expects to hit. This is where the fun is.
const RARE = [
  'Triple',
  'Ejection',
  'Fan interference on a live ball',
  'Bare-handed foul ball catch',
  'Anything inside-the-park',
  'Grand slam',
  'Replay review overturns the call',
  'Foul ball lands in somebody\'s beer',
  'Back-to-back home runs',
  'Chris ends up on the jumbotron',
  'Someone proposes in the stands',
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
