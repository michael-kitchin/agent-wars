/**
 * Stores a consulted world-map plan, and brings it in line when the `holdAutomaticFireAgainst` list changes later.
 *
 * Purpose: A plan stored before a battle already holds automatic attacks. A side listed during the battle must not
 * take them at the next Ready.
 * When to use: `storeConsultedPlan` where a consult's plan is stored; `repickStoredPlanAttacks` after the list changes.
 * Expected outcome: Only rows the engine chose are ever re-aimed. Ordered attacks and `pursue` shots stay.
 * Exceptions: `storeConsultedPlan` propagates a SQLite error from storing the plan. The re-aim never throws.
 */

import type { AiSeatId } from '../../shared/seatIds';
import { dbGetAll, getAiPendingOrders, getGameStateForPlayer, setAiPendingOrders } from '../gameDb';
import type { AiPendingOrderSet } from '../gameDb/aiState';
import { readHoldAutomaticFireAgainstSeatIds } from '../gameDb/holdAutomaticFireAgainstMemory';
import {
  commitPlanAttackPicks,
  readPlanAttackPicks,
  writePlanAttackPicks,
  type PlanAttackPick,
} from '../gameDb/holdAutomaticFireAgainstPlanPicks';
import { logDebug, logError } from '../logger';
import { collectTempoRuleAttacks } from '../tools/tempoRuleAttacks';

/**
 * Stores the plan of one consult, with the record of which of its attacks the engine chose.
 *
 * Purpose: The plan and that record have to change together, or a later re-aim would touch the wrong rows.
 * When to use: Wherever a consulted world-map plan is stored for a later Ready.
 * Expected outcome: The plan is the seat's pending plan, and the picks of its merge are saved.
 * Exceptions: Propagates a SQLite error from storing the plan.
 */
export function storeConsultedPlan(seatId: AiSeatId, orders: AiPendingOrderSet): void {
  logDebug('holdAutomaticFireAgainstStoredPlan storeConsultedPlan', { seatId });
  setAiPendingOrders(seatId, orders);
  commitPlanAttackPicks(seatId);
}

/**
 * Whether a stored target now holds only listed sides, besides the seat's own units.
 *
 * Purpose: The same rule the engine applies when it picks a target.
 * When to use: For each engine-chosen row.
 * Expected outcome: True when a listed side stands there and no unlisted enemy does. An empty hex is false.
 * Exceptions: Propagates a SQLite error.
 */
function holdsOnlyListedEnemies(h3Index: string, seatId: string, spared: ReadonlySet<string>): boolean {
  const enemies = dbGetAll<{ player: string }>('SELECT DISTINCT player FROM units WHERE h3_index = ?', [h3Index])
    .map((row) => row.player)
    .filter((player) => player !== seatId);
  return enemies.length > 0 && enemies.every((player) => spared.has(player));
}

/**
 * Removes the stored automatic attacks aimed at listed sides and lets the sweep re-aim those units.
 *
 * Purpose: A listed side takes no automatic fire from a plan stored before it was listed.
 * When to use: From `applyHoldAutomaticFireAgainstChoice` after a change is stored.
 * Expected outcome: Nothing changes without a stored plan or without such a row. A freed unit fires at the nearest
 * enemy outside the list, or not at all. Movement and every other order stay.
 * Exceptions: None; a failure is logged and the stored plan stays as it was, so a failure never costs the seat its
 * movement or ordered attacks.
 */
export function repickStoredPlanAttacks(seatId: AiSeatId): void {
  logDebug('holdAutomaticFireAgainstStoredPlan repickStoredPlanAttacks', { seatId });
  try {
    const pending = getAiPendingOrders(seatId);
    if (!pending) return;
    const spared = readHoldAutomaticFireAgainstSeatIds(seatId);
    const picks = readPlanAttackPicks(seatId);
    /**
     * Whether a stored row is an engine-chosen attack that now aims at listed sides only.
     *
     * Purpose: The same test selects the rows to remove and the rows to keep.
     * When to use: On each stored ranged and air-strike row.
     * Expected outcome: True only for a row that matches a pick and has no unlisted enemy on its target.
     * Exceptions: Propagates a SQLite error.
     */
    const isStale = (row: PlanAttackPick): boolean =>
      picks.some((pick) => pick.unitId === row.unitId && pick.targetH3Index === row.targetH3Index) &&
      holdsOnlyListedEnemies(row.targetH3Index, seatId, spared);
    const staleRows = [...pending.rangedOrders, ...pending.airStrikeOrders].filter(isStale);
    if (staleRows.length === 0) return;
    const freed = new Set(staleRows.map((row) => row.unitId));
    const state = getGameStateForPlayer(seatId);
    const sweep = collectTempoRuleAttacks({
      playerId: seatId,
      state,
      alreadyAttackingUnitIds: new Set(state.units.map((unit) => unit.id).filter((id) => !freed.has(id))),
    });
    setAiPendingOrders(seatId, {
      ...pending,
      rangedOrders: [...pending.rangedOrders.filter((row) => !isStale(row)), ...sweep.rangedAttacks],
      airStrikeOrders: [...pending.airStrikeOrders.filter((row) => !isStale(row)), ...sweep.airStrikes],
    });
    writePlanAttackPicks(seatId, [
      ...picks.filter((pick) => !freed.has(pick.unitId)),
      ...sweep.rangedAttacks,
      ...sweep.airStrikes,
    ]);
    logDebug('holdAutomaticFireAgainstStoredPlan repickStoredPlanAttacks: re-aimed', {
      seatId,
      removedCount: staleRows.length,
      addedCount: sweep.rangedAttacks.length + sweep.airStrikes.length,
    });
  } catch (err) {
    logError('holdAutomaticFireAgainstStoredPlan repickStoredPlanAttacks', { seatId }, err);
  }
}
