/**
 * Production adds a fixed number of credits and still builds the next unit.
 *
 * Purpose: Points spent follow the active map. Credits added do not.
 * When to use: After changing the credits branch of production.
 * Expected outcome: The cases below. Each case removes its temporary match.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOBAL_GAME_MAP, withGameMap } from '../shared/activeGameMap';
import { CREDITS_PER_ITEM, CREDITS_QUEUE_ITEM } from '../shared/creditsRules';
import { creditsItemCost } from '../shared/gameRules';
import { HUMAN_SEAT_ID } from '../shared/seatIds';
import { processProductionAfterControlResolution } from './gameActions/controlAndProduction';
import {
  dbGetOne,
  dbRun,
  getGameStateForPlayer,
  getTreasuryCredits,
  replaceBuildQueueForHex,
  setBuildProgressPointsForHex,
} from './gameDb';
import { withTempGameDb } from './testSupport/withTempGameDb';

test('two credits items empty the queue and add twice the fixed credit amount', () => {
  withTempGameDb('aw-credits-two-', () => {
    dbRun("DELETE FROM units WHERE player = 'human' AND unit_type = 'infantry'");
    const hex = humanCityHex();
    replaceBuildQueueForHex(hex, [{ unitType: CREDITS_QUEUE_ITEM, remainingCount: 2 }]);
    setBuildProgressPointsForHex(hex, 2 * creditsItemCost());
    const summary = processProductionAfterControlResolution();
    assert.equal(dbGetOne<{ n: number }>('SELECT COUNT(*) AS n FROM res_s_build_queue WHERE h3_index = ?', [hex])?.n, 0);
    assert.equal(getTreasuryCredits(HUMAN_SEAT_ID), 2 * CREDITS_PER_ITEM);
    assert.equal(summary.creditsAddedByPlayer.get(HUMAN_SEAT_ID), 2 * CREDITS_PER_ITEM);
  });
});

test('a credits item and an infantry item both complete', () => {
  withTempGameDb('aw-credits-then-infantry-', () => {
    dbRun("DELETE FROM units WHERE player = 'human' AND unit_type = 'infantry'");
    const hex = humanCityHex();
    replaceBuildQueueForHex(hex, [
      { unitType: CREDITS_QUEUE_ITEM, remainingCount: 1 },
      { unitType: 'infantry', remainingCount: 1 },
    ]);
    setBuildProgressPointsForHex(hex, creditsItemCost() + 20);
    processProductionAfterControlResolution();
    assert.equal(getTreasuryCredits(HUMAN_SEAT_ID), CREDITS_PER_ITEM);
    const infantry = dbGetOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM units WHERE player = 'human' AND unit_type = 'infantry' AND is_mercenary = 0"
    );
    assert.equal(infantry?.n, 1);
    assert.equal(getGameStateForPlayer(HUMAN_SEAT_ID).mercenaryEconomy?.credits, getTreasuryCredits(HUMAN_SEAT_ID));
  });
});

test('a regional infantry price spends 60 points and still adds 20 credits', () => {
  withTempGameDb('aw-credits-regional-', () => {
    dbRun("DELETE FROM units WHERE player = 'human' AND unit_type = 'infantry'");
    const hex = humanCityHex();
    const profile = {
      ...GLOBAL_GAME_MAP,
      id: 'western_europe' as const,
      rules: { ...GLOBAL_GAME_MAP.rules, infantryCost: 60 },
    };
    replaceBuildQueueForHex(hex, [{ unitType: CREDITS_QUEUE_ITEM, remainingCount: 1 }]);
    setBuildProgressPointsForHex(hex, 60);
    withGameMap(profile, () => {
      processProductionAfterControlResolution();
    });
    assert.equal(getTreasuryCredits(HUMAN_SEAT_ID), CREDITS_PER_ITEM);
  });
});

/**
 * A human-controlled hex that can produce.
 *
 * Purpose: The credits cases need a city the human already holds.
 * When to use: Inside `withTempGameDb`.
 * Expected outcome: The hex index.
 * Exceptions: Throws when the seeded map has no such hex.
 */
function humanCityHex(): string {
  const hex = dbGetOne<{ h3Index: string }>(
    `SELECT c.h3_index AS h3Index
     FROM res_s_control c
     JOIN res_s_infrastructure i ON i.h3_index = c.h3_index
     WHERE c.controller_player_id = ? AND i.urban_hex_count > 0
     LIMIT 1`,
    [HUMAN_SEAT_ID]
  )?.h3Index;
  assert.ok(hex);
  return hex;
}
