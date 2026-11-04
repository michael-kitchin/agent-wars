/**
 * An air unit's plan_route result is an airport chain.
 *
 * Purpose: The tool used to refuse air units. A ferry now needs the chain, not a hex-by-hex march.
 * When to use: After changes to `executePathfinding` for air units.
 * Expected outcome: A destination that is not a single hop returns three airports and a hop count of 2.
 * Exceptions: Assertion failure when the seeded map has no such chain.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng } from 'h3-js';
import { computeGridDistancePure } from '../../shared/h3GridRangePure';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { AIR_FERRY_RANGE_HEXES } from '../../shared/tacticalRanges';
import { dbGetAll, dbRun, getGameState } from '../gameDb';
import { insertUnitRow } from '../gameDb/unitInsert';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { executePathfinding } from './pathfinding';

test('plan_route returns a two-hop airport chain for an air unit', () => {
  withTempGameDb('aw-plan-route-air-', () => {
    const hexes = dbGetAll<{ h3Index: string }>(
      'SELECT h3_index AS h3Index FROM res_s_infrastructure WHERE airport_count > 0'
    ).map((row) => row.h3Index);
    let chain: { origin: string; mid: string; destination: string } | null = null;
    for (const origin of hexes) {
      if (chain) break;
      for (const mid of hexes) {
        if (chain || mid === origin) continue;
        const first = computeGridDistancePure(origin, mid);
        if (first == null || first < 1 || first > AIR_FERRY_RANGE_HEXES) continue;
        for (const destination of hexes) {
          if (destination === origin || destination === mid) continue;
          const second = computeGridDistancePure(mid, destination);
          const direct = computeGridDistancePure(origin, destination);
          if (second == null || direct == null) continue;
          if (second < 1 || second > AIR_FERRY_RANGE_HEXES || direct <= AIR_FERRY_RANGE_HEXES) continue;
          chain = { origin, mid, destination };
          break;
        }
      }
    }
    assert.ok(chain);
    const keep = [chain.origin, chain.mid, chain.destination];
    dbRun(
      `UPDATE res_s_infrastructure SET airport_count = 0 WHERE h3_index NOT IN (${keep.map(() => '?').join(', ')})`,
      keep
    );
    for (const hex of keep) {
      dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [hex, HUMAN_SEAT_ID]);
    }
    insertUnitRow(dbRun, {
      id: 'h1-ferry',
      player: HUMAN_SEAT_ID,
      unitType: 'air',
      displayOrder: 1,
      h3Index: chain.origin,
      origin: null,
      formedTurn: 1,
    });
    const destination = cellToLatLng(chain.destination);
    const result = executePathfinding(
      'plan_route',
      { unitId: 'h1-ferry', destination },
      getGameState(),
      new Map(),
      (lat, lng) => (lat === destination[0] && lng === destination[1] ? chain.destination : undefined)
    );
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.airportPathH3Indexes, [chain.origin, chain.mid, chain.destination]);
    assert.equal(result.hopCount, 2);
  });
});
