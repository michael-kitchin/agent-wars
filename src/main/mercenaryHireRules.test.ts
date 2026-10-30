/**
 * Hire evaluation blocks the hexes and the units the panel must not offer.
 *
 * Purpose: Placement and the end of the turn share these rules.
 * When to use: After changing `evaluateHexHire` or `listHireEntryHexes`.
 * Expected outcome: The cases below, from snapshot literals.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../shared/ipc/gameStateTypes';
import { unitCostFor } from '../shared/gameRules';
import {
  HIRE_REASON_NOT_EXPLORED,
  HIRE_REASON_OTHER_HOME,
  RAISE_REASON_FORTIFIED,
  RAISE_REASON_OCCUPIED,
} from '../shared/mercenaryRules';
import { HUMAN_SEAT_ID, NEUTRAL_OWNER_ID, type SeatId } from '../shared/seatIds';
import type { SeatSnapshot } from '../shared/seatRoster';
import { buildHireContext, evaluateHexHire, listHireEntryHexes } from './mercenaryHireRules';

const HEX = 'hex-hire';
const OTHER = 'hex-other';

test('another owner, another fortification, and another home block raising', () => {
  const occupied = evaluateHexHire(buildHireContext(board({
    units: [unit('ai-i1', 'opponent', 'infantry', HEX)],
  }), HUMAN_SEAT_ID), HEX);
  assert.equal(occupied.raiseBlockedReason, RAISE_REASON_OCCUPIED);
  assert.deepEqual(occupied.raiseOptions, []);
  assert.deepEqual(listHireEntryHexes(buildHireContext(board({
    units: [unit('ai-i1', 'opponent', 'infantry', HEX)],
  }), HUMAN_SEAT_ID)), []);

  const fortified = evaluateHexHire(buildHireContext(board({
    strategicControl: [{ h3Index: HEX, controllerPlayerId: 'opponent' }],
    strategicInfrastructure: [infra(HEX, 10, 1)],
  }), HUMAN_SEAT_ID), HEX);
  assert.equal(fortified.raiseBlockedReason, RAISE_REASON_FORTIFIED);
  assert.deepEqual(fortified.raiseOptions, []);

  const home = evaluateHexHire(buildHireContext(board({
    homeRegionHexesBySeat: { human: [], opponent: [HEX] },
    seats: [active('human'), active('opponent')],
    strategicInfrastructure: [infra(HEX, 10, 0)],
  }), HUMAN_SEAT_ID), HEX);
  assert.equal(home.blockedReason, HIRE_REASON_OTHER_HOME);
  assert.deepEqual(home.raiseOptions, []);
});

test('raising is allowed in a knocked-out home and beside the seat\'s own units', () => {
  const formerHome = evaluateHexHire(buildHireContext(board({
    homeRegionHexesBySeat: { human: [], opponent: [HEX] },
    seats: [active('human'), { ...active('opponent'), outTurn: 2 }],
    strategicInfrastructure: [infra(HEX, 10, 0)],
  }), HUMAN_SEAT_ID), HEX);
  assert.equal(formerHome.blockedReason, null);
  assert.equal(formerHome.raiseBlockedReason, null);
  assert.ok(formerHome.raiseOptions.some((option) => option.unitType === 'infantry'));

  const own = evaluateHexHire(buildHireContext(board({
    units: [unit('h1-i1', HUMAN_SEAT_ID, 'infantry', HEX)],
    strategicInfrastructure: [infra(HEX, 10, 0)],
  }), HUMAN_SEAT_ID), HEX);
  assert.equal(own.raiseBlockedReason, null);
  assert.ok(own.raiseOptions.some((option) => option.unitType === 'infantry'));
});

test('an unexplored hex is blocked', () => {
  const evaluation = evaluateHexHire(buildHireContext(board({
    exploredHexes: [OTHER],
    strategicInfrastructure: [infra(HEX, 10, 0)],
  }), HUMAN_SEAT_ID), HEX);
  assert.equal(evaluation.blockedReason, HIRE_REASON_NOT_EXPLORED);
  assert.deepEqual(evaluation.raiseOptions, []);
  assert.deepEqual(evaluation.rehireCandidates, []);
});

test('capacity drops a type that costs more than twice the city cells', () => {
  const evaluation = evaluateHexHire(buildHireContext(board({
    strategicInfrastructure: [infra(HEX, 10, 0)],
  }), HUMAN_SEAT_ID), HEX);
  assert.equal(evaluation.raiseCapacityPerTurn, 20);
  assert.ok(evaluation.raiseOptions.some((option) => option.unitType === 'infantry'));
  assert.equal(evaluation.raiseOptions.some((option) => unitCostFor(option.unitType) > 20), false);
  assert.equal(unitCostFor('armor') > 20, true);
});

test('a missile, an embarked unit, a loaded ship, and a fortified Neutral hex are not candidates', () => {
  const evaluation = evaluateHexHire(buildHireContext(board({
    units: [
      unit('n-missile', NEUTRAL_OWNER_ID, 'missile', HEX),
      unit('n-rider', NEUTRAL_OWNER_ID, 'infantry', HEX, 'n-ship'),
      unit('n-ship', NEUTRAL_OWNER_ID, 'naval', HEX),
      unit('n-fort', NEUTRAL_OWNER_ID, 'infantry', OTHER),
    ],
    strategicControl: [{ h3Index: OTHER, controllerPlayerId: NEUTRAL_OWNER_ID }],
    strategicInfrastructure: [infra(HEX, 10, 0), infra(OTHER, 10, 1)],
  }), HUMAN_SEAT_ID), HEX);
  assert.deepEqual(evaluation.rehireCandidates, []);
  const fortified = evaluateHexHire(buildHireContext(board({
    units: [unit('n-fort', NEUTRAL_OWNER_ID, 'infantry', OTHER)],
    strategicControl: [{ h3Index: OTHER, controllerPlayerId: NEUTRAL_OWNER_ID }],
    strategicInfrastructure: [infra(OTHER, 10, 1)],
  }), HUMAN_SEAT_ID), OTHER);
  assert.deepEqual(fortified.rehireCandidates, []);
});

/**
 * A snapshot with the fields hire rules read.
 *
 * Purpose: The cases share one required-field set.
 * When to use: Each case, passing only what differs.
 * Expected outcome: A snapshot whose explored list contains the fixture hexes unless overridden.
 * Exceptions: None.
 */
