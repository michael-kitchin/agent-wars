/**
 * GameActions multi-select contracts: happy paths and essential failures only.
 * Run with: node dist/main/gameActionsMultiSelect.test.js
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  openGameDatabaseAtPathForTests,
  closeGameDatabaseForTests,
  resetGameForNewMatch,
  getGameState,
} from './gameDb';
import {
  assignHumanMarchOrders,
  previewHumanMarchOrders,
  validateGroupRangedTarget,
} from './gameActions';

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

function run(): void {
  testPreviewGroupedHappyPathSingleUnit();
  testPreviewGroupedFailsForUnknownUnit();
  testAssignGroupedRejectsEmptySelection();
  testAssignGroupedHappyPathSingleUnit();
  testValidateGroupedRangedRejectsMeleeUnit();
  console.log('gameActionsMultiSelect.test.ts passed');
}

run();
