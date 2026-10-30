/**
 * Re-encodes tool JSON results so the OpenRouter model sees briefing hex codes instead of raw lat/lng or H3.
 *
 * Purpose: Completes the "hard cutover" path: inbound args are decoded to lat/lng for engines, outbound payloads stay code-first for the LLM.
 * When to use: Wrap each tool `executeTool*` result in `requestOrdersFlow` immediately before `JSON.stringify` for the tool role message.
 * Expected outcome: Pathfinding and production summaries expose hex-first fields; assessment, combat, standing orders, and memory success payloads run through deep geo-field redaction.
 * Exceptions: On unexpected shapes, returns the original result unchanged (after debug log).
 */

import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { logDebug, logError, logTrace } from '../logger';
import type { LatLng } from '../tools/pathfinding';

/**
 * JSON keys whose values are always geographic `[lat,lng]` tuples in legacy tool responses.
 *
 * Purpose: Drives selective replacement so unrelated two-number arrays (e.g. pair metadata) are untouched.
 * When to use: Only inside `deepRedactGeoCoordinateFields` when visiting object properties.
 * Expected outcome: Tuple values become two-character briefing codes for the active context.
 * Exceptions: None.
 */
const GEO_COORDINATE_FIELD_KEYS = new Set([
  'position',
  'destination',
  'defendHex',
  'targetHex',
  'nextMoveHex',
  'origin',
  'orderToXY',
  'endHex',
  'from',
  'to',
]);

/**
 * Array keys whose elements are exclusively `[lat,lng]` waypoint / path samples.
 *
 * Purpose: Patrol `waypoints` and standing-order `totalPath` are arrays of tuples without per-element field names.
 * When to use: In `deepRedactGeoCoordinateFields` for those property names only.
 * Expected outcome: Arrays become parallel arrays of briefing hex code strings.
 * Exceptions: Leaves arrays unchanged if any element is not a finite lat/lng pair.
 */
const GEO_COORDINATE_ARRAY_KEYS = new Set(['waypoints', 'totalPath']);

/**
 * Converts a lat/lng pair to a briefing hex code using nearest cell in the active map (`resolveToH3`).
 *
 * Purpose: Bridges legacy tool internals that still compute on rounded lat/lng tuples.
 * When to use: When rewriting tool JSON that only includes `[lat,lng]` vertices.
 * Expected outcome: Same code the ASCII map uses for that map cell when the tuple resolves.
 * Exceptions: Returns `undefined` when inputs are not finite or `resolveToH3` yields no cell.
 */
/**
 * Returns true when a value looks like a WGS84 point suitable for `resolveToH3`.
 *
 * Purpose: Avoid rewriting unrelated length-2 numeric arrays that appear under non-geo keys.
 * When to use: Before treating an array as a coordinate tuple for encoding.
 * Expected outcome: True only for finite pairs within latitude/longitude ranges.
 * Exceptions: None.
 */
function isLatLngTuple(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length < 2) return false;
  const lat = Number(value[0]);
  const lng = Number(value[1]);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * Deep-clones a tool JSON value and replaces geographic tuples with briefing hex codes.
 *
 * Purpose: Implements outbound hex translation for tools 2–5 without changing tool implementations.
 * When to use: After `executeAssessment`–`executeStandingOrders` (and memory tools) for successful responses before the model sees them.
 * Expected outcome: Known geo fields hold strings like `"AB"`; `waypoints` / `totalPath` become string arrays.
 * Exceptions: Leaves a tuple in place when encoding fails (rare); logs trace for debugging.
 */
