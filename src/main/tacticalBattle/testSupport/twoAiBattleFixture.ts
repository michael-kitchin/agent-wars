/**
 * Shared setup for a battle between two AI seats.
 *
 * Purpose: Beat and playback tests start the same contested hex and ask for the same legal step.
 * When to use: Tests that call `applyAiOnlyTacticalBeat` or build playback from its result.
 * Expected outcome: The active session is a two-AI battle. Each test file still registers its own database cleanup.
 */

import assert from 'node:assert/strict';
import { gridDisk } from 'h3-js';
import type { TacticalOpponentPlanPayload } from '../../../shared/ipc/consultationPushTypes';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, type OwnerId } from '../../../shared/seatIds';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../../shared/tacticalBattleTypes';
import { dbGetOne, dbRun } from '../../gameDb';
import {
  getActiveTacticalBattleSnapshot,
  startTacticalBattleForEnclosingHex,
} from '../tacticalBattleSession';
import { tacticalComputeMovementOrderOutcomeForPlayer } from '../tacticalSnapshotGuards';
import { tacticalDbFixtureWithTempDbContestedPlanning } from './tacticalDbFixture';

/**
 * An empty plan, with the exit flag only when requested.
 *
 * Purpose: Idle and exit cases must not apply an order.
 * When to use: Beat tests that do not move a unit.
 * Expected outcome: Every order list is empty.
 * Exceptions: None.
 */
export function emptyPlan(exitBattle = false): TacticalOpponentPlanPayload {
  return {
    movementOrders: [],
    rangedAttacks: [],
    airStrikes: [],
    ferryOrders: [],
    embarkOrders: [],
    ...(exitBattle ? { exitBattle: true } : {}),
  };
}

/**
 * Starts a two-AI battle on the fixture hex.
 *
 * Purpose: The beat reads the active session, so the snapshot has to be committed first.
 * When to use: A test that needs both owners to be AI seats on one hex.
 * Expected outcome: `fn` runs while the session is active and both owners are AI seats.
 * Exceptions: Assertion failure when the hex cannot start.
 */
export function withTwoAiBattle(label: string, fn: (battle: TacticalBattleSnapshot) => void): void {
  tacticalDbFixtureWithTempDbContestedPlanning(label, ({ targetStrategicH3, humanId, opponentId }) => {
    const secondSeat = AI_SEAT_IDS[1];
    const spare = dbGetOne<{ id: string }>(
      `SELECT id FROM units WHERE id != ? AND id != ? AND unit_type IN ('infantry', 'armor') LIMIT 1`,
      [humanId, opponentId],
    );
    assert.ok(spare, 'seed needs a spare parent');
    dbRun(
      `INSERT INTO seats (
         seat_id, seat_order, kind, home_region, out_reasons, consultation_count, cost_usd
       ) SELECT ?, 3, 'ai', home_region, '[]', 0, 0 FROM seats WHERE seat_id = ?`,
      [secondSeat, AI_SEAT_IDS[0]],
    );
    const elsewhere = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM hexes WHERE h3_index != ? LIMIT 1', [targetStrategicH3]);
    assert.ok(elsewhere, 'seed needs a second hex');
    dbRun('UPDATE units SET h3_index = ? WHERE player = ? AND h3_index = ?', [elsewhere.h3_index, HUMAN_SEAT_ID, targetStrategicH3]);
    dbRun('UPDATE units SET player = ?, h3_index = ? WHERE id = ?', [secondSeat, targetStrategicH3, spare.id]);
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true, started.reason);
    const battle = getActiveTacticalBattleSnapshot();
    assert.ok(battle?.leadPartyId);
    fn(battle);
  });
}

/**
 * A destination one step away that the named seat can legally enter.
 *
 * Purpose: Move cases need one applied order without inventing a path.
 * When to use: After the battle has placed sub-units.
 * Expected outcome: The unit id and a cell the outcome helper accepts, or null when none of the neighbors is legal.
 * Exceptions: None.
 */
export function legalStep(battle: TacticalBattleSnapshot, player: OwnerId): { unitId: string; toH3Index: string } | null {
  const tacticalSet = new Set(battle.tacticalChildH3Indexes);
  const sub = battle.subUnits.map((unit) => ({ ...unit }));
  const byId = new Map(sub.map((unit, index) => [unit.id, index] as const));
  for (const unit of battle.subUnits) {
    if (unit.player !== player || (unit.unitType !== 'infantry' && unit.unitType !== 'armor')) continue;
    for (const cell of gridDisk(unit.h3Index, 1)) {
      if (cell === unit.h3Index) continue;
      const order = { unitId: unit.id, toH3Index: cell };
      const outcome = tacticalComputeMovementOrderOutcomeForPlayer(player, { byId, sub, order, tacticalSet, battle });
      if (outcome.ok) return order;
    }
  }
  return null;
}

/**
 * The stored sub-unit with this id.
 *
 * Purpose: Movement assertions read the snapshot the beat committed.
 * When to use: After `applyAiOnlyTacticalBeat`.
 * Expected outcome: The row, or undefined when combat removed it.
 * Exceptions: None.
 */
export function storedUnit(unitId: string): TacticalSubUnitSnapshot | undefined {
  return getActiveTacticalBattleSnapshot()?.subUnits.find((unit) => unit.id === unitId);
}
