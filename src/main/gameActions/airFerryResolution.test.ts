/**
 * Strategic ferry resolution along an airport chain.
 * Run: `npm run build:main` then `node dist/main/gameActions/airFerryResolution.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeGridDistancePure } from '../../shared/h3GridRangePure';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { AIR_FERRY_RANGE_HEXES } from '../../shared/tacticalRanges';
import { dbGetAll, dbGetOne, dbRun } from '../gameDb';
import { insertUnitRow } from '../gameDb/unitInsert';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { resolveStrategicFerryOrders, airCargoFollowMoves } from './airFerryResolution';
import { syncEmbarkedLandUnitPositionsWithNaval } from './sealift';

/**
 * Intact airport hexes on the seeded map.
 *
 * Purpose: Resolution cases need real H3 cells.
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
 * Leaves airports only on `keep` and gives them to the human.
 *
 * Purpose: Stops an extra airport from turning a refused hop into a chain.
 * When to use: Before the air unit is ordered.
 * Expected outcome: Every other airport count is 0.
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
 * Places one human air unit.
 *
 * Purpose: Resolution reads the unit row.
 * When to use: Each case.
 * Expected outcome: The unit is on `origin`.
 * Exceptions: None.
 */
function placeAir(id: string, origin: string): void {
  insertUnitRow(dbRun, {
    id,
    player: HUMAN_SEAT_ID,
    unitType: 'air',
    displayOrder: 1,
    h3Index: origin,
    origin: null,
    formedTurn: 1,
  });
}

/**
 * The first pair of airports whose grid distance is `wanted`.
 *
 * Purpose: Direct-hop cases.
 * When to use: Before `keepOnly`.
 * Expected outcome: Two distinct airport hexes, or null.
 * Exceptions: None.
 */
function pairAtDistance(wanted: number): { origin: string; destination: string } | null {
  const hexes = airportHexes();
  for (let i = 0; i < hexes.length; i += 1) {
    for (let j = i + 1; j < hexes.length; j += 1) {
      if (computeGridDistancePure(hexes[i]!, hexes[j]!) === wanted) {
        return { origin: hexes[i]!, destination: hexes[j]! };
      }
    }
  }
  return null;
}

test('a two-hop ferry ends on the destination and records the three airports', () => {
  withTempGameDb('aw-ferry-resolve-chain-', () => {
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
    assert.ok(chain);
    keepOnly([chain!.origin, chain!.mid, chain!.destination]);
    placeAir('h1-chain', chain!.origin);
    const moves = resolveStrategicFerryOrders([{ unitId: 'h1-chain', destinationH3Index: chain!.destination }]);
    const hex = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', ['h1-chain']);
    assert.equal(hex?.h3_index, chain!.destination);
    assert.equal(moves.length, 1);
    assert.deepEqual(moves[0]?.pathH3Indexes, [chain!.origin, chain!.mid, chain!.destination]);
  });
});

test('a direct hop of 4 moves and a direct hop of 5 with no intermediate stays', () => {
  withTempGameDb('aw-ferry-resolve-direct-', () => {
    const near = pairAtDistance(AIR_FERRY_RANGE_HEXES);
    const far = pairAtDistance(AIR_FERRY_RANGE_HEXES + 1);
    assert.ok(near);
    assert.ok(far);
    keepOnly([near!.origin, near!.destination, far!.origin, far!.destination]);
    placeAir('h1-near', near!.origin);
    const moved = resolveStrategicFerryOrders([{ unitId: 'h1-near', destinationH3Index: near!.destination }]);
    const nearHex = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', ['h1-near']);
    assert.equal(nearHex?.h3_index, near!.destination);
    assert.deepEqual(moved[0]?.pathH3Indexes, [near!.origin, near!.destination]);

    dbRun('UPDATE res_s_infrastructure SET airport_count = 0 WHERE h3_index NOT IN (?, ?)', [far!.origin, far!.destination]);
    placeAir('h1-far', far!.origin);
    const stayed = resolveStrategicFerryOrders([{ unitId: 'h1-far', destinationH3Index: far!.destination }]);
    const farHex = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', ['h1-far']);
    assert.equal(farHex?.h3_index, far!.origin);
    assert.equal(stayed.length, 0);
  });
});

test('an unreachable ferry leaves a legal origin and deletes the air unit and its infantry when that origin is gone', () => {
  withTempGameDb('aw-ferry-resolve-stay-', () => {
    const far = pairAtDistance(AIR_FERRY_RANGE_HEXES + 1);
    assert.ok(far);
    keepOnly([far!.origin, far!.destination]);
    placeAir('h1-stay', far!.origin);
    resolveStrategicFerryOrders([{ unitId: 'h1-stay', destinationH3Index: far!.destination }]);
    const stayed = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', ['h1-stay']);
    assert.equal(stayed?.h3_index, far!.origin);
    insertUnitRow(dbRun, {
      id: 'inf-stay',
      player: HUMAN_SEAT_ID,
      unitType: 'infantry',
      displayOrder: 2,
      h3Index: far!.origin,
      origin: null,
      formedTurn: 1,
    });
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['inf-stay', 'h1-stay']);

    dbRun('UPDATE res_s_infrastructure SET airport_count = 0 WHERE h3_index = ?', [far!.origin]);
    resolveStrategicFerryOrders([{ unitId: 'h1-stay', destinationH3Index: far!.destination }]);
    const gone = dbGetOne<{ id: string }>('SELECT id FROM units WHERE id = ?', ['h1-stay']);
    assert.equal(gone == null, true);
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['inf-stay']), undefined);
  });
});

