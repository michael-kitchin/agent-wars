/**
 * Applies a production envelope's rows.
 *
 * Purpose: A queue row and a hire row share one pass, and this module does not import the production tools at runtime.
 * When to use: `parseOrdersResponse` when production tools are enabled.
 * Expected outcome: How many rows were stored, and why the rest were dropped.
 * Exceptions: None. A tool error becomes a drop reason.
 */

import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import { coordinateContextSeatId, type CoordinateContext } from '../briefing/map/coordinateContext';
import { codeToLatLngRounded } from '../briefing/map/hexCodeTranslator';
import { logDebug } from '../logger';
import { normalizeProductionOrders } from '../productionOrders';
import { executeMercenaryTools } from '../tools/mercenaryTools';
import type { executeProductionTools } from '../tools/productionTools';
import type { LatLng } from '../tools/pathfinding';

/**
 * Stores each accepted production row.
 *
 * Purpose: The caller passes the production executor so this file does not import it.
 * When to use: Once per parsed envelope that includes production orders.
 * Expected outcome: `appliedCount` is the number of tool calls that returned ok.
 * Exceptions: None. Translation and tool failures are drop reasons.
 */
export function applyProductionOrdersFromEnvelope(
  entries: unknown,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  context: CoordinateContext,
  executeProduction: typeof executeProductionTools
): { appliedCount: number; droppedReasons: string[] } {
  const normalized = normalizeProductionOrders(entries, context);
  const droppedReasons = [...normalized.droppedReasons];
  let appliedCount = 0;
  const seatId = coordinateContextSeatId(context);
  for (const order of normalized.validOrders) {
    if (order.action === 'rehire_mercenary') {
      const result = executeMercenaryTools(
        seatId,
        'hire_mercenaries',
        { action: 'rehire', unitId: order.unitId },
        state,
        latLngByH3,
        resolveToH3
      );
      if (result.status === 'ok') appliedCount += 1;
      else droppedReasons.push(`production rehire_mercenary @ ${order.unitId}: ${String(result.error ?? 'failed')}`);
      continue;
    }
    let hexLatLng: [number, number];
    try {
      hexLatLng = codeToLatLngRounded(order.hex, context);
    } catch {
      droppedReasons.push(`production ${order.action} @ ${order.hex}: hex code could not be translated`);
      continue;
    }
    const result = order.action === 'raise_mercenaries'
      ? executeMercenaryTools(
        seatId,
        'hire_mercenaries',
        { action: 'raise', hex: hexLatLng, unitType: order.unitType, count: order.count },
        state,
        latLngByH3,
        resolveToH3
      )
      : executeProduction(seatId, order.action, { hex: hexLatLng, unitType: order.unitType, count: order.count }, state, latLngByH3, resolveToH3);
    if (result.status === 'ok') appliedCount += 1;
    else droppedReasons.push(`production ${order.action} @ ${order.hex}: ${String(result.error ?? 'failed')}`);
  }
  logDebug('openRouter applyProductionOrdersFromEnvelope', {
    requestedCount: Array.isArray(entries) ? entries.length : 0,
    appliedCount,
    droppedCount: droppedReasons.length,
    droppedReasons,
  });
  return { appliedCount, droppedReasons };
}
