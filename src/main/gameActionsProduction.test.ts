import * as assert from 'assert';
import { gridDistance, gridPathCells } from 'h3-js';
import {
  dbRun,
  dbGetOne,
  getGameState,
  setRes1InfrastructureForHex,
} from './gameDb';
import {
  getHexBuildQueue,
  addHexBuildQueueEntry,
  updateHexBuildQueueEntry,
  removeHexBuildQueueEntry,
  ready,
  submitOrders,
} from './gameActions';
import {
  collectTraversedHexesByPlayer,
  resolveRes1ControlAfterCombatAndMovement,
} from './game-actions/controlAndProduction';
import { MAX_UNITS_PER_TYPE } from './productionCaps';
import { withTempGameDb } from './testSupport/withTempGameDb';

function withTempDb(runCase: () => void): void {
  withTempGameDb('aw-gameactions-prod-', runCase);
}

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
    setRes1InfrastructureForHex(fallbackHex.h3Index, { urbanHexCount: 1, airportCount: 0, seaportCount: 0 });
    const queue = getHexBuildQueue(fallbackHex.h3Index, 'human');
    if (queue.buildSectionVisible && queue.availableUnitTypes.length > 0) {
      return fallbackHex.h3Index;
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

function findNavalPassableHex(): string {
  const state = getGameState();
  const hit = state.hexes.find((hx) => hx.terrain === 'water' || hx.terrain === 'coastal');
  if (!hit) throw new Error('Expected at least one naval-passable hex.');
  return hit.h3Index;
}

function testNavalOccupancyGrantsControl(): void {
  withTempDb(() => {
    const targetHex = findNavalPassableHex();
    dbRun('DELETE FROM units WHERE h3_index = ?', [targetHex]);
    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [targetHex, 'opponent']);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      'human-naval-control-grant',
      'human',
      'naval',
      targetHex,
    ]);

    const transitions = resolveRes1ControlAfterCombatAndMovement();
    const post = getHexBuildQueue(targetHex, 'human');

    assert.strictEqual(post.controllerPlayerId, 'human');
    assert.ok(
      transitions.some((transition) => transition.h3Index === targetHex && transition.toControllerPlayerId === 'human'),
      'expected control transition to human from naval-only occupancy'
    );
  });
}

function testNavalMixedOccupancyContestsControl(): void {
  withTempDb(() => {
    const targetHex = findNavalPassableHex();
    dbRun('DELETE FROM units WHERE h3_index = ?', [targetHex]);
    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [targetHex, 'human']);
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

    const transitions = resolveRes1ControlAfterCombatAndMovement();
    const post = getHexBuildQueue(targetHex, 'human');

    assert.strictEqual(post.controllerPlayerId, 'human');
    assert.strictEqual(
      transitions.some((transition) => transition.h3Index === targetHex),
      false,
      'expected no control transition for contested naval occupancy'
    );
  });
}

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
    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [intermediateHex, 'opponent']);

    const traversed = collectTraversedHexesByPlayer(
      [{ unitId: naval!.id, toH3Index: destination!.h3Index }],
      [{ id: naval!.id, player: naval!.player, h3Index: naval!.h3Index, unitType: naval!.unitType }]
    );
    const transitions = resolveRes1ControlAfterCombatAndMovement(traversed);
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
    const infantryCap = MAX_UNITS_PER_TYPE.infantry;
    for (let i = 0; i < infantryCap; i++) {
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
    assert.strictEqual(infantryAfter, infantryCap);
    const queueAfter = getHexBuildQueue(targetHex, 'human');
    assert.strictEqual(queueAfter.entries.length, 1);
    assert.strictEqual(queueAfter.entries[0]?.unitType, 'infantry');
    assert.strictEqual(queueAfter.entries[0]?.count, 1);
    const progressAfter = dbGetOne<{ stored_points: number }>(
      'SELECT stored_points FROM res1_build_progress WHERE h3_index = ?',
      [targetHex]
    )?.stored_points ?? 0;
    assert.ok(progressAfter > 9, 'stored points should continue accumulating while blocked by cap');
  });
}

function testAirBuildRequiresAirportInfrastructure(): void {
  withTempDb(() => {
    const targetHex = findBuildableHumanControlledHex();
    setRes1InfrastructureForHex(targetHex, { urbanHexCount: 4, airportCount: 1, seaportCount: 0 });
    const queueWithoutUrban = getHexBuildQueue(targetHex, 'human');
    assert.ok(
      !queueWithoutUrban.availableUnitTypes.includes('air'),
      'expected air unit type to be unavailable without minimum urban production capacity'
    );

    setRes1InfrastructureForHex(targetHex, { urbanHexCount: 5, airportCount: 0, seaportCount: 0 });
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

    setRes1InfrastructureForHex(targetHex, { urbanHexCount: 5, airportCount: 1, seaportCount: 0 });
    const queueWithAirport = getHexBuildQueue(targetHex, 'human');
    assert.ok(
      queueWithAirport.availableUnitTypes.includes('air'),
      'expected air unit type to be available with an airport'
    );
    const forceAirWithAirport = updateHexBuildQueueEntry(targetHex, entry.id, 'air', entry.count, 'human');
    assert.strictEqual(forceAirWithAirport.success, true);
  });
}

function testNavalBuildRequiresSeaportAndUrbanInfrastructure(): void {
  withTempDb(() => {
    const targetHex = findBuildableHumanControlledHex();
    setRes1InfrastructureForHex(targetHex, { urbanHexCount: 9, airportCount: 0, seaportCount: 1 });
    const queueWithoutUrban = getHexBuildQueue(targetHex, 'human');
    assert.ok(
      !queueWithoutUrban.availableUnitTypes.includes('naval'),
      'expected naval unit type to be unavailable without minimum urban production capacity'
    );

    setRes1InfrastructureForHex(targetHex, { urbanHexCount: 1, airportCount: 0, seaportCount: 0 });
    const queueWithoutSeaport = getHexBuildQueue(targetHex, 'human');
    assert.ok(
      !queueWithoutSeaport.availableUnitTypes.includes('naval'),
      'expected naval unit type to be unavailable without a seaport'
    );

    setRes1InfrastructureForHex(targetHex, { urbanHexCount: 10, airportCount: 0, seaportCount: 1 });
    const queueWithSeaport = getHexBuildQueue(targetHex, 'human');
    assert.ok(
      queueWithSeaport.availableUnitTypes.includes('naval'),
      'expected naval unit type to be available with seaport and minimum urban production capacity'
    );
  });
}

function run(): void {
  testBuildQueueMutationContracts();
  testTypeChangeAfterCountEditKeepsCount();
  testNoProductionBeforeReadyDuringPlanningEdits();
  testControlTakeoverClearsQueueAndProgress();
  testTraversedIntermediateHexCapturesControl();
  testNavalOccupancyGrantsControl();
  testNavalMixedOccupancyContestsControl();
  testNavalTraversedIntermediateHexCapturesControl();
  testProductionBlocksWhenFirstEnqueuedUnitTypeAtCap();
  testAirBuildRequiresAirportInfrastructure();
  testNavalBuildRequiresSeaportAndUrbanInfrastructure();
  // eslint-disable-next-line no-console
  console.log('gameActionsProduction.test.ts passed');
}

run();
