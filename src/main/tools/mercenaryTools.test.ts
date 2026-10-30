/**
 * Mercenary tools place and read hire orders for an AI seat.
 *
 * Purpose: The tool uses the seat's own view, so a seen enemy blocks a raise and an empty home city does not.
 * When to use: After changing `executeMercenaryTools`.
 * Expected outcome: The cases below. Each case removes its temporary match.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng, gridDisk } from 'h3-js';
import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import { HUMAN_SEAT_ID, type AiSeatId } from '../../shared/seatIds';
import { createStrategicUnit } from '../gameActions/strategicUnitSpawn';
import {
  getGameState,
  getScenarioHomeRegionHexes,
  getSeatRoster,
  refreshFogOfWarIntelFromCurrentState,
  setStrategicInfrastructureForHex,
} from '../gameDb';
import { listHireOrdersForSeat } from '../gameDb/mercenaryStateAccess';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { executeMercenaryTools } from './mercenaryTools';

const SEAT: AiSeatId = 'opponent';

test('a raise on an empty home city is stored, cancelled, and visible to a query', () => {
  withTempGameDb('aw-merc-tools-', () => {
    const hex = emptyHomeHex();
    const helpers = coordHelpers(getGameState());
    const raised = executeMercenaryTools(SEAT, 'hire_mercenaries', {
      action: 'raise',
      hex: helpers.latLngByH3.get(hex),
      unitType: 'infantry',
      count: 1,
    }, getGameState(), helpers.latLngByH3, helpers.resolveToH3);
    assert.equal(raised.status, 'ok');
    assert.equal(typeof raised.orderId, 'number');
    assert.equal(listHireOrdersForSeat(SEAT).length, 1);
    const queried = executeMercenaryTools(SEAT, 'query_mercenaries', { hex: helpers.latLngByH3.get(hex) }, getGameState(), helpers.latLngByH3, helpers.resolveToH3);
    assert.equal(queried.status, 'ok');
    assert.ok(Array.isArray(queried.position));
    const cancelled = executeMercenaryTools(SEAT, 'hire_mercenaries', { action: 'cancel', orderId: raised.orderId }, getGameState(), helpers.latLngByH3, helpers.resolveToH3);
    assert.equal(cancelled.status, 'ok');
    assert.equal(listHireOrdersForSeat(SEAT).length, 0);
  });
});

test('a raise on a seen enemy unit is rejected', () => {
  withTempGameDb('aw-merc-tools-seen-', () => {
    const state = getGameState();
    const humanHex = state.hexes[0]?.h3Index;
    assert.ok(humanHex);
    const neighbor = gridDisk(humanHex, 1).find((hex) => hex !== humanHex && state.hexes.some((row) => row.h3Index === hex));
    assert.ok(neighbor);
    const turn = state.turnNumber;
    createStrategicUnit({ owner: HUMAN_SEAT_ID, unitType: 'infantry', h3Index: humanHex, turnNumber: turn, isMercenary: false });
    createStrategicUnit({ owner: SEAT, unitType: 'infantry', h3Index: neighbor, turnNumber: turn, isMercenary: false });
    refreshFogOfWarIntelFromCurrentState();
    const helpers = coordHelpers(getGameState());
    const raised = executeMercenaryTools(SEAT, 'hire_mercenaries', {
      action: 'raise',
      hex: helpers.latLngByH3.get(humanHex),
      unitType: 'infantry',
      count: 1,
    }, getGameState(), helpers.latLngByH3, helpers.resolveToH3);
    assert.equal(raised.status, 'error');
    assert.equal(listHireOrdersForSeat(SEAT).length, 0);
  });
});

/**
 * An opponent home hex that holds no unit.
 *
 * Purpose: A raise needs a city the seat owns and that nobody occupies.
 * When to use: Inside `withTempGameDb`.
 * Expected outcome: The hex has ten city cells.
 * Exceptions: Throws when every home hex is occupied.
 */
function emptyHomeHex(): string {
  const home = getSeatRoster().find((row) => row.seatId === SEAT);
  assert.ok(home);
  const occupied = new Set(getGameState().units.map((unit) => unit.h3Index));
  const hex = getScenarioHomeRegionHexes(home.homeRegion).find((h3) => !occupied.has(h3));
  assert.ok(hex);
  setStrategicInfrastructureForHex(hex, { urbanHexCount: 10, airportCount: 0, seaportCount: 0 });
  return hex;
}

/**
 * Lat/lng pairs the tool can resolve back to cells.
 *
 * Purpose: The tool receives coordinates, not briefing codes.
 * When to use: Before `executeMercenaryTools`.
 * Expected outcome: A map and an exact-pair resolver.
 * Exceptions: None.
 */
function coordHelpers(state: GameStateSnapshot): {
  latLngByH3: Map<string, [number, number]>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
} {
  const latLngByH3 = new Map(state.hexes.map((hex) => [hex.h3Index, cellToLatLng(hex.h3Index) as [number, number]]));
  const resolveToH3 = (lat: number, lng: number): string | undefined => {
    for (const [h3Index, pair] of latLngByH3) {
      if (pair[0] === lat && pair[1] === lng) return h3Index;
    }
    return undefined;
  };
  return { latLngByH3, resolveToH3 };
}
