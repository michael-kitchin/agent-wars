import * as assert from 'assert';
import { cellToParent, gridDistance, gridPathCells } from 'h3-js';
import {
  dbRun,
  dbGetOne,
  dbGetAll,
  getGameState,
  getKeepBuildingForHex,
  replaceBuildQueueForHex,
  setBuildProgressPointsForHex,
  setKeepBuildingForHex,
  setStrategicInfrastructureForHex,
} from './gameDb';
import {
  getHexBuildQueue,
  addHexBuildQueueEntry,
  updateHexBuildQueueEntry,
  removeHexBuildQueueEntry,
  applyBuildQueueTemplateToHexes,
  setHexesKeepBuilding,
  ready,
  submitOrders,
} from './gameActions';
import { pruneBuildQueueForInfrastructureState } from './gameActions/airStrikeResolution';
import {
  collectTraversedHexesByPlayer,
  processProductionAfterControlResolution,
  resolveStrategicControlAfterCombatAndMovement,
} from './gameActions/controlAndProduction';
import { getMaxUnitsPerType } from './productionCaps';
import { persistGameSize } from './gameDb/gameSizeConfig';
import { withTempGameDb } from './testSupport/withTempGameDb';
import { parseStrategicUnitId } from '../shared/unitIds';

/**
 * Defines the `withTempDb` function shape (function withTempDb(runCase: () => void): void).

 * Purpose: Supports maintainability by documenting why `withTempDb` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function withTempDb(runCase: () => void): void {
  withTempGameDb('aw-gameactions-prod-', runCase);
}

/**
 * Defines the `findBuildableHumanControlledHex` function shape (function findBuildableHumanControlledHex(): string).

 * Purpose: Supports maintainability by documenting why `findBuildableHumanControlledHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function findBuildableHumanControlledHex(): string {
  const state = getGameState();
  for (const hx of state.hexes) {
    const queue = getHexBuildQueue(hx.h3Index, 'human');
    if (queue.controllerPlayerId === 'human' && queue.buildSectionVisible && queue.availableUnitTypes.length > 0) {
      return hx.h3Index;
    }
  }
  // Stabilize production contract tests by provisioning one controlled hex with minimal infrastructure.
  const fallbackHex = state.hexes.find((hx) => getHexBuildQueue(hx.h3Index, 'human').controllerPlayerId === 'human');
  if (fallbackHex) {
    setStrategicInfrastructureForHex(fallbackHex.h3Index, { urbanHexCount: 1, airportCount: 0, seaportCount: 0 });
    const queue = getHexBuildQueue(fallbackHex.h3Index, 'human');
    if (queue.buildSectionVisible && queue.availableUnitTypes.length > 0) {
      return fallbackHex.h3Index;
    }
  }
  throw new Error('Expected at least one buildable human-controlled hex in seeded world.');
}

/**
 * Defines the `findAnyHexExcluding` function shape (function findAnyHexExcluding(excluded: string): string).

 * Purpose: Supports maintainability by documenting why `findAnyHexExcluding` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function findAnyHexExcluding(excluded: string): string {
  const state = getGameState();
  const hit = state.hexes.find((hx) => hx.h3Index !== excluded);
  if (!hit) throw new Error('Expected at least two map hexes.');
  return hit.h3Index;
}

/**
 * Finds two distinct human-controlled hexes for multi-hex production contracts.
 *
 * Purpose: Keeps batch queue tests independent of any particular seeded H3 ids.
 * When to use: Tests that require different infrastructure eligibility on sibling human hexes.
 * Expected outcome: Two controlled hex ids from the temporary game database.
 * Exceptions: Throws when the seeded scenario does not provide two human-controlled hexes.
 */
function findTwoHumanControlledHexes(): [string, string] {
  const controlled = getGameState().hexes
    .map((hex) => hex.h3Index)
    .filter((h3Index) => getHexBuildQueue(h3Index, 'human').controlledByRequester);
  if (controlled.length < 2) throw new Error('Expected at least two human-controlled hexes.');
  return [controlled[0]!, controlled[1]!];
}

/**
 * Defines the `testBuildQueueMutationContracts` function shape (function testBuildQueueMutationContracts(): void).

 * Purpose: Supports maintainability by documenting why `testBuildQueueMutationContracts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testTypeChangeAfterCountEditKeepsCount` function shape (function testTypeChangeAfterCountEditKeepsCount(): void).

 * Purpose: Supports maintainability by documenting why `testTypeChangeAfterCountEditKeepsCount` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Verifies shared templates apply best-effort and filter unavailable types per hex.
 *
 * Purpose: Protects the core contract used by multi-hex renderer synchronization.
 * When to use: Backend production regression suite.
 * Expected outcome: Eligible rows preserve order, ineligible rows are reported, counts clamp, and
 * an invalid sibling does not roll back a valid write.
 * Exceptions: None.
 */
