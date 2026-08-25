/**
 * Active Callbacks table for both briefing modes.
 *
 * Purpose: Moved out of `briefingFormatter.ts` so that file stays under the size limit, and so
 * the Details cell can name each event's parameters without dragging the rest of the briefing along.
 * When to use: `formatBriefing` and `formatTacticalBriefing` after the other briefing sections.
 * Expected outcome: A two-column Event / Details markdown table. Empty subscriptions get the defined empty row.
 * Exceptions: None.
 */

import type { CallbackSubscription } from '../callbackSubscriptions';
import type { CoordinateContext } from './map/coordinateContext';
import { h3ToCode } from './map/hex-code-translator';
import { logDebug, logTrace } from '../logger';

/**
 * Turns a stored hex id into the briefing cell code for a territory or infrastructure watch.
 *
 * Purpose: The Details cell must be copyable, so it shows the same two-character code the rest of the prompt uses.
 * When to use: `territory_changed` and `infrastructure_destroyed` parameter formatting.
 * Expected outcome: A briefing code, or a fallback label when the id is not a cell.
 * Exceptions: Lookup failure returns `'specified territory'`.
 */
function formatTerritoryTarget(hexId: string, ctx: CoordinateContext): string {
  try {
    return h3ToCode(hexId, ctx);
  } catch {
    return 'specified territory';
  }
}

/**
 * Recursively replaces raw H3 strings in leftover callback params with briefing codes.
 *
 * Purpose: Unknown events still must not leak raw H3 into the prompt.
 * When to use: The fallback branch of `formatCallbackLine`.
 * Expected outcome: Strings that look like H3 become codes; other values pass through.
 * Exceptions: None.
 */
function sanitizeCallbackParamsForPrompt(params: unknown, ctx: CoordinateContext): unknown {
  if (typeof params === 'string') {
    try {
      return h3ToCode(params, ctx);
    } catch {
      return params;
    }
  }
  if (Array.isArray(params)) {
    return params.map((x) => sanitizeCallbackParamsForPrompt(x, ctx));
  }
  if (params && typeof params === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
      out[k] = sanitizeCallbackParamsForPrompt(v, ctx);
    }
    return out;
  }
  return params;
}

/**
 * Renders one subscription's Details cell.
 *
 * Purpose: The Event column already names the event; this cell must name the parameters the model would copy.
 * Repeating the event name alone does not satisfy the detail-cell contract.
 * When to use: Each row of `buildActiveCallbacksSection`.
 * Expected outcome: `event(param, …)` with unit ids, severities, types, and cell codes as applicable.
 * Exceptions: None.
 */
export function formatCallbackLine(sub: CallbackSubscription, ctx: CoordinateContext): string {
  logTrace('activeCallbacksSection formatCallbackLine', { event: sub.event });
  const n = sub.params?.n as number | undefined;
  if (sub.event === 'turns' && typeof n === 'number' && sub.subscribedTurn != null) {
    return `turns(${n}) → fires turn ${sub.subscribedTurn + n}`;
  }
  if (sub.event === 'unit_engaged' || sub.event === 'unit_destroyed' || sub.event === 'unit_arrived') {
    const unitId = (sub.params?.unitId as string) ?? (sub.params?.side as string) ?? '?';
    return `${sub.event}(${unitId})`;
  }
  if (sub.event === 'threat_escalation') {
    const unitId = (sub.params?.unitId as string) ?? '?';
    const severity = (sub.params?.severity as string) ?? '';
    return `threat_escalation(${unitId}, ${severity})`;
  }
  if (sub.event === 'territory_changed') {
    const hexId = sub.params?.hexId != null ? String(sub.params.hexId) : '';
    return hexId ? `territory_changed(${formatTerritoryTarget(hexId, ctx)})` : 'territory_changed';
  }
  if (sub.event === 'infrastructure_destroyed') {
    const targetType = sub.params?.targetType != null ? String(sub.params.targetType) : '';
    const h3Index = sub.params?.h3Index != null ? String(sub.params.h3Index) : '';
    const cell = h3Index ? formatTerritoryTarget(h3Index, ctx) : '';
    if (targetType && cell) return `infrastructure_destroyed(${targetType}, ${cell})`;
    if (targetType) return `infrastructure_destroyed(${targetType})`;
    if (cell) return `infrastructure_destroyed(${cell})`;
    return 'infrastructure_destroyed';
  }
  const sanitizedParams = sanitizeCallbackParamsForPrompt(sub.params ?? {}, ctx);
  return `${sub.event}(${JSON.stringify(sanitizedParams)})`;
}

/**
 * Builds the Active Callbacks markdown table.
 *
 * Purpose: The model replaces the whole subscription list, so it must see every live subscription and its parameters.
 * When to use: End of both mode briefings.
 * Expected outcome: Header plus either the empty-state row or one row per subscription.
 * Exceptions: None.
 */
export function buildActiveCallbacksSection(subscriptions: CallbackSubscription[], ctx: CoordinateContext): string {
  logDebug('activeCallbacksSection buildActiveCallbacksSection', { subscriptionCount: subscriptions.length });
  const header = '| Event | Details |';
  const sep = '| --- | --- |';
  if (subscriptions.length === 0) {
    return `${header}\n${sep}\n| — | None. You may add callbacks in your response JSON to be consulted on specific events. |`;
  }
  const rows = subscriptions.map((s) => `| ${s.event} | ${formatCallbackLine(s, ctx)} |`);
  return [header, sep, ...rows].join('\n');
}
