/**
 * Sealift contract tests: happy paths and essential failures only.
 * Run with: node dist/main/game-actions/sealift.test.js
 */

import * as assert from 'assert';
import { dbGetAll, dbGetOne, dbRun, getGameState } from '../gameDb';
import type { CombatUnit } from '../combatUnitTypes';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import {
  applyEmbarkOrdersForPlayer,
  applyTransportLossForRemovedNavalUnits,
  autoDisembarkIndependentLandMoves,
  getSealiftStackStateImpl,
} from './sealift';

/**
 * Defines the `withTempDb` function shape (function withTempDb(runCase: () => void): void).

 * Purpose: Supports maintainability by documenting why `withTempDb` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function withTempDb(runCase: () => void): void {
  withTempGameDb('aw-sealift-', runCase);
}

/**
 * Defines the `pickHex` function shape (function pickHex(index: number): string).

 * Purpose: Supports maintainability by documenting why `pickHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function pickHex(index: number): string {
  const state = getGameState();
  const hex = state.hexes[index];
  assert.ok(hex, 'expected seeded hex');
  return hex.h3Index;
}

/**
 * Defines the `insertUnit` function shape (function insertUnit(id: string, player: 'human' | 'opponent', unitType: string, h3Index: string): void).

 * Purpose: Supports maintainability by documenting why `insertUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function insertUnit(id: string, player: 'human' | 'opponent', unitType: string, h3Index: string): void {
  dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, player, unitType, h3Index]);
}

/**
 * Defines the `setHexTerrain` function shape (function setHexTerrain(h3Index: string, terrain: 'land' | 'coastal' | 'water'): void).

 * Purpose: Supports maintainability by documenting why `setHexTerrain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function setHexTerrain(h3Index: string, terrain: 'land' | 'coastal' | 'water'): void {
  dbRun('UPDATE hexes SET terrain = ? WHERE h3_index = ?', [terrain, h3Index]);
}

/**
 * Defines the `setPortControl` function shape (function setPortControl(h3Index: string, controllerPlayerId: 'human' | 'opponent', seaportCount = 1): void).

 * Purpose: Supports maintainability by documenting why `setPortControl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function setPortControl(h3Index: string, controllerPlayerId: 'human' | 'opponent', seaportCount = 1): void {
  dbRun('UPDATE res1_infrastructure SET seaport_count = ? WHERE h3_index = ?', [seaportCount, h3Index]);
  dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [h3Index, controllerPlayerId]);
}

/**
 * Defines the `loadAssignments` function shape (function loadAssignments(): Array<).

 * Purpose: Supports maintainability by documenting why `loadAssignments` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function loadAssignments(): Array<{ landUnitId: string; navalUnitId: string }> {
  return dbGetAll<{ landUnitId: string; navalUnitId: string }>(
    'SELECT land_unit_id AS landUnitId, naval_unit_id AS navalUnitId FROM unit_transport_assignments ORDER BY land_unit_id'
  );
}

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
    insertUnit('opponent-armor-a', 'opponent', 'armor', coastalHex);
    const embarkContext = dbGetOne<{ terrain: string; seaportCount: number; controllerPlayerId: string | null }>(
      `SELECT hx.terrain AS terrain,
              ri.seaport_count AS seaportCount,
              rc.controller_player_id AS controllerPlayerId
       FROM hexes hx
       LEFT JOIN res1_infrastructure ri ON ri.h3_index = hx.h3_index
       LEFT JOIN res1_control rc ON rc.h3_index = hx.h3_index
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
      ],
      'opponent'
    );

    let assignments = loadAssignments();
    assert.deepStrictEqual(assignments, [
      { landUnitId: 'opponent-inf-a', navalUnitId: 'opponent-naval-a' },
      { landUnitId: 'opponent-inf-b', navalUnitId: 'opponent-naval-a' },
    ]);

    applyEmbarkOrdersForPlayer([{ unitId: 'opponent-armor-a', navalUnitId: 'opponent-naval-a' }], 'opponent');
    assignments = loadAssignments();
    assert.strictEqual(
      assignments.some((row) => row.landUnitId === 'opponent-armor-a'),
      false,
      'armor should be rejected when target naval already has cargo'
    );

    applyEmbarkOrdersForPlayer([{ unitId: 'opponent-inf-a', navalUnitId: 'opponent-naval-b' }], 'opponent');
    assignments = loadAssignments();
    assert.deepStrictEqual(assignments, [
      { landUnitId: 'opponent-inf-a', navalUnitId: 'opponent-naval-b' },
      { landUnitId: 'opponent-inf-b', navalUnitId: 'opponent-naval-a' },
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
    dbRun('UPDATE res1_infrastructure SET seaport_count = 0 WHERE h3_index = ?', [coastalNoPortHex]);

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
 * Defines the `testTransportLossDestroysCargoOnWaterAndDebarksOnCoastal` function shape (function testTransportLossDestroysCargoOnWaterAndDebarksOnCoastal(): void).

 * Purpose: Supports maintainability by documenting why `testTransportLossDestroysCargoOnWaterAndDebarksOnCoastal` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testTransportLossDestroysCargoOnWaterAndDebarksOnCoastal(): void {
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

    const removedCargo = applyTransportLossForRemovedNavalUnits([
      { id: 'human-naval-water-loss', player: 'human', unitType: 'naval', h3Index: waterHex } as CombatUnit,
      { id: 'human-naval-coastal-loss', player: 'human', unitType: 'naval', h3Index: coastalHex } as CombatUnit,
    ]);

    assert.deepStrictEqual(
      removedCargo.map((unit) => unit.id).sort(),
      ['human-inf-water-loss'],
      'water transport loss should remove embarked land cargo'
    );
    assert.strictEqual(
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM units WHERE id = ?', ['human-inf-water-loss'])?.count ?? 0,
      0,
      'water cargo should be deleted from units table'
    );
    assert.strictEqual(
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM units WHERE id = ?', ['human-inf-coastal-loss'])?.count ?? 0,
      1,
      'coastal cargo should remain alive'
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
 * Defines the `testAutoDisembarkOnIndependentMoveWhenNotOnWater` function shape (function testAutoDisembarkOnIndependentMoveWhenNotOnWater(): void).

 * Purpose: Supports maintainability by documenting why `testAutoDisembarkOnIndependentMoveWhenNotOnWater` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAutoDisembarkOnIndependentMoveWhenNotOnWater(): void {
  withTempDb(() => {
    const landHex = pickHex(7);
    const destinationHex = pickHex(8);
    dbRun('UPDATE hexes SET terrain = ? WHERE h3_index = ?', ['land', landHex]);
    insertUnit('human-naval-land-move', 'human', 'naval', landHex);
    insertUnit('human-inf-land-move', 'human', 'infantry', landHex);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      'human-inf-land-move',
      'human-naval-land-move',
    ]);

    autoDisembarkIndependentLandMoves([{ unitId: 'human-inf-land-move', toH3Index: destinationHex }]);

    const remaining = dbGetOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM unit_transport_assignments WHERE land_unit_id = ?',
      ['human-inf-land-move']
    )?.count ?? 0;
    assert.strictEqual(remaining, 0, 'expected independent move on non-water to auto-disembark');
  });
}

/**
 * Defines the `testSealiftStateDisablesDebarkButtonsOnWater` function shape (function testSealiftStateDisablesDebarkButtonsOnWater(): void).

 * Purpose: Supports maintainability by documenting why `testSealiftStateDisablesDebarkButtonsOnWater` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testSealiftStateDisablesDebarkButtonsOnWater(): void {
  withTempDb(() => {
    const waterHex = pickHex(9);
    setHexTerrain(waterHex, 'water');
    insertUnit('human-naval-water-debark-ui', 'human', 'naval', waterHex);
    insertUnit('human-inf-water-debark-ui', 'human', 'infantry', waterHex);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      'human-inf-water-debark-ui',
      'human-naval-water-debark-ui',
    ]);

    const state = getSealiftStackStateImpl(waterHex);
    assert.strictEqual(state.contextMode, 'water');
    assert.strictEqual(state.controlsDisabled, true);
    assert.strictEqual(state.navalRows.length, 1);
    assert.strictEqual(state.navalRows[0]?.debarkSlot1Enabled, false);
    assert.strictEqual(state.navalRows[0]?.debarkSlot2Enabled, false);
  });
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testApplyEmbarkOrdersEnforcesCapacityAndReassignment();
  testApplyEmbarkOrdersAllowsControlledSeaportRegardlessTerrainLabel();
  testApplyEmbarkOrdersRejectsAtSeaAndNoPort();
  testApplyEmbarkOrdersAllowsWaterAndArcticWhenPortPresent();
  testTransportLossDestroysCargoOnWaterAndDebarksOnCoastal();
  testAutoDisembarkOnIndependentMoveWhenNotOnWater();
  testSealiftStateDisablesDebarkButtonsOnWater();
  console.log('sealift.test.ts passed');
}

run();
