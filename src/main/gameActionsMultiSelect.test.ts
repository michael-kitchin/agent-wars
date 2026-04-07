/**
 * GameActions multi-select contracts: happy paths and essential failures only.
 * Run with: node dist/main/gameActionsMultiSelect.test.js
 */

import * as assert from 'assert';
import { gridDistance } from 'h3-js';
import {
  dbGetOne,
  getGameState,
  dbRun,
} from './gameDb';
import {
  assignHumanMarchOrder,
  assignHumanMarchOrders,
  getSealiftStackState,
  previewHumanMarchOrders,
  ready,
  validateGroupRangedTarget,
  submitOrders,
  updateSealiftSlot,
} from './gameActions';
import { getRes1ProductionContext } from './terrainClassificationCache';
import { withTempGameDb } from './testSupport/withTempGameDb';
import {
  EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON,
  LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON,
} from './game-actions/landMovementConstraints';

function withTempDb(runCase: () => void): void {
  withTempGameDb('aw-gameactions-multi-', runCase);
}

function findNearestLandSeaportHex(state: ReturnType<typeof getGameState>, originH3: string): string | null {
  const landSeaportHexes = state.hexes
    .filter((hex) => hex.terrain === 'land' && getRes1ProductionContext({ h3Index: hex.h3Index }).seaportCount > 0)
    .sort((a, b) => {
      try {
        return gridDistance(originH3, a.h3Index) - gridDistance(originH3, b.h3Index);
      } catch {
        return a.h3Index.localeCompare(b.h3Index);
      }
    });
  return landSeaportHexes[0]?.h3Index ?? null;
}

function findAdjacentNavalPassableHex(state: ReturnType<typeof getGameState>, centerH3: string): string | null {
  const adjacentNavalHex = state.hexes.find((hex) => {
    const isNavalPassable = hex.terrain === 'water' || hex.terrain === 'coastal' || hex.terrainKind === 'coastal';
    if (!isNavalPassable) return false;
    try {
      return gridDistance(hex.h3Index, centerH3) === 1;
    } catch {
      return false;
    }
  });
  return adjacentNavalHex?.h3Index ?? null;
}

function findAdjacentWaterHex(state: ReturnType<typeof getGameState>, centerH3: string): string | null {
  const adjacentWaterHex = state.hexes.find((hex) => {
    if (hex.terrain !== 'water') return false;
    try {
      return gridDistance(hex.h3Index, centerH3) === 1;
    } catch {
      return false;
    }
  });
  return adjacentWaterHex?.h3Index ?? null;
}

function setHumanControlledPort(h3Index: string): void {
  const childRes4 = dbGetOne<{ h3Index: string }>(
    'SELECT h3_index AS h3Index FROM res4_feature_overrides WHERE parent_h3_index = ? LIMIT 1',
    [h3Index]
  );
  if (childRes4) {
    dbRun('UPDATE res4_feature_overrides SET is_seaport = 1 WHERE h3_index = ?', [childRes4.h3Index]);
  }
  dbRun('UPDATE res1_infrastructure SET seaport_count = 1 WHERE h3_index = ?', [h3Index]);
  dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [h3Index, 'human']);
}

function findAirportPairByDistance(
  state: ReturnType<typeof getGameState>,
  predicate: (distance: number) => boolean
): { originH3: string; destinationH3: string } | null {
  const airportHexes = state.hexes
    .map((hex) => {
      const airportCount =
        dbGetOne<{ airportCount: number }>(
          'SELECT airport_count AS airportCount FROM res1_infrastructure WHERE h3_index = ?',
          [hex.h3Index]
        )?.airportCount ?? 0;
      return airportCount > 0 ? hex.h3Index : null;
    })
    .filter((h3): h3 is string => !!h3);
  for (let i = 0; i < airportHexes.length; i++) {
    const originH3 = airportHexes[i]!;
    for (let j = 0; j < airportHexes.length; j++) {
      if (i === j) continue;
      const destinationH3 = airportHexes[j]!;
      try {
        const distance = gridDistance(originH3, destinationH3);
        if (predicate(distance)) return { originH3, destinationH3 };
      } catch {
        // Ignore malformed test pairs.
      }
    }
  }
  return null;
}

