/**
 * Formats the Commander's Briefing block for Milestone 0.6/0.7. Consumes pre-computed assessments and
 * builds the three-section structure (strategic narrative, unit status, possible actions, attention flags)
 * plus memory, standing-order, and active callbacks sections.
 */

import type { GameStateSnapshot } from './gameDb';
import { buildRecentTurnNotesSection } from './briefing/recentTurnNotesSection';
import type { PrecomputationResult, UnitAssessmentResult, HexAssessmentEntry } from './precomputation';
import type { CallbackSubscription } from './callbackSubscriptions';
import { cellToLatLng, latLngToCell } from 'h3-js';
import { LATLNG_DECIMAL_PLACES } from './mapData';
import { logDebug, logTrace } from './logger';
import { buildStrategicOperationalMapSectionMarkdown } from './briefing/map/briefing-map-section';
import { ensureStrategicCoordinateRegistryInitialized } from './briefing/map/hex-coordinates';
import { h3ToCode } from './briefing/map/hex-code-translator';
import type { CoordinateContext } from './briefing/map/coordinateContext';
import type { PossibleActionsIndexedState } from './openrouter/possibleUnitActions';
import { buildActiveCallbacksSection } from './briefing/activeCallbacksSection';
import { buildEmptyProductionQueuesSection } from './openrouter/briefingSections';
import {
  OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE,
  usesOmniscientGridProximity,
} from './tools/assessUnitProximity';
import {
  SECTION_TITLE_ACTIVE_CALLBACKS,
  SECTION_TITLE_COMMANDERS_BRIEFING,
  SECTION_TITLE_RECENT_TURN_NOTES,
  SECTION_TITLE_STRATEGIC_MEMORY,
  SECTION_TITLE_SUPPLEMENTAL_HEX_INTELLIGENCE,
  SECTION_TITLE_UNIT_STATUS_AND_THREATS,
  SECTION_TITLE_ATTENTION_FLAGS,
  topLevelHeading,
} from './openrouter/promptSpec/sectionHeadings';
import { buildIntelStalenessRule } from './openrouter/promptSpec/gameRuleText';

/**
 * Optional shared coordinate/index data to avoid rebuilding within one AI request.
 *
 * Purpose: Lets `requestOrdersFlow` pass maps built once into `formatBriefing`.
 * When to use: Strategic AI order requests that already built `latLngByH3` / indexed state.
 * Expected outcome: Briefing output identical to omitting this object (internal rebuild).
 * Exceptions: None.
 */
