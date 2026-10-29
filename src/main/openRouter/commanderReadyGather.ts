/**
 * Collects one order set per active AI seat at Ready.
 *
 * Purpose: Ready resolves every commander together. A seat that is still planning is waited on, not replaced by a second race.
 * When to use: `handleGameReady`, after the deferred-playback guard.
 * Expected outcome: A map with one entry per active AI seat. Pending orders are used and cleared. Otherwise standing orders and the sweep, or one inline consult when every-turn mode has a model and Run is on.
 * Exceptions: Logs and skips a seat whose state cannot be read.
 */

import { AI_CONSULTATION_WAIT_TIMEOUT_MS } from '../../shared/aiConsultationLimits';
import type { GameStateSnapshot } from '../gameDb';
import { commanderModelId, getAiPendingOrders, clearAiPendingOrders, getSeatRoster } from '../gameDb';
import { buildLatLngCoordinateMap } from '../mapData';
import { type AiSeatId } from '../../shared/seatIds';
import { activeAiSeatIds } from '../../shared/seatRoster';
import type { OwnerTurnOrders, TurnOrdersByOwner } from '../gameActions/ownerTurnOrders';
import { generateOrdersForStandingOrders } from '../tools/standingOrders';
import { collectTempoRuleAttacks } from '../tools/tempoRuleAttacks';
import { logDebug, logError } from '../logger';
import { readCommanderPoolSnapshot, startStrategicPlanning, waitForSeatsSettled } from './commanderPool';

/**
 * What Ready knows about the consultation mode.
 *
 * Purpose: The gather decides between a stored plan, an inline consult, and standing orders.
 * When to use: `gatherCommanderOrdersForReady`.
 * Expected outcome: Every-turn mode with Run on and a model consults a seat that has no stored plan.
 * Exceptions: None.
 */
export type CommanderReadyGatherArgs = {
  /**
   * Whether this Ready is in event-driven mode.
   *
   * Contract: True skips the inline consult. The stored plan or standing orders are used.
   * When to use: The Ready payload's consultation mode.
   * Expected outcome: Event-driven Ready does not start a new strategic consult.
   * Exceptions: None.
   */
  readonly useEventDriven: boolean;
  /**
   * The planning turn Ready is resolving.
   *
   * Contract: The turn number from the game state at the start of Ready.
   * When to use: Logs.
   * Expected outcome: The turn the orders belong to.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * Whether Run is on.
   *
   * Contract: False keeps every-turn Ready on standing orders when nothing is stored.
   * When to use: The Ready payload.
   * Expected outcome: An inline consult runs only when this is true.
   * Exceptions: None.
   */
  readonly aiPlanningRunEnabled: boolean;
  /**
   * Whether an API key is saved.
   *
   * Contract: False skips the inline consult.
   * When to use: The Ready dependencies.
   * Expected outcome: No model call without a key.
   * Exceptions: None.
   */
  readonly hasKey: boolean;
  /**
   * Fogged state for one seat.
   *
   * Contract: The same getter Ready uses for a player snapshot.
   * When to use: Standing orders and the sweep.
   * Expected outcome: That seat's units and hexes.
   * Exceptions: May throw when the database is unavailable. The gather logs and skips that seat.
   */
  readonly getGameStateForPlayer: (seatId: AiSeatId) => GameStateSnapshot;
};

/**
 * Standing orders plus one attack for each unit that can shoot and was not already ordered.
 *
 * Purpose: A turn with no model plan still moves and fires.
 * When to use: A seat with no stored plan, and a seat whose consult did not store one.
 * Expected outcome: Movement from standing orders. Attacks from standing orders plus the sweep, with no unit firing twice.
 * Exceptions: None.
 */
export function buildUnconsultedCommanderOrders(seatId: AiSeatId, aiState: GameStateSnapshot): OwnerTurnOrders {
  logDebug('buildUnconsultedCommanderOrders', { seatId, turnNumber: aiState.turnNumber });
  const hexList = aiState.hexes.map((hex) => hex.h3Index);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
  const generated = generateOrdersForStandingOrders(seatId, aiState, latLngByH3, resolveToH3);
  const tempo = collectTempoRuleAttacks({
    playerId: seatId,
    state: aiState,
    alreadyAttackingUnitIds: new Set([
      ...generated.rangedAttacks.map((attack) => attack.unitId),
      ...generated.airStrikes.map((strike) => strike.unitId),
    ]),
  });
  return {
    movementOrders: generated.movementOrders,
    rangedOrders: [...generated.rangedAttacks, ...tempo.rangedAttacks],
    airStrikeOrders: [...generated.airStrikes, ...tempo.airStrikes],
    ferryOrders: [],
    embarkOrders: [],
    missileLaunchOrders: [],
  };
}

