/**
 * Normalizes OpenRouter tool-call arguments from LLM hex codes into internal `[lat,lng]` tuples.
 *
 * Purpose: Keeps tool implementations lat/lng-based while the external contract uses 2-character codes.
 * When to use: Immediately before `executePathfinding`/`executeAssessment`/`executeCombatEstimation`/`executeProductionTools` in `requestOrdersFlow`.
 * Expected outcome: Tool implementations continue to receive the legacy argument shapes they validate today.
 * Exceptions: Throws when a hex code is invalid for the active context (surface as tool error JSON upstream).
 */

import { logDebug, logError } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { HEX_CODE_PATTERN } from '../briefing/map/coordinateContext';
import { codeToLatLngRounded } from '../briefing/map/hexCodeTranslator';

/**
 * Decodes LLM-facing coordinate strings in tool arguments for execution-time APIs.
 *
 * Purpose: Single choke point for inbound tool arg translation keyed by tool name.
 * When to use: Wrap each tool invocation in `requestOrdersFlow` after JSON-parsing `function.arguments`.
 * Expected outcome: A cloned args object when changes are needed; otherwise the original reference.
 * Exceptions: Throws on invalid hex codes for fields that must decode successfully.
 */
export function decodeOpenRouterToolArgsForExecution(
  toolName: string,
  args: unknown,
  context: CoordinateContext
): unknown {
  logDebug('openRouterToolArgsHex decodeOpenRouterToolArgsForExecution', { toolName, mode: context.mode });
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args;
  const a = args as Record<string, unknown>;
  try {
    if (toolName === 'plan_route') {
      const dest = a.destination;
      if (typeof dest === 'string' && HEX_CODE_PATTERN.test(dest)) {
        return { ...a, destination: codeToLatLngRounded(dest, context) };
      }
    }
    if (toolName === 'check_distance') {
      const out = { ...a };
      if (typeof out.from === 'string' && HEX_CODE_PATTERN.test(out.from)) {
        out.from = codeToLatLngRounded(out.from, context);
      }
      if (typeof out.to === 'string' && HEX_CODE_PATTERN.test(out.to)) {
        out.to = codeToLatLngRounded(out.to, context);
      }
      return out;
    }
    if (toolName === 'assess_hex') {
      const pos = a.position;
      if (typeof pos === 'string' && HEX_CODE_PATTERN.test(pos)) {
        return { ...a, position: codeToLatLngRounded(pos, context) };
      }
    }
    if (toolName === 'estimate_combat') {
      const th = a.targetHex;
      if (typeof th === 'string' && HEX_CODE_PATTERN.test(th)) {
        return { ...a, targetHex: codeToLatLngRounded(th, context) };
      }
    }
    if (toolName === 'set_build_queue' || toolName === 'query_production') {
      const hx = a.hex;
      if (typeof hx === 'string' && HEX_CODE_PATTERN.test(hx)) {
        return { ...a, hex: codeToLatLngRounded(hx, context) };
      }
    }
    return args;
  } catch (err) {
    logError('openRouterToolArgsHex decodeOpenRouterToolArgsForExecution: decode failed', err);
    throw err;
  }
}
