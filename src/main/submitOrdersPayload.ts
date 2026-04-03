import type { SubmitOrdersPayload } from '../shared/ipcTypes';

/**
 * Why this exists:
 *     Normalizes submit-orders payloads so both legacy movement arrays and structured payloads share one contract.
 * When to use:
 *     Main-process IPC `game:submitOrders` handler before forwarding to game actions.
 * What to expect:
 *     Preserves structured tactical orders (ranged/air/ferry) and always provides a movement-order array.
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
