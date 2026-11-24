/**
 * Embark order contract tests.
 * Run with: node dist/main/gameActions/sealiftEmbarkOrders.test.js
 */

import * as assert from 'assert';
import { canManualDebarkFromHex, getSealiftStackContextModeForHex } from './sealiftHexEligibility';
import { dbGetOne, dbRun } from '../gameDb';
import { withTempDb, pickHex, insertUnit, setHexTerrain, setPortControl, loadAssignments } from '../testSupport/sealiftTestFixtures';
import {
  applyEmbarkOrdersForPlayer,
} from './sealiftEmbarkOrders';
import { listLandSeaportsBySeaAccess } from '../testSupport/seaAccessFixtures';

/**
 * Defines the `testApplyEmbarkOrdersEnforcesCapacityAndReassignment` function shape (function testApplyEmbarkOrdersEnforcesCapacityAndReassignment(): void).

 * Purpose: Supports maintainability by documenting why `testApplyEmbarkOrdersEnforcesCapacityAndReassignment` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testApplyEmbarkOrdersEnforcesCapacityAndReassignment(): void {
  withTempDb(() => {
    const coastalHex = pickHex(1);
    setHexTerrain(coastalHex, 'coastal');
    setPortControl(coastalHex, 'opponent');

    insertUnit('opponent-naval-a', 'opponent', 'naval', coastalHex);
    insertUnit('opponent-naval-b', 'opponent', 'naval', coastalHex);
    insertUnit('opponent-inf-a', 'opponent', 'infantry', coastalHex);
    insertUnit('opponent-inf-b', 'opponent', 'infantry', coastalHex);
    insertUnit('opponent-inf-c', 'opponent', 'infantry', coastalHex);
    insertUnit('opponent-inf-d', 'opponent', 'infantry', coastalHex);
    insertUnit('opponent-inf-e', 'opponent', 'infantry', coastalHex);
    insertUnit('opponent-armor-a', 'opponent', 'armor', coastalHex);
    const embarkContext = dbGetOne<{ terrain: string; seaportCount: number; controllerPlayerId: string | null }>(
      `SELECT hx.terrain AS terrain,
              ri.seaport_count AS seaportCount,
              rc.controller_player_id AS controllerPlayerId
       FROM hexes hx
       LEFT JOIN res_s_infrastructure ri ON ri.h3_index = hx.h3_index
       LEFT JOIN res_s_control rc ON rc.h3_index = hx.h3_index
       WHERE hx.h3_index = ?`,
      [coastalHex]
    );
    assert.strictEqual(embarkContext?.terrain, 'coastal');
    assert.strictEqual(embarkContext?.seaportCount, 1);
    assert.strictEqual(embarkContext?.controllerPlayerId, 'opponent');

    applyEmbarkOrdersForPlayer(
      [
        { unitId: 'opponent-inf-a', navalUnitId: 'opponent-naval-a' },
        { unitId: 'opponent-inf-b', navalUnitId: 'opponent-naval-a' },
        { unitId: 'opponent-inf-c', navalUnitId: 'opponent-naval-a' },
        { unitId: 'opponent-inf-d', navalUnitId: 'opponent-naval-a' },
        { unitId: 'opponent-inf-e', navalUnitId: 'opponent-naval-a' },
      ],
      'opponent'
    );

    let assignments = loadAssignments();
    assert.deepStrictEqual(assignments, [
      { landUnitId: 'opponent-inf-a', navalUnitId: 'opponent-naval-a' },
      { landUnitId: 'opponent-inf-b', navalUnitId: 'opponent-naval-a' },
      { landUnitId: 'opponent-inf-c', navalUnitId: 'opponent-naval-a' },
      { landUnitId: 'opponent-inf-d', navalUnitId: 'opponent-naval-a' },
    ]);

    applyEmbarkOrdersForPlayer([{ unitId: 'opponent-armor-a', navalUnitId: 'opponent-naval-a' }], 'opponent');
    assignments = loadAssignments();
    assert.strictEqual(
      assignments.some((row) => row.landUnitId === 'opponent-armor-a'),
      false,
      'armor should be rejected when target naval has no two free slots'
    );

    applyEmbarkOrdersForPlayer([{ unitId: 'opponent-inf-a', navalUnitId: 'opponent-naval-b' }], 'opponent');
    applyEmbarkOrdersForPlayer([{ unitId: 'opponent-armor-a', navalUnitId: 'opponent-naval-b' }], 'opponent');
    assignments = loadAssignments();
    assert.deepStrictEqual(assignments, [
      { landUnitId: 'opponent-armor-a', navalUnitId: 'opponent-naval-b' },
      { landUnitId: 'opponent-inf-a', navalUnitId: 'opponent-naval-b' },
      { landUnitId: 'opponent-inf-b', navalUnitId: 'opponent-naval-a' },
      { landUnitId: 'opponent-inf-c', navalUnitId: 'opponent-naval-a' },
      { landUnitId: 'opponent-inf-d', navalUnitId: 'opponent-naval-a' },
    ]);
  });
}

/**
 * Defines the `testApplyEmbarkOrdersAllowsControlledSeaportRegardlessTerrainLabel` function shape (function testApplyEmbarkOrdersAllowsControlledSeaportRegardlessTerrainLabel(): void).

 * Purpose: Supports maintainability by documenting why `testApplyEmbarkOrdersAllowsControlledSeaportRegardlessTerrainLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testApplyEmbarkOrdersAllowsControlledSeaportRegardlessTerrainLabel(): void {
  withTempDb(() => {
    const landHex = pickHex(6);
    setHexTerrain(landHex, 'coastal');
    dbRun('UPDATE hexes SET terrain = ? WHERE h3_index = ?', ['land', landHex]);
    setPortControl(landHex, 'opponent');

    insertUnit('opponent-naval-land-port', 'opponent', 'naval', landHex);
    insertUnit('opponent-inf-land-port', 'opponent', 'infantry', landHex);

    applyEmbarkOrdersForPlayer(
      [{ unitId: 'opponent-inf-land-port', navalUnitId: 'opponent-naval-land-port' }],
      'opponent'
    );

    const assignments = loadAssignments();
    assert.deepStrictEqual(assignments, [
      { landUnitId: 'opponent-inf-land-port', navalUnitId: 'opponent-naval-land-port' },
    ]);
  });
}

/**
 * Defines the `testApplyEmbarkOrdersRejectsAtSeaAndNoPort` function shape (function testApplyEmbarkOrdersRejectsAtSeaAndNoPort(): void).

 * Purpose: Supports maintainability by documenting why `testApplyEmbarkOrdersRejectsAtSeaAndNoPort` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testApplyEmbarkOrdersRejectsAtSeaAndNoPort(): void {
  withTempDb(() => {
    const waterHex = pickHex(2);
    const coastalNoPortHex = pickHex(3);
    setHexTerrain(waterHex, 'water');
    setHexTerrain(coastalNoPortHex, 'coastal');
    dbRun('UPDATE res_s_infrastructure SET seaport_count = 0 WHERE h3_index = ?', [waterHex]);
    dbRun('UPDATE res_s_infrastructure SET seaport_count = 0 WHERE h3_index = ?', [coastalNoPortHex]);

    insertUnit('opponent-naval-water', 'opponent', 'naval', waterHex);
    insertUnit('opponent-inf-water', 'opponent', 'infantry', waterHex);
    insertUnit('opponent-naval-no-port', 'opponent', 'naval', coastalNoPortHex);
    insertUnit('opponent-inf-no-port', 'opponent', 'infantry', coastalNoPortHex);

    applyEmbarkOrdersForPlayer(
      [
        { unitId: 'opponent-inf-water', navalUnitId: 'opponent-naval-water' },
        { unitId: 'opponent-inf-no-port', navalUnitId: 'opponent-naval-no-port' },
      ],
      'opponent'
    );

    const assignments = loadAssignments();
    assert.deepStrictEqual(assignments, [
      { landUnitId: 'opponent-inf-no-port', navalUnitId: 'opponent-naval-no-port' },
    ]);
  });
}

/**
 * Defines the `testApplyEmbarkOrdersAllowsWaterAndArcticWhenPortPresent` function shape (function testApplyEmbarkOrdersAllowsWaterAndArcticWhenPortPresent(): void).

 * Purpose: Supports maintainability by documenting why `testApplyEmbarkOrdersAllowsWaterAndArcticWhenPortPresent` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testApplyEmbarkOrdersAllowsWaterAndArcticWhenPortPresent(): void {
  withTempDb(() => {
    const waterPortHex = pickHex(0);
    const arcticPortHex = pickHex(1);
    setHexTerrain(waterPortHex, 'water');
    setHexTerrain(arcticPortHex, 'land');
    dbRun('UPDATE hexes SET terrain_kind = ? WHERE h3_index = ?', ['arctic', arcticPortHex]);
    setPortControl(waterPortHex, 'opponent');
    setPortControl(arcticPortHex, 'opponent');
    insertUnit('opponent-naval-water-port', 'opponent', 'naval', waterPortHex);
    insertUnit('opponent-inf-water-port', 'opponent', 'infantry', waterPortHex);
    insertUnit('opponent-naval-arctic-port', 'opponent', 'naval', arcticPortHex);
    insertUnit('opponent-inf-arctic-port', 'opponent', 'infantry', arcticPortHex);

    applyEmbarkOrdersForPlayer(
      [
        { unitId: 'opponent-inf-water-port', navalUnitId: 'opponent-naval-water-port' },
        { unitId: 'opponent-inf-arctic-port', navalUnitId: 'opponent-naval-arctic-port' },
      ],
      'opponent'
    );

    const assignments = loadAssignments();
    assert.deepStrictEqual(assignments, [
      { landUnitId: 'opponent-inf-arctic-port', navalUnitId: 'opponent-naval-arctic-port' },
      { landUnitId: 'opponent-inf-water-port', navalUnitId: 'opponent-naval-water-port' },
    ]);
  });
}

/**
 * Defines the `testLandSeaportSealiftWithoutControl` function shape (function testLandSeaportSealiftWithoutControl(): void).

 * Purpose: Occupied land seaports embark/debark like coastal without a control check.
 * When to use: After changes to land-seaport sealift eligibility.
 * Expected outcome: Embark writes an assignment; manual debark is allowed; stack mode is coastal_port.
 * Exceptions: None.
 */
