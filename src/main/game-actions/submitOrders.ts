import { dbGetOne, dbRun, isDbReady } from '../gameDb';
import type { AirStrikeOrder, FerryOrder, RangedAttackOrder, SubmitOrdersPayload } from '../../shared/ipcTypes';
import { logDebug, logError } from '../logger';
import { validateAirStrikeOrder, validateFerryOrder } from './airValidation';

export interface SubmitOrdersResult {
  success: boolean;
  reason?: string;
}

interface SubmitOrdersDeps {
  validateOrder: (unitId: string, toH3Index: string) => { valid: true } | { valid: false; reason: string };
  validateRangedAttack: (
    unitId: string,
    targetH3Index: string,
    options?: { allowedPlayer?: 'human' | 'opponent' }
  ) => { valid: true } | { valid: false; reason: string };
  humanPlayerId: string;
  validPhase: string;
}

/**
 * Why this exists:
 *     Commits one planning-phase batch of human tactical intents into pending order tables.
 * When to use:
 *     Main-process submitOrders IPC handler after client-side planning edits are finalized for the turn.
 * What to expect:
 *     Rejects the entire batch on first invalid/duplicate order and returns a concrete reason; otherwise persists all pending tables.
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
