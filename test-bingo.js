'use strict';

const assert = require('node:assert/strict');
const { LINES, findBingo, dealCard, freshMarks, CARD_SIZE, cellOfCardIndex } = require('./bingo');
const SQUARE_POOL = require('./squares');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

console.log('bingo geometry');

test('there are 12 winning lines', () => {
  assert.equal(LINES.length, 12);
});

test('lines through the center need only 4 marks', () => {
  const throughCenter = LINES.filter((l) => l.length === 4);
  assert.equal(throughCenter.length, 4, 'middle row, middle column, both diagonals');
  assert.equal(LINES.filter((l) => l.length === 5).length, 8);
});

test('every card index appears in at least one line', () => {
  const seen = new Set(LINES.flat());
  for (let i = 0; i < CARD_SIZE; i++) assert.ok(seen.has(i), `index ${i} unreachable`);
});

test('card indices skip the free center cell', () => {
  const cells = Array.from({ length: CARD_SIZE }, (_, i) => cellOfCardIndex(i));
  assert.ok(!cells.includes(12), 'no card index maps onto the free space');
  assert.equal(new Set(cells).size, CARD_SIZE, 'mapping is one-to-one');
});

console.log('bingo detection');

test('an empty card is not a bingo', () => {
  assert.equal(findBingo(freshMarks()), null);
});

test('each of the 12 lines is detected', () => {
  LINES.forEach((line, n) => {
    const marks = freshMarks();
    line.forEach((i) => (marks[i] = true));
    assert.notEqual(findBingo(marks), null, `line ${n} not detected`);
  });
});

test('four of a five-square line is not a bingo', () => {
  const fiveLong = LINES.find((l) => l.length === 5);
  const marks = freshMarks();
  fiveLong.slice(0, 4).forEach((i) => (marks[i] = true));
  assert.equal(findBingo(marks), null);
});

test('three of a center line is not a bingo', () => {
  const centerLine = LINES.find((l) => l.length === 4);
  const marks = freshMarks();
  centerLine.slice(0, 3).forEach((i) => (marks[i] = true));
  assert.equal(findBingo(marks), null);
});

test('a fully marked card is a bingo', () => {
  assert.notEqual(findBingo(new Array(CARD_SIZE).fill(true)), null);
});

console.log('card generation');

test('a card is 24 distinct squares from the pool', () => {
  const card = dealCard(SQUARE_POOL);
  assert.equal(card.length, CARD_SIZE);
  assert.equal(new Set(card).size, CARD_SIZE, 'no duplicate squares on one card');
  const poolIds = new Set(SQUARE_POOL.map((s) => s.id));
  card.forEach((id) => assert.ok(poolIds.has(id), `${id} is not in the pool`));
});

test('two cards are not identical', () => {
  const a = dealCard(SQUARE_POOL).join(',');
  const b = dealCard(SQUARE_POOL).join(',');
  assert.notEqual(a, b);
});

test('a pool smaller than 24 throws instead of dealing a short card', () => {
  assert.throws(() => dealCard(SQUARE_POOL.slice(0, 10)), /need at least 24/);
});

console.log(`\n${passed} passed`);
