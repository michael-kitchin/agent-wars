/**
 * Shared logging for “drop invalid order row, keep the rest” flows (strategic `submitOrders`, tactical opponent draft Ready).
 *
 * Purpose: One consistent debug/info pattern so operators can grep `orderPlanSanitize` across strategic and tactical paths.
 * When to use: Call `logOrderPlanSanitizeDrop` per dropped row and `logOrderPlanSanitizeSummary` once per batch when any row was removed.
 * Expected outcome: Debug lines carry row-level reasons; a single info line summarizes counts when `droppedTotal > 0`.
 * Exceptions: None.
 */

import { logDebug, logInfo } from '../logger';

/**
 * Log context strings for order-plan sanitization call sites (stable grep tokens).
 *
 * Purpose: Avoid scattering magic strings across `gameActions` and `submitOrders`.
 * When to use: Pass as the first argument to `logOrderPlanSanitizeDrop` / `logOrderPlanSanitizeSummary`.
 * Expected outcome: Distinct values for strategic submit vs tactical opponent draft.
 * Exceptions: None.
 */
export const ORDER_PLAN_SANITIZE_CONTEXT = {
  strategicSubmit: 'orderPlanSanitize strategicSubmit',
  opponentTacticalDraft: 'orderPlanSanitize opponentTacticalDraft',
} as const;

/**
 * Emits a debug line for one invalid order row that was removed from a plan.
 *
 * Purpose: Row-level troubleshooting without failing the whole Ready/submit boundary.
 * When to use: Immediately when a validator rejects a single movement, ranged, air, ferry, or embark row during sanitization.
 * Expected outcome: `${context}: dropped ${orderKind}` with a structured detail object.
 * Exceptions: None.
 */
export function logOrderPlanSanitizeDrop(
  context: string,
  orderKind: string,
  detail: Record<string, unknown>
): void {
  logDebug(`${context}: dropped ${orderKind}`, detail);
}

/**
 * Emits one info line summarizing how many invalid rows were ignored in a sanitization pass.
 *
 * Purpose: Visible under default log level when anything was dropped; complements per-row debug lines.
 * When to use: After filtering a batch when `droppedTotal > 0`.
 * Expected outcome: No log when `droppedTotal` is zero.
 * Exceptions: None.
 */
export function logOrderPlanSanitizeSummary(
  context: string,
  droppedTotal: number,
  kept: Record<string, unknown>
): void {
  if (droppedTotal > 0) {
    logInfo(`${context}: ignored invalid order rows`, { droppedCount: droppedTotal, ...kept });
  }
}

/**
 * Returns a human-readable reason when the same strategic unit id appears twice in a movement order list.
 *
 * Purpose: Duplicate rows remain a hard error (user mistake), not a silent drop.
 * When to use: `executeSubmitOrders` before per-row movement validation.
 * Expected outcome: `null` when every `unitId` is unique.
 * Exceptions: None.
 */
export function strategicMovementDuplicateReason(
  orders: readonly { unitId: string }[],
  displayLabelForUnit: (unitId: string) => string
): string | null {
  const seen = new Set<string>();
  for (const order of orders) {
    if (seen.has(order.unitId)) {
      return `Duplicate order for ${displayLabelForUnit(order.unitId)}`;
    }
    seen.add(order.unitId);
  }
  return null;
}

/**
 * Returns a reason when the same unit id appears twice in a ranged-attack list (strategic pending orders).
 *
 * Purpose: Same duplicate contract as movements.
 * When to use: `executeSubmitOrders` before ranged row validation.
 * Expected outcome: `null` when unique.
 * Exceptions: None.
 */
export function strategicRangedDuplicateReason(
  rows: readonly { unitId: string }[],
  displayLabelForUnit: (unitId: string) => string
): string | null {
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.unitId)) {
      return `Duplicate ranged order for ${displayLabelForUnit(r.unitId)}`;
    }
    seen.add(r.unitId);
  }
  return null;
}

/**
 * Returns a reason when the same unit id appears twice in an air-strike list.
 *
 * Purpose: Duplicate strike rows remain a hard error.
 * When to use: `executeSubmitOrders` before air row validation.
 * Expected outcome: `null` when unique.
 * Exceptions: None.
 */
export function strategicAirStrikeDuplicateReason(
  rows: readonly { unitId: string }[],
  displayLabelForUnit: (unitId: string) => string
): string | null {
  const seen = new Set<string>();
  for (const s of rows) {
    if (seen.has(s.unitId)) {
      return `Duplicate strike order for ${displayLabelForUnit(s.unitId)}`;
    }
    seen.add(s.unitId);
  }
  return null;
}

/**
 * Returns a reason when the same unit id appears twice in a ferry order list.
 *
 * Purpose: Duplicate ferry rows remain a hard error.
 * When to use: `executeSubmitOrders` before ferry row validation.
 * Expected outcome: `null` when unique.
 * Exceptions: None.
 */
export function strategicFerryDuplicateReason(
  rows: readonly { unitId: string }[],
  displayLabelForUnit: (unitId: string) => string
): string | null {
  const seen = new Set<string>();
  for (const f of rows) {
    if (seen.has(f.unitId)) {
      return `Duplicate ferry order for ${displayLabelForUnit(f.unitId)}`;
    }
    seen.add(f.unitId);
  }
  return null;
}