function testBatchBuildQueueTemplateContracts(): void {
  withTempDb(() => {
    const [coastalHex, inlandHex] = findTwoHumanControlledHexes();
    setStrategicInfrastructureForHex(coastalHex, { urbanHexCount: 10, airportCount: 0, seaportCount: 1 });
    setStrategicInfrastructureForHex(inlandHex, { urbanHexCount: 10, airportCount: 0, seaportCount: 0 });

    const apply = applyBuildQueueTemplateToHexes(
      [coastalHex, inlandHex, 'invalid-h3-index'],
      [
        { unitType: 'naval', count: 1 },
        { unitType: 'infantry', count: 120 },
      ],
      'human'
    );
    assert.strictEqual(apply.success, false);
    assert.deepStrictEqual(apply.applied, [coastalHex, inlandHex]);
    assert.ok(apply.skipped.some((row) => row.h3Index === inlandHex && row.unitType === 'naval'));
    assert.ok(apply.failed.some((row) => row.h3Index === 'invalid-h3-index'));
    assert.deepStrictEqual(
      getHexBuildQueue(coastalHex, 'human').entries.map((entry) => [entry.unitType, entry.count]),
      [
        ['naval', 1],
        ['infantry', 99],
      ]
    );
    assert.deepStrictEqual(
      getHexBuildQueue(inlandHex, 'human').entries.map((entry) => [entry.unitType, entry.count]),
      [['infantry', 99]]
    );

    setBuildProgressPointsForHex(coastalHex, 17);
    const preservePoints = applyBuildQueueTemplateToHexes(
      [coastalHex],
      [{ unitType: 'infantry', count: 2 }],
      'human'
    );
    assert.strictEqual(preservePoints.success, true);
    assert.strictEqual(getHexBuildQueue(coastalHex, 'human').storedPoints, 17);
    assert.deepStrictEqual(
      getHexBuildQueue(coastalHex, 'human').entries.map((entry) => [entry.unitType, entry.count]),
      [['infantry', 2]]
    );

    const empty = applyBuildQueueTemplateToHexes([], [], 'human');
    assert.strictEqual(empty.success, false);
    assert.match(empty.reason ?? '', /at least one/i);
  });
}

/**
 * Defines the `testNoProductionBeforeReadyDuringPlanningEdits` function shape (function testNoProductionBeforeReadyDuringPlanningEdits(): void).

 * Purpose: Supports maintainability by documenting why `testNoProductionBeforeReadyDuringPlanningEdits` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testControlTakeoverClearsQueueAndProgress` function shape (function testControlTakeoverClearsQueueAndProgress(): void).

 * Purpose: Supports maintainability by documenting why `testControlTakeoverClearsQueueAndProgress` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
      `INSERT OR REPLACE INTO res_s_build_progress (h3_index, stored_points) VALUES (?, ?)`,
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
      'SELECT stored_points FROM res_s_build_progress WHERE h3_index = ?',
      [targetHex]
    );
    assert.strictEqual(progressRow, undefined);
  });
}

/**
 * Defines the `testTraversedIntermediateHexCapturesControl` function shape (function testTraversedIntermediateHexCapturesControl(): void).

 * Purpose: Supports maintainability by documenting why `testTraversedIntermediateHexCapturesControl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [intermediateHex, 'opponent']);
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

/**
 * Defines the `findNavalPassableHex` function shape (function findNavalPassableHex(): string).

 * Purpose: Supports maintainability by documenting why `findNavalPassableHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function findNavalPassableHex(): string {
  const state = getGameState();
  const hit = state.hexes.find((hx) => hx.terrain === 'water' || hx.terrain === 'coastal');
  if (!hit) throw new Error('Expected at least one naval-passable hex.');
  return hit.h3Index;
}

/**
 * Defines the `testNavalOccupancyGrantsControl` function shape (function testNavalOccupancyGrantsControl(): void).

 * Purpose: Supports maintainability by documenting why `testNavalOccupancyGrantsControl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNavalOccupancyGrantsControl(): void {
  withTempDb(() => {
    const targetHex = findNavalPassableHex();
    dbRun('DELETE FROM units WHERE h3_index = ?', [targetHex]);
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [targetHex, 'opponent']);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      'human-naval-control-grant',
      'human',
      'naval',
      targetHex,
    ]);

    const transitions = resolveStrategicControlAfterCombatAndMovement();
    const post = getHexBuildQueue(targetHex, 'human');

    assert.strictEqual(post.controllerPlayerId, 'human');
    assert.ok(
      transitions.some((transition) => transition.h3Index === targetHex && transition.toControllerPlayerId === 'human'),
      'expected control transition to human from naval-only occupancy'
    );
  });
}

/**
 * Defines the `testNavalMixedOccupancyContestsControl` function shape (function testNavalMixedOccupancyContestsControl(): void).

 * Purpose: Supports maintainability by documenting why `testNavalMixedOccupancyContestsControl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNavalMixedOccupancyContestsControl(): void {
  withTempDb(() => {
    const targetHex = findNavalPassableHex();
    dbRun('DELETE FROM units WHERE h3_index = ?', [targetHex]);
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [targetHex, 'human']);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      'human-naval-control-contest',
      'human',
      'naval',
      targetHex,
    ]);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      'opponent-naval-control-contest',
      'opponent',
      'naval',
      targetHex,
    ]);

    const transitions = resolveStrategicControlAfterCombatAndMovement();
    const post = getHexBuildQueue(targetHex, 'human');

    assert.strictEqual(post.controllerPlayerId, 'human');
    assert.strictEqual(
      transitions.some((transition) => transition.h3Index === targetHex),
      false,
      'expected no control transition for contested naval occupancy'
    );
  });
}

/**
 * Defines the `testLandArmorPlusEnemyAirContestsControl` function shape (function testLandArmorPlusEnemyAirContestsControl(): void).
 *
 * Purpose: Regression guard for Fight→tactical when human armor shares a strategic hex with opponent air after movement.
 * When to use: `gameActionsProduction.test.ts` harness.
 * Expected outcome: Control must not flip to the land-only side while enemy air remains; otherwise finalize removes air
 * as stranded and tactical start fails with “not contested”.
 * Exceptions: None.
 */