function setArcticTerrain(h3Index: string): void {
  dbRun('UPDATE hexes SET terrain = ?, terrain_kind = ? WHERE h3_index = ?', ['land', 'arctic', h3Index]);
}

function positionLandUnitOnAdjacentWaterPorts(
  state: ReturnType<typeof getGameState>,
  landUnitId: string
): { originWaterHex: string; destinationWaterHex: string } {
  const originWaterHex = state.hexes.find((hex) => hex.terrain === 'water');
  assert.ok(originWaterHex, 'expected a water origin hex');
  const destinationWaterHex = originWaterHex ? findAdjacentWaterHex(state, originWaterHex.h3Index) : null;
  assert.ok(destinationWaterHex, 'expected an adjacent water destination hex');
  dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [originWaterHex!.h3Index, landUnitId]);
  setHumanControlledPort(originWaterHex!.h3Index);
  setHumanControlledPort(destinationWaterHex!);
  return { originWaterHex: originWaterHex!.h3Index, destinationWaterHex: destinationWaterHex! };
}

function findHexByDistance(
  state: ReturnType<typeof getGameState>,
  originH3: string,
  predicate: (distance: number) => boolean
): string | null {
  for (const hex of state.hexes) {
    if (hex.h3Index === originH3) continue;
    try {
      const distance = gridDistance(originH3, hex.h3Index);
      if (predicate(distance)) return hex.h3Index;
    } catch {
      // Ignore uncomputable pairs in tests and keep searching.
    }
  }
  return null;
}

function findAdjacentHex(state: ReturnType<typeof getGameState>, originH3: string): string | null {
  for (const hex of state.hexes) {
    if (hex.h3Index === originH3) continue;
    try {
      if (gridDistance(originH3, hex.h3Index) === 1) return hex.h3Index;
    } catch {
      // Ignore malformed test pairs.
    }
  }
  return null;
}

function findAdjacentLandHex(state: ReturnType<typeof getGameState>, originH3: string): string | null {
  for (const hex of state.hexes) {
    if (hex.h3Index === originH3 || hex.terrain !== 'land') continue;
    try {
      if (gridDistance(originH3, hex.h3Index) === 1) return hex.h3Index;
    } catch {
      // Ignore malformed test pairs.
    }
  }
  return null;
}

function findAdjacentNonArcticLandHex(state: ReturnType<typeof getGameState>, originH3: string): string | null {
  for (const hex of state.hexes) {
    if (hex.h3Index === originH3 || hex.terrain !== 'land' || hex.terrainKind === 'arctic') continue;
    try {
      if (gridDistance(originH3, hex.h3Index) === 1) return hex.h3Index;
    } catch {
      // Ignore malformed test pairs.
    }
  }
  return null;
}

function findWaterHexWithAdjacentLand(state: ReturnType<typeof getGameState>): { waterHex: string; adjacentLandHex: string } | null {
  for (const hex of state.hexes) {
    if (hex.terrain !== 'water') continue;
    const hasRes4Child =
      (dbGetOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM res4_feature_overrides WHERE parent_h3_index = ?',
        [hex.h3Index]
      )?.count ?? 0) > 0;
    if (!hasRes4Child) continue;
    const adjacentLandHex = findAdjacentNonArcticLandHex(state, hex.h3Index);
    if (!adjacentLandHex) continue;
    return { waterHex: hex.h3Index, adjacentLandHex };
  }
  return null;
}

function testPreviewGroupedHappyPathSingleUnit(): void {
  withTempDb(() => {
    const state = getGameState();
    const human = state.units.find((u) => u.player === 'human');
    assert.ok(human, 'expected seeded human unit');
    const result = previewHumanMarchOrders([human!.id], human!.h3Index);
    assert.strictEqual(result.validForAll, true);
    assert.strictEqual(result.previews.length, 1);
    assert.strictEqual(result.previews[0]?.unitId, human!.id);
  });
}

