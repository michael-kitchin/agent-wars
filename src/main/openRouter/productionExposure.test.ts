/**
 * Exposure of a seat's cities to active enemies.
 * Run with: node dist/main/openRouter/productionExposure.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../gameDb';
import { listExposedCityHexes } from './productionExposure';

/**
 * Chebyshev distance on `x:y` labels.
 *
 * Purpose: The exposure cases do not need a real H3 grid.
 * When to use: The cases in this file.
 * Expected outcome: The larger axis gap. A label that is not two numbers yields NaN.
 * Exceptions: None.
 */
const hop = (a: string, b: string): number => {
  const [ax, ay] = a.split(':').map(Number);
  const [bx, by] = b.split(':').map(Number);
  return Math.max(Math.abs(ax! - bx!), Math.abs(ay! - by!));
};

/**
 * A snapshot with two live enemies, one knocked-out side, and three controlled cells.
 *
 * Purpose: The cases vary only the intel row.
 * When to use: Both exposure cases.
 * Expected outcome: `a1` holds `0:0`, `9:9`, and a non-city at `1:1`.
 * Exceptions: None.
 */
function exposureState(includeIntel: boolean): GameStateSnapshot {
  return {
    seats: [
      { seatId: 'a1', outTurn: null },
      { seatId: 'a2', outTurn: null },
      { seatId: 'a3', outTurn: 5 },
    ],
    units: [
      { player: 'a2', h3Index: '3:0' },
      { player: 'a3', h3Index: '9:7' },
      { player: 'neutral', h3Index: '9:8' },
    ],
    enemyIntel: includeIntel ? [{ player: 'a2', lastKnownH3Index: '8:9' }] : [],
    strategicInfrastructure: [
      { h3Index: '0:0', urbanHexCount: 5 },
      { h3Index: '9:9', urbanHexCount: 5 },
      { h3Index: '1:1', urbanHexCount: 0 },
    ],
    strategicControl: [
      { h3Index: '0:0', controllerPlayerId: 'a1' },
      { h3Index: '9:9', controllerPlayerId: 'a1' },
      { h3Index: '1:1', controllerPlayerId: 'a1' },
    ],
  } as unknown as GameStateSnapshot;
}

test('a city is exposed by a live enemy unit or by intel, and not by a knocked-out or neutral unit', () => {
  const exposed = listExposedCityHexes(exposureState(true), 'a1', hop);
  assert.deepEqual([...exposed].sort(), ['0:0', '9:9']);
  const withoutIntel = listExposedCityHexes(exposureState(false), 'a1', hop);
  assert.deepEqual([...withoutIntel], ['0:0']);
});
