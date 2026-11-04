/**
 * Strategic airport-chain lookup on a seeded map.
 * Run: `npm run build:main` then `node dist/main/gameActions/airFerryRoute.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeGridDistancePure } from '../../shared/h3GridRangePure';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { AIR_FERRY_RANGE_HEXES } from '../../shared/tacticalRanges';
import { dbGetAll, dbGetOne, dbRun } from '../gameDb';
import { insertUnitRow } from '../gameDb/unitInsert';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { resolveStrategicAirportFerry } from './airFerryRoute';

/**
 * Intact airport hexes on the seeded map.
 *
 * Purpose: The chain cases need real H3 cells, not invented ids.
 * When to use: Geometry search in this file.
 * Expected outcome: Hexes whose airport count is at least 1.
 * Exceptions: None.
 */
function airportHexes(): string[] {
  return dbGetAll<{ h3Index: string }>(
    'SELECT h3_index AS h3Index FROM res_s_infrastructure WHERE airport_count > 0'
  ).map((row) => row.h3Index);
}

/**
 * Gives the named hexes to the human and wrecks every other airport.
 *
 * Purpose: A direct hop and a chain must not pick up an airport the case did not choose.
 * When to use: Before placing the air unit.
 * Expected outcome: Only `keep` still have an airport, and the human controls them.
 * Exceptions: None.
 */
function keepOnly(keep: readonly string[]): void {
  const placeholders = keep.map(() => '?').join(', ');
  dbRun(`UPDATE res_s_infrastructure SET airport_count = 0 WHERE h3_index NOT IN (${placeholders})`, [...keep]);
  for (const hex of keep) {
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [hex, HUMAN_SEAT_ID]);
  }
}

/**
 * Places one human air unit on the origin.
 *
 * Purpose: The lookup reads the unit's owner and birth hex from the database.
 * When to use: Each case.
 * Expected outcome: Unit `h1-ferry` exists.
 * Exceptions: None.
 */
function placeAir(origin: string): void {
  insertUnitRow(dbRun, {
    id: 'h1-ferry',
    player: HUMAN_SEAT_ID,
    unitType: 'air',
    displayOrder: 1,
    h3Index: origin,
    origin: null,
    formedTurn: 1,
  });
}

test('a direct hop of 4 is a two-hex path and a hop of 5 with no intermediate is not', () => {
  withTempGameDb('aw-ferry-direct-', () => {
    const hexes = airportHexes();
    let near: { origin: string; destination: string } | null = null;
    let far: { origin: string; destination: string } | null = null;
    for (let i = 0; i < hexes.length && (near == null || far == null); i += 1) {
      for (let j = i + 1; j < hexes.length; j += 1) {
        const distance = computeGridDistancePure(hexes[i]!, hexes[j]!);
        if (distance === AIR_FERRY_RANGE_HEXES && near == null) near = { origin: hexes[i]!, destination: hexes[j]! };
        if (distance === AIR_FERRY_RANGE_HEXES + 1 && far == null) far = { origin: hexes[i]!, destination: hexes[j]! };
      }
    }
    assert.ok(near, 'seeded map has two airports four hexes apart');
    assert.ok(far, 'seeded map has two airports five hexes apart');
    keepOnly([near!.origin, near!.destination]);
    placeAir(near!.origin);
    const legal = resolveStrategicAirportFerry({
      unitId: 'h1-ferry',
      originH3Index: near!.origin,
      destinationH3Index: near!.destination,
      owner: HUMAN_SEAT_ID,
    });
    assert.equal(legal.reachable, true);
    if (legal.reachable) assert.deepEqual(legal.pathH3Indexes, [near!.origin, near!.destination]);

    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [far!.origin, 'h1-ferry']);
    dbRun('UPDATE res_s_infrastructure SET airport_count = 0');
    dbRun('UPDATE res_s_infrastructure SET airport_count = 1 WHERE h3_index IN (?, ?)', [far!.origin, far!.destination]);
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [far!.origin, HUMAN_SEAT_ID]);
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [far!.destination, HUMAN_SEAT_ID]);
    const illegal = resolveStrategicAirportFerry({
      unitId: 'h1-ferry',
      originH3Index: far!.origin,
      destinationH3Index: far!.destination,
      owner: HUMAN_SEAT_ID,
    });
    assert.equal(illegal.reachable, false);
    if (!illegal.reachable) assert.equal(illegal.reason, 'No chain of your airports stays within ferry range.');
  });
});

test('a destination eight hexes away returns the intermediate airport', () => {
  withTempGameDb('aw-ferry-chain-', () => {
    const hexes = airportHexes();
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
    assert.ok(chain, 'seeded map has a two-hop airport chain');
    keepOnly([chain!.origin, chain!.mid, chain!.destination]);
    placeAir(chain!.origin);
    const result = resolveStrategicAirportFerry({
      unitId: 'h1-ferry',
      originH3Index: chain!.origin,
      destinationH3Index: chain!.destination,
      owner: HUMAN_SEAT_ID,
    });
    assert.deepEqual(result, { reachable: true, pathH3Indexes: [chain!.origin, chain!.mid, chain!.destination] });
    const stillThere = dbGetOne<{ id: string }>('SELECT id FROM units WHERE id = ?', ['h1-ferry']);
    assert.ok(stillThere);
  });
});