function deepRedactGeoCoordinateFields(
  value: unknown,
  context: CoordinateContext,
  resolveToH3: (lat: number, lng: number) => string | undefined
): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((x) => isLatLngTuple(x))) {
      return (value as [number, number][])
        .map((ll) => latLngTupleToHexCode(ll, context, resolveToH3))
        .map((c, i) => {
          if (c) return c;
          logTrace('openRouterToolResultHex deepRedactGeoCoordinateFields: tuple not encoded', { index: i });
          return null;
        })
        .filter((c): c is string => typeof c === 'string');
    }
    return value.map((el) => deepRedactGeoCoordinateFields(el, context, resolveToH3));
  }
  if (typeof value !== 'object') return value;
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (GEO_COORDINATE_FIELD_KEYS.has(k) && isLatLngTuple(v)) {
      const code = latLngTupleToHexCode(v, context, resolveToH3);
      if (code) {
        out[k] = code;
        continue;
      }
      logTrace('openRouterToolResultHex deepRedactGeoCoordinateFields: field not encoded', { key: k });
      out[k] = deepRedactGeoCoordinateFields(v, context, resolveToH3);
      continue;
    }
    if (GEO_COORDINATE_ARRAY_KEYS.has(k) && Array.isArray(v)) {
      out[k] = deepRedactGeoCoordinateFields(v, context, resolveToH3);
      continue;
    }
    out[k] = deepRedactGeoCoordinateFields(v, context, resolveToH3);
  }
  return out;
}

