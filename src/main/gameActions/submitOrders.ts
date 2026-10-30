import { type SeatId, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { dbGetOne, dbRun, isDbReady } from '../gameDb';
import type { SubmitOrdersPayload } from '../../shared/ipcTypes';
import { logDebug, logError } from '../logger';
import { isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';
import { validateAirStrikeOrder, validateFerryOrder } from './airValidation';
import { validateMissileLaunchOrder } from './missileValidation';
import {
  ORDER_PLAN_SANITIZE_CONTEXT,
  logOrderPlanSanitizeDrop,
  logOrderPlanSanitizeSummary,
  strategicAirStrikeDuplicateReason,
  strategicFerryDuplicateReason,
  strategicMissileLaunchDuplicateReason,
  strategicMovementDuplicateReason,
  strategicRangedDuplicateReason,
} from './orderPlanSanitize';

/**
 * Resolves a roster id to the same display label the renderer uses for tooltips and pending-order UI.
 *
 * Purpose: Duplicate-order and conflict reasons are shown to the player; they must not echo raw `human-infantry-1` ids.
 * When to use: Injected once per `executeSubmitOrders` call alongside movement/ranged validators.
 * Expected outcome: Stable per-turn labels derived from the same snapshot rows as strategic `buildUnitDisplayNameLookup`.
 * Exceptions: None.
 */
type UnitDisplayLabelFn = (unitId: string) => string;

/**
 * Documents the `SubmitOrdersResult` interface as a named contract surface (export interface SubmitOrdersResult).

 * Purpose: Supports maintainability by documenting why `SubmitOrdersResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface SubmitOrdersResult {
    /**
   * Specifies the contract for the `success` member (success: boolean;).

   * Contract: Describes stable behavior for callers of `success` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
success: boolean;
    /**
   * Specifies the contract for the `reason` member (reason?: string;).

   * Contract: Describes stable behavior for callers of `reason` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
reason?: string;
}

/**
 * Documents the `SubmitOrdersDeps` interface as a named contract surface (interface SubmitOrdersDeps).

 * Purpose: Supports maintainability by documenting why `SubmitOrdersDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface SubmitOrdersDeps {
    /**
   * Specifies the contract for the `validateOrder` member (validateOrder: (unitId: string, toH3Index: string) => { valid: true } | { valid: false; reason: string };).

   * Contract: Describes stable behavior for callers of `validateOrder` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validateOrder: (unitId: string, toH3Index: string) => { valid: true } | { valid: false; reason: string };
    /**
   * Specifies the contract for the `validateRangedAttack` member (validateRangedAttack: ( unitId: string, targetH3Index: string, options?: { allowedPlayer?: SeatId; displayLabelForUnit?: (unitId: string) => string } ) => { valid: true } | { val).

   * Contract: Describes stable behavior for callers of `validateRangedAttack` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: `displayLabelForUnit` is forwarded so `Unit not found` reasons never echo raw roster ids.
   * Exceptions: None.
   */
validateRangedAttack: (
    unitId: string,
    targetH3Index: string,
    options?: { allowedPlayer?: SeatId; displayLabelForUnit?: (unitId: string) => string }
  ) => { valid: true } | { valid: false; reason: string };
    /**
   * Specifies the contract for the `displayLabelForUnit` member (displayLabelForUnit: UnitDisplayLabelFn;).

   * Contract: Maps strategic unit ids to player-facing labels for any user-visible reason string assembled in this module.
   * When to use: Always supplied by `submitOrders` in `gameActions` from the current human-perspective roster.
   * Expected outcome: Ordinal + type noun strings; never raw ids in duplicate or air/ferry conflict messages.
   * Exceptions: None.
   */
displayLabelForUnit: UnitDisplayLabelFn;
    /**
   * Specifies the contract for the `humanPlayerId` member (humanPlayerId: string;).

   * Contract: Describes stable behavior for callers of `humanPlayerId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
humanPlayerId: string;
    /**
   * Specifies the contract for the `validPhase` member (validPhase: string;).

   * Contract: Describes stable behavior for callers of `validPhase` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validPhase: string;
}

/**
 * Keeps order rows that pass validation and counts the rows that do not.
 *
 * Purpose: Strategic submit drops an invalid row and continues. Five order kinds share that loop.
 * When to use: After the duplicate check for one order kind inside `executeSubmitOrders`.
 * Expected outcome: `kept` is the accepted rows in input order. `droppedCount` is how many failed. Each failure is logged with the row's unit id and reason.
 * Exceptions: None. The validator's false result supplies the reason.
 */
function keepValidOrderRows<T extends { readonly unitId: string }>(
  rows: readonly T[],
  orderKind: string,
  validate: (row: T) => { valid: true } | { valid: false; reason: string }
): { readonly kept: T[]; readonly droppedCount: number } {
  const kept: T[] = [];
  let droppedCount = 0;
  for (const row of rows) {
    const result = validate(row);
    if (!result.valid) {
      droppedCount += 1;
      logOrderPlanSanitizeDrop(ORDER_PLAN_SANITIZE_CONTEXT.strategicSubmit, orderKind, {
        unitId: row.unitId,
        reason: result.reason,
      });
      continue;
    }
    kept.push(row);
  }
  return { kept, droppedCount };
}

/**
 * Defines the `executeSubmitOrders` function shape (export function executeSubmitOrders(payload: SubmitOrdersPayload, deps: SubmitOrdersDeps): SubmitOrdersResult).

 * Purpose: Persists human strategic pending orders for the current planning phase after validation.
 * When to use: Called from `submitOrders` in `gameActions` with injected validators and display labels.
 * Expected outcome: Duplicate unit ids within a single category still fail the whole submit; per-row validation failures drop only that row, log via `orderPlanSanitize`, and persist the sanitized plan. Ferry rows for a unit that keeps a valid air strike are dropped (strike wins) instead of failing the batch.
 * Exceptions: Database and tactical-guard failures return `success: false`; caught exceptions are logged at error.
 */
export function executeSubmitOrders(payload: SubmitOrdersPayload, deps: SubmitOrdersDeps): SubmitOrdersResult {
  const orders = payload.movementOrders ?? [];
  const ranged = payload.rangedAttacks ?? [];
  const airStrikes = payload.airStrikes ?? [];
  const ferryOrders = payload.ferryOrders ?? [];
  logDebug('submitOrders', {
    orderCount: orders.length,
    rangedCount: ranged.length,
    airStrikeCount: airStrikes.length,
    ferryCount: ferryOrders.length,
  });
  try {
    if (!isDbReady()) {
      logError('submitOrders: database not initialized');
      return { success: false, reason: 'Database not initialized' };
    }
    if (isTacticalBattleActive()) {
      logError('submitOrders: blocked while tactical battle active');
      return { success: false, reason: 'Cannot change strategic orders during a tactical battle.' };
    }

    const turnRow = dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1');
    if (turnRow?.phase !== deps.validPhase) {
      logError('submitOrders: not in planning phase', turnRow?.phase);
      return { success: false, reason: 'Not in planning phase' };
    }

    const sanitizeCtx = ORDER_PLAN_SANITIZE_CONTEXT.strategicSubmit;
    let droppedInvalidRows = 0;

    const movementDupReason = strategicMovementDuplicateReason(orders, deps.displayLabelForUnit);
    if (movementDupReason) {
      return { success: false, reason: movementDupReason };
    }
    const movementPass = keepValidOrderRows(orders, 'movement', (order) =>
      deps.validateOrder(order.unitId, order.toH3Index)
    );
    droppedInvalidRows += movementPass.droppedCount;
    const keptMovements = movementPass.kept;

    const rangedDupReason = strategicRangedDuplicateReason(ranged, deps.displayLabelForUnit);
    if (rangedDupReason) {
      return { success: false, reason: rangedDupReason };
    }
    const rangedPass = keepValidOrderRows(ranged, 'ranged', (r) =>
      deps.validateRangedAttack(r.unitId, r.targetH3Index, {
        allowedPlayer: HUMAN_SEAT_ID,
        displayLabelForUnit: deps.displayLabelForUnit,
      })
    );
    droppedInvalidRows += rangedPass.droppedCount;
    const keptRanged = rangedPass.kept;

    const airDupReason = strategicAirStrikeDuplicateReason(airStrikes, deps.displayLabelForUnit);
    if (airDupReason) {
      return { success: false, reason: airDupReason };
    }
    const airPass = keepValidOrderRows(airStrikes, 'airStrike', (s) =>
      validateAirStrikeOrder(s.unitId, s.targetH3Index, s.targetType, {
        allowedPlayer: deps.humanPlayerId,
        displayLabelForUnit: deps.displayLabelForUnit,
      })
    );
    droppedInvalidRows += airPass.droppedCount;
    const keptAirStrikes = airPass.kept;
    const strikeUnitIds = new Set(keptAirStrikes.map((s) => s.unitId));

    const ferryDupReason = strategicFerryDuplicateReason(ferryOrders, deps.displayLabelForUnit);
    if (ferryDupReason) {
      return { success: false, reason: ferryDupReason };
    }
    const ferryPass = keepValidOrderRows(ferryOrders, 'ferry', (f) => {
      if (strikeUnitIds.has(f.unitId)) {
        return {
          valid: false as const,
          reason: `Air unit ${deps.displayLabelForUnit(f.unitId)} cannot strike and ferry in the same turn`,
        };
      }
      return validateFerryOrder(f.unitId, f.destinationH3Index, {
        allowedPlayer: deps.humanPlayerId,
        displayLabelForUnit: deps.displayLabelForUnit,
      });
    });
    droppedInvalidRows += ferryPass.droppedCount;
    const keptFerry = ferryPass.kept;

    const missileLaunches = payload.missileLaunches ?? [];
    const missileDupReason = strategicMissileLaunchDuplicateReason(missileLaunches, deps.displayLabelForUnit);
    if (missileDupReason) return { success: false, reason: missileDupReason };
    const missilePass = keepValidOrderRows(missileLaunches, 'missileLaunch', (row) =>
      validateMissileLaunchOrder(row.unitId, row.targetH3Index, {
        allowedPlayer: deps.humanPlayerId,
        displayLabelForUnit: deps.displayLabelForUnit,
      })
    );
    droppedInvalidRows += missilePass.droppedCount;
    const keptMissileLaunches = missilePass.kept;

    if (droppedInvalidRows > 0) {
      logOrderPlanSanitizeSummary(sanitizeCtx, droppedInvalidRows, {
        movements: keptMovements.length,
        ranged: keptRanged.length,
        airStrikes: keptAirStrikes.length,
        ferry: keptFerry.length,
        missileLaunches: keptMissileLaunches.length,
      });
    }

    dbRun('DELETE FROM pending_orders');
    for (const order of keptMovements) {
      dbRun('INSERT INTO pending_orders (unit_id, to_h3_index) VALUES (?, ?)', [order.unitId, order.toH3Index]);
    }
    dbRun('DELETE FROM pending_ranged_orders');
    for (const r of keptRanged) {
      dbRun('INSERT INTO pending_ranged_orders (unit_id, target_h3_index) VALUES (?, ?)', [r.unitId, r.targetH3Index]);
    }
    dbRun('DELETE FROM pending_air_orders');
    for (const s of keptAirStrikes) {
      dbRun('INSERT INTO pending_air_orders (unit_id, target_h3_index, target_type) VALUES (?, ?, ?)', [
        s.unitId,
        s.targetH3Index,
        s.targetType,
      ]);
    }
    dbRun('DELETE FROM pending_ferry_orders');
    for (const f of keptFerry) {
      dbRun('INSERT INTO pending_ferry_orders (unit_id, destination_h3_index) VALUES (?, ?)', [f.unitId, f.destinationH3Index]);
    }
    dbRun('DELETE FROM pending_missile_launches');
    for (const row of keptMissileLaunches) {
      dbRun('INSERT INTO pending_missile_launches (unit_id, target_h3_index) VALUES (?, ?)', [row.unitId, row.targetH3Index]);
    }
    return { success: true };
  } catch (err) {
    logError('submitOrders: exception', err);
    return { success: false, reason: String(err) };
  }
}
