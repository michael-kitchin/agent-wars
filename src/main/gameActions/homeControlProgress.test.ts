/**
 * Contract tests for home-region control progress.
 * Run: `npm run build:main` then `node dist/main/gameActions/homeControlProgress.test.js`
 */

import { type SeatId } from '../../shared/seatIds';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeHomeControlProgress, computeHomeLossProgress } from './homeControlProgress';

/**
 * Builds a control map from the hexes one side holds.
 *
 * Purpose: The progress function only treats an exact controller match as held.
 * When to use: Each case below.
 * Expected outcome: Held hexes map to the controller. Other hexes are absent.
 * Exceptions: None.
 */
function controlOf(controller: SeatId, held: readonly string[]): Map<string, string> {
  return new Map(held.map((hex) => [hex, controller]));
}

const URBAN = new Map([
  ['A', 60],
  ['B', 30],
  ['C', 10],
]);

test('the every-hex rule needs every home hex', () => {
  const homes = ['A', 'B'];
  const held = computeHomeControlProgress({
    homeHexes: homes,
    controller: 'human',
    controlByHex: controlOf('human', homes),
    baselineUrbanCellsForHex: (hex) => URBAN.get(hex) ?? 0,
    minUrbanShare: null,
  });
  assert.equal(held.controlWinMet, true);
  assert.equal(held.neededUrbanCells, 0);
  const missing = computeHomeControlProgress({
    homeHexes: homes,
    controller: 'human',
    controlByHex: controlOf('human', ['A']),
    baselineUrbanCellsForHex: (hex) => URBAN.get(hex) ?? 0,
    minUrbanShare: null,
  });
  assert.equal(missing.controlWinMet, false);
});

test('a 75 percent share is met by the hexes that hold enough urban cells', () => {
  const homes = ['A', 'B', 'C'];
  const progress = (held: readonly string[]) =>
    computeHomeControlProgress({
      homeHexes: homes,
      controller: 'human',
      controlByHex: controlOf('human', held),
      baselineUrbanCellsForHex: (hex) => URBAN.get(hex) ?? 0,
      minUrbanShare: 0.75,
    });
  assert.equal(progress(['A', 'B']).controlWinMet, true);
  assert.equal(progress(['A', 'B']).neededUrbanCells, 75);
  assert.equal(progress(['A', 'C']).controlWinMet, false);
  assert.equal(progress(['B', 'C']).controlWinMet, false);
});

test('a home with no generated urban cells falls back to every hex', () => {
  const met = computeHomeControlProgress({
    homeHexes: ['A', 'B'],
    controller: 'opponent',
    controlByHex: controlOf('opponent', ['A', 'B']),
    baselineUrbanCellsForHex: () => 0,
    minUrbanShare: 0.75,
  });
  assert.equal(met.totalUrbanCells, 0);
  assert.equal(met.controlWinMet, true);
  const missing = computeHomeControlProgress({
    homeHexes: ['A', 'B'],
    controller: 'opponent',
    controlByHex: controlOf('opponent', ['A']),
    baselineUrbanCellsForHex: () => 0,
    minUrbanShare: 0.75,
  });
  assert.equal(missing.controlWinMet, false);
});

test('holding exactly the threshold meets the share', () => {
  const progress = computeHomeControlProgress({
    homeHexes: ['A', 'B'],
    controller: 'human',
    controlByHex: controlOf('human', ['A']),
    baselineUrbanCellsForHex: (hex) => (hex === 'A' ? 75 : 25),
    minUrbanShare: 0.75,
  });
  assert.equal(progress.neededUrbanCells, 75);
  assert.equal(progress.heldUrbanCells, 75);
  assert.equal(progress.controlWinMet, true);
});

const LOSS_URBAN = new Map([
  ['h1', 10],
  ['h2', 5],
  ['h3', 0],
]);

/**
 * Computes the loss progress of owner `a1`'s three-hex home for a given control map and share.
 *
 * Purpose: Every loss case shares the same home and baseline.
 * When to use: Each loss case below.
 * Expected outcome: The `HomeLossProgress` for the arguments.
 * Exceptions: None.
 */
function lossFor(control: Map<string, string>, share: number | null) {
  return computeHomeLossProgress({
    homeHexes: ['h1', 'h2', 'h3'],
    ownerSeatId: 'a1',
    controlByHex: control,
    baselineUrbanCellsForHex: (hex) => LOSS_URBAN.get(hex) ?? 0,
    minUrbanShare: share,
  });
}

test('cells held by other seats or Neutral are lost, and the home is lost at 90 percent', () => {
  const loss = lossFor(
    new Map([
      ['h1', 'a2'],
      ['h2', 'neutral'],
      ['h3', 'a1'],
    ]),
    0.9
  );
  assert.equal(loss.lostUrbanCells, 15);
  assert.equal(loss.neededUrbanCells, 14);
  assert.equal(loss.lostHexes, 2);
  assert.equal(loss.totalHexes, 3);
  assert.equal(loss.everyHexRule, false);
  assert.equal(loss.homeLost, true);
});

test('hexes with no controller or held by the owner are not lost', () => {
  const uncontrolled = lossFor(
    new Map([
      ['h1', 'a2'],
      ['h3', 'a1'],
    ]),
    0.9
  );
  assert.equal(uncontrolled.lostUrbanCells, 10);
  assert.equal(uncontrolled.homeLost, false);
  const ownerHeld = lossFor(
    new Map([
      ['h1', 'a2'],
      ['h2', 'a1'],
      ['h3', 'a1'],
    ]),
    0.9
  );
  assert.equal(ownerHeld.homeLost, false);
});

test('without a share, the home is lost only when every hex is held by others', () => {
  const partial = lossFor(
    new Map([
      ['h1', 'a2'],
      ['h2', 'neutral'],
    ]),
    null
  );
  assert.equal(partial.everyHexRule, true);
  assert.equal(partial.neededUrbanCells, 0);
  assert.equal(partial.homeLost, false);
  const all = lossFor(
    new Map([
      ['h1', 'a2'],
      ['h2', 'neutral'],
      ['h3', 'a3'],
    ]),
    null
  );
  assert.equal(all.homeLost, true);
});

test('a home with no original urban cells uses the every-hex rule', () => {
  const loss = computeHomeLossProgress({
    homeHexes: ['h1', 'h2'],
    ownerSeatId: 'a1',
    controlByHex: new Map([['h1', 'a2']]),
    baselineUrbanCellsForHex: () => 0,
    minUrbanShare: 0.9,
  });
  assert.equal(loss.everyHexRule, true);
  assert.equal(loss.homeLost, false);
});

test('the needed cells round up from the share', () => {
  const loss = computeHomeLossProgress({
    homeHexes: ['h1'],
    ownerSeatId: 'a1',
    controlByHex: new Map([['h1', 'a2']]),
    baselineUrbanCellsForHex: () => 10,
    minUrbanShare: 0.9,
  });
  assert.equal(loss.neededUrbanCells, 9);
});

test('an empty home has no loss and is not lost', () => {
  const loss = lossFor(new Map(), 0.9);
  const empty = computeHomeLossProgress({
    homeHexes: [],
    ownerSeatId: 'a1',
    controlByHex: new Map(),
    baselineUrbanCellsForHex: () => 5,
    minUrbanShare: 0.9,
  });
  assert.equal(loss.homeLost, false);
  assert.deepEqual(
    [empty.lostUrbanCells, empty.totalUrbanCells, empty.neededUrbanCells, empty.lostHexes, empty.totalHexes, empty.homeLost],
    [0, 0, 0, 0, 0, false]
  );
});
