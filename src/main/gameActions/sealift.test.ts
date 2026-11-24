/**
 * Sealift contract tests: happy paths and essential failures only.
 * Run with: node dist/main/gameActions/sealift.test.js
 */

import * as assert from 'assert';
import { dbGetOne, dbRun, getGameState } from '../gameDb';
import type { CombatUnit } from '../combatUnitTypes';
import { withTempDb, pickHex, insertUnit, setHexTerrain, setPortControl } from '../testSupport/sealiftTestFixtures';
import {
  applyTransportLossForRemovedNavalUnits,
  autoDebarkNonHumanLandUnitIfMovingIndependently,
  canManualDebarkFromHex,
  clearEmbarkAssignmentForLandUnit,
  isEmbarkedLandUnit,
  shouldSkipEmbarkedLandIndependentMove,
} from './sealift';
import { getStrategicProductionContext } from '../terrainClassificationCache';
import { applyTransportLossForRemovedCarriers } from './transportCargoLoss';

/**
 * Defines the `testTransportLossDestroysCargoOnWaterAndDebarksOnCoastal` function shape (function testTransportLossDestroysCargoOnWaterAndDebarksOnCoastal(): void).

 * Purpose: Supports maintainability by documenting why `testTransportLossDestroysCargoOnWaterAndDebarksOnCoastal` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testTransportLossDestroysAllEmbarkedCargoRegardlessOfTerrain(): void {
  withTempDb(() => {
    const waterHex = pickHex(4);
    const coastalHex = pickHex(5);
    setHexTerrain(waterHex, 'water');
    setHexTerrain(coastalHex, 'coastal');

    insertUnit('human-naval-water-loss', 'human', 'naval', waterHex);
    insertUnit('human-inf-water-loss', 'human', 'infantry', waterHex);
    insertUnit('human-naval-coastal-loss', 'human', 'naval', coastalHex);
    insertUnit('human-inf-coastal-loss', 'human', 'infantry', coastalHex);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      'human-inf-water-loss',
      'human-naval-water-loss',
    ]);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      'human-inf-coastal-loss',
      'human-naval-coastal-loss',
    ]);

    const { cargo: removedCargo, carrierIdByCargoId } = applyTransportLossForRemovedCarriers([
      { id: 'human-naval-water-loss', player: 'human', unitType: 'naval', h3Index: waterHex } as CombatUnit,
      { id: 'human-naval-coastal-loss', player: 'human', unitType: 'naval', h3Index: coastalHex } as CombatUnit,
    ]);

    assert.deepStrictEqual(
      removedCargo.map((unit) => unit.id).sort(),
      ['human-inf-coastal-loss', 'human-inf-water-loss'],
      'transport loss should remove all embarked land cargo'
    );
    assert.strictEqual(carrierIdByCargoId.get('human-inf-water-loss'), 'human-naval-water-loss');
    assert.strictEqual(carrierIdByCargoId.get('human-inf-coastal-loss'), 'human-naval-coastal-loss');
    assert.strictEqual(
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM units WHERE id = ?', ['human-inf-water-loss'])?.count ?? 0,
      0,
      'water cargo should be deleted from units table'
    );
    assert.strictEqual(
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM units WHERE id = ?', ['human-inf-coastal-loss'])?.count ?? 0,
      0,
      'coastal cargo should also be deleted from units table'
    );
    assert.strictEqual(
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM unit_transport_assignments WHERE naval_unit_id IN (?, ?)', [
        'human-naval-water-loss',
        'human-naval-coastal-loss',
      ])?.count ?? 0,
      0,
      'all assignments for removed naval units should be cleared'
    );
  });
}

/**
 * Defines the `testClearEmbarkAssignmentForLandUnitRemovesRow` function shape (function testClearEmbarkAssignmentForLandUnitRemovesRow(): void).

 * Purpose: Regression guard for the shared manual/LLM debark primitive.
 * When to use: After edits to `clearEmbarkAssignmentForLandUnit` or callers that depend on assignment removal.
 * Expected outcome: Assignment row deleted; `isEmbarkedLandUnit` returns false afterward.
 * Exceptions: None.
 */
