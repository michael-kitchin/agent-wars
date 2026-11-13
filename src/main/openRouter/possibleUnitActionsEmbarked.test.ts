/**
 * Best Options rows for cargo that is already aboard a ship.
 *
 * Purpose: Confirms an embarked infantry unit is not offered an off-hex move while the database records the assignment.
 * When to use: After changes to possible-action row collection.
 * Expected outcome: No approach, advance, or move/melee row on open water or on a coastal hex. Process exit 0.
 * Exceptions: Throws when the seeded match has no opponent infantry, naval unit, water hex, or coastal hex.
 */

import * as assert from 'assert';
import { cellToLatLng } from 'h3-js';
import { dbRun, getGameState } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { formatLatLng } from './promptText';
import { LATLNG_DECIMAL_PLACES } from '../mapData';
import { collectAggregatedPossibleActionRows } from './possibleUnitActions';

/**
 * Counts off-hex move rows for one unit.
 *
 * Purpose: Approach, advance, and move/melee are the rows that become an explicit move.
 * When to use: After collecting rows for an embarked infantry unit.
 * Expected outcome: The number of those rows whose target is not the unit's hex.
 * Exceptions: None.
 */
function offHexMoveRowCount(unitId: string, unitH3: string, state: ReturnType<typeof getGameState>): number {
  const latLngByH3 = new Map(state.hexes.map((hex) => [hex.h3Index, cellToLatLng(hex.h3Index) as [number, number]]));
  const rows = collectAggregatedPossibleActionRows({
    state,
    latLngByH3,
    formatLatLng: (ll) => formatLatLng(ll, LATLNG_DECIMAL_PLACES),
    forThisTurnOptionsTable: true,
  });
  return rows.filter((row) => {
    if (row.unitId !== unitId || row.targetH3 === unitH3) return false;
    return row.actionTypes.includes('approach') || row.actionTypes.includes('advance') || row.actionTypes.includes('move/melee');
  }).length;
}

/**
 * Moves the pair onto one hex and records the assignment.
 *
 * Purpose: `getValidDestinations` treats the unit as embarked only when the assignment row exists.
 * When to use: Once per terrain case.
 * Expected outcome: The refreshed snapshot shows the infantry aboard the naval unit on that hex.
 * Exceptions: Throws when the refreshed snapshot drops either unit.
 */
function placeAboard(infantryId: string, navalId: string, h3Index: string): ReturnType<typeof getGameState> {
  dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [h3Index, infantryId]);
  dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [h3Index, navalId]);
  dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
    infantryId,
    navalId,
  ]);
  const state = getGameState();
  const infantry = state.units.find((unit) => unit.id === infantryId);
  assert.equal(infantry?.embarkedOnCarrierUnitId, navalId);
  assert.equal(infantry?.h3Index, h3Index);
  return state;
}

/**
 * Runs the open-water and coastal cases.
 *
 * Purpose: Direct node invocation of this file.
 * When to use: `node dist/main/openRouter/possibleUnitActionsEmbarked.test.js`.
 * Expected outcome: Both terrains contribute zero off-hex move rows.
 * Exceptions: None beyond the assertions.
 */
function run(): void {
  withTempGameDb('aw-embark-options-', () => {
    const seeded = getGameState();
    const infantry = seeded.units.find((unit) => unit.player === 'opponent' && unit.unitType === 'infantry');
    const naval = seeded.units.find((unit) => unit.player === 'opponent' && unit.unitType === 'naval');
    const water = seeded.hexes.find((hex) => hex.terrain === 'water');
    const coastal = seeded.hexes.find((hex) => hex.terrain === 'coastal' || hex.terrainKind === 'coastal');
    assert.ok(infantry && naval && water && coastal, 'expected opponent cargo, a ship, open water, and a coastal hex');
    const atSea = placeAboard(infantry.id, naval.id, water.h3Index);
    assert.equal(offHexMoveRowCount(infantry.id, water.h3Index, atSea), 0, 'open water must not list a landing move');
    const atCoast = placeAboard(infantry.id, naval.id, coastal.h3Index);
    assert.equal(offHexMoveRowCount(infantry.id, coastal.h3Index, atCoast), 0, 'a coastal hex must not list a landing move today');
  });
  console.log('possibleUnitActions embarked tests passed');
}

run();
