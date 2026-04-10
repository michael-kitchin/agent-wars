import type { SubmitOrdersPayload } from '../shared/ipcTypes';

/**
 * Defines the `normalizeSubmitOrdersPayload` function shape (export function normalizeSubmitOrdersPayload().

 * Purpose: Supports maintainability by documenting why `normalizeSubmitOrdersPayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function normalizeSubmitOrdersPayload(
  payload: SubmitOrdersPayload | { unitId: string; toH3Index: string }[]
): SubmitOrdersPayload {
  if (Array.isArray(payload)) {
    return { movementOrders: payload };
  }
  return {
    movementOrders: payload.movementOrders ?? [],
    rangedAttacks: payload.rangedAttacks,
    airStrikes: payload.airStrikes,
    ferryOrders: payload.ferryOrders,
  };
}
