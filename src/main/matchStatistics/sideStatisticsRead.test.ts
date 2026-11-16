/**
 * Reading one turn's statistics from a seated match.
 *
 * Purpose: Each seat's counts, hexes, production, treasury, and upkeep come from the match tables, and upkeep matches the top bar's figure.
 * When to use: `npm run build:main`, then `node dist/main/matchStatistics/sideStatisticsRead.test.js`.
 * Expected outcome: The cases below. The temporary match is closed afterward.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STATISTIC_MERCENARY_TYPES, STATISTIC_UNIT_TYPES, type SeatForStatistics } from '../../shared/matchStatistics';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { readMercenaryFunds } from '../gameDb/mercenaryEconomyRead';
import { readSeatRoster } from '../gameDb/seatRosterStore';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { readSideStatistics } from './sideStatisticsRead';

/**
 * The largest listed home regions.
 *
 * Purpose: A global start needs regions that can hold opening units.
 * When to use: Before the match in this file.
 * Expected outcome: Up to `count` names.
 * Exceptions: None.
 */
function largestHomeRegions(count: number): string[] {
  return listScenarioHomeRegions()
    .map((name) => ({ name, hexes: getScenarioHomeRegionHexes(name).length }))
    .filter((region) => region.hexes > 0)
    .sort((a, b) => b.hexes - a.hexes || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((region) => region.name);
}

/**
 * Reads the roster as the statistics reader wants it.
 *
 * Purpose: The tests pass the same seat rows the recorder passes.
 * When to use: Every case.
 * Expected outcome: The roster rows.
 * Exceptions: None.
 */
function roster(): SeatForStatistics[] {
  return readSeatRoster(gameDbOps);
}

test('every seat has an entry with every unit type, and the numbers follow the match tables', () => {
  const regions = largestHomeRegions(3);
  assert.equal(regions.length, 3);
  withSeatedTempGameDb('aw-side-statistics-', {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
      { kind: 'ai', homeRegion: regions[2] },
    ],
  }, () => {
    const before = readSideStatistics(gameDbOps, roster());
    assert.deepEqual(before.map((side) => side.seatId), [HUMAN_SEAT_ID, AI_SEAT_IDS[0], AI_SEAT_IDS[1]]);
    for (const side of before) {
      assert.deepEqual(Object.keys(side.builtUnits), [...STATISTIC_UNIT_TYPES]);
      assert.deepEqual(Object.keys(side.mercenaryUnits), [...STATISTIC_MERCENARY_TYPES]);
      assert.equal(side.unitsLost, null);
    }
    const seat = AI_SEAT_IDS[0];
    const side = before[1]!;
    assert.equal(
      side.hexes,
      gameDbOps.getOne<{ n: number }>('SELECT COUNT(*) AS n FROM res_s_control WHERE controller_player_id = ?', [seat])?.n
    );

    const source = gameDbOps.getOne<{ id: string; unit_type: string }>(
      `SELECT id, unit_type FROM units WHERE player = ? AND unit_type = 'infantry' AND is_mercenary = 0 LIMIT 1`,
      [seat]
    );
    assert.ok(source, 'the seat starts with an infantry unit');
    gameDbOps.run(
      `INSERT INTO units (id, player, unit_type, display_order, h3_index, birth_h3_index, birth_res_t_h3_index,
         birth_terrain_kind, birth_is_urban, birth_country_name, birth_country_code, birth_area_id, birth_area_name,
         formed_turn, is_mercenary)
       SELECT 'merc-test-1', player, unit_type, display_order, h3_index, birth_h3_index, birth_res_t_h3_index,
         birth_terrain_kind, birth_is_urban, birth_country_name, birth_country_code, birth_area_id, birth_area_name,
         formed_turn, 1
       FROM units WHERE id = ?`,
      [source.id]
    );
    const withMercenary = readSideStatistics(gameDbOps, roster())[1]!;
    assert.equal(withMercenary.mercenaryUnits.infantry, 1);
    assert.equal(withMercenary.builtUnits.infantry, side.builtUnits.infantry);
    assert.ok(withMercenary.upkeepPerTurn > 0);
    assert.equal(withMercenary.upkeepPerTurn, readMercenaryFunds(gameDbOps, seat).upkeepPerTurn);

    gameDbOps.run('INSERT OR REPLACE INTO res_s_treasury (player_id, credits) VALUES (?, 123)', [seat]);
    assert.equal(readSideStatistics(gameDbOps, roster())[1]!.treasury, 123);
  });
});

test('production counts city cells in controlled hexes except neutral-border hexes, and stored points follow', () => {
  const regions = largestHomeRegions(2);
  withSeatedTempGameDb('aw-side-production-', {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
    ],
  }, () => {
    const seat = AI_SEAT_IDS[0];
    const hex = gameDbOps.getOne<{ h3_index: string }>(
      'SELECT h3_index FROM res_s_control WHERE controller_player_id = ? LIMIT 1',
      [seat]
    )?.h3_index;
    assert.ok(hex);
    const read = () => readSideStatistics(gameDbOps, roster()).find((side) => side.seatId === seat)!;
    gameDbOps.run('UPDATE hexes SET map_role = NULL WHERE h3_index = ?', [hex]);
    gameDbOps.run('UPDATE res_s_infrastructure SET urban_hex_count = 0 WHERE h3_index = ?', [hex]);
    gameDbOps.run('DELETE FROM res_s_build_queue WHERE h3_index = ?', [hex]);
    gameDbOps.run('INSERT OR REPLACE INTO res_s_build_progress (h3_index, stored_points) VALUES (?, 0)', [hex]);
    const base = read();

    gameDbOps.run('UPDATE res_s_infrastructure SET urban_hex_count = 7 WHERE h3_index = ?', [hex]);
    gameDbOps.run('UPDATE res_s_build_progress SET stored_points = 5 WHERE h3_index = ?', [hex]);
    const raised = read();
    assert.equal(raised.productionPerTurn - base.productionPerTurn, 7);
    assert.equal(raised.storedPoints - base.storedPoints, 5);

    gameDbOps.run(`UPDATE hexes SET map_role = 'neutral_border' WHERE h3_index = ?`, [hex]);
    assert.equal(read().productionPerTurn, base.productionPerTurn);
  });
});