export type FormatBriefingSharedContext = {
  latLngByH3?: Map<string, [number, number]>;
  indexedState?: PossibleActionsIndexedState;
  /**
   * Whether production tools are enabled for this consultation.
   *
   * Contract: True emits the production section even when `productionText` is empty, using the defined empty form.
   * When to use: Pass from `requestOrdersFlow` as `flags.productionEnabled`.
   * Expected outcome: Tools-off omits the section; tools-on with no queues still shows Production Status.
   * Exceptions: None.
   */
  includeProductionSection?: boolean;
};

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
function formatPosStrategicHex(ll: [number, number], ctx: CoordinateContext): string {
  try {
    const h3 = latLngToCell(ll[0], ll[1], ctx.mode === 'strategic' ? 1 : 4);
    return h3ToCode(h3, ctx);
  } catch {
    return `[${ll[0].toFixed(LATLNG_DECIMAL_PLACES)}, ${ll[1].toFixed(LATLNG_DECIMAL_PLACES)}]`;
  }
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
 * Inserts an ATX Markdown H1 with a blank line after the heading line (no leading newline, so the opener does not stack with the double newline already inserted before the briefing in the system prompt).
 *
 * Purpose: Shared H1 spacing for strategic `formatBriefing` and the tactical briefing assembler.
 * When to use: Pass a bare title from `sectionHeadings.ts`, never a string that already begins with `#`.
 * Expected outcome: A string fragment that joins cleanly after the prior prompt paragraph.
 * Exceptions: None.
 */
export function markdownHeading1(title: string): string {
  logTrace('briefingFormatter markdownHeading1', { title });
  return `# ${title}\n\n`;
}

/**
 * Inserts an ATX Markdown H2 with a blank line before the heading (so it never runs into a prior paragraph) and a blank line after the heading line.
 *
 * Purpose: Shared H2 spacing for strategic `formatBriefing` and the tactical briefing assembler.
 * When to use: Pass a bare title from `sectionHeadings.ts`, never a string that already begins with `#`.
 * Expected outcome: A fragment that joins with prior content without merging the heading into the previous paragraph.
 * Exceptions: None.
 */
export function markdownHeading2(title: string): string {
  logTrace('briefingFormatter markdownHeading2', { title });
  return `\n\n## ${title}\n\n`;
}

/**
 * Defines the `buildStrategicNarrative` function shape (function buildStrategicNarrative().
 *
 * Purpose: Short turn-opening sentences for the Commander briefing (contact, optional standing-order gaps, critical threats).
 * When to use: Strategic `formatBriefing` after assessments are ready.
 * Expected outcome: Up to five sentences; omits standing-order coaching when Orders tools are disabled; the critical-threat sentence counts only units that also need Action when standing orders are active.
 * Exceptions: None.
 */
export function buildStrategicNarrative(
  state: GameStateSnapshot,
  unitAssessments: UnitAssessmentResult[],
  /**
   * When false, skip “no standing order” sentences (Orders tools off — assign_order is unavailable).
   */
  standingOrdersActive = true
): string {
  const aiUnits = state.units.filter((u) => u.player === 'opponent');
  const humanUnits = state.units.filter((u) => u.player === 'human');
  const inContact = unitAssessments.filter(
    (a) => (a.result.threats?.length ?? 0) > 0 && a.result.nearbyEnemies?.some((e) => e.inRangedRange || e.inMeleeRange)
  ).length;
  const noOrder = standingOrdersActive
    ? unitAssessments.filter((a) => a.result.unit?.currentStandingOrder == null).length
    : 0;
  const critical = unitAssessments.filter((a) => {
    const isCritical = (a.result.threats ?? []).some((t) => t.severity === 'critical');
    if (!isCritical) return false;
    return standingOrdersActive ? needsAction(a, true) : true;
  }).length;
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
    'Review the unit status table, attention flags, and operational map below, then issue movement, ranged attacks, and air strikes as permitted this turn.'
  );
  return sentences.slice(0, 5).join(' ');
}

/**
 * True when assessment threats include moderate or critical severity.
 *
 * Purpose: Action needed / Attention triage ignores low-only threat noise when standing orders are inactive (and for SO-gap threat bullets).
 * When to use: `needsAction` and Attention Flags severity wording.
 * Expected outcome: false for empty or low-only threat lists.
 * Exceptions: None.
 */
function hasActionableThreat(assessment: UnitAssessmentResult): boolean {
  return (assessment.result.threats ?? []).some(
    (t) => t.severity === 'critical' || t.severity === 'moderate'
  );
}

/**
 * Highest threat severity among assessment threats for Attention Flags wording.
 *
 * Purpose: Avoid labeling low threats as “moderate”.
 * When to use: After deciding a unit deserves an attention bullet for threat contact.
 * Expected outcome: `critical` | `moderate` | `low`, or null when there are no threats.
 * Exceptions: None.
 */
function maxThreatSeverity(
  threats: ReadonlyArray<{ severity?: string }>
): 'critical' | 'moderate' | 'low' | null {
  if (threats.some((t) => t.severity === 'critical')) return 'critical';
  if (threats.some((t) => t.severity === 'moderate')) return 'moderate';
  if (threats.some((t) => t.severity === 'low')) return 'low';
  return null;
}

