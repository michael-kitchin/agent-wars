import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { gridDistance, gridPathCells } from 'h3-js';
import {
  openGameDatabaseAtPathForTests,
  closeGameDatabaseForTests,
  resetGameForNewMatch,
  dbRun,
  dbGetOne,
  getGameState,
} from './gameDb';
import {
  getHexBuildQueue,
  addHexBuildQueueEntry,
  updateHexBuildQueueEntry,
  removeHexBuildQueueEntry,
  ready,
  submitOrders,
} from './gameActions';

function withTempDb(runCase: () => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gameactions-prod-'));
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

function findBuildableHumanControlledHex(): string {
  const state = getGameState();
  for (const hx of state.hexes) {
    const queue = getHexBuildQueue(hx.h3Index, 'human');
    if (queue.controllerPlayerId === 'human' && queue.buildSectionVisible && queue.availableUnitTypes.length > 0) {
      return hx.h3Index;
    }
  }
  throw new Error('Expected at least one buildable human-controlled hex in seeded world.');
}

function findAnyHexExcluding(excluded: string): string {
  const state = getGameState();
  const hit = state.hexes.find((hx) => hx.h3Index !== excluded);
  if (!hit) throw new Error('Expected at least two map hexes.');
  return hit.h3Index;
}

function testBuildQueueMutationContracts(): void {
  withTempDb(() => {
    const h3 = findBuildableHumanControlledHex();
    const add = addHexBuildQueueEntry(h3, 'human');
    assert.strictEqual(add.success, true);
    const queueAfterAdd = getHexBuildQueue(h3, 'human');
    assert.strictEqual(queueAfterAdd.entries.length, 1);
    const entry = queueAfterAdd.entries[0]!;
    const updateBad = updateHexBuildQueueEntry(h3, entry.id, entry.unitType, 0, 'human');
    assert.strictEqual(updateBad.success, false);
    const updateGood = updateHexBuildQueueEntry(h3, entry.id, entry.unitType, 2, 'human');
    assert.strictEqual(updateGood.success, true);
    const queueAfterUpdate = getHexBuildQueue(h3, 'human');
    assert.strictEqual(queueAfterUpdate.entries[0]?.count, 2);
    // Immediate persistence contract: queue reads reflect changes right away.
    const queueAfterReread = getHexBuildQueue(h3, 'human');
    assert.strictEqual(queueAfterReread.entries[0]?.count, 2);
    const remove = removeHexBuildQueueEntry(h3, entry.id, 'human');
    assert.strictEqual(remove.success, true);
    const queueAfterRemove = getHexBuildQueue(h3, 'human');
    assert.strictEqual(queueAfterRemove.entries.length, 0);
  });
}

function testTypeChangeAfterCountEditKeepsCount(): void {
  withTempDb(() => {
    const h3 = findBuildableHumanControlledHex();
    const add = addHexBuildQueueEntry(h3, 'human');
    assert.strictEqual(add.success, true);
    const queue = getHexBuildQueue(h3, 'human');
    const entry = queue.entries[0]!;
    const updatedCount = updateHexBuildQueueEntry(h3, entry.id, entry.unitType, 23, 'human');
    assert.strictEqual(updatedCount.success, true);
    const refreshed = getHexBuildQueue(h3, 'human');
    const refreshedEntry = refreshed.entries[0]!;
    const targetType = refreshed.availableUnitTypes.find((t) => t !== refreshedEntry.unitType) ?? refreshedEntry.unitType;
    const updatedType = updateHexBuildQueueEntry(h3, refreshedEntry.id, targetType, refreshedEntry.count, 'human');
    assert.strictEqual(updatedType.success, true);
    const after = getHexBuildQueue(h3, 'human');
    assert.strictEqual(after.entries[0]?.count, 23);
  });
}

function testNoProductionBeforeReadyDuringPlanningEdits(): void {
  withTempDb(() => {
    const h3 = findBuildableHumanControlledHex();
    const unitsBefore = getGameState().units.length;
    const turnBefore = getGameState().turnNumber;
    const add = addHexBuildQueueEntry(h3, 'human');
    assert.strictEqual(add.success, true);
    const queue = getHexBuildQueue(h3, 'human');
    const entry = queue.entries[0]!;
    const update = updateHexBuildQueueEntry(h3, entry.id, entry.unitType, 4, 'human');
    assert.strictEqual(update.success, true);
    const unitsAfterEdits = getGameState().units.length;
    const turnAfterEdits = getGameState().turnNumber;
    assert.strictEqual(unitsAfterEdits, unitsBefore);
    assert.strictEqual(turnAfterEdits, turnBefore);
  });
}

function testControlTakeoverClearsQueueAndProgress(): void {
  withTempDb(() => {
    const targetHex = findBuildableHumanControlledHex();
    const add = addHexBuildQueueEntry(targetHex, 'human');
    assert.strictEqual(add.success, true);
    const queue = getHexBuildQueue(targetHex, 'human');
    assert.ok(queue.entries.length > 0, 'expected entry');
    const firstEntry = queue.entries[0]!;
    const update = updateHexBuildQueueEntry(targetHex, firstEntry.id, 'infantry', 1, 'human');
    assert.strictEqual(update.success, true);
    dbRun(
      `INSERT OR REPLACE INTO res1_build_progress (h3_index, stored_points) VALUES (?, ?)`,
      [targetHex, 9]
    );

    const state = getGameState();
    const opponent = state.units.find((u) => u.player === 'opponent');
    assert.ok(opponent, 'expected opponent unit');
    const fallbackHex = findAnyHexExcluding(targetHex);
    dbRun('UPDATE units SET h3_index = ? WHERE player = ? AND h3_index = ?', [fallbackHex, 'human', targetHex]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [targetHex, opponent!.id]);

    const result = ready();
    assert.strictEqual(result.success, true);
    const post = getHexBuildQueue(targetHex, 'human');
    assert.strictEqual(post.controllerPlayerId, 'opponent');
    assert.strictEqual(post.entries.length, 0);
    const progressRow = dbGetOne<{ stored_points: number }>(
      'SELECT stored_points FROM res1_build_progress WHERE h3_index = ?',
      [targetHex]
    );
    assert.strictEqual(progressRow, undefined);
  });
}

function testTraversedIntermediateHexCapturesControl(): void {
  withTempDb(() => {
    const state = getGameState();
    const armor = state.units.find((u) => u.player === 'human' && u.unitType === 'armor');
    assert.ok(armor, 'expected a human armor unit');
    const destination = state.hexes.find((hx) => {
      if (hx.h3Index === armor!.h3Index || hx.terrain === 'water') return false;
      try {
        return gridDistance(armor!.h3Index, hx.h3Index) === 2;
      } catch {
        return false;
      }
    });
    assert.ok(destination, 'expected a reachable armor destination 2 hexes away');
    let path: string[] = [];
    try {
      path = gridPathCells(armor!.h3Index, destination!.h3Index);
    } catch {
      path = [];
    }
    assert.ok(path.length >= 3, 'expected path with an intermediate hex');
    const intermediateHex = path[1]!;
    assert.notStrictEqual(intermediateHex, destination!.h3Index);
    assert.notStrictEqual(intermediateHex, armor!.h3Index);

    // Put the intermediate hex under opponent control and empty, so traversal capture is observable.
    dbRun('UPDATE units SET h3_index = ? WHERE h3_index = ? AND id <> ?', [armor!.h3Index, intermediateHex, armor!.id]);
    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [intermediateHex, 'opponent']);
    dbRun('DELETE FROM units WHERE player = ?', ['opponent']);

    const submit = submitOrders({
      movementOrders: [{ unitId: armor!.id, toH3Index: destination!.h3Index }],
    });
    assert.strictEqual(submit.success, true);
    const result = ready();
    assert.strictEqual(result.success, true);
    const postIntermediate = getHexBuildQueue(intermediateHex, 'human');
    assert.strictEqual(postIntermediate.controllerPlayerId, 'human');
  });
}

