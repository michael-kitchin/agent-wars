/**
 * Operation orders written into a seeded match.
 *
 * Purpose: A march must be stored, an embark must assign the ship, a bad embark must fail quietly, and an unload must clear it.
 * When to use: After changes to `applyOperationActions`.
 * Expected outcome: Process exit 0. The database is a temporary seeded match.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { canLandUnitTraverseEdge } from '../../shared/landTraversalStrategic';
import type { KnockoutCoordinates } from '../gameActions/knockoutConsequences';
import { getEmbarkedNavalForLandUnit } from '../gameActions/sealift';
import { dbGetOne, dbRun, getGameState } from '../gameDb';
import { loadCampaignLandMass } from '../openRouter/campaignObjectiveFlow';
import type { LatLng } from '../tools/h3LatLng';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { applyOperationActions } from './operationActions';

/**
 * Coordinate helpers for every hex in the open match.
 *
 * Purpose: March and defend store a hex center, and the writer resolves it back.
 * When to use: Each case, after the match is seeded.
 * Expected outcome: A center for every snapshot hex, and the res-1 cell for a center.
 * Exceptions: None. An unresolvable center returns undefined.
 */
function coordinates(): KnockoutCoordinates {
  const state = getGameState();
  const latLngByH3 = new Map<string, LatLng>(state.hexes.map((hex) => [hex.h3Index, cellToLatLng(hex.h3Index)]));
  return {
    latLngByH3,
    resolveToH3: (lat, lng) => {
      try {
        return latLngToCell(lat, lng, 1);
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * Inserts one unit on a hex that is already in the match.
 *
 * Purpose: The standing-order writer and the embark check both read the units table.
 * When to use: Before the action under test.
 * Expected outcome: One row owned by the opponent seat.
 * Exceptions: Propagates a database error.
 */
function insertUnit(id: string, unitType: 'infantry' | 'naval', h3Index: string): void {
  dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, 'opponent', unitType, h3Index]);
}

test('a march action stores a march', () => {
  withTempGameDb('aw-operation-actions-', () => {
    const before = getGameState();
    const landMass = loadCampaignLandMass('opponent');
    assert.ok(landMass, 'expected the terrain cache');
    const onMap = new Set(before.hexes.map((hex) => hex.h3Index));
    const origin = before.hexes.find((hex) =>
      gridDisk(hex.h3Index, 1).some((neighbor) => neighbor !== hex.h3Index && onMap.has(neighbor) && canLandUnitTraverseEdge(hex.h3Index, neighbor, landMass)),
    );
    assert.ok(origin, 'expected a land hex with a walkable neighbour');
    const destination = gridDisk(origin.h3Index, 1).find(
      (hex) => hex !== origin.h3Index && onMap.has(hex) && canLandUnitTraverseEdge(origin.h3Index, hex, landMass),
    );
    assert.ok(destination, 'expected an adjacent land hex');
    insertUnit('inf-march', 'infantry', origin.h3Index);
    const state = getGameState();
    const stored = applyOperationActions({
      seatId: 'opponent',
      actions: [{ kind: 'march', unitId: 'inf-march', toH3: destination }],
      state,
      coordinates: coordinates(),
    });
    assert.equal(stored, 1);
    const row = dbGetOne<{ order_type: string }>('SELECT order_type FROM standing_orders WHERE player_id = ? AND unit_id = ?', [
      'opponent',
      'inf-march',
    ]);
    assert.equal(row?.order_type, 'march');
  });
});

test('cancel of a unit with no standing order is already done', () => {
  withTempGameDb('aw-operation-actions-', () => {
    const before = getGameState();
    const hex = before.hexes[0];
    assert.ok(hex, 'expected a hex');
    insertUnit('inf-clear', 'infantry', hex.h3Index);
    const stored = applyOperationActions({
      seatId: 'opponent',
      actions: [{ kind: 'cancelOrder', unitId: 'inf-clear' }],
      state: getGameState(),
      coordinates: coordinates(),
    });
    assert.equal(stored, 1);
  });
});

test('embark on the same coastal hex assigns the ship and unload removes it', () => {
  withTempGameDb('aw-operation-actions-', () => {
    const before = getGameState();
    const coastal = before.hexes.find((hex) => hex.terrain === 'coastal' || hex.terrainKind === 'coastal');
    assert.ok(coastal, 'expected a coastal hex');
    insertUnit('inf-load', 'infantry', coastal.h3Index);
    insertUnit('ship-load', 'naval', coastal.h3Index);
    const state = getGameState();
    const loaded = applyOperationActions({
      seatId: 'opponent',
      actions: [{ kind: 'embark', unitId: 'inf-load', carrierId: 'ship-load' }],
      state,
      coordinates: coordinates(),
    });
    assert.equal(loaded, 1);
    assert.equal(getEmbarkedNavalForLandUnit('inf-load'), 'ship-load');
    const unloaded = applyOperationActions({
      seatId: 'opponent',
      actions: [{ kind: 'unload', unitId: 'inf-load' }],
      state,
      coordinates: coordinates(),
    });
    assert.equal(unloaded, 1);
    assert.equal(getEmbarkedNavalForLandUnit('inf-load'), null);
  });
});

test('embark on a ship at another hex fails and does not throw', () => {
  withTempGameDb('aw-operation-actions-', () => {
    const before = getGameState();
    const coastal = before.hexes.find((hex) => hex.terrain === 'coastal' || hex.terrainKind === 'coastal');
    assert.ok(coastal, 'expected a coastal hex');
    const other = before.hexes.find((hex) => hex.h3Index !== coastal.h3Index);
    assert.ok(other, 'expected a second hex');
    insertUnit('inf-far', 'infantry', coastal.h3Index);
    insertUnit('ship-far', 'naval', other.h3Index);
    const stored = applyOperationActions({
      seatId: 'opponent',
      actions: [{ kind: 'embark', unitId: 'inf-far', carrierId: 'ship-far' }],
      state: getGameState(),
      coordinates: coordinates(),
    });
    assert.equal(stored, 0);
    assert.equal(getEmbarkedNavalForLandUnit('inf-far'), null);
  });
});
