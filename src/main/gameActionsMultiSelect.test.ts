/**
 * GameActions multi-select contracts: happy paths and essential failures only.
 * Run with: node dist/main/gameActionsMultiSelect.test.js
 */

import * as assert from 'assert';
import { gridDistance } from 'h3-js';
import {
  getGameState,
  dbRun,
} from './gameDb';
import {
  assignHumanMarchOrder,
  assignHumanMarchOrders,
  previewHumanMarchOrders,
  validateGroupRangedTarget,
  submitOrders,
} from './gameActions';
import { getRes1ProductionContext } from './terrainClassificationCache';
import { withTempGameDb } from './testSupport/withTempGameDb';

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
    const human = state.units.find((u) => u.player === 'human');
    assert.ok(human, 'expected seeded human unit');
    const airUnitId = 'human-air-preview-test-1';
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      airUnitId,
      'human',
      'air',
      human!.h3Index,
    ]);
    dbRun('UPDATE res1_infrastructure SET airport_count = 1 WHERE h3_index = ?', [human!.h3Index]);
    const hovered = findHexByDistance(state, human!.h3Index, (distance) => distance > 4);
    assert.ok(hovered, 'expected at least one destination beyond ferry range');

    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [hovered!, 'human']);
    dbRun('UPDATE res1_infrastructure SET airport_count = 1 WHERE h3_index = ?', [hovered!]);
    const result = previewHumanMarchOrders([airUnitId], hovered!);
    const outOfRangeReason = result.invalidReason ?? null;
    const hasExpectedOutOfRangeReason =
      outOfRangeReason?.includes('out of range') || outOfRangeReason?.includes('out of ferry range');
    assert.ok(hasExpectedOutOfRangeReason, `expected out-of-range ferry reason, got: ${outOfRangeReason}`);
  });
}

function testPreviewGroupedAcceptsAirFerryDestinationWithinRange(): void {
  withTempDb(() => {
    const state = getGameState();
    const human = state.units.find((u) => u.player === 'human');
    assert.ok(human, 'expected seeded human unit');
    const hovered = findHexByDistance(state, human!.h3Index, (distance) => distance >= 1 && distance <= 4);
    assert.ok(hovered, 'expected a destination within ferry range');
    const airUnitId = 'human-air-preview-test-2';
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      airUnitId,
      'human',
      'air',
      human!.h3Index,
    ]);
    dbRun('UPDATE res1_infrastructure SET airport_count = 1 WHERE h3_index = ?', [human!.h3Index]);
    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [hovered!, 'human']);
    dbRun('UPDATE res1_infrastructure SET airport_count = 1 WHERE h3_index = ?', [hovered!]);
    const result = previewHumanMarchOrders([airUnitId], hovered!);
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
  console.log('gameActionsMultiSelect.test.ts passed');
}

run();