/**
 * True when the assessment lists at least one attack the unit could legally make this turn.
 *
 * Purpose: Distinguishes "covered by a standing order" from "has nothing to do". Those are not the same, and
 * conflating them is what let a unit with a critical threat and a legal shot render as `no (quiet)`.
 * When to use: The `Action needed` and Attention Flags decisions, in both coordinate modes.
 * Expected outcome: True for any `canAttackThisTurn` row whose `attackType` is not `none`; false when the list is
 * absent or holds only out-of-range rows.
 * Exceptions: None; unrecognised row shapes count as no attack.
 */
/**
 * How many unit ids the available-attack Attention Flags bullet names before summarising the remainder.
 *
 * Purpose: The bullet has to be complete enough to act on without becoming a wall of ids on a large roster. Units
 * beyond this are still listed in Unit Status with `Action needed` = yes, which the bullet points at.
 * When to use: `buildAttentionFlags` only.
 * Expected outcome: Bullets stay roughly one screen line at typical shooter counts.
 * Exceptions: None.
 */
const ATTENTION_ARMED_UNITS_LISTED = 12;

function hasLegalAttackThisTurn(assessment: UnitAssessmentResult): boolean {
  const rows = (assessment.result.canAttackThisTurn ?? []) as Array<{ attackType?: unknown }>;
  return rows.some((r) => typeof r.attackType === 'string' && r.attackType !== 'none');
}

/**
 * True when the nearest observed enemy is at most one march/sail turn away.
 *
 * Purpose: A healthy standing order must not hide a this-turn move/melee close. The assessment already
 * stores `estimatedTurnsToReach` (grid-hop ETA when omniscient, path ETA under fog); Action needed and
 * Attention Flags read that instead of re-deriving Best Options.
 * When to use: `needsAction` and Attention Flags when standing orders are active.
 * Expected outcome: True for `estimatedTurnsToReach` 0 or 1, or same-hex melee when the turn estimate is absent.
 * Exceptions: Air units typically have a null estimate (no march budget) and therefore return false here
 * unless they occupy the enemy cell.
 */
function canCloseThisTurn(assessment: UnitAssessmentResult): boolean {
  const nearest = assessment.result.nearbyEnemies?.[0] as
    | { estimatedTurnsToReach?: unknown; inMeleeRange?: unknown }
    | undefined;
  if (!nearest) return false;
  if (typeof nearest.estimatedTurnsToReach === 'number') {
    return nearest.estimatedTurnsToReach <= 1;
  }
  return nearest.inMeleeRange === true;
}

/**
 * Marks units that deserve Attention Flags / Action needed = yes.
 *
 * Purpose: Triage Unit Status and Attention Flags without flooding on distant low threats, while never letting a
 * standing order hide a shot or a this-turn close the model should be choosing itself. Idle air holding on
 * defend is left off this flag; coaching still tells the model to ferry those units.
 * When to use: Unit Status rows and Attention Flags assembly.
 * Expected outcome: Always true when the unit has a legal attack or can close this turn under a moderate/critical
 * threat. Otherwise: when standing orders are inactive, moderate/critical threats only; when active, also
 * missing/warning standing orders.
 * Exceptions: None.
 */
function needsAction(assessment: UnitAssessmentResult, standingOrdersActive: boolean): boolean {
  // A shot the model could take is always worth surfacing. Auto-fire is a backstop for a turn the model skips,
  // never a reason to tell it a unit needs nothing, or it loses the chance to pick a better target than the
  // nearest one.
  if (hasLegalAttackThisTurn(assessment)) return true;
  // A this-turn close is the other action the engine cannot choose a destination for. A healthy march to a
  // rear hex must not mark the unit as needing nothing while Best Options lists move/melee onto the enemy.
  if (canCloseThisTurn(assessment) && hasActionableThreat(assessment)) return true;
  const actionable = hasActionableThreat(assessment);
  if (!standingOrdersActive) return actionable;
  const order = assessment.result.unit?.currentStandingOrder as { status?: string } | null | undefined;
  if (!order && actionable) return true;
  if (order && typeof order.status === 'string' && WARNING_STATUSES.has(order.status)) return true;
  return false;
}

