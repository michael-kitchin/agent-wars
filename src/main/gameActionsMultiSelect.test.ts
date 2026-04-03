/**
 * GameActions multi-select contracts: happy paths and essential failures only.
 * Run with: node dist/main/gameActionsMultiSelect.test.js
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { gridDistance } from 'h3-js';
import {
  openGameDatabaseAtPathForTests,
  closeGameDatabaseForTests,
  resetGameForNewMatch,
  getGameState,
  dbRun,
} from './gameDb';
import {
  assignHumanMarchOrders,
  previewHumanMarchOrders,
  validateGroupRangedTarget,
  submitOrders,
} from './gameActions';
import { getRes1ProductionContext } from './terrainClassificationCache';

function withTempDb(runCase: () => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gameactions-multi-'));
  const dbPath = path.join(dir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    runCase();
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

function run(): void {
  testPreviewGroupedHappyPathSingleUnit();
  testPreviewGroupedFailsForUnknownUnit();
  testAssignGroupedRejectsEmptySelection();
  testAssignGroupedHappyPathSingleUnit();
  testValidateGroupedRangedRejectsMeleeUnit();
  testNavalOrdersCanEgressFromLandSeaportToAdjacentWaterOrCoastal();
  console.log('gameActionsMultiSelect.test.ts passed');
}

run();
