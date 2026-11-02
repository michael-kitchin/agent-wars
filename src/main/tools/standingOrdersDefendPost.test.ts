/**
 * Defend-post progress shown in Standing Order Status.
 *
 * Purpose: An off-post defender must be briefed as walking back, and a defender already on its post must not look like it is moving.
 * When to use: `node dist/main/tools/standingOrdersDefendPost.test.js` after `npm run build:main`.
 * Expected outcome: Status, Next Move, Turns Remaining, and the stored route match the unit's place relative to its post.
 * Exceptions: Assertion failures. A map with no receding enemy cell skips that case.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cellToLatLng, gridDisk, gridDistance } from 'h3-js';
import { strategicCellAt } from '../../shared/h3Resolutions';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { closeGameDatabaseForTests, dbGetOne, dbRun, getGameState, openGameDatabaseAtPathForTests, resetGameForNewMatch } from '../gameDb';
import { getInjectionText, getStandingOrderForUnit } from './standingOrders';
import { moveDefendPostsToExplicitMoveDestinations } from './standingOrdersDefendPost';

/**
 * Inserts a defend order and returns the standing-order table row for that unit.
 *
 * Purpose: Each case starts from a known row, then reads the briefing `getInjectionText` builds after the refresh.
 * When to use: The cases in this file.
 * Expected outcome: The markdown row whose unit-id cell is `unitId`.
 * Exceptions: Throws when the row is missing.
 */
