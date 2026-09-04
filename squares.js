'use strict';

/**
 * STARTER POOL — replace/expand this Saturday night (spec §8).
 *
 * Spec targets 45-60 squares with a mix of roughly:
 *   ~15 near-certainties / ~30 medium / ~10 rare
 * This file is 32 squares: enough to deal cards and smoke-test, not enough
 * to differentiate cards across nine innings. The rare ones are where the
 * fun lives, so that's the tier to grow first.
 *
 * Rule of thumb from §8: if confirming it needs a replay or a stat line,
 * it's a bad square. Everything here should be callable from a seat.
 *
 * LENGTH LIMIT: keep text under ~60 characters. A grid cell is 67px on a
 * 375px phone, and measured on device, 60 chars is the last length that fits
 * without clipping. 83 overflows. The longest square here is 60.
 */

const CERTAIN = [
  'Strikeout swinging',
  'Walk',
  'Pitching change',
  'Foul ball lands in the stands',
  'A full count',
  'Groundout to the left side',
  'Ball hit to the warning track',
  'Kid on the jumbotron',
  'Vendor yells within earshot',
  'Someone near you checks their fantasy lineup',
  'Someone leaves for beer, returns after the inning ends',
  'Mets jersey with a name no longer on the roster',
];

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
  'Someone in your section starts a chant that dies immediately',
  'Someone spills a full beer',
  'Reliever warms up but never comes in',
];

const RARE = [
  'Triple',
  'Balk called',
  'Ejection',
  'Fan interference on a live ball',
  'Bare-handed foul ball catch',
  'Anything inside-the-park',
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