/**
 * Defines the `isQuiet` function shape (function isQuiet(assessment: UnitAssessmentResult): boolean).
 *
 * Purpose: Softens Action needed for units with a healthy standing order and only low threats.
 * When to use: Strategic Unit Status rows when Orders tools are enabled.
 * Expected outcome: false when standing orders are inactive, the unit has a legal attack, or threats are non-low /
 * order missing/warning.
 * Exceptions: None.
 */
function isQuiet(assessment: UnitAssessmentResult, standingOrdersActive: boolean): boolean {
  if (!standingOrdersActive) return false;
  if (hasLegalAttackThisTurn(assessment)) return false;
  const order = assessment.result.unit?.currentStandingOrder as { status?: string } | null | undefined;
  const threats = assessment.result.threats ?? [];
  const hasNonLow = threats.some((t) => t.severity !== 'low');
  if (hasNonLow) return false;
  if (!order) return false;
  if (order.status && WARNING_STATUSES.has(order.status)) return false;
  return true;
}

/**
 * Builds the Unit Status and Threats markdown table for Commander briefings.
 *
 * Purpose: One dense per-unit type/threat/nearest/action table; standing-order detail lives in `# Standing Order Status` when Orders are enabled.
 * When to use: Strategic `formatBriefing` and tactical `formatTacticalBriefing` after assessments are ready.
 * Expected outcome: GFM table with Type; no standing-order column (avoids duplicating Standing Order Status / former Unit Roster).
 * Exceptions: None; empty assessments yield an empty-state row.
 */
export function buildUnitStatusTable(
  unitAssessments: UnitAssessmentResult[],
  ctx: CoordinateContext,
  /**
   * When false, Action needed uses moderate/critical threats only (no standing-order gaps).
   */
  standingOrdersActive = true
): string {
  logDebug('briefingFormatter buildUnitStatusTable', {
    unitCount: unitAssessments.length,
    mode: ctx.mode,
    standingOrdersActive,
  });
  const header =
    '| Unit ID | Type | Hex | Nearest enemy + distance | Threat severity | Action needed |';
  const sep = '|---------|------|-----|---------------------------|-----------------|---------------|';
  const rows: string[] = [];
  for (const a of unitAssessments) {
    const pos = Array.isArray(a.result.unit?.position)
      ? formatPosStrategicHex(a.result.unit.position as [number, number], ctx)
      : '—';
    const type = typeof a.result.unit?.type === 'string' ? a.result.unit.type : '—';
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
    const action = needsAction(a, standingOrdersActive) ? 'yes' : 'no';
    const selfLabel = formatUnitDisplayRef(a.unitId);
    const actionCell =
      ctx.mode === 'strategic' && isQuiet(a, standingOrdersActive) ? `${action} (quiet)` : action;
    rows.push(`| ${selfLabel} | ${type} | ${pos} | ${nearestStr} | ${severity} | ${actionCell} |`);
  }
  if (rows.length === 0) return `${header}\n${sep}\n(No AI units)\n`;
  return `${[header, sep, ...rows].join('\n')}\n`;
}