function testPreviewGroupedFailsForUnknownUnit(): void {
  withTempDb(() => {
    const state = getGameState();
    const hovered = state.hexes[0]?.h3Index ?? '';
    const result = previewHumanMarchOrders(['human-missing-unit'], hovered);
    assert.strictEqual(result.validForAll, false);
    assert.ok(result.invalidReason, 'expected invalid reason');
  });
}

function testAssignGroupedRejectsEmptySelection(): void {
  withTempDb(() => {
    const state = getGameState();
    const destination = state.hexes[0]?.h3Index ?? '';
    const result = assignHumanMarchOrders([], destination);
    assert.strictEqual(result.success, false);
    assert.ok(result.reason?.includes('No selected units'));
  });
}

function testAssignGroupedHappyPathSingleUnit(): void {
  withTempDb(() => {
    const state = getGameState();
    const human = state.units.find((u) => u.player === 'human');
    assert.ok(human, 'expected seeded human unit');
    const result = assignHumanMarchOrders([human!.id], human!.h3Index);
    assert.strictEqual(result.success, true);
  });
}

function testValidateGroupedRangedRejectsMeleeUnit(): void {
  withTempDb(() => {
    const state = getGameState();
    const infantry = state.units.find((u) => u.player === 'human' && u.unitType === 'infantry');
    assert.ok(infantry, 'expected seeded human infantry unit');
    const target = state.hexes[0]?.h3Index ?? '';
    const result = validateGroupRangedTarget([infantry!.id], target);
    assert.strictEqual(result.success, false);
    assert.ok(result.reason?.includes('has no ranged attack'));
  });
}

function testNavalOrdersCanEgressFromLandSeaportToAdjacentWaterOrCoastal(): void {
  withTempDb(() => {
    const state = getGameState();
    const humanNaval = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(humanNaval, 'expected seeded human naval unit');
    const landSeaportH3 = findNearestLandSeaportHex(state, humanNaval!.h3Index);
    assert.ok(landSeaportH3, 'expected at least one land seaport hex');
    const adjacentNavalH3 = findAdjacentNavalPassableHex(state, landSeaportH3!);
    assert.ok(adjacentNavalH3, 'expected a water/coastal hex adjacent to a land seaport hex');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [landSeaportH3!, humanNaval!.id]);

    const preview = previewHumanMarchOrders([humanNaval!.id], adjacentNavalH3!);
    assert.strictEqual(
      preview.validForAll,
      true,
      preview.invalidReason ?? 'expected naval preview egress from land seaport to adjacent water/coastal'
    );

    const submit = submitOrders({
      movementOrders: [{ unitId: humanNaval!.id, toH3Index: adjacentNavalH3! }],
    });
    assert.strictEqual(
      submit.success,
      true,
      submit.reason ?? 'expected naval movement order from land seaport to adjacent water/coastal hex to be valid'
    );
  });
}

function testPreviewGroupedRejectsAirUnitsForMarchPlanning(): void {
  withTempDb(() => {
    const state = getGameState();
    const airportPair = findAirportPairByDistance(state, (distance) => distance > 4);
    assert.ok(airportPair, 'expected at least one airport destination beyond ferry range');
    const airUnitId = 'human-air-preview-test-1';
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      airUnitId,
      'human',
      'air',
      airportPair!.originH3,
    ]);

    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [airportPair!.destinationH3, 'human']);
    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [airportPair!.originH3, 'human']);
    const result = previewHumanMarchOrders([airUnitId], airportPair!.destinationH3);
    const outOfRangeReason = result.invalidReason ?? null;
    const hasExpectedOutOfRangeReason =
      outOfRangeReason?.includes('out of range') || outOfRangeReason?.includes('out of ferry range');
    assert.ok(hasExpectedOutOfRangeReason, `expected out-of-range ferry reason, got: ${outOfRangeReason}`);
  });
}

