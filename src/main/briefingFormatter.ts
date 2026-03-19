/**
 * Formats the Commander's Briefing block for Milestone 0.6/0.7. Consumes pre-computed assessments and
 * builds the three-section structure (strategic narrative, unit status + combat tables, attention flags)
 * plus memory, standing-order, and ACTIVE CALLBACKS sections.
 */

import type { GameStateSnapshot } from './gameDb';
import type { PrecomputationResult, UnitAssessmentResult, CombatEstimateEntry } from './precomputation';
import type { CallbackSubscription } from './callbackSubscriptions';
import { LATLNG_DECIMAL_PLACES } from './mapData';

/** Standing order statuses that require immediate attention (match tool5 WARNING_STATUSES). */
const WARNING_STATUSES = new Set([
  'blocked',
  'target_lost',
  'target_out_of_range',
  'target_destroyed',
  'arrived',
  'contact',
]);

function formatPos(ll: [number, number]): string {
  return `[${ll[0].toFixed(LATLNG_DECIMAL_PLACES)}, ${ll[1].toFixed(LATLNG_DECIMAL_PLACES)}]`;
}

/**
 * Builds Section 1: strategic narrative (3–5 sentences) from state and unit assessments.
 * Covers turn, unit counts, posture, and critical threats without numbers/tables.
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
  const sentences: string[] = [];
  sentences.push(
    `Turn ${state.turnNumber}: you command ${aiUnits.length} unit(s) against ${humanUnits.length} human unit(s).`
  );
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
    'Review the unit status and combat tables below, then issue movement and ranged attacks as needed.'
  );
  return sentences.slice(0, 5).join(' ');
}

/**
 * Derives "action needed" for a unit: yes when no standing order and has threat, or order status is in warning set.
 */
function needsAction(assessment: UnitAssessmentResult): boolean {
  const order = assessment.result.unit?.currentStandingOrder as { status?: string } | null | undefined;
  const hasThreat = (assessment.result.threats?.length ?? 0) > 0;
  if (!order && hasThreat) return true;
  if (order && typeof order.status === 'string' && WARNING_STATUSES.has(order.status)) return true;
  return false;
}

/**
 * Returns true if the unit is "quiet": has a standing order not in warning state and at most low threat.
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
 * Formats standing order + status for table cell (e.g. "MARCH to [x,y] — en_route" or "—").
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
 * Builds Section 2 Table 1: unit status (one row per AI unit with spatial decay for quiet units).
 */
function buildUnitStatusTable(unitAssessments: UnitAssessmentResult[]): string {
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
      ? `${nearest.unitId} @ ${nearest.hexDistance}`
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
    if (isQuiet(a)) {
      rows.push(`| ${a.unitId} | ${pos} | ${orderCell} | ${nearestStr} | ${severity} | ${action} (quiet) |`);
    } else {
      rows.push(`| ${a.unitId} | ${pos} | ${orderCell} | ${nearestStr} | ${severity} | ${action} |`);
    }
  }
  if (rows.length === 0) return `${header}\n${sep}\n(No AI units)`;
  return [header, sep, ...rows].join('\n');
}

/**
 * Builds Section 2 Table 2: combat estimates (matchup, assessment, P(eliminate), P(lose unit), note).
 */
function buildCombatEstimatesTable(
  combatEstimates: CombatEstimateEntry[],
  state: GameStateSnapshot
): string {
  const header =
    '| Matchup | Assessment | P(eliminate) | P(lose unit) | Note |';
  const sep = '|---------|------------|--------------|--------------|------|';
  const rows = combatEstimates.map((ce) => {
    const humanUnit = state.units.find((u) => u.id === ce.enemyUnitId);
    const posStr = formatPos(ce.targetHex);
    const matchup = `${ce.aiUnitId} vs ${ce.enemyUnitId} @ ${posStr}`;
    const note = (ce.note ?? '').slice(0, 80);
    return `| ${matchup} | ${(ce.assessment ?? 'even').toUpperCase().replace('_', ' ')} | ${(ce.probabilityDefenderEliminated ?? 0).toFixed(2)} | ${(ce.probabilityAttackerLosesUnit ?? 0).toFixed(2)} | ${note} |`;
  });
  if (rows.length === 0) return `${header}\n${sep}\n(No pre-computed engagements)`;
  return [header, sep, ...rows].join('\n');
}

/**
 * Builds Section 3: 2–3 attention flags as bulleted imperatives from units needing action.
 */
function buildAttentionFlags(unitAssessments: UnitAssessmentResult[]): string {
  const bullets: string[] = [];
  for (const a of unitAssessments) {
    if (!needsAction(a)) continue;
    const order = a.result.unit?.currentStandingOrder as { status?: string } | null | undefined;
    const threats = a.result.threats ?? [];
    const nearest = a.result.nearbyEnemies?.[0];
    if (!order && threats.length > 0 && nearest) {
      const sev = threats.some((t) => t.severity === 'critical') ? 'critical' : 'moderate';
      bullets.push(
        `${a.unitId} has no standing order and faces a ${sev} threat (nearest enemy: ${nearest.unitId}, distance ${nearest.hexDistance}).`
      );
    } else if (order?.status && WARNING_STATUSES.has(order.status)) {
      bullets.push(
        `${a.unitId} standing order is in warning state (${order.status}) — decide follow-on orders.`
      );
    }
  }
  if (bullets.length === 0) return 'None.';
  return bullets.slice(0, 3).map((b) => `- ${b}`).join('\n');
}

/**
 * Returns a short human-readable line for one callback subscription (e.g. "turns(3) → fires turn 14").
 */
function formatCallbackLine(sub: CallbackSubscription, currentTurn: number): string {
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
    return hexId ? `territory_changed(${hexId})` : 'territory_changed';
  }
  return `${sub.event}(${JSON.stringify(sub.params ?? {})})`;
}

/**
 * Builds the ACTIVE CALLBACKS section: one line per subscription or "None. You may add callbacks...".
 */
function buildActiveCallbacksSection(subscriptions: CallbackSubscription[], currentTurn: number): string {
  if (subscriptions.length === 0) {
    return 'None. You may add callbacks in your response JSON to be consulted on specific events.';
  }
  return subscriptions.map((s) => `- ${formatCallbackLine(s, currentTurn)}`).join('\n');
}

/**
 * Produces the full Commander's Briefing string: title, Section 1, Section 2 (both tables),
 * Section 3, memory block, standing order block, and ACTIVE CALLBACKS section.
 */
export function formatBriefing(
  state: GameStateSnapshot,
  precomputed: PrecomputationResult,
  standingOrderText: string,
  memoryText: string,
  subscriptions?: CallbackSubscription[]
): string {
  const sections: string[] = [];
  sections.push(`=== COMMANDER'S BRIEFING (Turn ${state.turnNumber}) ===\n`);
  sections.push(buildStrategicNarrative(state, precomputed.unitAssessments));
  sections.push('\n\n**Unit status and threats**\n');
  sections.push(buildUnitStatusTable(precomputed.unitAssessments));
  sections.push('\n\n**Combat estimates (likely engagements)**\n');
  sections.push(buildCombatEstimatesTable(precomputed.combatEstimates, state));
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
  sections.push(buildActiveCallbacksSection(subscriptions ?? [], state.turnNumber));
  return sections.join('');
}