function testLandSeaportSealiftWithoutControl(): void {
  withTempDb(() => {
    const landPortHex = pickHex(7);
    setHexTerrain(landPortHex, 'land');
    dbRun(
      `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
       VALUES (?, 0, 0, 1)
       ON CONFLICT(h3_index) DO UPDATE SET seaport_count = 1`,
      [landPortHex]
    );
    dbRun('DELETE FROM res_s_control WHERE h3_index = ?', [landPortHex]);
    insertUnit('human-naval-land-port', 'human', 'naval', landPortHex);
    insertUnit('human-inf-land-port', 'human', 'infantry', landPortHex);
    applyEmbarkOrdersForPlayer(
      [{ unitId: 'human-inf-land-port', navalUnitId: 'human-naval-land-port' }],
      'human'
    );
    assert.deepStrictEqual(loadAssignments(), [
      { landUnitId: 'human-inf-land-port', navalUnitId: 'human-naval-land-port' },
    ]);
    assert.strictEqual(canManualDebarkFromHex(landPortHex, 'human'), true);
    assert.strictEqual(getSealiftStackContextModeForHex(landPortHex), 'coastal_port');
  });
}

/**
 * Boarding at a land seaport needs sea access; unloading there does not.
 *
 * Purpose: A seaport with only land around it lets no cargo board, but a ship stuck there can still unload.
 * When to use: After changes to land-seaport boarding or sea access.
 * Expected outcome: Embark at the dry port writes no assignment; embark at a port with sea access does; manual debark at the dry port is allowed.
 * Exceptions: None.
 */