function testPreviewGroupedAcceptsAirFerryDestinationWithinRange(): void {
  withTempDb(() => {
    const state = getGameState();
    const airportPair = findAirportPairByDistance(state, (distance) => distance >= 1 && distance <= 4);
    assert.ok(airportPair, 'expected an airport destination within ferry range');
    const airUnitId = 'human-air-preview-test-2';
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      airUnitId,
      'human',
      'air',
      airportPair!.originH3,
    ]);
    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [airportPair!.destinationH3, 'human']);
    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [airportPair!.originH3, 'human']);
    const result = previewHumanMarchOrders([airUnitId], airportPair!.destinationH3);
    assert.strictEqual(result.validForAll, true);
    assert.strictEqual(result.previews.length, 1);
    assert.strictEqual(result.previews[0]?.preview.valid, true);
  });
}

function testAssignMarchRejectsAirUnits(): void {
  withTempDb(() => {
    const state = getGameState();
    const human = state.units.find((u) => u.player === 'human');
    assert.ok(human, 'expected seeded human unit');
    const destination = state.hexes[0]?.h3Index ?? '';
    const airUnitId = 'human-air-assign-test-1';
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      airUnitId,
      'human',
      'air',
      human!.h3Index,
    ]);
    const result = assignHumanMarchOrder(airUnitId, destination);
    assert.strictEqual(result.success, false);
    assert.ok(result.reason?.includes('Air units cannot use march orders'));
  });
}

function testPreviewEmbarkedLandUnitOnWaterShowsInvalidWithoutPathPlanning(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    const waterHex = state.hexes.find((hex) => hex.terrain === 'water');
    const hoveredHex = state.hexes.find((hex) => hex.h3Index !== (waterHex?.h3Index ?? ''));
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    assert.ok(waterHex, 'expected at least one water hex');
    assert.ok(hoveredHex, 'expected at least one hovered destination hex');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [waterHex!.h3Index, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [waterHex!.h3Index, navalUnit!.id]);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      landUnit!.id,
      navalUnit!.id,
    ]);
    const result = previewHumanMarchOrders([landUnit!.id], hoveredHex!.h3Index);
    assert.strictEqual(result.validForAll, false);
    assert.strictEqual(result.showInvalidMarker, true);
    assert.strictEqual(
      result.invalidReason,
      EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON
    );
    assert.strictEqual(result.previews.length, 1);
    assert.strictEqual(result.previews[0]?.preview.valid, false);
    assert.strictEqual(result.previews[0]?.preview.showInvalidMarker, true);
    assert.deepStrictEqual(result.previews[0]?.preview.segments, []);
  });
}

function testEmbarkedLandUnitCanPreviewAndAssignFromSeaportWaterToAdjacentLand(): void {
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

    const preview = previewHumanMarchOrders([landUnit!.id], waterWithAdjacentLand!.adjacentLandHex);
    assert.strictEqual(preview.validForAll, true, preview.invalidReason ?? 'expected preview to allow seaport disembark move');
    const assign = assignHumanMarchOrder(landUnit!.id, waterWithAdjacentLand!.adjacentLandHex);
    assert.strictEqual(assign.success, true, assign.reason ?? 'expected assignment to allow seaport disembark move');
  });
}

function testAssignMarchForEmbarkedLandUnitImmediatelyDebarksAndClearsSealiftSlot(): void {
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
    assert.strictEqual(assign.success, true, assign.reason ?? 'expected independent disembark move assignment to succeed');
    const assignmentCount =
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM unit_transport_assignments WHERE land_unit_id = ?', [landUnit!.id])
        ?.count ?? 0;
    assert.strictEqual(assignmentCount, 0, 'expected embarked assignment to be removed immediately');
    const sealiftState = getSealiftStackState(waterWithAdjacentLand!.waterHex);
    const navalRow = sealiftState.navalRows.find((row) => row.navalUnitId === navalUnit!.id);
    assert.ok(navalRow, 'expected naval row in sealift state');
    assert.strictEqual(navalRow?.slot1UnitId ?? null, null, 'expected sealift slot to be deselected after debark move order');
  });
}

