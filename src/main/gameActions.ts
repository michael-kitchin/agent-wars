/**
 * WEGO turn actions: validate movement orders, submit orders, and resolve the turn.
 * All logic runs in the main process and uses the game database.
 */

import { gridDistance } from 'h3-js';
import { dbGetOne, dbRun, dbGetAll, isDbReady, saveDatabase } from './gameDb';
import { getOrderedHexList } from './mapData';
import { logDebug, logError } from './logger';

export interface MovementOrder {
  unitId: string;
  toH3Index: string;
}

export interface SubmitOrdersResult {
  success: boolean;
  reason?: string;
}

const VALID_PHASE = 'planning';
const MAP_HEXES = new Set(getOrderedHexList());

/** Movement range in hexes per turn by unit type. Infantry 1, armor 2, naval 1. */
const MOVEMENT_RANGE: Record<string, number> = {
  infantry: 1,
  armor: 2,
  naval: 1,
};

/**
 * Validates a single movement order: unit exists and is human-owned, destination is on map,
 * within unit's movement range, and terrain allows the unit type (naval→water, infantry/armor→land).
 * Returns a reason string when invalid.
 */
function validateOrder(
  unitId: string,
  toH3Index: string
): { valid: true } | { valid: false; reason: string } {
  if (!isDbReady()) return { valid: false, reason: 'Database not initialized' };

  const unit = dbGetOne<{ player: string; unit_type: string; h3_index: string }>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return { valid: false, reason: `Unit not found: ${unitId}` };
  if (unit.player !== 'human') return { valid: false, reason: 'Only human units can receive orders' };

  if (!MAP_HEXES.has(toH3Index)) return { valid: false, reason: 'Destination not on map' };

  const dist = gridDistance(unit.h3_index, toH3Index);
  const range = MOVEMENT_RANGE[unit.unit_type] ?? 1;
  if (dist > range) return { valid: false, reason: `${unit.unit_type} can move at most ${range} hex(es)` };
  if (dist < 1) return { valid: false, reason: 'Destination must be different from current hex' };

  const destTerrain = dbGetOne<{ terrain: string }>('SELECT terrain FROM hexes WHERE h3_index = ?', [toH3Index]);
  const terrain = destTerrain?.terrain ?? 'land';
  if (unit.unit_type === 'naval' && terrain !== 'water') return { valid: false, reason: 'Naval units must move to water' };
  if ((unit.unit_type === 'infantry' || unit.unit_type === 'armor') && terrain !== 'land') {
    return { valid: false, reason: 'Land units must move to land' };
  }

  return { valid: true };
}

/**
 * Submits movement orders for the current planning phase. Validates all orders; if any fail, rejects the batch and returns success: false with reason. Otherwise stores pending orders and returns success: true.
 */
export function submitOrders(orders: MovementOrder[]): SubmitOrdersResult {
  logDebug('submitOrders', { orderCount: orders.length });
  try {
    if (!isDbReady()) {
      logError('submitOrders: database not initialized');
      return { success: false, reason: 'Database not initialized' };
    }

    const turnRow = dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1');
    if (turnRow?.phase !== VALID_PHASE) {
      logError('submitOrders: not in planning phase', turnRow?.phase);
      return { success: false, reason: 'Not in planning phase' };
    }

    const seen = new Set<string>();
    for (const order of orders) {
      if (seen.has(order.unitId)) {
        logError('submitOrders: duplicate unit', order.unitId);
        return { success: false, reason: `Duplicate order for unit ${order.unitId}` };
      }
      seen.add(order.unitId);
      const result = validateOrder(order.unitId, order.toH3Index);
      if (!result.valid) {
        logError('submitOrders: validation failed', order.unitId, order.toH3Index, result.reason);
        return { success: false, reason: result.reason };
      }
    }

    dbRun('DELETE FROM pending_orders');
    for (const order of orders) {
      dbRun('INSERT INTO pending_orders (unit_id, to_h3_index) VALUES (?, ?)', [order.unitId, order.toH3Index]);
    }
    return { success: true };
  } catch (err) {
    logError('submitOrders: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Ends the planning phase and resolves all pending orders (human + optional AI) simultaneously:
 * updates each unit's position, clears pending orders, increments turn number, and sets phase back to planning.
 * Call only when phase is planning. If aiOrders is provided, they are merged with human orders from the DB.
 */
export function ready(aiOrders: MovementOrder[] = []): SubmitOrdersResult {
  logDebug('ready', { aiOrderCount: aiOrders.length });
  try {
    if (!isDbReady()) {
      logError('ready: database not initialized');
      return { success: false, reason: 'Database not initialized' };
    }

    const turnRow = dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1');
    if (turnRow?.phase !== VALID_PHASE) {
      logError('ready: not in planning phase', turnRow?.phase);
      return { success: false, reason: 'Not in planning phase' };
    }

    const humanOrders = dbGetAll<{ unit_id: string; to_h3_index: string }>('SELECT unit_id, to_h3_index FROM pending_orders');
    const allOrders = [
      ...humanOrders.map((o) => ({ unitId: o.unit_id, toH3Index: o.to_h3_index })),
      ...aiOrders,
    ];

    dbRun('UPDATE turn_state SET phase = ? WHERE id = 1', ['resolution']);

    for (const order of allOrders) {
      dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [order.toH3Index, order.unitId]);
    }

    dbRun('DELETE FROM pending_orders');
    const turnNumberRow = dbGetOne<{ turn_number: number }>('SELECT turn_number FROM turn_state WHERE id = 1');
    dbRun('UPDATE turn_state SET phase = ?, turn_number = ? WHERE id = 1', [
      'planning',
      (turnNumberRow?.turn_number ?? 1) + 1,
    ]);

    saveDatabase();
    return { success: true };
  } catch (err) {
    logError('ready: exception', err);
    return { success: false, reason: String(err) };
  }
}