function briefingRowAfterDefendInsert(unitId: string, postH3: string, paramsJson: string, status: string): string[] {
  const state = getGameState();
  dbRun(
    `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['opponent', unitId, 'defend', paramsJson, null, status, state.turnNumber, JSON.stringify(cellToLatLng(postH3))]
  );
  const text = getInjectionText('opponent', getGameState());
  const row = text.split('\n').find((line) => line.includes(`| ${unitId} |`));
  assert.ok(row, `expected a standing-order row for ${unitId}`);
  return row.split('|').slice(1, -1).map((cell) => cell.trim());
}

/**
 * An adjacent post is the next step, with one turn remaining.
 *
 * Purpose: The briefing used to call this `holding` and hide the walk-back.
 * When to use: After `refreshDefendPostProgress` is wired into `expireAndUpdateStatus`.
 * Expected outcome: Status `en_route`, Next Move is the post, Turns Remaining is `1`, and the getter exposes that step.
 * Exceptions: None.
 */
function testOffPostDefendBriefsTheWalkBack(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-defend-off-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const unit = state.units.find((u) => u.player === 'opponent' && u.unitType === 'infantry');
    assert.ok(unit, 'expected an opponent infantry unit');
    const post = gridDisk(unit.h3Index, 1).find((h3) => {
      if (h3 === unit.h3Index) return false;
      return state.hexes.some((hex) => hex.h3Index === h3 && hex.terrain !== 'water');
    });
    assert.ok(post, 'expected a land neighbor for the defend post');
    const cells = briefingRowAfterDefendInsert(
      unit.id,
      post,
      JSON.stringify({ type: 'defend', defendHex: cellToLatLng(post) }),
      'holding'
    );
    assert.strictEqual(cells[4], 'en_route', cells.join(' | '));
    assert.strictEqual(cells[5], h3ToCode(post, { mode: 'strategic' }), cells.join(' | '));
    assert.strictEqual(cells[6], '1', cells.join(' | '));
    const order = getStandingOrderForUnit('opponent', unit.id);
    assert.ok(order?.nextMoveHex, 'expected a stored next step');
    assert.strictEqual(strategicCellAt(order.nextMoveHex[0], order.nextMoveHex[1]), post);
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * A unit already on its post is holding, with no next step stored.
 *
 * Purpose: Best Options must not treat an on-post defender as leaving its cell.
 * When to use: Together with the off-post case.
 * Expected outcome: Status `holding`, em dashes for Next Move and Turns Remaining, and `{"turnsRemaining":0}` with no `nextMoveHex`.
 * Exceptions: None.
 */
function testOnPostDefendStoresNoNextStep(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-defend-on-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const unit = state.units.find((u) => u.player === 'opponent' && u.unitType === 'infantry');
    assert.ok(unit, 'expected an opponent infantry unit');
    const cells = briefingRowAfterDefendInsert(
      unit.id,
      unit.h3Index,
      JSON.stringify({ type: 'defend', defendHex: cellToLatLng(unit.h3Index) }),
      'en_route'
    );
    assert.strictEqual(cells[4], 'holding', cells.join(' | '));
    assert.strictEqual(cells[5], '—', cells.join(' | '));
    assert.strictEqual(cells[6], '—', cells.join(' | '));
    const stored = dbGetOne<{ computed_route: string | null }>(
      'SELECT computed_route FROM standing_orders WHERE player_id = ? AND unit_id = ?',
      ['opponent', unit.id]
    );
    assert.strictEqual(stored?.computed_route, '{"turnsRemaining":0}');
    const order = getStandingOrderForUnit('opponent', unit.id);
    assert.strictEqual(order?.nextMoveHex, undefined);
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * A defend row with no stored post is left unchanged.
 *
 * Purpose: Older rows store `{}`. Refresh must not invent a post or a route.
 * When to use: After the off-post and on-post cases.
 * Expected outcome: Status stays `holding` and `computed_route` stays null.
 * Exceptions: None.
 */
function testMissingDefendPostIsLeftAlone(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-defend-empty-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const unit = state.units.find((u) => u.player === 'opponent' && u.unitType === 'infantry');
    assert.ok(unit, 'expected an opponent infantry unit');
    briefingRowAfterDefendInsert(unit.id, unit.h3Index, '{}', 'holding');
    const stored = dbGetOne<{ status: string; computed_route: string | null }>(
      'SELECT status, computed_route FROM standing_orders WHERE player_id = ? AND unit_id = ?',
      ['opponent', unit.id]
    );
    assert.strictEqual(stored?.status, 'holding');
    assert.strictEqual(stored?.computed_route, null);
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * A walk-back that increases distance to the nearest enemy is marked in Attention.
 *
 * Purpose: The status table has to flag the same receding step the briefing will later call out.
 * When to use: When a land cell adjacent to the unit is two hops from the post.
 * Expected outcome: Attention is `yes`. The case returns without failing when the map has no such cell.
 * Exceptions: None.
 */
function testRecedingWalkBackMarksAttention(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-defend-recede-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const unit = state.units.find((u) => u.player === 'opponent' && u.unitType === 'infantry');
    assert.ok(unit, 'expected an opponent infantry unit');
    const post = gridDisk(unit.h3Index, 1).find((h3) => {
      if (h3 === unit.h3Index) return false;
      return state.hexes.some((hex) => hex.h3Index === h3 && hex.terrain !== 'water');
    });
    assert.ok(post, 'expected a land neighbor for the defend post');
    const enemyHex = gridDisk(unit.h3Index, 1).find((h3) => {
      if (h3 === unit.h3Index || h3 === post) return false;
      if (!state.hexes.some((hex) => hex.h3Index === h3 && hex.terrain !== 'water')) return false;
      return gridDistance(post, h3) === 2;
    });
    if (!enemyHex) {
      console.log('standingOrdersDefendPost: no land cell two hops from the post and one hop from the unit; skipped receding case');
      return;
    }
    dbRun('UPDATE units SET h3_index = ? WHERE player = ?', [enemyHex, 'human']);
    const cells = briefingRowAfterDefendInsert(
      unit.id,
      post,
      JSON.stringify({ type: 'defend', defendHex: cellToLatLng(post) }),
      'holding'
    );
    assert.strictEqual(cells[7], 'yes', cells.join(' | '));
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * Reads the stored defend row for one unit.
 *
 * Purpose: The move cases compare the row before and after, including fields the move must keep.
 * When to use: After inserting a defend order in this file.
 * Expected outcome: The params, status, and route, or undefined when the row is missing.
 * Exceptions: None.
 */
function readDefendRow(unitId: string): { params: string; status: string; computed_route: string | null } | undefined {
  return dbGetOne('SELECT params, status, computed_route FROM standing_orders WHERE player_id = ? AND unit_id = ?', [
    'opponent',
    unitId,
  ]);
}

/**
 * Inserts a defend order without refreshing it.
 *
 * Purpose: The move cases need a known post and a non-null route so a cleared route is visible.
 * When to use: Before `moveDefendPostsToExplicitMoveDestinations`.
 * Expected outcome: One opponent defend row whose post is `postH3`.
 * Exceptions: A database write failure propagates.
 */
function insertDefendOrder(unitId: string, postH3: string): void {
  const state = getGameState();
  dbRun(
    `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'opponent',
      unitId,
      'defend',
      JSON.stringify({ type: 'defend', defendHex: cellToLatLng(postH3), engageRange: 2 }),
      '{"turnsRemaining":2}',
      'holding',
      state.turnNumber,
      JSON.stringify(cellToLatLng(postH3)),
    ]
  );
}