function testLandSeaportBoardingNeedsSeaAccess(): void {
  withTempDb(() => {
    const { dry, wet } = listLandSeaportsBySeaAccess();
    const board = (port: string, suffix: string): void => {
      insertUnit(`human-naval-${suffix}`, 'human', 'naval', port);
      insertUnit(`human-inf-${suffix}`, 'human', 'infantry', port);
      applyEmbarkOrdersForPlayer([{ unitId: `human-inf-${suffix}`, navalUnitId: `human-naval-${suffix}` }], 'human');
    };
    board(dry[0]!, 'dry');
    assert.deepStrictEqual(loadAssignments(), []);
    assert.strictEqual(canManualDebarkFromHex(dry[0]!, 'human'), true);
    board(wet[0]!, 'wet');
    assert.deepStrictEqual(loadAssignments(), [{ landUnitId: 'human-inf-wet', navalUnitId: 'human-naval-wet' }]);
  });
}

/**
 * Runs every embark order test in order.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/gameActions/sealiftEmbarkOrders.test.js`.
 * Expected outcome: Logs `sealiftEmbarkOrders.test.ts passed` when every case passes.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testApplyEmbarkOrdersEnforcesCapacityAndReassignment();
  testApplyEmbarkOrdersAllowsControlledSeaportRegardlessTerrainLabel();
  testApplyEmbarkOrdersRejectsAtSeaAndNoPort();
  testApplyEmbarkOrdersAllowsWaterAndArcticWhenPortPresent();
  testLandSeaportSealiftWithoutControl();
  testLandSeaportBoardingNeedsSeaAccess();
  console.log('sealiftEmbarkOrders.test.ts passed');
}

run();