function testLandArmorPlusEnemyAirContestsControl(): void {
  withTempDb(() => {
    const state = getGameState();
    const landHex = state.hexes.find((hx) => hx.terrainKind !== 'water' && hx.terrain !== 'water');
    if (!landHex) throw new Error('Expected a land hex for armor/air co-occupancy test.');
    const targetHex = landHex.h3Index;
    dbRun('DELETE FROM units WHERE h3_index = ?', [targetHex]);
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [targetHex, 'opponent']);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      'human-armor-air-contest',
      'human',
      'armor',
      targetHex,
    ]);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      'opponent-air-air-contest',
      'opponent',
      'air',
      targetHex,
    ]);

    const transitions = resolveStrategicControlAfterCombatAndMovement();
    const post = getHexBuildQueue(targetHex, 'human');

    assert.strictEqual(post.controllerPlayerId, 'opponent');
    assert.strictEqual(
      transitions.some((transition) => transition.h3Index === targetHex),
      false,
      'expected no control transition when land and enemy air co-occupy the same hex'
    );
  });
}

/**
 * Defines the `testNavalTraversedIntermediateHexCapturesControl` function shape (function testNavalTraversedIntermediateHexCapturesControl(): void).

 * Purpose: Supports maintainability by documenting why `testNavalTraversedIntermediateHexCapturesControl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNavalTraversedIntermediateHexCapturesControl(): void {
  withTempDb(() => {
    const state = getGameState();
    const naval = state.units.find((u) => {
      if (u.player !== 'human' || u.unitType !== 'naval') return false;
      const originHex = state.hexes.find((hex) => hex.h3Index === u.h3Index);
      return originHex?.terrain === 'water' || originHex?.terrain === 'coastal';
    });
    assert.ok(naval, 'expected a human naval unit on water/coastal');
    const destination = state.hexes.find((hx) => {
      if (hx.h3Index === naval!.h3Index) return false;
      if (!(hx.terrain === 'water' || hx.terrain === 'coastal')) return false;
      try {
        return gridDistance(naval!.h3Index, hx.h3Index) === 2;
      } catch {
        return false;
      }
    });
    assert.ok(destination, 'expected a naval-passable destination 2 hexes away');
    let path: string[] = [];
    try {
      path = gridPathCells(naval!.h3Index, destination!.h3Index);
    } catch {
      path = [];
    }
    assert.ok(path.length >= 3, 'expected path with an intermediate hex');
    const intermediateHex = path[1]!;
    assert.notStrictEqual(intermediateHex, destination!.h3Index);
    assert.notStrictEqual(intermediateHex, naval!.h3Index);

    dbRun('UPDATE units SET h3_index = ? WHERE h3_index = ? AND id <> ?', [naval!.h3Index, intermediateHex, naval!.id]);
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [intermediateHex, 'opponent']);

    const traversed = collectTraversedHexesByPlayer(
      [{ unitId: naval!.id, toH3Index: destination!.h3Index }],
      [{ id: naval!.id, player: naval!.player, h3Index: naval!.h3Index, unitType: naval!.unitType }]
    );
    const transitions = resolveStrategicControlAfterCombatAndMovement(traversed);
    const postIntermediate = getHexBuildQueue(intermediateHex, 'human');

    assert.strictEqual(postIntermediate.controllerPlayerId, 'human');
    assert.ok(
      transitions.some(
        (transition) =>
          transition.h3Index === intermediateHex &&
          transition.fromControllerPlayerId === 'opponent' &&
          transition.toControllerPlayerId === 'human'
      ),
      'expected intermediate traversal control transition from opponent to human for naval movement'
    );
  });
}

/**
 * Defines the `testProductionBlocksWhenFirstEnqueuedUnitTypeAtCap` function shape (function testProductionBlocksWhenFirstEnqueuedUnitTypeAtCap(): void).

 * Purpose: Supports maintainability by documenting why `testProductionBlocksWhenFirstEnqueuedUnitTypeAtCap` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testProductionBlocksWhenFirstEnqueuedUnitTypeAtCap(): void {
  withTempDb(() => {
    const targetHex = findBuildableHumanControlledHex();
    const add = addHexBuildQueueEntry(targetHex, 'human');
    assert.strictEqual(add.success, true);
    const queue = getHexBuildQueue(targetHex, 'human');
    const entry = queue.entries[0]!;
    const forceInfantry = updateHexBuildQueueEntry(targetHex, entry.id, 'infantry', 1, 'human');
    assert.strictEqual(forceInfantry.success, true);

    dbRun("DELETE FROM units WHERE player = 'human' AND unit_type = 'infantry'");
    const infantryCap = getMaxUnitsPerType('small').infantry;
    for (let i = 0; i < infantryCap; i++) {
      dbRun(
        `INSERT INTO units (id, player, unit_type, h3_index)
         VALUES (?, 'human', 'infantry', ?)`,
        [`human-infantry-cap-${i}`, targetHex]
      );
    }
    dbRun(
      `INSERT OR REPLACE INTO res_s_build_progress (h3_index, stored_points)
       VALUES (?, 9)`,
      [targetHex]
    );

    const result = ready();
    assert.strictEqual(result.success, true);
    assert.ok(result.humanDeploymentCapReachedUnitTypes?.includes('infantry'));
    const infantryAfter = dbGetOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM units WHERE player = 'human' AND unit_type = 'infantry'"
    )?.c ?? 0;
    assert.strictEqual(infantryAfter, infantryCap);
    const queueAfter = getHexBuildQueue(targetHex, 'human');
    assert.strictEqual(queueAfter.entries.length, 1);
    assert.strictEqual(queueAfter.entries[0]?.unitType, 'infantry');
    assert.strictEqual(queueAfter.entries[0]?.count, 1);
    const progressAfter = dbGetOne<{ stored_points: number }>(
      'SELECT stored_points FROM res_s_build_progress WHERE h3_index = ?',
      [targetHex]
    )?.stored_points ?? 0;
    assert.ok(progressAfter > 9, 'stored points should continue accumulating while blocked by cap');
  });
}

/**
 * Locks Medium caps allowing spawn past the Small infantry ceiling, then blocking at Medium.
 *
 * Purpose: Match size must change the live deployment ceiling, not only snapshot metadata.
 * When to use: After changing production cap reads or `game_size` persistence.
 * Expected outcome: 12 infantry still spawn on Medium, with a birth origin in the producing hex; 24 infantry block and accumulate points.
 * Exceptions: None.
 */