function testProductionSkipsWhenHumanUnitTypeAtCap(): void {
  withTempDb(() => {
    const targetHex = findBuildableHumanControlledHex();
    const add = addHexBuildQueueEntry(targetHex, 'human');
    assert.strictEqual(add.success, true);
    const queue = getHexBuildQueue(targetHex, 'human');
    const entry = queue.entries[0]!;
    const forceInfantry = updateHexBuildQueueEntry(targetHex, entry.id, 'infantry', 1, 'human');
    assert.strictEqual(forceInfantry.success, true);

    dbRun("DELETE FROM units WHERE player = 'human' AND unit_type = 'infantry'");
    for (let i = 0; i < 10; i++) {
      dbRun(
        `INSERT INTO units (id, player, unit_type, h3_index)
         VALUES (?, 'human', 'infantry', ?)`,
        [`human-infantry-cap-${i}`, targetHex]
      );
    }
    dbRun(
      `INSERT OR REPLACE INTO res1_build_progress (h3_index, stored_points)
       VALUES (?, 9)`,
      [targetHex]
    );

    const result = ready();
    assert.strictEqual(result.success, true);
    assert.ok(result.humanDeploymentCapReachedUnitTypes?.includes('infantry'));
    const infantryAfter = dbGetOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM units WHERE player = 'human' AND unit_type = 'infantry'"
    )?.c ?? 0;
    assert.strictEqual(infantryAfter, 10);
  });
}

function run(): void {
  testBuildQueueMutationContracts();
  testTypeChangeAfterCountEditKeepsCount();
  testNoProductionBeforeReadyDuringPlanningEdits();
  testControlTakeoverClearsQueueAndProgress();
  testTraversedIntermediateHexCapturesControl();
  testProductionSkipsWhenHumanUnitTypeAtCap();
  // eslint-disable-next-line no-console
  console.log('gameActionsProduction.test.ts passed');
}

run();