/**
 * Defines the `buildSupplementalHexIntelligenceBlock` function shape (function buildSupplementalHexIntelligenceBlock(hexAssessments: HexAssessmentEntry[]): string).

 * Purpose: Supports maintainability by documenting why `buildSupplementalHexIntelligenceBlock` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildSupplementalHexIntelligenceBlock(hexAssessments: HexAssessmentEntry[], ctx: CoordinateContext): string {
  if (hexAssessments.length === 0) return '';
  const bullets: string[] = [];
  for (const entry of hexAssessments) {
    const posStr = formatPosStrategicHex(entry.position, ctx);
    const r = entry.result;
    const terrain = typeof r.terrain === 'string' ? r.terrain : 'unknown';
    const passableBy = Array.isArray(r.passableBy) ? (r.passableBy as string[]).join(', ') : '';
    const notes = Array.isArray(r.strategicNotes) ? (r.strategicNotes as string[]).filter((x) => typeof x === 'string') : [];
    const noteStr = notes.length > 0 ? ` notes: ${notes.join('; ')}` : '';
    bullets.push(`- ${posStr}: terrain ${terrain}; passableBy: ${passableBy || 'unknown'}${noteStr}`);
  }
  return markdownHeading2(SECTION_TITLE_SUPPLEMENTAL_HEX_INTELLIGENCE) + bullets.join('\n');
}

/**
 * Defines the `buildAttentionFlags` function shape (function buildAttentionFlags().
 *
 * Purpose: Short triage bullets for units that need attention this consultation.
 * When to use: Strategic and tactical Commander briefings after assessments.
 * Expected outcome: Up to five bullets sorted critical→moderate→other, or `None.`; omits standing-order language in tactical mode or when Orders tools are off.
 * Exceptions: None.
 */
export function buildAttentionFlags(
  unitAssessments: UnitAssessmentResult[],
  /**
   * When `tactical`, attention bullets omit standing-order language (orders do not apply in-battle).
   */
  coordinateMode: 'strategic' | 'tactical' = 'strategic',
  /**
   * When false, strategic bullets ignore standing-order gaps/warnings and only flag moderate/critical threats.
   */
  standingOrdersActive = true
): string {
  logDebug('briefingFormatter buildAttentionFlags', {
    unitCount: unitAssessments.length,
    coordinateMode,
    standingOrdersActive,
  });
  // Ranks 0-3 are threat severities; rank 4 is reserved for the available-attack bullet, which must never displace
  // a threat from the five-bullet cap.
  const severityRank = (sev: 'critical' | 'moderate' | 'low' | null): number => {
    if (sev === 'critical') return 0;
    if (sev === 'moderate') return 1;
    if (sev === 'low') return 2;
    return 3;
  };
  type AttentionCandidate = { text: string; rank: number };
  const candidates: AttentionCandidate[] = [];
  const armedUnitRefs: string[] = [];
  const soActive = coordinateMode === 'tactical' ? false : standingOrdersActive;
  for (const a of unitAssessments) {
    if (!needsAction(a, soActive)) continue;
    const threats = a.result.threats ?? [];
    const nearest = a.result.nearbyEnemies?.[0];
    if (hasLegalAttackThisTurn(a)) armedUnitRefs.push(formatUnitDisplayRef(a.unitId));
    if (!soActive) {
      const sev = maxThreatSeverity(threats);
      if ((sev === 'critical' || sev === 'moderate') && nearest) {
        candidates.push({
          rank: severityRank(sev),
          text: `${formatUnitDisplayRef(a.unitId)} faces a ${sev} threat (nearest enemy: ${formatUnitDisplayRef(nearest.unitId)}, distance ${nearest.hexDistance}).`,
        });
      }
      continue;
    }
    const order = a.result.unit?.currentStandingOrder as { status?: string } | null | undefined;
    // Shooters already occupy the armed-units aggregate. Emitting them again as closers lets naval/air
    // shots fill the reserved threat slots and hide armor that can only move/melee this turn.
    if (canCloseThisTurn(a) && hasActionableThreat(a) && nearest && !hasLegalAttackThisTurn(a)) {
      const sev = maxThreatSeverity(threats);
      candidates.push({
        rank: severityRank(sev),
        text: `${formatUnitDisplayRef(a.unitId)} faces a ${sev} threat (nearest enemy: ${formatUnitDisplayRef(nearest.unitId)}, distance ${nearest.hexDistance}).`,
      });
    } else if (!order && hasActionableThreat(a) && nearest) {
      const sev = maxThreatSeverity(threats);
      candidates.push({
        rank: severityRank(sev),
        text: `${formatUnitDisplayRef(a.unitId)} has no standing order and faces a ${sev ?? 'moderate'} threat (nearest enemy: ${formatUnitDisplayRef(nearest.unitId)}, distance ${nearest.hexDistance}).`,
      });
    } else if (order?.status && WARNING_STATUSES.has(order.status)) {
      candidates.push({
        rank: 2,
        text: `${formatUnitDisplayRef(a.unitId)} standing order is in warning state (${order.status}) — decide follow-on orders.`,
      });
    }
  }
  if (armedUnitRefs.length > 0) {
    // One bullet for the whole group rather than one each. Per-unit bullets ate the entire five-bullet cap the
    // first time a handful of units had shots, hiding both the sixth shooter and any threat bullet behind them.
    // Rank 4 is below every threat bullet; the slice below still reserves one of the five slots for it whenever
    // it exists, so critical closers cannot hide the legal-attack worklist.
    const listed = armedUnitRefs.slice(0, ATTENTION_ARMED_UNITS_LISTED);
    const overflow = armedUnitRefs.length - listed.length;
    candidates.push({
      rank: 4,
      text:
        `${armedUnitRefs.length} unit(s) have a legal attack this turn — order a ranged_attack or air strike for each ` +
        `and choose the targets yourself: ${listed.join(', ')}` +
        `${overflow > 0 ? `, and ${overflow} more marked Action needed = yes` : ''}.`,
    });
  }
  if (candidates.length === 0) return 'None.';
  candidates.sort((a, b) => a.rank - b.rank || a.text.localeCompare(b.text));
  const threatCandidates = candidates.filter((c) => c.rank < 4);
  const armedCandidate = candidates.find((c) => c.rank === 4);
  const threatLimit = armedCandidate ? 4 : 5;
  const selected = threatCandidates.slice(0, threatLimit);
  if (armedCandidate) selected.push(armedCandidate);
  return selected.map((c) => `- ${c.text}`).join('\n');
}

