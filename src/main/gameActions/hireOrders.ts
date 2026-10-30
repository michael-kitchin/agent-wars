/**
 * Reads and changes one seat's hire orders during planning.
 *
 * Purpose: The panel and the AI submit the same checks, and neither spends credits.
 * When to use: The hire IPC handlers. The end of the turn fills orders through a different module.
 * Expected outcome: A rejection names the first failing reason. A success stores or deletes one row.
 * Exceptions: Propagates SQLite errors. A closed database fails inside the snapshot read.
 */

import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import type {
  HexHireView,
  HireMutationResult,
  HireOrderRequest,
  HireOrderView,
  HireRaiseView,
} from '../../shared/ipc/mercenaryTypes';
import { unitCostFor } from '../../shared/gameRules';
import {
  HIRE_COUNT_MAX,
  HIRE_COUNT_MIN,
  HIRE_REASON_COUNT,
  HIRE_REASON_NOT_ACTIVE,
  HIRE_REASON_NOT_PLANNING,
  HIRE_REASON_NOTHING_HERE,
  HIRE_REASON_ORDER_MISSING,
  HIRE_REASON_TACTICAL,
  RAISE_REASON_CAPACITY,
  RAISE_REASON_CAPACITY_USED,
  RAISE_REASON_TYPE,
  REHIRE_REASON_ALREADY_ORDERED,
  REHIRE_REASON_NOT_ELIGIBLE,
  isHireableUnitType,
} from '../../shared/mercenaryRules';
import { NEUTRAL_OWNER_ID, isHumanSeatId, type SeatId } from '../../shared/seatIds';
import { buildStrategicUnitDisplayLabelResolver } from '../../shared/unitDisplayNames';
import { getGameStateForPlayer, getSeatRoster } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { hireOrderFee, readMercenaryFunds } from '../gameDb/mercenaryEconomyRead';
import {
  deleteHireOrder,
  insertHireOrder,
  listHireOrdersForSeat,
  type HireOrderRow,
} from '../gameDb/mercenaryState';
import { logDebug, logTrace } from '../logger';
import { isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';
import {
  buildHireContext,
  evaluateHexHire,
  type HexHireEvaluation,
} from '../mercenaryHireRules';

/**
 * The snapshot, the hex evaluation, and the capacity this seat's orders have left.
 *
 * Purpose: The view and placement must reject a hex for the same reason.
 * When to use: Only inside this module. Null means the hex is not on the map.
 * Expected outcome: Orders are this seat's orders on this hex. Capacity left can be negative when orders already overdraw it.
 * Exceptions: None.
 */
interface SeatHexHire {
  /**
   * The seat's snapshot.
   *
   * Contract: Fog already applied. Unexplored terrain is not masked.
   * When to use: Rehire display names.
   * Expected outcome: The snapshot from `getGameStateForPlayer`.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * The hire rules for this hex.
   *
   * Contract: Built from `state`.
   * When to use: The view and the rejection reasons.
   * Expected outcome: The evaluation of this hex.
   * Exceptions: None.
   */
  readonly evaluation: HexHireEvaluation;
  /**
   * This seat's orders on this hex.
   *
   * Contract: Other seats' orders are absent.
   * When to use: Capacity left and the pending list.
   * Expected outcome: Rows whose hex is the one requested.
   * Exceptions: None.
   */
  readonly ordersHere: readonly HireOrderRow[];
  /**
   * Raise capacity still unused by this seat's orders.
   *
   * Contract: May be negative when stored orders already exceed the hex.
   * When to use: Which options still fit, and the capacity rejection.
   * Expected outcome: Capacity per turn minus the unit cost of raise orders here.
   * Exceptions: None.
   */
  readonly capacityLeft: number;
}

/**
 * Reads everything the hire panel shows for one hex.
 *
 * Purpose: One read fills funds, options, candidates, and pending orders.
 * When to use: When the panel opens or refreshes. A missing hex returns null.
 * Expected outcome: A view. `hireAvailable` is false only when there is nothing to order and nothing to remove.
 * Exceptions: Propagates a database error from the snapshot or the fund read.
 */
export function readHexHireView(h3Index: string, seatId: SeatId): HexHireView | null {
  logTrace('gameActions readHexHireView', { h3Index, seatId });
  const evaluated = evaluateHexForSeat(h3Index, seatId);
  if (!evaluated) return null;
  const displayName = buildStrategicUnitDisplayLabelResolver(evaluated.state.units);
  const pendingOrders = evaluated.ordersHere.map((order) => orderView(order, displayName));
  const fitting = evaluated.evaluation.raiseOptions.filter((option) => option.unitCost <= evaluated.capacityLeft);
  const raiseBlockedReason = evaluated.evaluation.raiseBlockedReason
    ?? (evaluated.evaluation.raiseOptions.length > 0 && fitting.length === 0 ? RAISE_REASON_CAPACITY_USED : null);
  const raise: HireRaiseView | null = raiseBlockedReason || fitting.length === 0
    ? null
    : {
        capacityPerTurn: evaluated.evaluation.raiseCapacityPerTurn,
        capacityLeft: evaluated.capacityLeft,
        options: fitting,
      };
  const orderedRehires = new Set(
    evaluated.ordersHere.filter((order) => order.kind === 'rehire').map((order) => order.neutralUnitId)
  );
  const rehireUnits = evaluated.evaluation.rehireCandidates
    .filter((candidate) => !orderedRehires.has(candidate.unitId))
    .map((candidate) => ({
      unitId: candidate.unitId,
      unitType: candidate.unitType,
      displayName: candidate.displayName,
      fee: candidate.fee,
      upkeep: candidate.upkeep,
    }));
  const hireAvailable = (
    evaluated.evaluation.blockedReason == null && (raise != null || rehireUnits.length > 0)
  ) || pendingOrders.length > 0;
  return {
    h3Index,
    funds: readMercenaryFunds(gameDbOps, seatId),
    hireAvailable,
    unavailableReason: hireAvailable
      ? null
      : evaluated.evaluation.blockedReason ?? raiseBlockedReason ?? HIRE_REASON_NOTHING_HERE,
    raise,
    raiseBlockedReason: raise ? null : raiseBlockedReason,
    rehireUnits,
    pendingOrders,
  };
}

/**
 * Stores one hire order when the hex still allows it.
 *
 * Purpose: Planning records the request. The end of the turn decides whether the treasury can pay.
 * When to use: A raise names a hex, a type, and a count. A rehire names a Neutral unit.
 * Expected outcome: `{ success: true, orderId }` or the first rejection reason. Credits do not change.
 * Exceptions: Propagates SQLite errors from the insert.
 */
export function executePlaceHireOrder(seatId: SeatId, request: HireOrderRequest): HireMutationResult {
  logDebug('gameActions executePlaceHireOrder', { seatId, kind: request.kind });
  const rejected = planningGate(seatId);
  if (rejected) return rejected;
  if (!seatIsActive(seatId)) return failure(HIRE_REASON_NOT_ACTIVE);
  if (request.kind === 'raise') return placeRaise(seatId, request);
  return placeRehire(seatId, request.unitId);
}

/**
 * Deletes one of the seat's hire orders.
 *
 * Purpose: The player can take an order back until Ready.
 * When to use: With the order id from the hire view. Another seat's id does not match.
 * Expected outcome: Success, or the planning, battle, or missing-order reason.
 * Exceptions: Propagates SQLite errors.
 */
export function executeRemoveHireOrder(seatId: SeatId, orderId: number): HireMutationResult {
  logDebug('gameActions executeRemoveHireOrder', { seatId, orderId });
  const rejected = planningGate(seatId);
  if (rejected) return rejected;
  if (!deleteHireOrder(gameDbOps, seatId, orderId)) return failure(HIRE_REASON_ORDER_MISSING);
  return { success: true };
}

/**
 * Evaluates one hex from the seat's own snapshot.
 *
 * Purpose: The view and placement share the fog and the orders already stored.
 * When to use: Before showing or accepting an order on that hex.
 * Expected outcome: Null when the hex is not on the map. Otherwise the evaluation and this seat's orders there.
 * Exceptions: Propagates a database error from the snapshot.
 */
function evaluateHexForSeat(h3Index: string, seatId: SeatId): SeatHexHire | null {
  const state = getGameStateForPlayer(seatId, { maskUnexploredTerrain: false });
  if (!state.hexes.some((hex) => hex.h3Index === h3Index)) return null;
  const evaluation = evaluateHexHire(buildHireContext(state, seatId), h3Index);
  const ordersHere = listHireOrdersForSeat(gameDbOps, seatId).filter((order) => order.h3Index === h3Index);
  const used = ordersHere
    .filter((order) => order.kind === 'raise')
    .reduce((sum, order) => sum + unitCostFor(order.unitType) * order.unitCount, 0);
  return { state, evaluation, ordersHere, capacityLeft: evaluation.raiseCapacityPerTurn - used };
}

/**
 * Rejects a change that is outside planning or, for the human, inside a tactical battle.
 *
 * Purpose: Remove and place share the first two checks.
 * When to use: Before the roster check.
 * Expected outcome: A failure result, or null when the change may continue.
 * Exceptions: None.
 */
function planningGate(seatId: SeatId): HireMutationResult | null {
  const phase = gameDbOps.getOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase ?? 'planning';
  if (phase !== 'planning') return failure(HIRE_REASON_NOT_PLANNING);
  if (isHumanSeatId(seatId) && isTacticalBattleActive()) return failure(HIRE_REASON_TACTICAL);
  return null;
}

/**
 * Whether the roster still has this seat in the match.
 *
 * Purpose: Placement refuses a knocked-out seat even when the snapshot is stale.
 * When to use: After the planning gate.
 * Expected outcome: True when the seat exists and its out turn is null.
 * Exceptions: None.
 */
function seatIsActive(seatId: SeatId): boolean {
  const seat = getSeatRoster().find((row) => row.seatId === seatId);
  return seat != null && seat.outTurn === null;
}

/**
 * Stores a raise after the hex and capacity checks.
 *
 * Purpose: The count and the type are checked only for a raise.
 * When to use: From `executePlaceHireOrder`.
 * Expected outcome: The new order id, or the first failing reason.
 * Exceptions: Propagates SQLite errors.
 */
function placeRaise(
  seatId: SeatId,
  request: Extract<HireOrderRequest, { kind: 'raise' }>
): HireMutationResult {
  if (!Number.isInteger(request.count) || request.count < HIRE_COUNT_MIN || request.count > HIRE_COUNT_MAX) {
    return failure(HIRE_REASON_COUNT);
  }
  const evaluated = evaluateHexForSeat(request.h3Index, seatId);
  if (!evaluated) return failure(HIRE_REASON_NOTHING_HERE);
  if (evaluated.evaluation.blockedReason) return failure(evaluated.evaluation.blockedReason);
  if (evaluated.evaluation.raiseBlockedReason) return failure(evaluated.evaluation.raiseBlockedReason);
  const option = evaluated.evaluation.raiseOptions.find((row) => row.unitType === request.unitType);
  if (!option) return failure(RAISE_REASON_TYPE);
  if (option.unitCost * request.count > evaluated.capacityLeft) return failure(RAISE_REASON_CAPACITY);
  const orderId = insertHireOrder(gameDbOps, {
    playerId: seatId,
    kind: 'raise',
    h3Index: request.h3Index,
    unitType: request.unitType,
    unitCount: request.count,
    neutralUnitId: null,
    createdTurn: currentTurn(),
  });
  return { success: true, orderId };
}

/**
 * Stores a rehire after the unit is still a candidate.
 *
 * Purpose: The order keeps the unit's hex and type so a later view can label it.
 * When to use: From `executePlaceHireOrder`.
 * Expected outcome: The new order id, or the first failing reason. Funds are not checked.
 * Exceptions: Propagates SQLite errors.
 */
function placeRehire(seatId: SeatId, unitId: string): HireMutationResult {
  const state = getGameStateForPlayer(seatId, { maskUnexploredTerrain: false });
  const unit = state.units.find((row) => row.id === unitId && row.player === NEUTRAL_OWNER_ID);
  if (!unit || !isHireableUnitType(unit.unitType)) return failure(REHIRE_REASON_NOT_ELIGIBLE);
  const evaluated = evaluateHexForSeat(unit.h3Index, seatId);
  if (!evaluated) return failure(REHIRE_REASON_NOT_ELIGIBLE);
  if (evaluated.evaluation.blockedReason) return failure(evaluated.evaluation.blockedReason);
  if (!evaluated.evaluation.rehireCandidates.some((candidate) => candidate.unitId === unitId)) {
    return failure(REHIRE_REASON_NOT_ELIGIBLE);
  }
  if (evaluated.ordersHere.some((order) => order.kind === 'rehire' && order.neutralUnitId === unitId)) {
    return failure(REHIRE_REASON_ALREADY_ORDERED);
  }
  const orderId = insertHireOrder(gameDbOps, {
    playerId: seatId,
    kind: 'rehire',
    h3Index: unit.h3Index,
    unitType: unit.unitType,
    unitCount: 1,
    neutralUnitId: unitId,
    createdTurn: currentTurn(),
  });
  return { success: true, orderId };
}

/**
 * The planning turn stored on a new order.
 *
 * Purpose: Diagnostics can tell which turn placed the row. The end of the turn deletes every order.
 * When to use: The insert.
 * Expected outcome: `turn_state.turn_number`, or 1 when the row is missing.
 * Exceptions: None.
 */
function currentTurn(): number {
  return gameDbOps.getOne<{ turnNumber: number }>('SELECT turn_number AS turnNumber FROM turn_state WHERE id = 1')?.turnNumber ?? 1;
}

/**
 * One pending order for the panel, including a rehire's display name.
 *
 * Purpose: The fee comes from the same helper as the treasury warning.
 * When to use: Mapping `ordersHere`.
 * Expected outcome: A raise has a null unit id and display name. A missing rehire target has a fee of 0.
 * Exceptions: None.
 */
function orderView(order: HireOrderRow, displayName: (unitId: string) => string): HireOrderView {
  return {
    orderId: order.id,
    kind: order.kind,
    unitType: order.unitType,
    count: order.unitCount,
    unitId: order.neutralUnitId,
    displayName: order.kind === 'rehire' && order.neutralUnitId ? displayName(order.neutralUnitId) : null,
    fee: hireOrderFee(gameDbOps, order),
  };
}

/**
 * A rejected mutation.
 *
 * Purpose: Callers branch on `success` and show `reason`.
 * When to use: Each failing check.
 * Expected outcome: `success` false and the sentence.
 * Exceptions: None.
 */
function failure(reason: string): HireMutationResult {
  return { success: false, reason };
}
