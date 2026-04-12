import { dbGetOne, dbRun, isDbReady } from '../gameDb';
import type { SubmitOrdersPayload } from '../../shared/ipcTypes';
import { logDebug, logError } from '../logger';
import { isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';
import { validateAirStrikeOrder, validateFerryOrder } from './airValidation';

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
   * Specifies the contract for the `validateRangedAttack` member (validateRangedAttack: ( unitId: string, targetH3Index: string, options?: { allowedPlayer?: 'human' | 'opponent' } ) => { valid: true } | { val).

   * Contract: Describes stable behavior for callers of `validateRangedAttack` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validateRangedAttack: (
    unitId: string,
    targetH3Index: string,
    options?: { allowedPlayer?: 'human' | 'opponent' }
  ) => { valid: true } | { valid: false; reason: string };
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
 * Defines the `submitOrdersImpl` function shape (export function submitOrdersImpl(payload: SubmitOrdersPayload, deps: SubmitOrdersDeps): SubmitOrdersResult).

 * Purpose: Supports maintainability by documenting why `submitOrdersImpl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function submitOrdersImpl(payload: SubmitOrdersPayload, deps: SubmitOrdersDeps): SubmitOrdersResult {
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

    const seen = new Set<string>();
    for (const order of orders) {
      if (seen.has(order.unitId)) return { success: false, reason: `Duplicate order for unit ${order.unitId}` };
      seen.add(order.unitId);
      const result = deps.validateOrder(order.unitId, order.toH3Index);
      if (!result.valid) return { success: false, reason: result.reason };
    }

    const seenRanged = new Set<string>();
    for (const r of ranged) {
      if (seenRanged.has(r.unitId)) return { success: false, reason: `Duplicate ranged order for unit ${r.unitId}` };
      seenRanged.add(r.unitId);
      const result = deps.validateRangedAttack(r.unitId, r.targetH3Index, { allowedPlayer: 'human' });
      if (!result.valid) return { success: false, reason: result.reason };
    }

    const seenAirStrike = new Set<string>();
    for (const s of airStrikes) {
      if (seenAirStrike.has(s.unitId)) return { success: false, reason: `Duplicate strike order for unit ${s.unitId}` };
      seenAirStrike.add(s.unitId);
      const result = validateAirStrikeOrder(s.unitId, s.targetH3Index, s.targetType, { allowedPlayer: deps.humanPlayerId });
      if (!result.valid) return { success: false, reason: result.reason };
    }

    const seenFerry = new Set<string>();
    for (const f of ferryOrders) {
      if (seenFerry.has(f.unitId)) return { success: false, reason: `Duplicate ferry order for unit ${f.unitId}` };
      seenFerry.add(f.unitId);
      const result = validateFerryOrder(f.unitId, f.destinationH3Index, { allowedPlayer: deps.humanPlayerId });
      if (!result.valid) return { success: false, reason: result.reason };
    }

    for (const unitId of seenAirStrike) {
      if (seenFerry.has(unitId)) {
        return { success: false, reason: `Air unit ${unitId} cannot strike and ferry in the same turn` };
      }
    }

    dbRun('DELETE FROM pending_orders');
    for (const order of orders) {
      dbRun('INSERT INTO pending_orders (unit_id, to_h3_index) VALUES (?, ?)', [order.unitId, order.toH3Index]);
    }
    dbRun('DELETE FROM pending_ranged_orders');
    for (const r of ranged) {
      dbRun('INSERT INTO pending_ranged_orders (unit_id, target_h3_index) VALUES (?, ?)', [r.unitId, r.targetH3Index]);
    }
    dbRun('DELETE FROM pending_air_orders');
    for (const s of airStrikes) {
      dbRun('INSERT INTO pending_air_orders (unit_id, target_h3_index, target_type) VALUES (?, ?, ?)', [
        s.unitId,
        s.targetH3Index,
        s.targetType,
      ]);
    }
    dbRun('DELETE FROM pending_ferry_orders');
    for (const f of ferryOrders) {
      dbRun('INSERT INTO pending_ferry_orders (unit_id, destination_h3_index) VALUES (?, ?)', [f.unitId, f.destinationH3Index]);
    }
    return { success: true };
  } catch (err) {
    logError('submitOrders: exception', err);
    return { success: false, reason: String(err) };
  }
}