/**
 * Honesty sentence when Unit Status distances use grid hops instead of march paths.
 *
 * Purpose: Fog-off strategic assessments report H3 grid distance; the model must not treat that as a legal march ETA.
 * When to use: formatBriefing immediately after the Unit Status heading (caller appends a blank line before the table).
 * Expected outcome: The shared briefing line when fog is off and hexes are res1; otherwise empty.
 * Exceptions: Empty hex list yields empty string.
 */
function omniscientGridProximityBriefingLine(state: GameStateSnapshot): string {
  logTrace('briefingFormatter omniscientGridProximityBriefingLine', {
    turnNumber: state.turnNumber,
    fogOfWarEnabled: state.fogOfWarEnabled ?? null,
    hexCount: state.hexes.length,
  });
  const h3Index = state.hexes[0]?.h3Index;
  if (!h3Index) return '';
  if (!usesOmniscientGridProximity({ fogOfWarEnabled: state.fogOfWarEnabled, h3Index })) return '';
  return OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE;
}

/**
 * Assembles the strategic Commander briefing markdown for the opponent AI system prompt.
 *
 * Purpose: Single map-first briefing (status, attention, operational map, memory, optional Standing Order Status, callbacks).
 * When to use: `requestOrdersFlow` when building strategic `briefingOverride`.
 * Expected outcome: Full briefing string; `# Standing Order Status` appears only when `standingOrderText` is non-empty (Orders enabled).
 * Exceptions: None.
 */