function testProductionSpawnsPastSmallCapWhenMedium(): void {
  withTempDb(() => {
    persistGameSize({ run: dbRun, hasDb: () => true }, 'medium');
    const targetHex = findBuildableHumanControlledHex();
    const add = addHexBuildQueueEntry(targetHex, 'human');
    assert.strictEqual(add.success, true);
    const queue = getHexBuildQueue(targetHex, 'human');
    const entry = queue.entries[0]!;
    const forceInfantry = updateHexBuildQueueEntry(targetHex, entry.id, 'infantry', 1, 'human');
    assert.strictEqual(forceInfantry.success, true);

    dbRun("DELETE FROM units WHERE player = 'human' AND unit_type = 'infantry'");
    const smallCap = getMaxUnitsPerType('small').infantry;
    for (let i = 0; i < smallCap; i++) {
      dbRun(
        `INSERT INTO units (id, player, unit_type, h3_index)
         VALUES (?, 'human', 'infantry', ?)`,
        [`human-infantry-medium-under-${i}`, targetHex]
      );
    }
    dbRun(
      `INSERT OR REPLACE INTO res_s_build_progress (h3_index, stored_points)
       VALUES (?, 20)`,
      [targetHex]
    );

    const underResult = ready();
    assert.strictEqual(underResult.success, true);
    assert.ok(!underResult.humanDeploymentCapReachedUnitTypes?.includes('infantry'));
    const infantryAfterUnder = dbGetOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM units WHERE player = 'human' AND unit_type = 'infantry'"
    )?.c ?? 0;
    assert.strictEqual(infantryAfterUnder, smallCap + 1);
    const unitsAfterSpawn = getGameState().units;
    const legacyUnit = unitsAfterSpawn.find((u) => u.id === 'human-infantry-medium-under-0');
    assert.strictEqual(legacyUnit?.origin, undefined, 'rows inserted without birth columns carry no origin');
    const spawned = unitsAfterSpawn.find(
      (u) => u.player === 'human' && u.unitType === 'infantry' && !u.id.startsWith('human-infantry-medium-under-')
    );
    assert.strictEqual(spawned?.origin?.birthH3Index, targetHex, 'produced unit is born in the producing hex');
    const birthCell = spawned?.origin?.birthTacticalH3Index;
    if (birthCell) assert.strictEqual(cellToParent(birthCell, 1), targetHex, 'birth cell lies inside the producing hex');

    dbRun("DELETE FROM units WHERE player = 'human' AND unit_type = 'infantry'");
    const mediumCap = getMaxUnitsPerType('medium').infantry;
    for (let i = 0; i < mediumCap; i++) {
      dbRun(
        `INSERT INTO units (id, player, unit_type, h3_index)
         VALUES (?, 'human', 'infantry', ?)`,
        [`human-infantry-medium-at-${i}`, targetHex]
      );
    }
    dbRun(
      `INSERT OR REPLACE INTO res_s_build_progress (h3_index, stored_points)
       VALUES (?, 9)`,
      [targetHex]
    );
    const queued = getHexBuildQueue(targetHex, 'human');
    if (queued.entries.length === 0) {
      const addAgain = addHexBuildQueueEntry(targetHex, 'human');
      assert.strictEqual(addAgain.success, true);
      const againEntry = getHexBuildQueue(targetHex, 'human').entries[0]!;
      assert.strictEqual(updateHexBuildQueueEntry(targetHex, againEntry.id, 'infantry', 1, 'human').success, true);
    }

    const blocked = ready();
    assert.strictEqual(blocked.success, true);
    assert.ok(blocked.humanDeploymentCapReachedUnitTypes?.includes('infantry'));
    const infantryAfterBlock = dbGetOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM units WHERE player = 'human' AND unit_type = 'infantry'"
    )?.c ?? 0;
    assert.strictEqual(infantryAfterBlock, mediumCap);
    const progressAfter = dbGetOne<{ stored_points: number }>(
      'SELECT stored_points FROM res_s_build_progress WHERE h3_index = ?',
      [targetHex]
    )?.stored_points ?? 0;
    assert.ok(progressAfter > 9, 'stored points should continue accumulating while blocked by medium cap');
  });
}