function testPreviewEmbarkedLandUnitRepairsRes1Res4SeaportDrift(): void {
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
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      landUnit!.id,
      navalUnit!.id,
    ]);

    // Simulate drift: res4 says seaport exists while res1 count is stale at zero.
    const childRes4 = dbGetOne<{ h3Index: string }>(
      'SELECT h3_index AS h3Index FROM res4_feature_overrides WHERE parent_h3_index = ? LIMIT 1',
      [waterWithAdjacentLand!.waterHex]
    );
    assert.ok(childRes4, 'expected at least one res4 child row under the selected water hex');
    dbRun('UPDATE res4_feature_overrides SET is_seaport = 1 WHERE h3_index = ?', [childRes4!.h3Index]);
    dbRun('UPDATE res1_infrastructure SET seaport_count = 0 WHERE h3_index = ?', [waterWithAdjacentLand!.waterHex]);

    const preview = previewHumanMarchOrders([landUnit!.id], waterWithAdjacentLand!.adjacentLandHex);
    assert.strictEqual(preview.validForAll, true, preview.invalidReason ?? 'expected preview to recover from infrastructure drift');
    const repairedSeaportCount =
      dbGetOne<{ seaportCount: number }>(
        'SELECT seaport_count AS seaportCount FROM res1_infrastructure WHERE h3_index = ?',
        [waterWithAdjacentLand!.waterHex]
      )?.seaportCount ?? 0;
    assert.ok(repairedSeaportCount > 0, 'expected preview path to reconcile stale res1 seaport count');
  });
}

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

    const embarkResult = updateSealiftSlot(seaportHex!, navalUnit!.id, 1, landUnit!.id);
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

function testReadyIncludesEmbarkedCargoFollowMoveForNavalMovement(): void {
  withTempDb(() => {
    const state = getGameState();
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    assert.ok(navalUnit, 'expected seeded human naval unit');
    assert.ok(landUnit, 'expected seeded human land unit');
    const destination = findAdjacentNavalPassableHex(state, navalUnit!.h3Index);
    assert.ok(destination, 'expected adjacent naval-passable destination');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [navalUnit!.h3Index, landUnit!.id]);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      landUnit!.id,
      navalUnit!.id,
    ]);
    const assignResult = assignHumanMarchOrders([navalUnit!.id], destination!);
    assert.strictEqual(assignResult.success, true, assignResult.reason ?? 'expected naval order assignment to succeed');
    const readyResult = ready();
    assert.strictEqual(readyResult.success, true, readyResult.reason ?? 'expected ready to succeed');
    const moves = readyResult.humanMoves ?? [];
    const navalMove = moves.find((m) => m.unitId === navalUnit!.id);
    const cargoMove = moves.find((m) => m.unitId === landUnit!.id);
    assert.ok(navalMove, 'expected naval move in playback moves');
    assert.ok(cargoMove, 'expected embarked cargo follow move in playback moves');
    assert.strictEqual(navalMove!.toH3Index, destination);
    assert.strictEqual(cargoMove!.toH3Index, destination);
  });
}

function testSubmitOrdersAllowsLandMovementToSingleArcticHex(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find((u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor'));
    assert.ok(landUnit, 'expected seeded human land unit');
    const adjacent = findAdjacentHex(state, landUnit!.h3Index);
    assert.ok(adjacent, 'expected adjacent destination hex');
    dbRun('UPDATE hexes SET terrain = ?, terrain_kind = ? WHERE h3_index = ?', ['land', 'arctic', adjacent!]);
    const result = submitOrders({
      movementOrders: [{ unitId: landUnit!.id, toH3Index: adjacent! }],
    });
    assert.strictEqual(result.success, true, result.reason ?? 'expected single-transition movement into arctic to be allowed');
  });
}