/**
 * One order set per active AI seat for this Ready.
 *
 * Purpose: The turn resolves stored plans, plans that finish during the wait, and standing orders for the rest.
 * When to use: `handleGameReady`.
 * Expected outcome: The map has an entry for each active AI seat. A seat that is `planning` is waited on until it leaves that status, up to the consultation wait. No shorter race is started.
 * Exceptions: A seat whose state throws is logged and omitted.
 */
export async function gatherCommanderOrdersForReady(args: CommanderReadyGatherArgs): Promise<TurnOrdersByOwner> {
  const active = activeAiSeatIds(getSeatRoster());
  logDebug('commanderReadyGather gatherCommanderOrdersForReady', {
    turnNumber: args.turnNumber,
    useEventDriven: args.useEventDriven,
    aiPlanningRunEnabled: args.aiPlanningRunEnabled,
    seatCount: active.length,
  });
  const orders = new Map<AiSeatId, OwnerTurnOrders>();
  for (const seatId of active) {
    if (isPlanning(seatId)) {
      await waitForSeatsSettled([seatId], AI_CONSULTATION_WAIT_TIMEOUT_MS);
    }
    const stored = takePending(seatId);
    if (stored) {
      orders.set(seatId, stored);
      continue;
    }
    if (shouldConsultInline(args, seatId)) {
      startStrategicPlanning([seatId]);
      await waitForSeatsSettled([seatId], AI_CONSULTATION_WAIT_TIMEOUT_MS);
      const arrived = takePending(seatId);
      if (arrived) {
        orders.set(seatId, arrived);
        continue;
      }
    }
    try {
      orders.set(seatId, buildUnconsultedCommanderOrders(seatId, args.getGameStateForPlayer(seatId)));
    } catch (err) {
      logError('commanderReadyGather could not build standing orders', err);
    }
  }
  return orders;
}

/**
 * Whether this seat should run the every-turn consult at Ready.
 *
 * Purpose: Event-driven Ready uses the plan stored after the previous turn. Every-turn Ready consults when Run is on and nothing is stored.
 * When to use: After a seat has no pending orders.
 * Expected outcome: True only for every-turn mode with Run on, a key, and a model on that seat.
 * Exceptions: None.
 */
function shouldConsultInline(args: CommanderReadyGatherArgs, seatId: AiSeatId): boolean {
  if (args.useEventDriven || !args.aiPlanningRunEnabled || !args.hasKey) return false;
  const modelId = commanderModelId(seatId);
  return typeof modelId === 'string' && modelId.trim().length > 0;
}

/**
 * Whether the pool still lists this seat as planning.
 *
 * Purpose: Ready waits only for a consult that has already started.
 * When to use: Before reading pending orders.
 * Expected outcome: True while the snapshot status is `planning`.
 * Exceptions: None.
 */
function isPlanning(seatId: AiSeatId): boolean {
  return readCommanderPoolSnapshot(false).statuses.some((row) => row.seatId === seatId && row.status === 'planning');
}

/**
 * Reads and clears one seat's stored plan.
 *
 * Purpose: Pending orders are consumed by the Ready that plays them.
 * When to use: When the seat is no longer planning.
 * Expected outcome: The five order lists, or null when nothing is stored. The row is deleted when present.
 * Exceptions: None.
 */
function takePending(seatId: AiSeatId): OwnerTurnOrders | null {
  const pending = getAiPendingOrders(seatId);
  if (!pending) return null;
  clearAiPendingOrders(seatId);
  return {
    movementOrders: pending.movementOrders,
    rangedOrders: pending.rangedOrders,
    airStrikeOrders: pending.airStrikeOrders,
    ferryOrders: pending.ferryOrders,
    embarkOrders: pending.embarkOrders,
    missileLaunchOrders: pending.missileLaunchOrders,
  };
}