function board(partial: Partial<GameStateSnapshot>): GameStateSnapshot {
  return {
    hexes: [
      { h3Index: HEX, terrain: 'land', terrainKind: 'land' },
      { h3Index: OTHER, terrain: 'land', terrainKind: 'land' },
    ],
    units: [],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    exploredHexes: [HEX, OTHER],
    seats: [active('human')],
    homeRegionHexesBySeat: { human: [] },
    ...partial,
  };
}

/**
 * An active seat row with only the fields hire rules read.
 *
 * Purpose: The snapshot type requires a full roster row. These cases read `seatId` and `outTurn`.
 * When to use: `board`.
 * Expected outcome: A cast seat with a null out turn.
 * Exceptions: None.
 */
function active(seatId: SeatId): SeatSnapshot {
  return { seatId, outTurn: null } as SeatSnapshot;
}

/**
 * One unit on a hex.
 *
 * Purpose: Occupancy and rehire fixtures.
 * When to use: `board`.
 * Expected outcome: A snapshot unit. `shipId` sets the embark link.
 * Exceptions: None.
 */
function unit(
  id: string,
  player: string,
  unitType: string,
  h3Index: string,
  embarkedOnNavalUnitId?: string
): GameStateSnapshot['units'][number] {
  return { id, player, unitType, h3Index, ...(embarkedOnNavalUnitId ? { embarkedOnNavalUnitId } : {}) };
}

/**
 * Infrastructure for a fixture hex.
 *
 * Purpose: Capacity and fortification.
 * When to use: `board`.
 * Expected outcome: Ten or the given city cells, and the given fortified count.
 * Exceptions: None.
 */
function infra(h3Index: string, urbanHexCount: number, fortifiedCount: number): NonNullable<GameStateSnapshot['strategicInfrastructure']>[number] {
  return { h3Index, urbanHexCount, airportCount: 0, seaportCount: 0, fortifiedCount };
}
