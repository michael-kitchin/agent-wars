/**
 * A seat builds at home, on its units, and on a fortification.
 *
 * Purpose: The pause flag must not reveal another side's units.
 * When to use: After changing `isHexBuildableForSeat` or `withBuildPausedFlags`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from './ipc/gameStateTypes';
import { formatBuildPausedLine, isHexBuildableForSeat, withBuildPausedFlags } from './productionBuildability';

const empty = new Set<string>();

test('a hex is buildable at home, with a unit, or with a fortification', () => {
  assert.equal(isHexBuildableForSeat({ h3Index: 'home', homeHexes: new Set(['home']), seatUnitHexes: empty, fortifiedCount: 0 }), true);
  assert.equal(isHexBuildableForSeat({ h3Index: 'unit', homeHexes: empty, seatUnitHexes: new Set(['unit']), fortifiedCount: 0 }), true);
  assert.equal(isHexBuildableForSeat({ h3Index: 'fort', homeHexes: empty, seatUnitHexes: empty, fortifiedCount: 1 }), true);
  assert.equal(isHexBuildableForSeat({ h3Index: 'away', homeHexes: empty, seatUnitHexes: empty, fortifiedCount: 0 }), false);
});

test('paused flags mark only the viewer, and every seat when the viewer is absent', () => {
  const state = {
    units: [],
    hexes: [],
    homeRegionHexesBySeat: { human: ['home'], opponent: ['opp-home'] },
    strategicControl: [
      { h3Index: 'away', controllerPlayerId: 'human' },
      { h3Index: 'home', controllerPlayerId: 'human' },
      { h3Index: 'opp-away', controllerPlayerId: 'opponent' },
      { h3Index: 'neutral-hex', controllerPlayerId: 'neutral' },
    ],
    strategicInfrastructure: [],
    strategicBuildQueueTotals: [
      { h3Index: 'away', queuedUnits: 1, nextUnitType: 'infantry', nextRemainingCount: 1, storedPoints: 0 },
      { h3Index: 'home', queuedUnits: 1, nextUnitType: 'infantry', nextRemainingCount: 1, storedPoints: 0 },
      { h3Index: 'opp-away', queuedUnits: 1, nextUnitType: 'infantry', nextRemainingCount: 1, storedPoints: 0 },
      { h3Index: 'neutral-hex', queuedUnits: 1, nextUnitType: 'infantry', nextRemainingCount: 1, storedPoints: 0 },
    ],
  } as unknown as GameStateSnapshot;
  const humanView = withBuildPausedFlags(state, 'human');
  assert.equal(humanView.strategicBuildQueueTotals?.find((row) => row.h3Index === 'away')?.buildPaused, true);
  assert.equal(humanView.strategicBuildQueueTotals?.find((row) => row.h3Index === 'home')?.buildPaused, undefined);
  assert.equal(humanView.strategicBuildQueueTotals?.find((row) => row.h3Index === 'opp-away')?.buildPaused, undefined);
  assert.equal(humanView.strategicBuildQueueTotals?.find((row) => row.h3Index === 'neutral-hex')?.buildPaused, undefined);
  const allView = withBuildPausedFlags(state, null);
  assert.equal(allView.strategicBuildQueueTotals?.find((row) => row.h3Index === 'away')?.buildPaused, true);
  assert.equal(allView.strategicBuildQueueTotals?.find((row) => row.h3Index === 'opp-away')?.buildPaused, true);
  assert.equal(allView.strategicBuildQueueTotals?.find((row) => row.h3Index === 'neutral-hex')?.buildPaused, undefined);
});

test('the paused line names one place or three', () => {
  assert.equal(
    formatBuildPausedLine(['Prague']),
    'Building is paused at Prague, which holds none of your units or fortifications.'
  );
  assert.equal(
    formatBuildPausedLine(['Prague', 'Vienna', 'Oslo']),
    'Building is paused at Prague, Vienna, and Oslo, which hold none of your units or fortifications.'
  );
});
