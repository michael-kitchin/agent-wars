/**
 * GameActions embarked land unit contracts: boarding, debarking, and march orders.
 * Run with: node dist/main/gameActionsEmbarkedLand.test.js
 */

import * as assert from 'assert';
import {
  dbGetOne,
  getGameState,
  dbRun,
} from './gameDb';
import {
  assignHumanMarchOrder,
  getSealiftStackState,
  updateSealiftSlot,
} from './gameActions';
import { sealiftRowCargoIds } from '../shared/sealiftStackState';
import {
  findAdjacentNonArcticLandHex,
  findCoastalHexWithAdjacentLand,
  findNearestLandSeaportHex,
  findWaterHexWithAdjacentLand,
  setHumanControlledPort,
  withTempDb,
} from './testSupport/gameActionsMultiSelectFixtures';

/**
 * Defines the `testAssignMarchForEmbarkedLandUnitDoesNotAutoDebark` function shape (function testAssignMarchForEmbarkedLandUnitDoesNotAutoDebark(): void).

 * Purpose: Human march assignment must not clear sealift slots implicitly while cargo remains embarked.
 * When to use: Regression guard after removing `clearEmbarkAssignmentForIndependentLandMove`.
 * Expected outcome: Assignment rejected; sealift slot still occupied.
 * Exceptions: None.
 */
function testAssignMarchForEmbarkedLandUnitDoesNotAutoDebark(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    const waterWithAdjacentLand = findWaterHexWithAdjacentLand(state);
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    assert.ok(waterWithAdjacentLand, 'expected a water hex with an adjacent land destination');

    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [waterWithAdjacentLand!.waterHex, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [waterWithAdjacentLand!.waterHex, navalUnit!.id]);
    setHumanControlledPort(waterWithAdjacentLand!.waterHex);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      landUnit!.id,
      navalUnit!.id,
    ]);

    const assign = assignHumanMarchOrder(landUnit!.id, waterWithAdjacentLand!.adjacentLandHex);
    assert.strictEqual(assign.success, false, assign.reason ?? 'expected embarked march assignment to be rejected');
    const assignmentCount =
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM unit_transport_assignments WHERE land_unit_id = ?', [landUnit!.id])
        ?.count ?? 0;
    assert.strictEqual(assignmentCount, 1, 'expected embarked assignment to remain');
    const sealiftState = getSealiftStackState(waterWithAdjacentLand!.waterHex);
    const navalRow = sealiftState.navalRows.find((row) => row.navalUnitId === navalUnit!.id);
    assert.ok(navalRow, 'expected naval row in sealift state');
    assert.ok(navalRow && sealiftRowCargoIds(navalRow).includes(landUnit!.id), 'expected sealift slot to remain occupied');
  });
}

/**
 * Defines the `testEmbarkedLandOnCoastalHexBlockedUntilManualDebark` function shape (function testEmbarkedLandOnCoastalHexBlockedUntilManualDebark(): void).

 * Purpose: Coastal embarked cargo also cannot march independently without manual debark first.
 * When to use: Regression guard for general embarked movement block (not water-only).
 * Expected outcome: March blocked while embarked; succeeds after manual debark via sealift slot.
 * Exceptions: None.
 */
function testEmbarkedLandOnCoastalHexBlockedUntilManualDebark(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    const coastalSetup = findCoastalHexWithAdjacentLand(state);
    assert.ok(coastalSetup, 'expected coastal hex with adjacent land destination');
    const { coastalHex, adjacentLandHex } = coastalSetup;

    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [coastalHex, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [coastalHex, navalUnit!.id]);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      landUnit!.id,
      navalUnit!.id,
    ]);

    const blocked = assignHumanMarchOrder(landUnit!.id, adjacentLandHex);
    assert.strictEqual(blocked.success, false, blocked.reason ?? 'expected embarked coastal march to be blocked');

    const sealiftBefore = getSealiftStackState(coastalHex);
    const row = sealiftBefore.navalRows.find((r) => r.navalUnitId === navalUnit!.id);
    assert.ok(row, 'expected naval row');
    const occupiedSlot = row!.slots.findIndex((slot) => slot.unitId === landUnit!.id) + 1;
    const debark = updateSealiftSlot({ h3Index: coastalHex, navalUnitId: navalUnit!.id, slotIndex: occupiedSlot, landUnitId: null });
    assert.strictEqual(debark.success, true, debark.reason ?? 'expected manual debark at coastal hex');

    const assign = assignHumanMarchOrder(landUnit!.id, adjacentLandHex);
    assert.strictEqual(assign.success, true, assign.reason ?? 'expected march after manual debark');
  });
}

/**
 * Defines the `testEmbarkImmediatelyCancelsExistingHumanMovementOrder` function shape (function testEmbarkImmediatelyCancelsExistingHumanMovementOrder(): void).

 * Purpose: Supports maintainability by documenting why `testEmbarkImmediatelyCancelsExistingHumanMovementOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testEmbarkImmediatelyCancelsExistingHumanMovementOrder(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    const seaportHex = findNearestLandSeaportHex(state, landUnit!.h3Index);
    assert.ok(seaportHex, 'expected at least one land seaport');
    const adjacentLandHex = findAdjacentNonArcticLandHex(state, seaportHex!);
    assert.ok(adjacentLandHex, 'expected adjacent non-arctic land destination from seaport hex');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, navalUnit!.id]);
    setHumanControlledPort(seaportHex!);

    const assignResult = assignHumanMarchOrder(landUnit!.id, adjacentLandHex!);
    assert.strictEqual(assignResult.success, true, assignResult.reason ?? 'expected initial land movement order assignment');
    const beforeStandingOrderCount =
      dbGetOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM standing_orders WHERE player_id = ? AND unit_id = ? AND order_type = ?',
        ['human', landUnit!.id, 'march']
      )?.count ?? 0;
    assert.strictEqual(beforeStandingOrderCount, 1, 'expected precondition: unit has one march standing order');

    const embarkResult = updateSealiftSlot({
      h3Index: seaportHex!,
      navalUnitId: navalUnit!.id,
      slotIndex: 1,
      landUnitId: landUnit!.id,
    });
    assert.strictEqual(embarkResult.success, true, embarkResult.reason ?? 'expected embark slot update success');
    const afterStandingOrderCount =
      dbGetOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM standing_orders WHERE player_id = ? AND unit_id = ? AND order_type = ?',
        ['human', landUnit!.id, 'march']
      )?.count ?? 0;
    assert.strictEqual(afterStandingOrderCount, 0, 'expected movement standing order to be cancelled on embark');
    const pendingCount =
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM pending_orders WHERE unit_id = ?', [landUnit!.id])?.count ?? 0;
    assert.strictEqual(pendingCount, 0, 'expected pending movement orders to be cleared on embark');
  });
}

/**
 * Runs every embarked land unit test in order.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/gameActionsEmbarkedLand.test.js`.
 * Expected outcome: Logs `gameActionsEmbarkedLand.test.ts passed` when every case passes.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testAssignMarchForEmbarkedLandUnitDoesNotAutoDebark();
  testEmbarkedLandOnCoastalHexBlockedUntilManualDebark();
  testEmbarkImmediatelyCancelsExistingHumanMovementOrder();
  console.log('gameActionsEmbarkedLand.test.ts passed');
}

run();