function latLngTupleToHexCode(
  ll: unknown,
  context: CoordinateContext,
  resolveToH3: (lat: number, lng: number) => string | undefined
): string | undefined {
  if (!Array.isArray(ll) || ll.length < 2) return undefined;
  const lat = Number(ll[0]);
  const lng = Number(ll[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  const h3 = resolveToH3(lat, lng);
  if (!h3) return undefined;
  try {
    return h3ToCode(h3, context);
  } catch {
    return undefined;
  }
}

/**
 * Rewrites a successful `plan_route` tool body to remove lat/lng tuples and raw H3 from the model-visible JSON.
 *
 * Purpose: `PlanRouteOk` historically included `origin`, `destination`, `orderToXY`, and per-step `endHex` as `[lat,lng]`.
 * When to use: Only from `encodeOpenRouterToolResultForLlm` for `toolName === 'plan_route'`.
 * Expected outcome: Adds `orderToHexCode`, per-segment `hexCodes` / `endHexCode`, optional `suggestedDestinationHexCodes`, drops sensitive fields, including `pathH3Indexes`.
 * Exceptions: If `orderToH3` is missing, `orderToHexCode` may be omitted; path entries are copied through when malformed.
 */
function redactPlanRouteResult(
  result: Record<string, unknown>,
  context: CoordinateContext,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  const out = { ...result };
  const orderH3 = typeof out.orderToH3 === 'string' ? out.orderToH3 : undefined;
  delete out.origin;
  delete out.destination;
  delete out.orderToXY;
  delete out.orderToH3;
  delete out.pathH3Indexes;
  if (orderH3) {
    try {
      out.orderToHexCode = h3ToCode(orderH3, context);
    } catch {
      logDebug('openRouterToolResultHex redactPlanRouteResult: orderToH3 could not be encoded', { orderH3 });
    }
  }
  const path = out.path;
  if (Array.isArray(path)) {
    out.path = path.map((seg) => {
      if (!seg || typeof seg !== 'object') return seg;
      const s = { ...(seg as Record<string, unknown>) };
      const hexes = s.hexes;
      const endHex = s.endHex;
      delete s.hexes;
      delete s.endHex;
      if (Array.isArray(hexes)) {
        const codes = (hexes as LatLng[])
          .map((ll) => latLngTupleToHexCode(ll, context, resolveToH3))
          .filter((c): c is string => typeof c === 'string');
        if (codes.length > 0) s.hexCodes = codes;
      }
      if (Array.isArray(endHex)) {
        const endCode = latLngTupleToHexCode(endHex, context, resolveToH3);
        if (endCode) s.endHexCode = endCode;
      }
      return s;
    });
  }
  const suggested = out.suggestedDestinations;
  if (Array.isArray(suggested)) {
    const codes = (suggested as LatLng[])
      .map((ll) => latLngTupleToHexCode(ll, context, resolveToH3))
      .filter((c): c is string => typeof c === 'string');
    if (codes.length > 0) out.suggestedDestinationHexCodes = codes;
    delete out.suggestedDestinations;
  }
  return out;
}

/**
 * Rewrites a successful `check_distance` tool body to replace endpoint tuples with briefing hex codes.
 *
 * Purpose: `CheckDistanceOk` exposed `from` / `to` as `[lat,lng]`.
 * When to use: Only from `encodeOpenRouterToolResultForLlm` for `toolName === 'check_distance'`.
 * Expected outcome: `fromHexCode` / `toHexCode` populated when resolvable; `from` / `to` removed.
 * Exceptions: Leaves endpoints absent if resolution fails (caller still has numeric distances).
 */
function redactCheckDistanceResult(
  result: Record<string, unknown>,
  context: CoordinateContext,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  const out = { ...result };
  const fromCode = latLngTupleToHexCode(out.from, context, resolveToH3);
  const toCode = latLngTupleToHexCode(out.to, context, resolveToH3);
  delete out.from;
  delete out.to;
  if (fromCode) out.fromHexCode = fromCode;
  if (toCode) out.toHexCode = toCode;
  return out;
}

/**
 * Rewrites nested `production` objects from tool 6 so queue rows use `hexCode` instead of a lat/lng tuple.
 *
 * Purpose: `summarizeQueue` attaches `hex: [lat,lng]` for display; the LLM contract is now code-first.
 * When to use: From `encodeOpenRouterToolResultForLlm` for `query_production` / `set_build_queue` success payloads.
 * Expected outcome: Each queue summary gains `hexCode` when the tuple maps to a cell; `hex` tuple removed.
 * Exceptions: Skips rows that do not carry a `hex` array.
 */
function redactTool6ProductionPayload(
  result: Record<string, unknown>,
  context: CoordinateContext,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  const out = { ...result };
  const prod = result.production;
  if (!prod || typeof prod !== 'object' || Array.isArray(prod)) return out;

  const prodClone = JSON.parse(JSON.stringify(prod)) as Record<string, unknown>;

  const patchQueueRow = (row: Record<string, unknown>): void => {
    const hx = row.hex;
    if (!Array.isArray(hx)) return;
    const code = latLngTupleToHexCode(hx, context, resolveToH3);
    delete row.hex;
    if (code) row.hexCode = code;
  };

  const queues = prodClone.controlledHexQueues;
  if (Array.isArray(queues)) {
    for (const q of queues) {
      if (q && typeof q === 'object' && !Array.isArray(q)) patchQueueRow(q as Record<string, unknown>);
    }
  } else {
    patchQueueRow(prodClone);
  }
  out.production = prodClone;
  return out;
}

/**
 * Applies hex-first encoding rules to a tool execution result before it is sent back to the model.
 *
 * Purpose: Centralizes outbound redaction so individual tools can stay lat/lng-native internally.
 * When to use: Once per tool response in the OpenRouter tool loop.
 * Expected outcome: Known tools return redacted clones; unknown tools pass through unchanged.
 * Exceptions: Catches per-tool redaction errors and returns the original payload after `logError`.
 */
export function encodeOpenRouterToolResultForLlm(
  toolName: string,
  result: Record<string, unknown>,
  context: CoordinateContext,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('openRouterToolResultHex encodeOpenRouterToolResultForLlm', { toolName, mode: context.mode });
  if (result.status !== 'ok') return result;
  try {
    if (toolName === 'plan_route') return redactPlanRouteResult(result, context, resolveToH3);
    if (toolName === 'check_distance') return redactCheckDistanceResult(result, context, resolveToH3);
    if (toolName === 'query_production' || toolName === 'set_build_queue') {
      return redactTool6ProductionPayload(result, context, resolveToH3);
    }
    if (
      toolName === 'assess_unit' ||
      toolName === 'query_mercenaries' ||
      toolName === 'hire_mercenaries' ||
      toolName === 'assess_hex' ||
      toolName === 'estimate_combat' ||
      toolName === 'assign_order' ||
      toolName === 'query_orders' ||
      toolName === 'cancel_order' ||
      toolName.startsWith('memory_')
    ) {
      return deepRedactGeoCoordinateFields(
        JSON.parse(JSON.stringify(result)) as Record<string, unknown>,
        context,
        resolveToH3
      ) as Record<string, unknown>;
    }
    return result;
  } catch (err) {
    logError('openRouterToolResultHex encodeOpenRouterToolResultForLlm: redaction failed', err);
    return result;
  }
}