/**
 * A land hex next to `origin`, other than the excluded cells.
 *
 * Purpose: Move cases need a destination that is on the snapshot.
 * When to use: While choosing a post or a move destination.
 * Expected outcome: The hex, or undefined when none remains.
 * Exceptions: None.
 */
function landNeighbor(origin: string, excluded: readonly string[]): string | undefined {
  const state = getGameState();
  return gridDisk(origin, 1).find((h3) => {
    if (h3 === origin || excluded.includes(h3)) return false;
    return state.hexes.some((hex) => hex.h3Index === h3 && hex.terrain !== 'water');
  });
}

/**
 * Centers for the cells a move test will name.
 *
 * Purpose: The post is stored from this map, so the assertion resolves the same centers the function writes.
 * When to use: The argument `latLngByH3` of each move case.
 * Expected outcome: One center per snapshot hex.
 * Exceptions: None.
 */
function centersByHex(): Map<string, [number, number]> {
  const state = getGameState();
  return new Map(state.hexes.map((hex) => [hex.h3Index, cellToLatLng(hex.h3Index) as [number, number]]));
}

/**
 * An explicit move off the post moves the defend post.
 *
 * Purpose: The next refresh must walk toward the cell the commander just chose.
 * When to use: After `moveDefendPostsToExplicitMoveDestinations` exists.
 * Expected outcome: The returned ids contain the unit, the post resolves to the destination, status is `en_route`, and the route is null. Other params stay.
 * Exceptions: None.
 */