function testSubmitOrdersAllowsLandMovementFromSingleArcticHex(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find((u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor'));
    assert.ok(landUnit, 'expected seeded human land unit');
    const adjacent = findAdjacentHex(state, landUnit!.h3Index);
    assert.ok(adjacent, 'expected adjacent destination hex');
    dbRun('UPDATE hexes SET terrain = ?, terrain_kind = ? WHERE h3_index = ?', ['land', 'arctic', landUnit!.h3Index]);
    dbRun('UPDATE hexes SET terrain = ?, terrain_kind = ? WHERE h3_index = ?', ['land', 'plains', adjacent!]);
    const result = submitOrders({
      movementOrders: [{ unitId: landUnit!.id, toH3Index: adjacent! }],
    });
    assert.strictEqual(result.success, true, result.reason ?? 'expected single-transition movement from arctic to be allowed');
  });
}

function testSubmitOrdersRejectsLandWaterToWaterPortMovement(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find((u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor'));
    assert.ok(landUnit, 'expected seeded human land unit');
    const { destinationWaterHex } = positionLandUnitOnAdjacentWaterPorts(state, landUnit!.id);
    const result = submitOrders({
      movementOrders: [{ unitId: landUnit!.id, toH3Index: destinationWaterHex! }],
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON);
  });
}

function testPreviewShowsInvalidForLandWaterToWaterPortMovement(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find((u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor'));
    assert.ok(landUnit, 'expected seeded human land unit');
    const { destinationWaterHex } = positionLandUnitOnAdjacentWaterPorts(state, landUnit!.id);
    const result = previewHumanMarchOrders([landUnit!.id], destinationWaterHex!);
    assert.strictEqual(result.validForAll, false);
    assert.strictEqual(result.showInvalidMarker, true);
    assert.strictEqual(result.invalidReason, LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON);
  });
}

function testSubmitOrdersRejectsLandWaterToArcticPortMovement(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find((u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor'));
    assert.ok(landUnit, 'expected seeded human land unit');
    const originWaterHex = state.hexes.find((hex) => hex.terrain === 'water');
    assert.ok(originWaterHex, 'expected a water origin hex');
    const destinationAdjacentHex = originWaterHex ? findAdjacentHex(state, originWaterHex.h3Index) : null;
    assert.ok(destinationAdjacentHex, 'expected an adjacent destination hex for arctic setup');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [originWaterHex!.h3Index, landUnit!.id]);
    setArcticTerrain(destinationAdjacentHex!);
    setHumanControlledPort(originWaterHex!.h3Index);
    setHumanControlledPort(destinationAdjacentHex!);
    const result = submitOrders({
      movementOrders: [{ unitId: landUnit!.id, toH3Index: destinationAdjacentHex! }],
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON);
  });
}

function run(): void {
  testPreviewGroupedHappyPathSingleUnit();
  testPreviewGroupedFailsForUnknownUnit();
  testAssignGroupedRejectsEmptySelection();
  testAssignGroupedHappyPathSingleUnit();
  testValidateGroupedRangedRejectsMeleeUnit();
  testNavalOrdersCanEgressFromLandSeaportToAdjacentWaterOrCoastal();
  testPreviewGroupedRejectsAirUnitsForMarchPlanning();
  testPreviewGroupedAcceptsAirFerryDestinationWithinRange();
  testAssignMarchRejectsAirUnits();
  testPreviewEmbarkedLandUnitOnWaterShowsInvalidWithoutPathPlanning();
  testEmbarkedLandUnitCanPreviewAndAssignFromSeaportWaterToAdjacentLand();
  testAssignMarchForEmbarkedLandUnitImmediatelyDebarksAndClearsSealiftSlot();
  testPreviewEmbarkedLandUnitRepairsRes1Res4SeaportDrift();
  testEmbarkImmediatelyCancelsExistingHumanMovementOrder();
  testReadyIncludesEmbarkedCargoFollowMoveForNavalMovement();
  testSubmitOrdersAllowsLandMovementToSingleArcticHex();
  testSubmitOrdersAllowsLandMovementFromSingleArcticHex();
  testSubmitOrdersRejectsLandWaterToWaterPortMovement();
  testPreviewShowsInvalidForLandWaterToWaterPortMovement();
  testSubmitOrdersRejectsLandWaterToArcticPortMovement();
  console.log('gameActionsMultiSelect.test.ts passed');
}

run();