/**
 * Defines the `testAirBuildRequiresAirportInfrastructure` function shape (function testAirBuildRequiresAirportInfrastructure(): void).

 * Purpose: Supports maintainability by documenting why `testAirBuildRequiresAirportInfrastructure` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAirBuildRequiresAirportInfrastructure(): void {
  withTempDb(() => {
    const targetHex = findBuildableHumanControlledHex();
    setStrategicInfrastructureForHex(targetHex, { urbanHexCount: 4, airportCount: 1, seaportCount: 0 });
    const queueWithoutUrban = getHexBuildQueue(targetHex, 'human');
    assert.ok(
      !queueWithoutUrban.availableUnitTypes.includes('air'),
      'expected air unit type to be unavailable without minimum urban production capacity'
    );

    setStrategicInfrastructureForHex(targetHex, { urbanHexCount: 5, airportCount: 0, seaportCount: 0 });
    const queueWithoutAirport = getHexBuildQueue(targetHex, 'human');
    assert.ok(
      !queueWithoutAirport.availableUnitTypes.includes('air'),
      'expected air unit type to be unavailable without an airport'
    );

    const add = addHexBuildQueueEntry(targetHex, 'human');
    assert.strictEqual(add.success, true);
    const entry = getHexBuildQueue(targetHex, 'human').entries[0]!;
    const forceAirWithoutAirport = updateHexBuildQueueEntry(targetHex, entry.id, 'air', entry.count, 'human');
    assert.strictEqual(forceAirWithoutAirport.success, false);

    setStrategicInfrastructureForHex(targetHex, { urbanHexCount: 5, airportCount: 1, seaportCount: 0 });
    const queueWithAirport = getHexBuildQueue(targetHex, 'human');
    assert.ok(
      queueWithAirport.availableUnitTypes.includes('air'),
      'expected air unit type to be available with an airport'
    );
    const forceAirWithAirport = updateHexBuildQueueEntry(targetHex, entry.id, 'air', entry.count, 'human');
    assert.strictEqual(forceAirWithAirport.success, true);
  });
}

/**
 * Defines the `testNavalBuildRequiresSeaportAndUrbanInfrastructure` function shape (function testNavalBuildRequiresSeaportAndUrbanInfrastructure(): void).

 * Purpose: Supports maintainability by documenting why `testNavalBuildRequiresSeaportAndUrbanInfrastructure` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNavalBuildRequiresSeaportAndUrbanInfrastructure(): void {
  withTempDb(() => {
    const targetHex = findBuildableHumanControlledHex();
    setStrategicInfrastructureForHex(targetHex, { urbanHexCount: 9, airportCount: 0, seaportCount: 1 });
    const queueWithoutUrban = getHexBuildQueue(targetHex, 'human');
    assert.ok(
      !queueWithoutUrban.availableUnitTypes.includes('naval'),
      'expected naval unit type to be unavailable without minimum urban production capacity'
    );

    setStrategicInfrastructureForHex(targetHex, { urbanHexCount: 1, airportCount: 0, seaportCount: 0 });
    const queueWithoutSeaport = getHexBuildQueue(targetHex, 'human');
    assert.ok(
      !queueWithoutSeaport.availableUnitTypes.includes('naval'),
      'expected naval unit type to be unavailable without a seaport'
    );

    setStrategicInfrastructureForHex(targetHex, { urbanHexCount: 10, airportCount: 0, seaportCount: 1 });
    const queueWithSeaport = getHexBuildQueue(targetHex, 'human');
    assert.ok(
      queueWithSeaport.availableUnitTypes.includes('naval'),
      'expected naval unit type to be available with seaport and minimum urban production capacity'
    );
  });
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * Keep-building arm/disarm, player-empty clear, and stored-points preservation.
 *
 * Purpose: Locks the human mutation contracts for the Keep building standing order.
 * When to use: After changing Keep-building persistence or queue-empty sync.
 * Expected outcome: Arm sets last type without rewriting rows; disarm and remove-last clear it;
 * setBuildProgressPointsForHex preserves the standing order; removing the last entry while armed clears it.
 * Exceptions: None.
 */
