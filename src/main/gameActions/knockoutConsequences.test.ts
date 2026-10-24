/**
 * Knockout consequences for a three-seat regional match.
 * Run: `node dist/main/gameActions/knockoutConsequences.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import { ready } from '../gameActions';
import {
  dbGetAll,
  dbGetOne,
  dbRun,
  getGameState,
  getScenarioHomeRegionHexes,
  getSeatRoster,
  setHexController,
} from '../gameDb';
import { listGameMaps } from '../gameMap/listGameMaps';
import { buildLatLngCoordinateMap } from '../mapData';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { applyKnockout } from './knockoutConsequences';

const PRIVATE_TABLES = [
  'standing_orders',
  'ai_memory',
  'ai_callback_subscriptions',
  'ai_pending_orders',
  'ai_combat_since_consultation',
  'ai_loss_events_since_consultation',
  'player_hex_intel',
  'player_unit_intel',
];

/**
 * A regional map with at least three side groups.
 *
 * Purpose: Knockout tests need a second AI seat.
 * When to use: Before opening the temporary match.
 * Expected outcome: The map id and three group ids, or null when none is listed.
 * Exceptions: None.
 */
function threeGroupMap(): { id: string; sideGroupIds: string[] } | null {
  const map = listGameMaps().find((entry) => entry.id === 'western_asia_north' && entry.sideGroups.length >= 3)
    ?? listGameMaps().find((entry) => entry.sideGroups.length >= 3);
  if (!map) return null;
  return { id: map.id, sideGroupIds: map.sideGroups.slice(0, 3).map((group) => group.id) };
}

/**
 * Three seats on the chosen map.
 *
 * Purpose: The direct knockout and the ready-path knockout start from the same roster.
 * When to use: The `seats` option of `withSeatedTempGameDb`.
 * Expected outcome: One human seat and two AI seats.
 * Exceptions: None.
 */
function threeSeats(sideGroupIds: readonly string[]): NewGameSeatInput[] {
  return [
    { kind: 'human', sideGroupId: sideGroupIds[0] },
    { kind: 'ai', sideGroupId: sideGroupIds[1] },
    { kind: 'ai', sideGroupId: sideGroupIds[2] },
  ];
}

/**
 * Rows for one player in a table.
 *
 * Purpose: The knockout must remove every private row, not only the ones a single insert created.
 * When to use: Before and after `applyKnockout`.
 * Expected outcome: The stored count.
 * Exceptions: None.
 */
