/**
 * Inbound briefing-hex-code translation for `assign_order` standing-order parameters.
 *
 * The model only ever sees two-character briefing hex codes, but `AssignOrderParams` stores places as
 * rounded `[lat, lng]` tuples. Every place-bearing field therefore needs translating before the payload
 * reaches Tool 5, otherwise validation resolves a code string through `Number(...)` and rejects the order as
 * off-map. Standing orders are strategic-only (tactical sub-unit ids reject `assign_order` outright), so
 * this module is reached from the strategic branch of the order parser.
 */

import { logDebug } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { HEX_CODE_PATTERN } from '../briefing/map/coordinateContext';
import { codeToLatLngRounded } from '../briefing/map/hexCodeTranslator';

/**
 * Order fields that hold exactly one place as a briefing hex code.
 *
 * Purpose: Keeps `march` (`destination`) and `defend` (`defendHex`) translating through one code path so a
 * new place-bearing field cannot be added to only one of them.
 * When to use: Internal to `translateAssignOrderHexCodeParams`.
 * Expected outcome: Each listed field is translated when it holds a syntactically valid hex code.
 * Exceptions: None.
 */
const SINGLE_HEX_CODE_ORDER_FIELDS = ['destination', 'defendHex'] as const;

/**
 * Translates one briefing hex code to a rounded lat/lng pair, or `null` when it does not resolve.
 *
 * Purpose: Isolates the throwing translator so a single bad code degrades that field instead of the order.
 * When to use: Internal to `translateAssignOrderHexCodeParams`.
 * Expected outcome: A `[lat, lng]` tuple, or `null` when the code is outside the active coordinate registry.
 * Exceptions: None; translation failures are swallowed and reported as `null`.
 */
function tryCodeToLatLng(code: string, context: CoordinateContext): [number, number] | null {
  try {
    return codeToLatLngRounded(code, context);
  } catch {
    return null;
  }
}

/**
 * Rewrites every place-bearing `assign_order` field from briefing hex codes into `[lat, lng]` tuples.
 *
 * Purpose: Makes `march`, `defend`, and `patrol` all usable from model output. Before this existed only
 * `destination` was translated, so patrol waypoints reached Tool 5 as raw code strings and were always
 * rejected as off-map.
 * When to use: In the strategic `assign_order` branch of the order parser, immediately before `executeStandingOrders`.
 * Expected outcome: A shallow copy with `destination`, `defendHex`, and each `waypoints` entry converted
 * where they held a valid hex code. Non-object payloads pass through untouched, values that are already
 * coordinate tuples are preserved, and codes that fail to resolve are left as-is so Tool 5 reports the
 * off-map error against the field the model actually sent.
 * Exceptions: None.
 */
export function translateAssignOrderHexCodeParams(
  orderPayload: unknown,
  context: CoordinateContext,
  unitId: string
): unknown {
  if (!orderPayload || typeof orderPayload !== 'object' || Array.isArray(orderPayload)) return orderPayload;
  const order = { ...(orderPayload as Record<string, unknown>) };
  logDebug('openRouter translateAssignOrderHexCodeParams', { unitId, orderType: order.type });

  for (const field of SINGLE_HEX_CODE_ORDER_FIELDS) {
    const raw = order[field];
    if (typeof raw !== 'string' || !HEX_CODE_PATTERN.test(raw)) continue;
    const latLng = tryCodeToLatLng(raw, context);
    if (latLng) order[field] = latLng;
    else logDebug('openRouter assign_order: hex code did not resolve', { unitId, field, code: raw });
  }

  const waypoints = order.waypoints;
  if (Array.isArray(waypoints)) {
    order.waypoints = waypoints.map((waypoint) => {
      if (typeof waypoint !== 'string' || !HEX_CODE_PATTERN.test(waypoint)) return waypoint;
      const latLng = tryCodeToLatLng(waypoint, context);
      if (latLng) return latLng;
      logDebug('openRouter assign_order: patrol waypoint hex code did not resolve', { unitId, code: waypoint });
      return waypoint;
    });
  }

  return order;
}