function testKeepBuildingMutationContracts(): void {
  withTempDb(() => {
    const h3 = findBuildableHumanControlledHex();
    const add = addHexBuildQueueEntry(h3, 'human');
    assert.strictEqual(add.success, true);
    const entry = getHexBuildQueue(h3, 'human').entries[0]!;
    assert.strictEqual(updateHexBuildQueueEntry(h3, entry.id, 'infantry', 3, 'human').success, true);

    const armed = setHexesKeepBuilding([h3], true, 'human');
    assert.strictEqual(armed.success, true);
    const afterArm = getHexBuildQueue(h3, 'human');
    assert.strictEqual(afterArm.keepBuilding, true);
    assert.strictEqual(afterArm.keepBuildingUnitType, 'infantry');
    assert.strictEqual(afterArm.entries.length, 1);
    assert.strictEqual(afterArm.entries[0]?.count, 3);

    setBuildProgressPointsForHex(h3, 11);
    const afterPoints = getHexBuildQueue(h3, 'human');
    assert.strictEqual(afterPoints.storedPoints, 11);
    assert.strictEqual(afterPoints.keepBuilding, true);
    assert.strictEqual(afterPoints.keepBuildingUnitType, 'infantry');

    assert.strictEqual(updateHexBuildQueueEntry(h3, entry.id, 'armor', 3, 'human').success, true);
    assert.strictEqual(getHexBuildQueue(h3, 'human').keepBuildingUnitType, 'armor');

    assert.strictEqual(removeHexBuildQueueEntry(h3, entry.id, 'human').success, true);
    const afterEmptyWhileArmed = getHexBuildQueue(h3, 'human');
    assert.strictEqual(afterEmptyWhileArmed.entries.length, 0);
    assert.strictEqual(afterEmptyWhileArmed.keepBuilding, false);
    assert.strictEqual(afterEmptyWhileArmed.keepBuildingUnitType, null);
    assert.strictEqual(setHexesKeepBuilding([h3], true, 'human').success, false);
  });
}

/**
 * Keep-building same-turn refill after draining during a production pulse.
 *
 * Purpose: Locks same-turn leftover spend, multi-refill loop, planning residue, and cap stall.
 * When to use: After changing Keep-building production refill timing or sizing.
 * Expected outcome: Owner $40/1-infantry example deploys 2 and leaves 1 queued; empty-start works;
 * cap stall retains refilled rows without infinite looping; ineligible refill clears standing order;
 * finite queues without Keep building still stop empty with leftover points banked.
 * Exceptions: None.
 */
