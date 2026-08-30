/**
 * Strategic human march stacking: dests occupied by friendlies, and two units sharing one dest.
 * Run: `npm run build:main` then `node dist/main/gameActions/strategicMarchStacking.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbGetAll, dbRun, getGameState } from '../gameDb';
import { assignHumanMarchOrder, assignHumanMarchOrders, previewHumanMarchOrders } from '../gameActions';
import { getValidDestinations } from '../oneStepMoveDestinations';
import { resetHumanMarchPreviewDiagnosticsForTests } from './humanMarchPreview';
import { withTempGameDb } from '../testSupport/withTempGameDb';

/**
 * Opens a temp game DB and clears march-preview caches for each case.
 *
 * Purpose: Same fixture style as other strategic assign integration tests.
 * When to use: Every case in this file.
 * Expected outcome: Isolated SQLite file; preview diagnostics reset.
 * Exceptions: None.
 */
function withTempDb(runCase: () => void): void {
  withTempGameDb('aw-strategic-stack-', () => {
    resetHumanMarchPreviewDiagnosticsForTests();
    runCase();
  });
}

type LandUnitRow = { id: string; unit_type: string; h3_index: string };

/**
 * Two distinct human land units from the seeded roster.
 *
 * Purpose: Stacking tests need two actors the assigner will accept as human-controlled land units.
 * When to use: After `resetGameForNewMatch`.
 * Expected outcome: Two infantry or armor rows from the units table.
 * Exceptions: Throws if fewer than two human land units exist.
 */
function twoHumanLandUnits(): { stay: LandUnitRow; join: LandUnitRow } {
  const rows = dbGetAll<LandUnitRow>(
    "SELECT id, unit_type, h3_index FROM units WHERE player = 'human' AND unit_type IN ('infantry', 'armor') ORDER BY id"
  );
  assert.ok(rows.length >= 2, `expected at least two seeded human land units, got ${rows.length}`);
  return { stay: rows[0]!, join: rows[1]! };
}

/**
 * One-step dests `getValidDestinations` would accept from this unit's current cell.
 *
 * Purpose: Assign uses plan_route on the land-mass graph, so the dest must come from that set, not from raw H3 neighbors.
 * When to use: After placing a unit, before assign/preview.
 * Expected outcome: Dest hexes excluding the origin.
 * Exceptions: None.
 */
function legalStepDests(unit: { id: string; unit_type: string; h3_index: string }): string[] {
  const state = getGameState();
  return getValidDestinations(
    { id: unit.id, h3Index: unit.h3_index, unitType: unit.unit_type },
    state
  ).filter((h3) => h3 !== unit.h3_index);
}

test('assignHumanMarchOrder lets a unit stack onto a hex another friendly already occupies', () => {
  withTempDb(() => {
    const { stay, join } = twoHumanLandUnits();
    const dests = legalStepDests(join);
    assert.ok(dests.length > 0, 'expected the joining unit to have a one-step dest');
    const dest = dests[0]!;
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [dest, stay.id]);
    const preview = previewHumanMarchOrders([join.id], dest);
    assert.equal(preview.validForAll, true, preview.invalidReason ?? 'preview onto occupied dest should be valid');
    const assigned = assignHumanMarchOrder(join.id, dest);
    assert.equal(assigned.success, true, assigned.reason ?? 'assign onto occupied dest should succeed');
  });
});

test('assignHumanMarchOrders lets two units share the same dest', () => {
  withTempDb(() => {
    const { stay, join } = twoHumanLandUnits();
    const dests = legalStepDests(join);
    assert.ok(dests.length > 0, 'expected the joining unit to have a one-step dest');
    const dest = dests[0]!;
    const origins = legalStepDests({ id: stay.id, unit_type: stay.unit_type, h3_index: dest }).filter(
      (h3) => h3 !== join.h3_index
    );
    assert.ok(origins.length > 0, 'expected a second origin that can step onto the shared dest');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [origins[0]!, stay.id]);
    const assigned = assignHumanMarchOrders([stay.id, join.id], dest);
    assert.equal(assigned.success, true, assigned.reason ?? 'two units sharing one dest should succeed');
  });
});
