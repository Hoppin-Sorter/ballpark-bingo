'use strict';

/**
 * Card geometry and bingo detection.
 *
 * A card is 24 square ids. The center of the 5x5 grid is a free space that
 * is never stored and always counts as marked, so card index != grid cell:
 *
 *   grid cells   0  1  2  3  4        card indices   0  1  2  3  4
 *                5  6  7  8  9                       5  6  7  8  9
 *               10 11 12 13 14                      10 11  *  12 13
 *               15 16 17 18 19                      14 15 16 17 18
 *               20 21 22 23 24                      19 20 21 22 23
 *
 * Everything below works in card-index space so callers never think about
 * the offset.
 */

const CARD_SIZE = 24;
const FREE_CELL = 12;

/** Grid cell -> card index. The free cell has no card index. */
function cardIndexOfCell(cell) {
  return cell < FREE_CELL ? cell : cell - 1;
}

/** Card index -> grid cell. Used by the client to lay the grid out. */
function cellOfCardIndex(index) {
  return index < FREE_CELL ? index : index + 1;
}

function buildGridLines() {
  const lines = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
}

/**
 * The 12 winning lines, expressed as card indices. Lines through the center
 * drop to four entries because the free space is always satisfied.
 */
const LINES = buildGridLines().map((line) =>
  line.filter((cell) => cell !== FREE_CELL).map(cardIndexOfCell)
);

/**
 * Returns the winning line (array of card indices) or null.
 * Server-authoritative: clients never call this to decide anything (§4).
 */
function findBingo(marks) {
  for (const line of LINES) {
    if (line.every((i) => marks[i])) return line;
  }
  return null;
}

/** 24 distinct square ids drawn uniformly from the pool. */
function dealCard(pool) {
  if (pool.length < CARD_SIZE) {
    throw new Error(`square pool has ${pool.length}, need at least ${CARD_SIZE}`);
  }
  const ids = pool.map((s) => s.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, CARD_SIZE);
}

function freshMarks() {
  return new Array(CARD_SIZE).fill(false);
}

module.exports = {
  CARD_SIZE,
  FREE_CELL,
  LINES,
  findBingo,
  dealCard,
  freshMarks,
  cellOfCardIndex,
  cardIndexOfCell,
};
