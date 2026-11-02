/**
 * Drops the march orders of sub-units that must stay put for a head-on contact.
 */

import type { MovementOrder } from '../../shared/ipc/ordersTypes';
import { resolveHeadOnContacts, type HeadOnContact, type HeadOnMover } from '../../shared/headOnContact';
import type { OwnerId } from '../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { logDebug, logTrace } from '../logger';
import { createHeadOnInitiativePicker } from '../headOnInitiative';
import { tacticalComputeMovementOrderOutcomeForPlayer } from './tacticalSnapshotGuards';
import { withTacticalMarchStop } from './tacticalMovementApply';

/**
 * One side's marches for the beat.
 *
 * Purpose: The two sides are named, so a caller cannot swap their order lists.
 * When to use: `withoutTacticalHeadOnHolderMoves`.
 * Expected outcome: `orders` may be empty. Only this `player`'s units are considered.
 */
export interface TacticalSeatMarch {
  /**
   * The owner whose orders these are.
   *
   * Contract: An `OwnerId`. Neutral has no marches in a battle.
   * When to use: Filtering the outcome helper to this side.
   * Expected outcome: Another side's unit id in `orders` is skipped.
   * Exceptions: None.
   */
  readonly player: OwnerId;
  /**
   * That side's movement orders for this beat.
   *
   * Contract: Destinations may be farther than this beat's stop. The applied stop is computed here.
   * When to use: The human or lead list, and the opposing list.
   * Expected outcome: A later order for the same unit replaces the earlier stop.
   * Exceptions: None.
   */
  readonly orders: readonly MovementOrder[];
}

/**
 * Both sides' orders after holding sub-units are removed.
 *
 * Purpose: Each beat path applies `firstOrders` and then `secondOrders` with the projection it already uses.
 * When to use: The return of `withoutTacticalHeadOnHolderMoves`.
 * Expected outcome: Holding sub-units are missing from their side's list. Entering sub-units remain.
 */
export interface TacticalHeadOnOutcome {
  /**
   * The first side's orders that still apply.
   *
   * Contract: A mutable array, matching the projection helpers' parameter.
   * When to use: The human list, or the lead list in an AI-only beat.
   * Expected outcome: Same order as the input, without holding units.
   * Exceptions: None.
   */
  readonly firstOrders: MovementOrder[];
  /**
   * The second side's orders that still apply.
   *
   * Contract: A mutable array, matching the projection helpers' parameter.
   * When to use: The opposing list.
   * Expected outcome: Same order as the input, without holding units.
   * Exceptions: None.
   */
  readonly secondOrders: MovementOrder[];
  /**
   * The contacts that produced the cancellations.
   *
   * Contract: Sorted by the contact rule.
   * When to use: Logging. The beat does not branch on it.
   * Expected outcome: Empty when the two sides do not trade cells.
   * Exceptions: None.
   */
  readonly contacts: readonly HeadOnContact[];
}

/**
 * The applied stops for one side, judged the way the apply loop judges them.
 *
 * Purpose: Cargo that only rides a carrier must not become a mover. The projection helper copies those positions at the end, so this walk stops before that copy.
 * When to use: Once per side, from the same pre-movement snapshot.
 * Expected outcome: One mover per unit whose own order changes its cell. A failed order is skipped. A later order for the same unit replaces the stop, and the clone's cell is updated first so that later order is judged from the new cell.
 * Exceptions: None.
 */
function tacticalSeatMovers(battle: TacticalBattleSnapshot, seat: TacticalSeatMarch): HeadOnMover[] {
  logTrace('tacticalSeatMovers', {
    battleId: battle.battleId,
    player: seat.player,
    orderCount: seat.orders.length,
  });
  if (seat.orders.length === 0) return [];
  const tacticalSet = new Set(battle.tacticalChildH3Indexes);
  const sub = battle.subUnits.map((unit) => ({ ...unit }));
  const byId = new Map(sub.map((unit, index) => [unit.id, index] as const));
  const stopByUnitId = new Map<string, string>();
  for (const order of seat.orders) {
    const outcome = tacticalComputeMovementOrderOutcomeForPlayer(seat.player, {
      byId,
      sub,
      order,
      tacticalSet,
      battle,
    });
    if (!outcome.ok) continue;
    const unit = sub[outcome.idx];
    if (!unit) continue;
    const applied = outcome.appliedToH3Index;
    sub[outcome.idx] = withTacticalMarchStop(unit, applied);
    stopByUnitId.set(order.unitId, applied);
  }
  const originalById = new Map(battle.subUnits.map((unit) => [unit.id, unit]));
  return [...stopByUnitId].flatMap(([unitId, toCell]) => {
    const original = originalById.get(unitId);
    if (!original || original.h3Index === toCell) return [];
    return [{ unitId, owner: seat.player, fromCell: original.h3Index, toCell }];
  });
}

/**
 * Sub-units of the two parties whose applied stops would trade cells meet in one of them instead of passing.
 *
 * Purpose: Ends the swap, including the battle loop where both sides are ordered onto each other's cells every beat.
 * When to use: Once per beat, on the snapshot after air and ranged and before either side's movement projection. `battle` must be that snapshot.
 * Expected outcome: Each list minus the holding sub-units' orders. Entering sub-units' orders are unchanged, so the existing projection moves them onto the held cell.
 * Exceptions: None expected. The rule throws only on a broken picker.
 */
export function withoutTacticalHeadOnHolderMoves(args: {
  readonly battle: TacticalBattleSnapshot;
  readonly first: TacticalSeatMarch;
  readonly second: TacticalSeatMarch;
  readonly gameSeed: number;
}): TacticalHeadOnOutcome {
  const battle = args.battle;
  logDebug('withoutTacticalHeadOnHolderMoves', {
    battleId: battle.battleId,
    tacticalTurnNumber: battle.tacticalTurnNumber,
    firstPlayer: args.first.player,
    firstOrderCount: args.first.orders.length,
    secondPlayer: args.second.player,
    secondOrderCount: args.second.orders.length,
  });
  const resolution = resolveHeadOnContacts(
    [...tacticalSeatMovers(battle, args.first), ...tacticalSeatMovers(battle, args.second)],
    createHeadOnInitiativePicker(args.gameSeed, {
      kind: 'tactical',
      strategicTurnNumber: battle.strategicTurnNumber,
      battleId: battle.battleId,
      tacticalTurnNumber: battle.tacticalTurnNumber,
    }),
  );
  for (const contact of resolution.contacts) {
    logDebug('withoutTacticalHeadOnHolderMoves contact', { battleId: battle.battleId, ...contact });
  }
  const keep = (orders: readonly MovementOrder[]): MovementOrder[] =>
    orders.filter((order) => !resolution.cancelledUnitIds.has(order.unitId));
  return {
    firstOrders: keep(args.first.orders),
    secondOrders: keep(args.second.orders),
    contacts: resolution.contacts,
  };
}
