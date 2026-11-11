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
import { isHexBuildableForSeat, listOccupationPausedHexes, withBuildPausedFlags } from './productionBuildability';

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

test('occupation-paused hexes are the seat production cells it cannot build in', () => {
  const state = {
    units: [
      { player: 'opponent', h3Index: 'garrisoned' },
      { player: 'human', h3Index: 'occupied' },
    ],
    hexes: [],
    homeRegionHexesBySeat: { opponent: ['home'] },
    strategicControl: [
      { h3Index: 'home', controllerPlayerId: 'opponent' },
      { h3Index: 'garrisoned', controllerPlayerId: 'opponent' },
      { h3Index: 'fortified', controllerPlayerId: 'opponent' },
      { h3Index: 'occupied', controllerPlayerId: 'opponent' },
      { h3Index: 'rural', controllerPlayerId: 'opponent' },
      { h3Index: 'theirs', controllerPlayerId: 'human' },
    ],
    strategicInfrastructure: [
      { h3Index: 'home', urbanHexCount: 3, airportCount: 0, seaportCount: 0, fortifiedCount: 0 },
      { h3Index: 'garrisoned', urbanHexCount: 2, airportCount: 0, seaportCount: 0, fortifiedCount: 0 },
      { h3Index: 'fortified', urbanHexCount: 2, airportCount: 0, seaportCount: 0, fortifiedCount: 1 },
      { h3Index: 'occupied', urbanHexCount: 2, airportCount: 0, seaportCount: 0, fortifiedCount: 0 },
      { h3Index: 'rural', urbanHexCount: 0, airportCount: 0, seaportCount: 0, fortifiedCount: 0 },
      { h3Index: 'theirs', urbanHexCount: 2, airportCount: 0, seaportCount: 0, fortifiedCount: 0 },
    ],
  } as unknown as GameStateSnapshot;
  assert.deepEqual([...listOccupationPausedHexes(state, 'opponent')], ['occupied']);
});
