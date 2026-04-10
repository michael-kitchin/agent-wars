/**
 * Formats the Commander's Briefing block for Milestone 0.6/0.7. Consumes pre-computed assessments and
 * builds the three-section structure (strategic narrative, unit status, possible actions, attention flags)
 * plus memory, standing-order, and ACTIVE CALLBACKS sections.
 */

import type { GameStateSnapshot } from './gameDb';
import type { AiLossEventSinceConsultation } from './gameDb';
import type { PrecomputationResult, UnitAssessmentResult, HexAssessmentEntry } from './precomputation';
import type { CallbackSubscription } from './callbackSubscriptions';
import { cellToLatLng } from 'h3-js';
import { LATLNG_DECIMAL_PLACES } from './mapData';
import { logTrace } from './logger';
import { buildPossibleUnitActionsMarkdown } from './openrouter/possibleUnitActions';

/**
 * Documents the module-scope binding `WARNING_STATUSES` (WARNING_STATUSES).

 * Purpose: Supports maintainability by documenting why `WARNING_STATUSES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const WARNING_STATUSES = new Set([
  'blocked',
  'target_lost',
  'target_out_of_range',
  'target_destroyed',
  'arrived',
  'contact',
]);

/**
 * Defines the `formatPos` function shape (function formatPos(ll: [number, number]): string).

 * Purpose: Supports maintainability by documenting why `formatPos` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatPos(ll: [number, number]): string {
  return `[${ll[0].toFixed(LATLNG_DECIMAL_PLACES)}, ${ll[1].toFixed(LATLNG_DECIMAL_PLACES)}]`;
}

/**
 * Defines the `formatUnitDisplayRef` function shape (function formatUnitDisplayRef(unitId: string): string).

 * Purpose: Supports maintainability by documenting why `formatUnitDisplayRef` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatUnitDisplayRef(unitId: string): string {
  return unitId;
}

/**
 * Defines the `formatTerritoryTarget` function shape (function formatTerritoryTarget(hexId: string, latLngByH3: Map<string, [number, number]>): string).

 * Purpose: Supports maintainability by documenting why `formatTerritoryTarget` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatTerritoryTarget(hexId: string, latLngByH3: Map<string, [number, number]>): string {
  const ll = latLngByH3.get(hexId);
  return ll ? formatPos(ll) : 'specified territory';
}

/**
 * Defines the `sanitizeCallbackParamsForPrompt` function shape (function sanitizeCallbackParamsForPrompt().

 * Purpose: Supports maintainability by documenting why `sanitizeCallbackParamsForPrompt` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function sanitizeCallbackParamsForPrompt(
  params: unknown,
  latLngByH3: Map<string, [number, number]>
): unknown {
  if (typeof params === 'string') {
    return latLngByH3.has(params) ? formatTerritoryTarget(params, latLngByH3) : params;
  }
  if (Array.isArray(params)) {
    return params.map((x) => sanitizeCallbackParamsForPrompt(x, latLngByH3));
  }
  if (params && typeof params === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
      out[k] = sanitizeCallbackParamsForPrompt(v, latLngByH3);
    }
    return out;
  }
  return params;
}

/**
 * Defines the `buildStrategicNarrative` function shape (function buildStrategicNarrative().

 * Purpose: Supports maintainability by documenting why `buildStrategicNarrative` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildStrategicNarrative(
  state: GameStateSnapshot,
  unitAssessments: UnitAssessmentResult[]
): string {
  const aiUnits = state.units.filter((u) => u.player === 'opponent');
  const humanUnits = state.units.filter((u) => u.player === 'human');
  const inContact = unitAssessments.filter(
    (a) => (a.result.threats?.length ?? 0) > 0 && a.result.nearbyEnemies?.some((e) => e.inRangedRange || e.inMeleeRange)
  ).length;
  const noOrder = unitAssessments.filter(
    (a) => a.result.unit?.currentStandingOrder == null
  ).length;
  const critical = unitAssessments.filter((a) =>
    (a.result.threats ?? []).some((t) => t.severity === 'critical')
  ).length;
  const observedEnemySentence =
    humanUnits.length > 0
      ? `Turn ${state.turnNumber}: you command ${aiUnits.length} unit(s); currently observed human units: ${humanUnits.length}.`
      : `Turn ${state.turnNumber}: you command ${aiUnits.length} unit(s); currently observed human units: 0. Enemy forces may still be out of view, so scout and preserve contact.`;
  const sentences: string[] = [];
  sentences.push(observedEnemySentence);
  if (inContact > 0) {
    sentences.push(`${inContact} of your units are in or near direct combat range.`);
  }
  if (noOrder > 0) {
    sentences.push(`${noOrder} unit(s) have no standing order and may need orders this turn.`);
  }
  if (critical > 0) {
    sentences.push(`${critical} unit(s) face a critical threat and require immediate attention.`);
  }
  sentences.push(
    'Review the unit status table and possible unit actions below, then issue movement, ranged attacks, and air strikes as permitted this turn.'
  );
  return sentences.slice(0, 5).join(' ');
}

/**
 * Defines the `needsAction` function shape (function needsAction(assessment: UnitAssessmentResult): boolean).

 * Purpose: Supports maintainability by documenting why `needsAction` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function needsAction(assessment: UnitAssessmentResult): boolean {
  const order = assessment.result.unit?.currentStandingOrder as { status?: string } | null | undefined;
  const hasThreat = (assessment.result.threats?.length ?? 0) > 0;
  if (!order && hasThreat) return true;
  if (order && typeof order.status === 'string' && WARNING_STATUSES.has(order.status)) return true;
  return false;
}

/**
 * Defines the `isQuiet` function shape (function isQuiet(assessment: UnitAssessmentResult): boolean).

 * Purpose: Supports maintainability by documenting why `isQuiet` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isQuiet(assessment: UnitAssessmentResult): boolean {
  const order = assessment.result.unit?.currentStandingOrder as { status?: string } | null | undefined;
  const threats = assessment.result.threats ?? [];
  const hasNonLow = threats.some((t) => t.severity !== 'low');
  if (hasNonLow) return false;
  if (!order) return false;
  if (order.status && WARNING_STATUSES.has(order.status)) return false;
  return true;
}

/**
 * Defines the `formatOrderCell` function shape (function formatOrderCell(assessment: UnitAssessmentResult): string).

 * Purpose: Supports maintainability by documenting why `formatOrderCell` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatOrderCell(assessment: UnitAssessmentResult): string {
  const order = assessment.result.unit?.currentStandingOrder as
    | { type?: string; destination?: [number, number]; defendHex?: [number, number]; status?: string }
    | null
    | undefined;
  if (!order) return '—';
  const type = (order.type ?? '').toUpperCase();
  let dest = '';
  if (order.destination) dest = ` to ${formatPos(order.destination)}`;
  if (order.defendHex) dest = ` ${formatPos(order.defendHex)}`;
  const status = order.status ?? '';
  return `${type}${dest} — ${status}`.trim() || '—';
}

/**
 * Defines the `buildUnitStatusTable` function shape (function buildUnitStatusTable().

 * Purpose: Supports maintainability by documenting why `buildUnitStatusTable` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildUnitStatusTable(
  unitAssessments: UnitAssessmentResult[]
): string {
  const header =
    '| Unit ID | Position | Standing order + status | Nearest enemy + distance | Threat severity | Action needed |';
  const sep = '|---------|----------|------------------------|---------------------------|-----------------|---------------|';
  const rows: string[] = [];
  for (const a of unitAssessments) {
    const pos = Array.isArray(a.result.unit?.position)
      ? formatPos(a.result.unit.position as [number, number])
      : '—';
    const orderCell = formatOrderCell(a);
    const nearest = a.result.nearbyEnemies?.[0];
    const nearestStr = nearest
      ? `${formatUnitDisplayRef(nearest.unitId)} @ ${nearest.hexDistance} (${nearest.confidence ?? 'current'}${nearest.lastSeen != null ? `, seen t${nearest.lastSeen}` : ''})`
      : '—';
    const severities = (a.result.threats ?? []).map((t) => t.severity);
    const severity =
      severities.length === 0
        ? '—'
        : severities.includes('critical')
          ? 'critical'
          : severities.includes('moderate')
            ? 'moderate'
            : 'low';
    const action = needsAction(a) ? 'yes' : 'no';
    const selfLabel = formatUnitDisplayRef(a.unitId);
    if (isQuiet(a)) {
      rows.push(`| ${selfLabel} | ${pos} | ${orderCell} | ${nearestStr} | ${severity} | ${action} (quiet) |`);
    } else {
      rows.push(`| ${selfLabel} | ${pos} | ${orderCell} | ${nearestStr} | ${severity} | ${action} |`);
    }
  }
  if (rows.length === 0) return `${header}\n${sep}\n(No AI units)`;
  return [header, sep, ...rows].join('\n');
}

/**
 * Defines the `buildSupplementalHexIntelligenceBlock` function shape (function buildSupplementalHexIntelligenceBlock(hexAssessments: HexAssessmentEntry[]): string).

 * Purpose: Supports maintainability by documenting why `buildSupplementalHexIntelligenceBlock` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildSupplementalHexIntelligenceBlock(hexAssessments: HexAssessmentEntry[]): string {
  if (hexAssessments.length === 0) return '';
  const lines: string[] = ['**Supplemental hex intelligence**', ''];
  for (const entry of hexAssessments) {
    const posStr = formatPos(entry.position);
    const r = entry.result;
    const terrain = typeof r.terrain === 'string' ? r.terrain : 'unknown';
    const passableBy = Array.isArray(r.passableBy) ? (r.passableBy as string[]).join(', ') : '';
    const notes = Array.isArray(r.strategicNotes) ? (r.strategicNotes as string[]).filter((x) => typeof x === 'string') : [];
    const noteStr = notes.length > 0 ? ` notes: ${notes.join('; ')}` : '';
    lines.push(`- ${posStr}: terrain ${terrain}; passableBy: ${passableBy || 'unknown'}${noteStr}`);
  }
  return lines.join('\n');
}

/**
 * Defines the `buildLossesSinceLastConsultationTable` function shape (function buildLossesSinceLastConsultationTable().

 * Purpose: Supports maintainability by documenting why `buildLossesSinceLastConsultationTable` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildLossesSinceLastConsultationTable(
  losses: AiLossEventSinceConsultation[],
  perspectivePlayerId: string
): string {
  const header = '| Turn | Victim Unit | Side | Cause | Killer IDs |';
  const sep = '|------|-------------|------|-------|------------|';
  if (losses.length === 0) return `${header}\n${sep}\n| — | — | — | — | — |`;
  const rows = losses.map((loss) => {
    const side = loss.victimPlayer === perspectivePlayerId ? 'own' : 'enemy';
    const killers = loss.killerIds.length > 0
      ? loss.killerIds.map((killerId) => formatUnitDisplayRef(killerId)).join(', ')
      : 'unknown';
    return `| ${loss.turnNumber} | ${formatUnitDisplayRef(loss.victimUnitId)} | ${side} | ${loss.cause} | ${killers} |`;
  });
  return [header, sep, ...rows].join('\n');
}

/**
 * Defines the `buildAttentionFlags` function shape (function buildAttentionFlags().

 * Purpose: Supports maintainability by documenting why `buildAttentionFlags` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildAttentionFlags(
  unitAssessments: UnitAssessmentResult[]
): string {
  const bullets: string[] = [];
  for (const a of unitAssessments) {
    if (!needsAction(a)) continue;
    const order = a.result.unit?.currentStandingOrder as { status?: string } | null | undefined;
    const threats = a.result.threats ?? [];
    const nearest = a.result.nearbyEnemies?.[0];
    if (!order && threats.length > 0 && nearest) {
      const sev = threats.some((t) => t.severity === 'critical') ? 'critical' : 'moderate';
      bullets.push(
        `${formatUnitDisplayRef(a.unitId)} has no standing order and faces a ${sev} threat (nearest enemy: ${formatUnitDisplayRef(nearest.unitId)}, distance ${nearest.hexDistance}).`
      );
    } else if (order?.status && WARNING_STATUSES.has(order.status)) {
      bullets.push(
        `${formatUnitDisplayRef(a.unitId)} standing order is in warning state (${order.status}) — decide follow-on orders.`
      );
    }
  }
  if (bullets.length === 0) return 'None.';
  return bullets.slice(0, 3).map((b) => `- ${b}`).join('\n');
}

/**
 * Defines the `formatCallbackLine` function shape (function formatCallbackLine(sub: CallbackSubscription, latLngByH3: Map<string, [number, number]>): string).

 * Purpose: Supports maintainability by documenting why `formatCallbackLine` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatCallbackLine(sub: CallbackSubscription, latLngByH3: Map<string, [number, number]>): string {
  const n = sub.params?.n as number | undefined;
  if (sub.event === 'turns' && typeof n === 'number' && sub.subscribedTurn != null) {
    return `turns(${n}) → fires turn ${sub.subscribedTurn + n}`;
  }
  if (sub.event === 'unit_engaged' || sub.event === 'unit_destroyed' || sub.event === 'unit_arrived') {
    const unitId = (sub.params?.unitId as string) ?? '?';
    return `${sub.event}(${unitId})`;
  }
  if (sub.event === 'threat_escalation') {
    const unitId = (sub.params?.unitId as string) ?? '?';
    const severity = (sub.params?.severity as string) ?? '';
    return `threat_escalation(${unitId}, ${severity})`;
  }
  if (sub.event === 'territory_changed') {
    const hexId = sub.params?.hexId != null ? String(sub.params.hexId) : '';
    return hexId ? `territory_changed(${formatTerritoryTarget(hexId, latLngByH3)})` : 'territory_changed';
  }
  const sanitizedParams = sanitizeCallbackParamsForPrompt(sub.params ?? {}, latLngByH3);
  return `${sub.event}(${JSON.stringify(sanitizedParams)})`;
}

/**
 * Defines the `buildActiveCallbacksSection` function shape (function buildActiveCallbacksSection().

 * Purpose: Supports maintainability by documenting why `buildActiveCallbacksSection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildActiveCallbacksSection(
  subscriptions: CallbackSubscription[],
  latLngByH3: Map<string, [number, number]>
): string {
  const header = '| Event | Details |';
  const sep = '| --- | --- |';
  if (subscriptions.length === 0) {
    return `${header}\n${sep}\n| — | None. You may add callbacks in your response JSON to be consulted on specific events. |`;
  }
  const rows = subscriptions.map((s) => `| ${s.event} | ${formatCallbackLine(s, latLngByH3)} |`);
  return [header, sep, ...rows].join('\n');
}

/**
 * Defines the `formatBriefing` function shape (export function formatBriefing( state: GameStateSnapshot, precomputed: PrecomputationResult, standingOrderText: string, memoryText: string, subsc).

 * Purpose: Supports maintainability by documenting why `formatBriefing` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatBriefing(
  state: GameStateSnapshot,
  precomputed: PrecomputationResult,
  standingOrderText: string,
  memoryText: string,
  subscriptions?: CallbackSubscription[],
  lossesSinceLastConsultation: AiLossEventSinceConsultation[] = [],
  productionText = ''
): string {
  logTrace('briefingFormatter formatBriefing', {
    turnNumber: state.turnNumber,
    unitAssessmentCount: precomputed.unitAssessments.length,
    hexAssessmentCount: precomputed.hexAssessments.length,
    callbackCount: subscriptions?.length ?? 0,
    hasProductionText: productionText.trim().length > 0,
  });
  const latLngByH3 = new Map<string, [number, number]>();
  for (const hx of state.hexes) {
    const [lat, lng] = cellToLatLng(hx.h3Index);
    latLngByH3.set(hx.h3Index, [lat, lng]);
  }
  const sections: string[] = [];
  sections.push(`=== COMMANDER'S BRIEFING (Turn ${state.turnNumber}) ===\n`);
  sections.push(buildStrategicNarrative(state, precomputed.unitAssessments));
  sections.push('\n\n**Unit status and threats**\n');
  sections.push(buildUnitStatusTable(precomputed.unitAssessments));
  const possibleActions = buildPossibleUnitActionsMarkdown({
    state,
    latLngByH3,
    formatLatLng: formatPos,
  });
  if (possibleActions.trim().length > 0) {
    sections.push('\n\n');
    sections.push(possibleActions);
  }
  const supplementalHex = buildSupplementalHexIntelligenceBlock(precomputed.hexAssessments);
  if (supplementalHex.trim().length > 0) {
    sections.push('\n\n');
    sections.push(supplementalHex);
  }
  sections.push('\n\n**Losses since last consultation**\n');
  sections.push(buildLossesSinceLastConsultationTable(lossesSinceLastConsultation, 'opponent'));
  if (productionText.trim().length > 0) {
    sections.push('\n\n**Production status and options**\n');
    sections.push(productionText.trim());
  }
  sections.push('\n\n**Attention flags**\n');
  sections.push(buildAttentionFlags(precomputed.unitAssessments));
  const hasStrategicMemoryHeader = (memoryText ?? '').includes('=== YOUR STRATEGIC MEMORY');
  if (hasStrategicMemoryHeader) {
    sections.push('\n\n' + (memoryText || '(none)'));
  } else {
    sections.push('\n\n=== YOUR STRATEGIC MEMORY ===\n');
    sections.push(memoryText || '(none)');
  }
  sections.push('\n\n');
  sections.push(standingOrderText || '');
  sections.push('\n\n**ACTIVE CALLBACKS**\n');
  sections.push(buildActiveCallbacksSection(subscriptions ?? [], latLngByH3));
  return sections.join('');
}