function testKeepBuildingSameTurnRefill(): void {
  withTempDb(() => {
    const h3 = findBuildableHumanControlledHex();

    // Owner example: $40, 1 infantry queued, Keep building → 2 deployed, 1 residue.
    setStrategicInfrastructureForHex(h3, { urbanHexCount: 40, airportCount: 0, seaportCount: 0 });
    replaceBuildQueueForHex(h3, [{ unitType: 'infantry', remainingCount: 1 }]);
    setKeepBuildingForHex(h3, true, 'infantry');
    setBuildProgressPointsForHex(h3, 0);
    dbRun("DELETE FROM units WHERE player = 'human' AND unit_type = 'infantry'");
    const infantryBefore =
      dbGetOne<{ c: number }>(
        "SELECT COUNT(*) AS c FROM units WHERE player = 'human' AND unit_type = 'infantry'"
      )?.c ?? 0;

    processProductionAfterControlResolution();
    const infantryAfter =
      dbGetOne<{ c: number }>(
        "SELECT COUNT(*) AS c FROM units WHERE player = 'human' AND unit_type = 'infantry'"
      )?.c ?? 0;
    assert.strictEqual(infantryAfter - infantryBefore, 2);
    const producedInfantry = dbGetAll<{ id: string }>(
      "SELECT id FROM units WHERE player = 'human' AND unit_type = 'infantry'"
    );
    for (const row of producedInfantry) {
      const parsed = parseStrategicUnitId(row.id);
      assert.ok(parsed, `expected compact produced infantry id, got ${row.id}`);
      assert.strictEqual(parsed.player, 'human');
      assert.strictEqual(parsed.unitType, 'infantry');
    }
    const afterOwner = getHexBuildQueue(h3, 'human');
    assert.strictEqual(afterOwner.entries.length, 1);
    assert.strictEqual(afterOwner.entries[0]?.unitType, 'infantry');
    assert.strictEqual(afterOwner.entries[0]?.count, 1);
    assert.strictEqual(afterOwner.keepBuilding, true);
    assert.strictEqual(afterOwner.storedPoints, 0);

    // Empty start + Keep building + $40 → same 2 deployed + residue 1.
    replaceBuildQueueForHex(h3, []);
    setKeepBuildingForHex(h3, true, 'infantry');
    setBuildProgressPointsForHex(h3, 0);
    const infantryBeforeEmpty =
      dbGetOne<{ c: number }>(
        "SELECT COUNT(*) AS c FROM units WHERE player = 'human' AND unit_type = 'infantry'"
      )?.c ?? 0;
    processProductionAfterControlResolution();
    const infantryAfterEmpty =
      dbGetOne<{ c: number }>(
        "SELECT COUNT(*) AS c FROM units WHERE player = 'human' AND unit_type = 'infantry'"
      )?.c ?? 0;
    assert.strictEqual(infantryAfterEmpty - infantryBeforeEmpty, 2);
    const afterEmptyStart = getHexBuildQueue(h3, 'human');
    assert.strictEqual(afterEmptyStart.entries.length, 1);
    assert.strictEqual(afterEmptyStart.entries[0]?.count, 1);

    // Cap stall: refill inserts 2 armor; spend blocked; standing order remains.
    setStrategicInfrastructureForHex(h3, { urbanHexCount: 100, airportCount: 0, seaportCount: 0 });
    replaceBuildQueueForHex(h3, []);
    setKeepBuildingForHex(h3, true, 'armor');
    setBuildProgressPointsForHex(h3, 0);
    dbRun("DELETE FROM units WHERE player = 'human' AND unit_type = 'armor'");
    const armorCap = getMaxUnitsPerType('small').armor;
    for (let i = 0; i < armorCap; i++) {
      dbRun(
        `INSERT INTO units (id, player, unit_type, h3_index)
         VALUES (?, 'human', 'armor', ?)`,
        [`human-armor-cap-kb-${i}`, h3]
      );
    }
    processProductionAfterControlResolution();
    const armorPulse = getHexBuildQueue(h3, 'human');
    assert.strictEqual(armorPulse.entries.length, 1);
    assert.strictEqual(armorPulse.entries[0]?.unitType, 'armor');
    assert.strictEqual(armorPulse.entries[0]?.count, 2);
    assert.strictEqual(armorPulse.keepBuilding, true);
    assert.strictEqual(armorPulse.keepBuildingUnitType, 'armor');

    // Ineligible standing type at refill → clear Keep building; leave queue empty.
    setStrategicInfrastructureForHex(h3, { urbanHexCount: 40, airportCount: 0, seaportCount: 0 });
    replaceBuildQueueForHex(h3, []);
    setKeepBuildingForHex(h3, true, 'naval');
    setBuildProgressPointsForHex(h3, 0);
    processProductionAfterControlResolution();
    const afterIneligible = getHexBuildQueue(h3, 'human');
    assert.strictEqual(afterIneligible.entries.length, 0);
    assert.strictEqual(afterIneligible.keepBuilding, false);
    assert.strictEqual(afterIneligible.keepBuildingUnitType, null);

    // Finite queue without Keep building still stops when empty (no auto-refill).
    setStrategicInfrastructureForHex(h3, { urbanHexCount: 40, airportCount: 0, seaportCount: 0 });
    replaceBuildQueueForHex(h3, [{ unitType: 'infantry', remainingCount: 1 }]);
    setKeepBuildingForHex(h3, false, null);
    setBuildProgressPointsForHex(h3, 0);
    dbRun("DELETE FROM units WHERE player = 'human' AND unit_type = 'infantry'");
    const infantryBeforeFinite =
      dbGetOne<{ c: number }>(
        "SELECT COUNT(*) AS c FROM units WHERE player = 'human' AND unit_type = 'infantry'"
      )?.c ?? 0;
    processProductionAfterControlResolution();
    const infantryAfterFinite =
      dbGetOne<{ c: number }>(
        "SELECT COUNT(*) AS c FROM units WHERE player = 'human' AND unit_type = 'infantry'"
      )?.c ?? 0;
    assert.strictEqual(infantryAfterFinite - infantryBeforeFinite, 1);
    const afterFinite = getHexBuildQueue(h3, 'human');
    assert.strictEqual(afterFinite.entries.length, 0);
    assert.strictEqual(afterFinite.keepBuilding, false);
    assert.strictEqual(afterFinite.storedPoints, 20);
  });
}