function testExplicitMoveOffPostMovesDefendPost(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-defend-move-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const unit = getGameState().units.find((u) => u.player === 'opponent' && u.unitType === 'infantry');
    assert.ok(unit, 'expected an opponent infantry unit');
    const destination = landNeighbor(unit.h3Index, []);
    assert.ok(destination, 'expected a land neighbor');
    insertDefendOrder(unit.id, unit.h3Index);
    const moved = moveDefendPostsToExplicitMoveDestinations({
      playerId: 'opponent',
      state: getGameState(),
      moves: [{ unitId: unit.id, toH3Index: destination }],
      skipUnitIds: new Set(),
      latLngByH3: centersByHex(),
    });
    assert.ok(moved.includes(unit.id));
    const row = readDefendRow(unit.id);
    assert.strictEqual(row?.status, 'en_route');
    assert.strictEqual(row?.computed_route, null);
    const params = JSON.parse(row!.params) as { defendHex?: [number, number]; engageRange?: number };
    assert.strictEqual(params.engageRange, 2);
    assert.ok(params.defendHex);
    assert.strictEqual(strategicCellAt(params.defendHex[0], params.defendHex[1]), destination);
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * An explicit move while the unit is already off the post still moves the post.
 *
 * Purpose: Leaving the old post in place would walk the unit back on the next refresh.
 * When to use: Together with the on-post move case.
 * Expected outcome: The post becomes the destination, which is neither the old post nor the unit's cell.
 * Exceptions: None.
 */
function testExplicitMoveWhileOffPostMovesDefendPost(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-defend-move-off-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const unit = getGameState().units.find((u) => u.player === 'opponent' && u.unitType === 'infantry');
    assert.ok(unit, 'expected an opponent infantry unit');
    const post = landNeighbor(unit.h3Index, []);
    const destination = landNeighbor(unit.h3Index, post ? [post] : []);
    assert.ok(post && destination, 'expected two distinct land neighbors');
    insertDefendOrder(unit.id, post);
    const moved = moveDefendPostsToExplicitMoveDestinations({
      playerId: 'opponent',
      state: getGameState(),
      moves: [{ unitId: unit.id, toH3Index: destination }],
      skipUnitIds: new Set(),
      latLngByH3: centersByHex(),
    });
    assert.ok(moved.includes(unit.id));
    const params = JSON.parse(readDefendRow(unit.id)!.params) as { defendHex: [number, number] };
    assert.strictEqual(strategicCellAt(params.defendHex[0], params.defendHex[1]), destination);
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * A move whose destination is already the post leaves the row.
 *
 * Purpose: Re-targeting the post to itself must not clear a stored route or change status.
 * When to use: Together with the off-post move cases.
 * Expected outcome: Params, status, and route are unchanged, and the returned list is empty.
 * Exceptions: None.
 */
function testExplicitMoveToCurrentPostLeavesRow(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-defend-move-same-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const unit = getGameState().units.find((u) => u.player === 'opponent' && u.unitType === 'infantry');
    assert.ok(unit, 'expected an opponent infantry unit');
    const elsewhere = landNeighbor(unit.h3Index, []);
    const post = landNeighbor(unit.h3Index, elsewhere ? [elsewhere] : []);
    assert.ok(elsewhere && post, 'expected a cell to stand on and a different post');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [elsewhere, unit.id]);
    insertDefendOrder(unit.id, post);
    const before = readDefendRow(unit.id);
    const moved = moveDefendPostsToExplicitMoveDestinations({
      playerId: 'opponent',
      state: getGameState(),
      moves: [{ unitId: unit.id, toH3Index: post }],
      skipUnitIds: new Set(),
      latLngByH3: centersByHex(),
    });
    assert.deepStrictEqual(moved, []);
    assert.deepStrictEqual(readDefendRow(unit.id), before);
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * A unit whose standing order this response changed keeps its post.
 *
 * Purpose: Assign and cancel already decided the mission. The explicit move must not overwrite that post.
 * When to use: The same move as the off-post case, with the unit listed in `skipUnitIds`.
 * Expected outcome: The row is unchanged.
 * Exceptions: None.
 */
function testSkippedUnitKeepsItsPost(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-defend-move-skip-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const unit = getGameState().units.find((u) => u.player === 'opponent' && u.unitType === 'infantry');
    assert.ok(unit, 'expected an opponent infantry unit');
    const destination = landNeighbor(unit.h3Index, []);
    assert.ok(destination, 'expected a land neighbor');
    insertDefendOrder(unit.id, unit.h3Index);
    const before = readDefendRow(unit.id);
    const moved = moveDefendPostsToExplicitMoveDestinations({
      playerId: 'opponent',
      state: getGameState(),
      moves: [{ unitId: unit.id, toH3Index: destination }],
      skipUnitIds: new Set([unit.id]),
      latLngByH3: centersByHex(),
    });
    assert.deepStrictEqual(moved, []);
    assert.deepStrictEqual(readDefendRow(unit.id), before);
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * An air defender keeps its post.
 *
 * Purpose: Air units do not march, so an explicit move must not retarget their defend post.
 * When to use: When the seed has an opponent air unit with a neighboring snapshot hex.
 * Expected outcome: The row is unchanged. The case returns without failing when no such air unit exists.
 * Exceptions: None.
 */
function testAirDefenderKeepsItsPost(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-defend-move-air-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const air = state.units.find((u) => u.player === 'opponent' && u.unitType === 'air');
    const destination = air
      ? gridDisk(air.h3Index, 1).find((h3) => h3 !== air.h3Index && state.hexes.some((hex) => hex.h3Index === h3))
      : undefined;
    if (!air || !destination) {
      console.log('standingOrdersDefendPost: no opponent air unit with a neighboring snapshot hex; skipped air post case');
      return;
    }
    insertDefendOrder(air.id, air.h3Index);
    const before = readDefendRow(air.id);
    const moved = moveDefendPostsToExplicitMoveDestinations({
      playerId: 'opponent',
      state: getGameState(),
      moves: [{ unitId: air.id, toH3Index: destination }],
      skipUnitIds: new Set(),
      latLngByH3: centersByHex(),
    });
    assert.deepStrictEqual(moved, []);
    assert.deepStrictEqual(readDefendRow(air.id), before);
  } finally {
    closeGameDatabaseForTests();
  }
}

testOffPostDefendBriefsTheWalkBack();
testOnPostDefendStoresNoNextStep();
testMissingDefendPostIsLeftAlone();
testRecedingWalkBackMarksAttention();
testExplicitMoveOffPostMovesDefendPost();
testExplicitMoveWhileOffPostMovesDefendPost();
testExplicitMoveToCurrentPostLeavesRow();
testSkippedUnitKeepsItsPost();
testAirDefenderKeepsItsPost();
console.log('standingOrdersDefendPost.test.ts: ok');
