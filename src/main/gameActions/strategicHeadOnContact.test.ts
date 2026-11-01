/**
 * Strategic head-on contact: traded hexes become one melee.
 * Run with: node dist/main/gameActions/strategicHeadOnContact.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { ready } from '../gameActions';
import { dbGetOne, dbRun, getGameSeed } from '../gameDb';
import { createHeadOnInitiativePicker } from '../headOnInitiative';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { EMPTY_OWNER_TURN_ORDERS } from './ownerTurnOrders';
import { withoutStrategicHeadOnHolderMoves } from './strategicHeadOnContact';

/**
 * Two infantry on adjacent land hexes, with every other unit removed.
 *
 * Purpose: A Ready test has to trade exactly two units. Neutral sails and standing marches would otherwise join the turn.
 * When to use: The traded-hex case, inside `withTempGameDb`.
 * Expected outcome: The human infantry stays on its hex. The AI infantry stands on a neighboring non-water hex. No other unit remains.
 * Exceptions: Asserts when the seed has no free infantry or no neighboring land hex.
 */
function placeAdjacentPair(): { humanId: string; humanHex: string; aiId: string; aiHex: string } {
  const human = dbGetOne<{ id: string; h3_index: string }>(
    `SELECT u.id AS id, u.h3_index AS h3_index FROM units u
     WHERE u.player = ? AND u.unit_type = 'infantry'
       AND NOT EXISTS (SELECT 1 FROM unit_transport_assignments t WHERE t.land_unit_id = u.id)
     LIMIT 1`,
    [HUMAN_SEAT_ID],
  );
  const ai = dbGetOne<{ id: string; h3_index: string }>(
    `SELECT u.id AS id, u.h3_index AS h3_index FROM units u
     WHERE u.player = ? AND u.unit_type = 'infantry'
       AND NOT EXISTS (SELECT 1 FROM unit_transport_assignments t WHERE t.land_unit_id = u.id)
     LIMIT 1`,
    [AI_SEAT_IDS[0]],
  );
  assert.ok(human, 'expected a human infantry unit');
  assert.ok(ai, 'expected an AI infantry unit');
  dbRun('DELETE FROM unit_transport_assignments');
  dbRun('DELETE FROM standing_orders');
  dbRun('DELETE FROM units WHERE id != ? AND id != ?', [human.id, ai.id]);
  const neighbor = gridDisk(human.h3_index, 1).find((cell) => {
    if (cell === human.h3_index) return false;
    const hex = dbGetOne<{ terrain: string }>('SELECT terrain FROM hexes WHERE h3_index = ?', [cell]);
    return hex != null && hex.terrain !== 'water';
  });
  assert.ok(neighbor, 'expected a non-water neighbor of the human infantry');
  dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [neighbor, ai.id]);
  return { humanId: human.id, humanHex: human.h3_index, aiId: ai.id, aiHex: neighbor };
}

/**
 * The current strategic turn number.
 *
 * Purpose: The initiative roll uses the turn Ready is resolving.
 * When to use: Before calling `ready` in the traded-hex case.
 * Expected outcome: The stored turn number, or 0 when the row is missing.
 * Exceptions: None.
 */
function turnNumber(): number {
  return dbGetOne<{ turn_number: number }>('SELECT turn_number FROM turn_state WHERE id = 1')?.turn_number ?? 0;
}

test('a human unit and an AI unit that trade hexes meet in the rolled hex', () => {
  withTempGameDb('aw-head-on-ready-', () => {
    const pair = placeAdjacentPair();
    dbRun('INSERT INTO pending_orders (unit_id, to_h3_index) VALUES (?, ?)', [pair.humanId, pair.aiHex]);
    const held = createHeadOnInitiativePicker(getGameSeed(), { kind: 'strategic', turnNumber: turnNumber() })(
      pair.humanHex,
      pair.aiHex,
    );
    const result = ready(new Map([[AI_SEAT_IDS[0], {
      ...EMPTY_OWNER_TURN_ORDERS,
      movementOrders: [{ unitId: pair.aiId, toH3Index: pair.humanHex }],
    }]]));
    assert.equal(result.success, true, result.reason);
    const humanNow = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', [pair.humanId])?.h3_index;
    const aiNow = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', [pair.aiId])?.h3_index;
    if (humanNow) assert.equal(humanNow, held);
    if (aiNow) assert.equal(aiNow, held);
    if (result.awaitingMeleeDecision) {
      assert.equal(humanNow, held);
      assert.equal(aiNow, held);
    } else {
      assert.ok(result.meleeCombatHexes?.includes(held), `melee hexes missing ${held}`);
    }
  });
});

test('a unit destroyed before movement does not make a contact', () => {
  withTempGameDb('aw-head-on-dead-', () => {
    const orders = [
      { unitId: 'unit-a', toH3Index: 'hex-y' },
      { unitId: 'unit-b', toH3Index: 'hex-x' },
    ];
    const outcome = withoutStrategicHeadOnHolderMoves({
      orders,
      unitsAtMovement: [{ id: 'unit-a', player: HUMAN_SEAT_ID, h3Index: 'hex-x' }],
      turnNumber: 1,
      gameSeed: 1,
    });
    assert.deepEqual(outcome.orders, orders);
    assert.equal(outcome.contacts.length, 0);
    assert.equal(outcome.cancelledUnitIds.size, 0);
  });
});