function rowsFor(table: string, playerId: string): number {
  return dbGetOne<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE player_id = ?`, [playerId])?.n ?? 0;
}

test('a knocked-out seat becomes neutral garrisons and loses its private rows', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  withSeatedTempGameDb('aw-knockout-', { gameMapId: map.id, seats: threeSeats(map.sideGroupIds) }, () => {
    const seatId = AI_SEAT_IDS[1];
    const unit = dbGetOne<{ id: string; h3_index: string }>(
      'SELECT id, h3_index FROM units WHERE player = ? LIMIT 1',
      [seatId]
    );
    const hex = dbGetOne<{ h3_index: string }>(
      'SELECT h3_index FROM res_s_control WHERE controller_player_id = ? LIMIT 1',
      [seatId]
    );
    assert.ok(unit);
    assert.ok(hex);
    const beforeIds = dbGetAll<{ id: string }>('SELECT id FROM units WHERE player = ?', [seatId]).map((row) => row.id);
    dbRun(
      `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, status, created_turn, origin_hex)
       VALUES (?, ?, 'hold_fire', '{}', 'holding', 1, ?)`,
      [seatId, unit!.id, hex!.h3_index]
    );
    dbRun(
      `INSERT INTO ai_memory (player_id, key, content, created_turn) VALUES (?, 'note', 'hold', 1)`,
      [seatId]
    );
    dbRun(
      `INSERT INTO ai_callback_subscriptions (player_id, event_type, params, subscribed_turn) VALUES (?, 'turn', '{}', 1)`,
      [seatId]
    );
    dbRun(
      `INSERT INTO ai_pending_orders (player_id, movement_orders, ranged_orders) VALUES (?, '[]', '[]')`,
      [seatId]
    );
    dbRun(
      `INSERT INTO ai_combat_since_consultation (player_id, unit_id) VALUES (?, ?)`,
      [seatId, unit!.id]
    );
    dbRun(
      `INSERT INTO ai_loss_events_since_consultation
         (player_id, turn_number, victim_unit_id, victim_player, cause, killer_ids_json)
       VALUES (?, 1, ?, ?, 'ranged', '[]')`,
      [seatId, unit!.id, seatId]
    );
    dbRun(
      `INSERT OR REPLACE INTO player_hex_intel (player_id, h3_index, seen_state, last_seen_turn) VALUES (?, ?, 'visible', 1)`,
      [seatId, hex!.h3_index]
    );
    dbRun(
      `INSERT OR REPLACE INTO player_unit_intel (player_id, enemy_unit_id, last_known_h3_index, intel_state, last_seen_turn)
       VALUES (?, ?, ?, 'current', 1)`,
      [seatId, unit!.id, hex!.h3_index]
    );
    dbRun('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [`fog_new_contacts_${seatId}`, '[]']);
    dbRun(
      `INSERT INTO res_s_build_queue (h3_index, queue_index, unit_type, remaining_count) VALUES (?, 0, 'infantry', 1)`,
      [hex!.h3_index]
    );
    dbRun(
      `INSERT INTO res_s_build_progress (h3_index, stored_points, keep_building) VALUES (?, 4, 0)
       ON CONFLICT(h3_index) DO UPDATE SET stored_points = 4`,
      [hex!.h3_index]
    );
    const hexes = dbGetAll<{ h3_index: string }>('SELECT h3_index FROM hexes').map((row) => row.h3_index);
    applyKnockout(seatId, buildLatLngCoordinateMap(hexes));
    for (const table of PRIVATE_TABLES) {
      assert.equal(rowsFor(table, seatId), 0, table);
    }
    assert.equal(
      dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [`fog_new_contacts_${seatId}`]),
      undefined
    );
    const controlled = dbGetAll<{ controller_player_id: string | null }>(
      'SELECT controller_player_id FROM res_s_control WHERE h3_index IN (SELECT h3_index FROM res_s_control WHERE controller_player_id = ?)',
      [seatId]
    );
    assert.equal(controlled.length, 0);
    const neutralHex = dbGetOne<{ controller_player_id: string }>(
      'SELECT controller_player_id FROM res_s_control WHERE h3_index = ?',
      [hex!.h3_index]
    );
    assert.equal(neutralHex?.controller_player_id, NEUTRAL_OWNER_ID);
    assert.equal(
      dbGetOne<{ n: number }>('SELECT COUNT(*) AS n FROM res_s_build_queue WHERE h3_index = ?', [hex!.h3_index])?.n,
      0
    );
    assert.equal(
      dbGetOne<{ n: number }>('SELECT COUNT(*) AS n FROM res_s_build_progress WHERE h3_index = ?', [hex!.h3_index])?.n,
      0
    );
    for (const id of beforeIds) {
      const owner = dbGetOne<{ player: string }>('SELECT player FROM units WHERE id = ?', [id]);
      assert.equal(owner?.player, NEUTRAL_OWNER_ID);
      const order = dbGetOne<{ player_id: string; order_type: string }>(
        'SELECT player_id, order_type FROM standing_orders WHERE unit_id = ?',
        [id]
      );
      assert.equal(order?.player_id, NEUTRAL_OWNER_ID);
      assert.equal(order?.order_type, 'defend');
    }
  });
});

test('ready knocks out the seat whose home another seat controls', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  withSeatedTempGameDb('aw-knockout-ready-', { gameMapId: map.id, seats: threeSeats(map.sideGroupIds) }, () => {
    const victim = getSeatRoster().find((seat) => seat.seatId === AI_SEAT_IDS[1]);
    assert.ok(victim);
    for (const h3 of getScenarioHomeRegionHexes(victim!.homeRegion)) {
      setHexController(h3, AI_SEAT_IDS[0]);
    }
    const result = ready();
    assert.equal(result.success, true);
    const knockout = result.knockouts?.find((row) => row.seatId === AI_SEAT_IDS[1]);
    assert.ok(knockout?.reasons.includes('home_control'));
    assert.equal(knockout?.place, 3);
    const stored = getSeatRoster().find((seat) => seat.seatId === AI_SEAT_IDS[1]);
    assert.equal(stored?.outTurn, 1);
    assert.equal(stored?.outBy, AI_SEAT_IDS[0]);
    assert.equal(getGameState().gameOver, undefined);
  });
});