/**
 * Keep-building standing-order sync when infrastructure makes types illegal.
 *
 * Purpose: Extends pruneBuildQueueForInfrastructureState for Keep building.
 * When to use: After changing prune / standing-order invalidation.
 * Expected outcome: Illegal last type retargets to remaining last row; empty-gap illegal type clears.
 * Exceptions: None.
 */
function testKeepBuildingPruneStandingOrderSync(): void {
  withTempDb(() => {
    const h3 = findBuildableHumanControlledHex();
    setStrategicInfrastructureForHex(h3, { urbanHexCount: 5, airportCount: 1, seaportCount: 0 });
    replaceBuildQueueForHex(h3, [
      { unitType: 'infantry', remainingCount: 1 },
      { unitType: 'air', remainingCount: 1 },
    ]);
    setKeepBuildingForHex(h3, true, 'air');

    setStrategicInfrastructureForHex(h3, { urbanHexCount: 5, airportCount: 0, seaportCount: 0 });
    pruneBuildQueueForInfrastructureState(h3);
    const afterPrune = getHexBuildQueue(h3, 'human');
    assert.deepStrictEqual(
      afterPrune.entries.map((entry) => entry.unitType),
      ['infantry']
    );
    assert.strictEqual(afterPrune.keepBuilding, true);
    assert.strictEqual(afterPrune.keepBuildingUnitType, 'infantry');

    replaceBuildQueueForHex(h3, []);
    setKeepBuildingForHex(h3, true, 'air');
    setStrategicInfrastructureForHex(h3, { urbanHexCount: 5, airportCount: 0, seaportCount: 0 });
    pruneBuildQueueForInfrastructureState(h3);
    const emptyGap = getKeepBuildingForHex(h3);
    assert.strictEqual(emptyGap.keepBuilding, false);
    assert.strictEqual(emptyGap.keepBuildingUnitType, null);
  });
}

function run(): void {
  testBuildQueueMutationContracts();
  testTypeChangeAfterCountEditKeepsCount();
  testBatchBuildQueueTemplateContracts();
  testNoProductionBeforeReadyDuringPlanningEdits();
  testControlTakeoverClearsQueueAndProgress();
  testTraversedIntermediateHexCapturesControl();
  testNavalOccupancyGrantsControl();
  testNavalMixedOccupancyContestsControl();
  testLandArmorPlusEnemyAirContestsControl();
  testNavalTraversedIntermediateHexCapturesControl();
  testProductionBlocksWhenFirstEnqueuedUnitTypeAtCap();
  testProductionSpawnsPastSmallCapWhenMedium();
  testAirBuildRequiresAirportInfrastructure();
  testNavalBuildRequiresSeaportAndUrbanInfrastructure();
  testKeepBuildingMutationContracts();
  testKeepBuildingSameTurnRefill();
  testKeepBuildingPruneStandingOrderSync();
  console.log('gameActionsProduction.test.ts passed');
}

run();