function testClearEmbarkAssignmentForLandUnitRemovesRow(): void {
  withTempDb(() => {
    const landHex = pickHex(7);
    insertUnit('human-naval-debark', 'human', 'naval', landHex);
    insertUnit('human-inf-debark', 'human', 'infantry', landHex);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      'human-inf-debark',
      'human-naval-debark',
    ]);
    assert.strictEqual(isEmbarkedLandUnit('human-inf-debark'), true);
    clearEmbarkAssignmentForLandUnit('human-inf-debark');
    const remaining = dbGetOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM unit_transport_assignments WHERE land_unit_id = ?',
      ['human-inf-debark']
    )?.count ?? 0;
    assert.strictEqual(remaining, 0);
    assert.strictEqual(isEmbarkedLandUnit('human-inf-debark'), false);
  });
}

/**
 * Defines the `testCanManualDebarkFromHexCoastalWaterPortAndOpenWater` function shape (function testCanManualDebarkFromHexCoastalWaterPortAndOpenWater(): void).

 * Purpose: Contract tests for manual debark eligibility by terrain and port control.
 * When to use: After edits to `canManualDebarkFromHex` or embark context queries.
 * Expected outcome: Coastal always allowed; water requires controlled port; open water blocked.
 * Exceptions: None.
 */
function testCanManualDebarkFromHexCoastalWaterPortAndOpenWater(): void {
  withTempDb(() => {
    const state = getGameState();
    const coastalHex = pickHex(10);
    const waterPortHex = pickHex(11);
    setHexTerrain(coastalHex, 'coastal');
    setHexTerrain(waterPortHex, 'water');
    setPortControl(waterPortHex, 'human');
    assert.strictEqual(canManualDebarkFromHex(coastalHex, 'human'), true);
    assert.strictEqual(canManualDebarkFromHex(waterPortHex, 'human'), true);
    const openWaterHex = state.hexes.find(
      (hex) =>
        hex.terrain === 'water' &&
        hex.h3Index !== waterPortHex &&
        getStrategicProductionContext({ h3Index: hex.h3Index }).seaportCount === 0
    )?.h3Index;
    assert.ok(openWaterHex, 'expected open water hex without seaport in classification cache');
    dbRun(
      `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
       VALUES (?, 0, 0, 0)
       ON CONFLICT(h3_index) DO UPDATE SET seaport_count = 0`,
      [openWaterHex]
    );
    dbRun('DELETE FROM res_s_control WHERE h3_index = ?', [openWaterHex]);
    assert.strictEqual(canManualDebarkFromHex(openWaterHex, 'human'), false);
    const uncontrolledWaterPort = pickHex(12);
    setHexTerrain(uncontrolledWaterPort, 'water');
    dbRun(
      `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
       VALUES (?, 0, 0, 1)
       ON CONFLICT(h3_index) DO UPDATE SET seaport_count = 1`,
      [uncontrolledWaterPort]
    );
    dbRun('DELETE FROM res_s_control WHERE h3_index = ?', [uncontrolledWaterPort]);
    assert.strictEqual(canManualDebarkFromHex(uncontrolledWaterPort, 'human'), false);
  });
}

/**
 * Defines the `testGameStateSnapshotIncludesEmbarkedOnNavalUnitId` function shape (function testGameStateSnapshotIncludesEmbarkedOnNavalUnitId(): void).

 * Purpose: Ensures renderer selection guards can read embark state from strategic snapshots.
 * When to use: After edits to `unitSnapshotRead` or transport assignment schema.
 * Expected outcome: Embarked land unit row includes `embarkedOnCarrierUnitId`; debarked land omits it.
 * Exceptions: None.
 */
function testGameStateSnapshotIncludesEmbarkedOnNavalUnitId(): void {
  withTempDb(() => {
    const coastalHex = pickHex(13);
    setHexTerrain(coastalHex, 'coastal');
    insertUnit('human-naval-snap', 'human', 'naval', coastalHex);
    insertUnit('human-inf-snap', 'human', 'infantry', coastalHex);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      'human-inf-snap',
      'human-naval-snap',
    ]);
    const embarked = getGameState().units.find((u) => u.id === 'human-inf-snap');
    assert.strictEqual(embarked?.embarkedOnCarrierUnitId, 'human-naval-snap');
    clearEmbarkAssignmentForLandUnit('human-inf-snap');
    const debarked = getGameState().units.find((u) => u.id === 'human-inf-snap');
    assert.ok(!debarked?.embarkedOnCarrierUnitId);
  });
}

