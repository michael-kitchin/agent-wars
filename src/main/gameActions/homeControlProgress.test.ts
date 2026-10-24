/**
 * Contract tests for home-region control progress.
 * Run: `npm run build:main` then `node dist/main/gameActions/homeControlProgress.test.js`
 */

import { type SeatId } from '../../shared/seatIds';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeHomeControlProgress } from './homeControlProgress';

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
