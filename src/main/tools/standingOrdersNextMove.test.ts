/**
 * Briefing recovery for a standing-order next step the unit has already entered.
 *
 * Purpose: A completed march step used to stay in Next Move, so the following briefing named the current cell.
 * When to use: `node dist/main/tools/standingOrdersNextMove.test.js` after `tsc -p tsconfig.main.json`.
 * Expected outcome: The status row names the following cached step.
 * Exceptions: Assertion failures.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cellToLatLng, gridDisk } from 'h3-js';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { closeGameDatabaseForTests, dbRun, getGameState, openGameDatabaseAtPathForTests, resetGameForNewMatch } from '../gameDb';
import { getInjectionText } from './standingOrders';

/**
 * A stored next step that is the unit's current cell must yield the following cached step.
 *
 * Purpose: Saved marches already contain the consumed step plus the rest of the route.
 * When to use: After edits to `advanceNextMovePastOccupiedCell`.
 * Expected outcome: Next Move is the neighbor, not the occupied cell, and turns remain.
 * Exceptions: None.
 */
function testStaleNextMoveAdvancesToFollowingCachedStep(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tool5-stale-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const unit = state.units.find((u) => u.player === 'opponent' && u.unitType === 'infantry');
    assert.ok(unit, 'expected an opponent infantry unit');
    const hexByH3 = new Map(state.hexes.map((h) => [h.h3Index, h]));
    const neighbor = gridDisk(unit.h3Index, 1).find((h3) => {
      if (h3 === unit.h3Index) return false;
      const hex = hexByH3.get(h3);
      return !!hex && hex.terrain !== 'water';
    });
    const destination = gridDisk(unit.h3Index, 3).find((h3) => h3 !== unit.h3Index && h3 !== neighbor && hexByH3.get(h3)?.terrain !== 'water');
    assert.ok(neighbor && destination, 'expected a land neighbor and a farther land hex');
    const originLl = cellToLatLng(unit.h3Index);
    const neighborLl = cellToLatLng(neighbor);
    const destinationLl = cellToLatLng(destination);
    dbRun(
      `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'opponent',
        unit.id,
        'march',
        JSON.stringify({ type: 'march', destination: destinationLl, avoidEnemies: false, engageEnRoute: false }),
        JSON.stringify({
          turnsRemaining: 2,
          nextMoveHex: originLl,
          totalPath: [originLl, neighborLl],
          cachedOriginH3: destination,
          cachedRouteSegments: [
            { turn: 1, hexes: [originLl] },
            { turn: 2, hexes: [neighborLl] },
          ],
        }),
        'en_route',
        state.turnNumber,
        JSON.stringify(originLl),
      ]
    );
    const text = getInjectionText('opponent', getGameState());
    const row = text.split('\n').find((line) => line.includes(`| ${unit.id} |`));
    assert.ok(row, `expected a standing-order row for ${unit.id}`);
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
    assert.strictEqual(cells[5], h3ToCode(neighbor, { mode: 'strategic' }), row);
    assert.notStrictEqual(cells[5], h3ToCode(unit.h3Index, { mode: 'strategic' }), row);
    assert.strictEqual(cells[6], '2', row);
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * A next step the unit has not entered yet must stay that step.
 *
 * Purpose: Advancing whenever a later cached segment exists would skip the queued step when an explicit move
 * replaced it, or when the step has not been applied yet.
 * When to use: Together with `testStaleNextMoveAdvancesToFollowingCachedStep`.
 * Expected outcome: Next Move remains the neighbor, and the farther cached hex is not shown.
 * Exceptions: None.
 */
function testUpcomingNextMoveIsNotSkipped(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tool5-upcoming-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const unit = state.units.find((u) => u.player === 'opponent' && u.unitType === 'infantry');
    assert.ok(unit, 'expected an opponent infantry unit');
    const hexByH3 = new Map(state.hexes.map((h) => [h.h3Index, h]));
    const neighbor = gridDisk(unit.h3Index, 1).find((h3) => h3 !== unit.h3Index && hexByH3.get(h3)?.terrain !== 'water');
    const farther = gridDisk(unit.h3Index, 2).find(
      (h3) => h3 !== unit.h3Index && h3 !== neighbor && hexByH3.get(h3)?.terrain !== 'water'
    );
    assert.ok(neighbor && farther, 'expected two land hexes beyond the unit');
    const originLl = cellToLatLng(unit.h3Index);
    const neighborLl = cellToLatLng(neighbor);
    const fartherLl = cellToLatLng(farther);
    dbRun(
      `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'opponent',
        unit.id,
        'march',
        JSON.stringify({ type: 'march', destination: fartherLl, avoidEnemies: false, engageEnRoute: false }),
        JSON.stringify({
          turnsRemaining: 2,
          nextMoveHex: neighborLl,
          totalPath: [neighborLl, fartherLl],
          cachedOriginH3: unit.h3Index,
          cachedRouteSegments: [
            { turn: 1, hexes: [neighborLl] },
            { turn: 2, hexes: [fartherLl] },
          ],
        }),
        'en_route',
        state.turnNumber,
        JSON.stringify(originLl),
      ]
    );
    const text = getInjectionText('opponent', getGameState());
    const row = text.split('\n').find((line) => line.includes(`| ${unit.id} |`));
    assert.ok(row, `expected a standing-order row for ${unit.id}`);
    const nextMove = row.split('|').slice(1, -1).map((cell) => cell.trim())[5];
    assert.strictEqual(nextMove, h3ToCode(neighbor, { mode: 'strategic' }), row);
    assert.notStrictEqual(nextMove, h3ToCode(farther, { mode: 'strategic' }), row);
  } finally {
    closeGameDatabaseForTests();
  }
}

testStaleNextMoveAdvancesToFollowingCachedStep();
testUpcomingNextMoveIsNotSkipped();
console.log('standingOrdersNextMove tests passed');
