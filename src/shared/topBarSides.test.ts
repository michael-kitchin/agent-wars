import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiSeatIdForIndex, HUMAN_SEAT_ID } from './seatIds';
import { buildTopBarSideChips, type TopBarSideSeat } from './topBarSides';

const secondAi = aiSeatIdForIndex(2);
const seats: readonly TopBarSideSeat[] = [
  { seatId: HUMAN_SEAT_ID, seatOrder: 1, kind: 'human', homeRegion: 'Western Turkey', outTurn: null },
  { seatId: 'opponent', seatOrder: 2, kind: 'ai', homeRegion: 'Eastern Turkey', outTurn: null },
  { seatId: secondAi, seatOrder: 3, kind: 'ai', homeRegion: 'Levant & Cyprus', outTurn: null },
];

test('buildTopBarSideChips names the human seat and shortens the others', () => {
  const block = buildTopBarSideChips(seats, [
    { seatId: 'opponent', status: 'planning' },
    { seatId: secondAi, status: 'ready' },
  ], HUMAN_SEAT_ID);
  assert.equal(block.observing, false);
  assert.equal(block.lead?.label, 'Western Turkey');
  assert.equal(block.lead?.statusIcon, null);
  assert.deepEqual(block.chips.map((chip) => chip.label), ['E. Turkey', 'Levant']);
  assert.equal(block.chips[0]?.statusIcon, 'planning');
  assert.equal(block.chips[0]?.statusColor, '#F0B4C8');
  assert.equal(block.chips[1]?.statusIcon, 'ready');
  assert.equal(block.chips[1]?.statusColor, '#86EFAC');
});

test('buildTopBarSideChips draws no icon for no model, a timeout, or a knockout', () => {
  const knockedOut = seats.map((seat) => (seat.seatId === secondAi ? { ...seat, outTurn: 6 } : seat));
  const block = buildTopBarSideChips(knockedOut, [
    { seatId: 'opponent', status: 'no_model' },
    { seatId: secondAi, status: 'timed_out' },
  ], HUMAN_SEAT_ID);
  assert.equal(block.chips[0]?.statusIcon, null);
  assert.equal(block.chips[1]?.statusIcon, null);
  assert.equal(block.chips[1]?.outTurn, 6);
  assert.equal(block.chips[1]?.label, 'Levant');
});

test('buildTopBarSideChips lists every side while observing', () => {
  const block = buildTopBarSideChips(seats, [], null);
  assert.equal(block.observing, true);
  assert.equal(block.lead, null);
  assert.deepEqual(block.chips.map((chip) => chip.label), ['W. Turkey', 'E. Turkey', 'Levant']);
});