/**
 * Defines the `testTransportLossSparesManuallyDebarkedCoLocatedLand` function shape (function testTransportLossSparesManuallyDebarkedCoLocatedLand(): void).

 * Purpose: Manually debarked co-located land has no assignment row and must survive naval destruction.
 * When to use: Regression guard for terrain-neutral cargo loss applying only to embarked assignments.
 * Expected outcome: Debarked infantry row remains; embarked sibling on same hex is deleted with the carrier.
 * Exceptions: None.
 */
function testTransportLossSparesManuallyDebarkedCoLocatedLand(): void {
  withTempDb(() => {
    const coastalHex = pickHex(16);
    setHexTerrain(coastalHex, 'coastal');
    insertUnit('human-naval-debarked-survivor', 'human', 'naval', coastalHex);
    insertUnit('human-inf-still-embarked', 'human', 'infantry', coastalHex);
    insertUnit('human-inf-debarked-survivor', 'human', 'infantry', coastalHex);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      'human-inf-still-embarked',
      'human-naval-debarked-survivor',
    ]);

    const removedCargo = applyTransportLossForRemovedNavalUnits([
      { id: 'human-naval-debarked-survivor', player: 'human', unitType: 'naval', h3Index: coastalHex } as CombatUnit,
    ]);

    assert.deepStrictEqual(
      removedCargo.map((unit) => unit.id),
      ['human-inf-still-embarked']
    );
    assert.strictEqual(
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM units WHERE id = ?', ['human-inf-debarked-survivor'])?.count ?? 0,
      1
    );
    assert.strictEqual(
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM units WHERE id = ?', ['human-inf-still-embarked'])?.count ?? 0,
      0
    );
  });
}

/**
 * Defines the `testAutoDebarkOpponentAndSkipHumanEmbarkedMoves` function shape (function testAutoDebarkOpponentAndSkipHumanEmbarkedMoves(): void).

 * Purpose: LLM/opponent movement auto-debarks at Ready; human embarked independent moves remain blocked.
 * When to use: After edits to `autoDebarkNonHumanLandUnitIfMovingIndependently` or `shouldSkipEmbarkedLandIndependentMove`.
 * Expected outcome: Opponent assignment cleared before move; human assignment preserved and move skipped.
 * Exceptions: None.
 */
function testAutoDebarkOpponentAndSkipHumanEmbarkedMoves(): void {
  withTempDb(() => {
    const hexA = pickHex(3);
    const hexB = pickHex(4);
    insertUnit('opp-nav', 'opponent', 'naval', hexA);
    insertUnit('opp-inf', 'opponent', 'infantry', hexA);
    insertUnit('hum-nav', 'human', 'naval', hexA);
    insertUnit('hum-inf', 'human', 'infantry', hexA);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      'opp-inf',
      'opp-nav',
    ]);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      'hum-inf',
      'hum-nav',
    ]);

    assert.strictEqual(isEmbarkedLandUnit('opp-inf'), true);
    assert.strictEqual(isEmbarkedLandUnit('hum-inf'), true);
    assert.strictEqual(shouldSkipEmbarkedLandIndependentMove('hum-inf', hexB), true);
    assert.strictEqual(shouldSkipEmbarkedLandIndependentMove('opp-inf', hexB), false);

    autoDebarkNonHumanLandUnitIfMovingIndependently('opp-inf', hexB);
    assert.strictEqual(isEmbarkedLandUnit('opp-inf'), false);
    assert.strictEqual(isEmbarkedLandUnit('hum-inf'), true);

    autoDebarkNonHumanLandUnitIfMovingIndependently('hum-inf', hexB);
    assert.strictEqual(isEmbarkedLandUnit('hum-inf'), true);
  });
}

/**
 * Runs every sealift test in order.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/gameActions/sealift.test.js`.
 * Expected outcome: Logs `sealift.test.ts passed` when every case passes.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testTransportLossDestroysAllEmbarkedCargoRegardlessOfTerrain();
  testClearEmbarkAssignmentForLandUnitRemovesRow();
  testCanManualDebarkFromHexCoastalWaterPortAndOpenWater();
  testGameStateSnapshotIncludesEmbarkedOnNavalUnitId();
  testTransportLossSparesManuallyDebarkedCoLocatedLand();
  testAutoDebarkOpponentAndSkipHumanEmbarkedMoves();
  console.log('sealift.test.ts passed');
}

run();