export function formatBriefing(
  state: GameStateSnapshot,
  precomputed: PrecomputationResult,
  standingOrderText: string,
  memoryText: string,
  subscriptions?: CallbackSubscription[],
  productionText = '',
  sharedContext?: FormatBriefingSharedContext
): string {
  logTrace('briefingFormatter formatBriefing', {
    turnNumber: state.turnNumber,
    unitAssessmentCount: precomputed.unitAssessments.length,
    hexAssessmentCount: precomputed.hexAssessments.length,
    callbackCount: subscriptions?.length ?? 0,
    hasProductionText: productionText.trim().length > 0,
    includeProductionSection: Boolean(sharedContext?.includeProductionSection),
    standingOrdersInBriefing: standingOrderText.trim().length > 0,
    reusedLatLngByH3: Boolean(sharedContext?.latLngByH3),
  });
  ensureStrategicCoordinateRegistryInitialized();
  const coordCtx: CoordinateContext = { mode: 'strategic' };
  const standingOrdersActive = standingOrderText.trim().length > 0;
  const latLngByH3 =
    sharedContext?.latLngByH3 ??
    (() => {
      const built = new Map<string, [number, number]>();
      for (const hx of state.hexes) {
        const [lat, lng] = cellToLatLng(hx.h3Index);
        built.set(hx.h3Index, [lat, lng]);
      }
      return built;
    })();
  const sections: string[] = [];
  sections.push(markdownHeading1(SECTION_TITLE_COMMANDERS_BRIEFING));
  sections.push(buildStrategicNarrative(state, precomputed.unitAssessments, standingOrdersActive));
  sections.push(markdownHeading2(SECTION_TITLE_UNIT_STATUS_AND_THREATS));
  const gridProximityLine = omniscientGridProximityBriefingLine(state);
  if (gridProximityLine.length > 0) {
    sections.push(gridProximityLine + '\n\n');
  } else if (state.fogOfWarEnabled === true) {
    sections.push(buildIntelStalenessRule() + '\n\n');
  }
  sections.push(buildUnitStatusTable(precomputed.unitAssessments, coordCtx, standingOrdersActive));
  sections.push(markdownHeading2(SECTION_TITLE_ATTENTION_FLAGS));
  sections.push(buildAttentionFlags(precomputed.unitAssessments, 'strategic', standingOrdersActive));
  const operational = buildStrategicOperationalMapSectionMarkdown({
    state,
    latLngByH3,
    indexedState: sharedContext?.indexedState,
  });
  if (operational.trim().length > 0) {
    sections.push('\n\n' + operational.trim());
  }
  const supplementalHex = buildSupplementalHexIntelligenceBlock(precomputed.hexAssessments, coordCtx);
  if (supplementalHex.trim().length > 0) {
    sections.push(supplementalHex);
  }
  const recentTurnNotes = buildRecentTurnNotesSection({
    scope: 'strategic',
    battleId: '',
    currentTurnNumber: state.turnNumber,
    heading: SECTION_TITLE_RECENT_TURN_NOTES,
  });
  if (recentTurnNotes.trim().length > 0) {
    sections.push('\n\n' + recentTurnNotes);
  }
  if (productionText.trim().length > 0) {
    sections.push('\n\n' + productionText.trim());
  } else if (sharedContext?.includeProductionSection) {
    sections.push('\n\n' + buildEmptyProductionQueuesSection());
  }
  const mem = memoryText ?? '';
  if (mem.trim().length > 0) {
    const hasStrategicMemoryHeader =
      mem.includes('=== YOUR STRATEGIC MEMORY') ||
      mem.includes('# YOUR STRATEGIC MEMORY') ||
      mem.includes('# Your strategic memory') ||
      mem.includes(topLevelHeading(SECTION_TITLE_STRATEGIC_MEMORY));
    if (hasStrategicMemoryHeader) {
      sections.push('\n\n' + mem);
    } else {
      sections.push(markdownHeading1(SECTION_TITLE_STRATEGIC_MEMORY));
      sections.push(mem);
    }
  }
  if (standingOrdersActive) {
    sections.push('\n\n');
    sections.push(standingOrderText);
  }
  sections.push(markdownHeading2(SECTION_TITLE_ACTIVE_CALLBACKS));
  sections.push(buildActiveCallbacksSection(subscriptions ?? [], coordCtx));
  return sections.join('');
}
