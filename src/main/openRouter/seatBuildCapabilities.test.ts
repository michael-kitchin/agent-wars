/**
 * Contract tests for seat build capability flags.
 * Run: node dist/main/openRouter/seatBuildCapabilities.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMinimumUrbanCells } from '../../shared/gameRules';
import { getMaxUnitsPerType, parseGameSize } from '../../shared/gameSize';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../gameDb';
import { seatBuildCapabilities } from './seatBuildCapabilities';

/** Origin reused from the missile briefing fixtures. */
const ORIGIN = '810ebffffffffff';
const OWN = AI_SEAT_IDS[0];

/**
 * Builds a snapshot with one controlled hex and the given infrastructure.
 *
 * Purpose: The capability function reads control, infrastructure, and the roster.
 * When to use: Each case in this file.
 * Expected outcome: A snapshot the function can read. Other fields stay at planning defaults.
 * Exceptions: None.
 */
function stateFor(
  infrastructure: GameStateSnapshot['strategicInfrastructure'],
  units: GameStateSnapshot['units'],
  controlSeat: string = OWN
): GameStateSnapshot {
  return {
    hexes: [{ h3Index: ORIGIN, terrain: 'land', terrainKind: 'plains' }],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    playerPerspective: OWN,
    gameSize: 'small',
    units,
    strategicControl: [{ h3Index: ORIGIN, controllerPlayerId: controlSeat }],
    strategicInfrastructure: infrastructure,
  } as GameStateSnapshot;
}

const urban = Math.max(buildMinimumUrbanCells('missile'), buildMinimumUrbanCells('naval'));

test('a qualifying city can build a naval unit and a missile', () => {
  const result = seatBuildCapabilities(
    stateFor([{ h3Index: ORIGIN, urbanHexCount: urban, airportCount: 0, seaportCount: 1 }], []),
    OWN
  );
  assert.deepEqual(result, { canBuildNaval: true, canBuildMissile: true });
});

test('a seat at the naval cap can still build a missile', () => {
  const navalCap = getMaxUnitsPerType(parseGameSize('small')).naval;
  const units = Array.from({ length: navalCap }, (_, index) => ({
    id: `n${index}`,
    player: OWN,
    unitType: 'naval' as const,
    h3Index: ORIGIN,
  }));
  const result = seatBuildCapabilities(
    stateFor([{ h3Index: ORIGIN, urbanHexCount: urban, airportCount: 0, seaportCount: 1 }], units),
    OWN
  );
  assert.deepEqual(result, { canBuildNaval: false, canBuildMissile: true });
});

test('a city without a seaport cannot build a naval unit', () => {
  const result = seatBuildCapabilities(
    stateFor([{ h3Index: ORIGIN, urbanHexCount: urban, airportCount: 0, seaportCount: 0 }], []),
    OWN
  );
  assert.equal(result.canBuildNaval, false);
});

test('another seat\'s hex does not count', () => {
  const result = seatBuildCapabilities(
    stateFor([{ h3Index: ORIGIN, urbanHexCount: urban, airportCount: 0, seaportCount: 1 }], [], HUMAN_SEAT_ID),
    OWN
  );
  assert.deepEqual(result, { canBuildNaval: false, canBuildMissile: false });
});

test('a controlled hex with no infrastructure row cannot build either type', () => {
  const result = seatBuildCapabilities(stateFor([], []), OWN);
  assert.deepEqual(result, { canBuildNaval: false, canBuildMissile: false });
});