/**
 * The first three airports that need an intermediate hop.
 *
 * Purpose: Cargo playback needs a path of three hexes.
 * When to use: The carried-infantry case.
 * Expected outcome: Origin, one intermediate, and a destination farther than one hop. Null when the map has none.
 * Exceptions: None.
 */
function twoHopChain(): { origin: string; mid: string; destination: string } | null {
  const hexes = airportHexes();
  for (const origin of hexes) {
    for (const mid of hexes) {
      if (mid === origin) continue;
      const first = computeGridDistancePure(origin, mid);
      if (first == null || first < 1 || first > AIR_FERRY_RANGE_HEXES) continue;
      for (const destination of hexes) {
        if (destination === origin || destination === mid) continue;
        const second = computeGridDistancePure(mid, destination);
        const direct = computeGridDistancePure(origin, destination);
        if (second == null || direct == null) continue;
        if (second < 1 || second > AIR_FERRY_RANGE_HEXES || direct <= AIR_FERRY_RANGE_HEXES) continue;
        return { origin, mid, destination };
      }
    }
  }
  return null;
}

test('carried infantry ends on the ferry destination and plays back along the airports', () => {
  withTempGameDb('aw-ferry-resolve-cargo-', () => {
    const chain = twoHopChain();
    assert.ok(chain);
    const elsewhere = airportHexes().find((hex) => hex !== chain!.origin && hex !== chain!.mid && hex !== chain!.destination);
    assert.ok(elsewhere);
    keepOnly([chain!.origin, chain!.mid, chain!.destination]);
    placeAir('h1-air', chain!.origin);
    placeAir('h1-stay', chain!.origin);
    insertUnitRow(dbRun, {
      id: 'h1-inf',
      player: HUMAN_SEAT_ID,
      unitType: 'infantry',
      displayOrder: 2,
      h3Index: chain!.origin,
      origin: null,
      formedTurn: 1,
    });
    insertUnitRow(dbRun, {
      id: 'h1-stay-inf',
      player: HUMAN_SEAT_ID,
      unitType: 'infantry',
      displayOrder: 3,
      h3Index: chain!.origin,
      origin: null,
      formedTurn: 1,
    });
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['h1-inf', 'h1-air']);
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['h1-stay-inf', 'h1-stay']);
    const humanFerry = resolveStrategicFerryOrders([
      { unitId: 'h1-air', destinationH3Index: chain!.destination },
      { unitId: 'h1-stay', destinationH3Index: elsewhere! },
    ]);
    for (const hex of [chain!.origin, chain!.mid, chain!.destination]) {
      dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [hex, AI_SEAT_IDS[0]]);
    }
    insertUnitRow(dbRun, {
      id: 'o1-air',
      player: AI_SEAT_IDS[0],
      unitType: 'air',
      displayOrder: 4,
      h3Index: chain!.origin,
      origin: null,
      formedTurn: 1,
    });
    insertUnitRow(dbRun, {
      id: 'o1-inf',
      player: AI_SEAT_IDS[0],
      unitType: 'infantry',
      displayOrder: 5,
      h3Index: chain!.origin,
      origin: null,
      formedTurn: 1,
    });
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['o1-inf', 'o1-air']);
    const aiFerry = resolveStrategicFerryOrders([{ unitId: 'o1-air', destinationH3Index: chain!.destination }]);
    const playback = airCargoFollowMoves([...humanFerry, ...aiFerry]);
    syncEmbarkedLandUnitPositionsWithNaval();
    const path = [chain!.origin, chain!.mid, chain!.destination];
    assert.equal(dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM units WHERE id = ?', ['h1-air'])?.h3Index, chain!.destination);
    assert.equal(dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM units WHERE id = ?', ['h1-inf'])?.h3Index, chain!.destination);
    assert.equal(dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM units WHERE id = ?', ['o1-air'])?.h3Index, chain!.destination);
    assert.equal(dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM units WHERE id = ?', ['o1-inf'])?.h3Index, chain!.destination);
    assert.ok(dbGetOne('SELECT land_unit_id AS landUnitId FROM unit_transport_assignments WHERE land_unit_id = ? AND naval_unit_id = ?', ['h1-inf', 'h1-air']));
    assert.ok(dbGetOne('SELECT land_unit_id AS landUnitId FROM unit_transport_assignments WHERE land_unit_id = ? AND naval_unit_id = ?', ['o1-inf', 'o1-air']));
    assert.equal(dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM units WHERE id = ?', ['h1-stay'])?.h3Index, chain!.origin);
    assert.equal(dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM units WHERE id = ?', ['h1-stay-inf'])?.h3Index, chain!.origin);
    assert.ok(dbGetOne('SELECT land_unit_id AS landUnitId FROM unit_transport_assignments WHERE land_unit_id = ?', ['h1-stay-inf']));
    assert.deepEqual(playback.humanMoves, [{ unitId: 'h1-inf', fromH3Index: chain!.origin, toH3Index: chain!.destination, pathH3Indexes: path }]);
    assert.deepEqual(playback.aiMoves, [{
      unitId: 'o1-inf',
      fromH3Index: chain!.origin,
      toH3Index: chain!.destination,
      pathH3Indexes: path,
      player: AI_SEAT_IDS[0],
    }]);
  });
});
