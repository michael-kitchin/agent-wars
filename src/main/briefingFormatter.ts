/**
 * Formats the Commander's Briefing block for Milestone 0.6/0.7. Consumes pre-computed assessments and
 * builds the three-section structure (strategic narrative, unit status, possible actions, attention flags)
 * plus memory, standing-order, and active callbacks sections.
 */

import { strategicCellAt, tacticalCellAt } from '../shared/h3Resolutions';

import type { GameStateSnapshot } from './gameDb';
import { buildRecentTurnNotesSection } from './briefing/recentTurnNotesSection';
import type { PrecomputationResult, UnitAssessmentResult, HexAssessmentEntry } from './precomputation';
import type { CallbackSubscription } from './callbackSubscriptions';
import { cellToLatLng } from 'h3-js';
import { LATLNG_DECIMAL_PLACES } from './mapData';
import { logDebug, logTrace } from './logger';
import { buildStrategicOperationalMapSectionMarkdown } from './briefing/map/briefingMapSection';
import { ensureStrategicCoordinateRegistryInitialized } from './briefing/map/hexCoordinates';
import { h3ToCode } from './briefing/map/hexCodeTranslator';
import type { CoordinateContext } from './briefing/map/coordinateContext';
import type { PossibleActionsIndexedState } from './openRouter/possibleUnitActions';
import { buildActiveCallbacksSection } from './briefing/activeCallbacksSection';
import { buildEmptyProductionQueuesSection } from './openRouter/briefingSections';
import {
  FOG_PATH_DISTANCE_BRIEFING_LINE,
  OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE,
  usesFogPathDistanceBriefing,
  usesOmniscientGridProximity,
} from './tools/assessUnitProximity';
import { getMovementBudgetForUnit } from './pathfinding';
import { formatBriefingWeatherCell } from '../shared/weatherBonusRules';
import { marchStepRecedesFromEnemy } from './tools/standingMarchReceding';
import {
  SECTION_TITLE_ACTIVE_CALLBACKS,
  SECTION_TITLE_COMMANDERS_BRIEFING,
  SECTION_TITLE_RECENT_TURN_NOTES,
  SECTION_TITLE_STRATEGIC_MEMORY,
  SECTION_TITLE_SUPPLEMENTAL_HEX_INTELLIGENCE,
  SECTION_TITLE_UNIT_STATUS_AND_THREATS,
  SECTION_TITLE_ATTENTION_FLAGS,
  topLevelHeading,
} from './openRouter/promptSpec/sectionHeadings';
import { buildIntelStalenessRule } from './openRouter/promptSpec/gameRuleText';
import { formatBonusTableCellWithTech } from '../shared/techBonusRules';
import { ORIGIN_BONUS_OFF, originBonusSettingsFromSnapshot } from '../shared/originBonusRules';
import type { OriginBonusSettings } from '../shared/originBonusTypes';

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
    const h3 = ctx.mode === 'strategic' ? strategicCellAt(ll[0], ll[1]) : tacticalCellAt(ll[0], ll[1]);
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
 * Expected outcome: Up to five sentences; omits standing-order coaching when Orders tools are disabled; names air strikes only when the opponent roster includes air; the critical-threat sentence counts only units that also need Action when standing orders are active.
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
    return standingOrdersActive ? needsAction(a, true, true) : true;
  }).length;
  const observedEnemySentence =
    humanUnits.length > 0
      ? `Turn ${state.turnNumber}: you command ${aiUnits.length} unit(s); currently observed human units: ${humanUnits.length}.`
      : `Turn ${state.turnNumber}: you command ${aiUnits.length} unit(s); currently observed human units: 0. Enemy forces may still be out of view, so scout and preserve contact.`;
  const hasAir = aiUnits.some((u) => u.unitType === 'air');
  logDebug('briefingFormatter buildStrategicNarrative', {
    turnNumber: state.turnNumber,
    aiUnitCount: aiUnits.length,
    hasAir,
    standingOrdersActive,
    criticalCount: critical,
  });
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
    hasAir
      ? 'Review the unit status table, attention flags, and operational map below, then issue movement, ranged attacks, and air strikes as permitted this turn.'
      : 'Review the unit status table, attention flags, and operational map below, then issue movement and ranged attacks as permitted this turn.'
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
 * How many unit ids the available-attack Attention Flags bullet names before summarising the remainder.
 *
 * Purpose: The bullet has to be complete enough to act on without becoming a wall of ids on a large roster. Units
 * beyond this are still listed in Unit Status with `Action needed` = yes, which the bullet points at.
 * When to use: `buildAttentionFlags` only.
 * Expected outcome: Bullets stay roughly one screen line at typical shooter counts.
 * Exceptions: None.
 */
const ATTENTION_ARMED_UNITS_LISTED = 12;

/**
 * True when the assessment lists at least one attack the unit could legally make this turn.
 *
 * Purpose: Distinguishes "covered by a standing order" from "has nothing to do". Those are not the same, and
 * conflating them is what let a unit with a critical threat and a legal shot render as `no (quiet)`.
 * When to use: `needsAction` and `isQuiet`. The armed-units bullet uses `hasOrderableShotThisTurn`, because a
 * strategic infantry contact is a legal fight and still not a ranged attack.
 * Expected outcome: True for any `canAttackThisTurn` row whose `attackType` is not `none`; false when the list is
 * absent or holds only out-of-range rows.
 * Exceptions: None; unrecognised row shapes count as no attack.
 */
function hasLegalAttackThisTurn(assessment: UnitAssessmentResult): boolean {
  const rows = (assessment.result.canAttackThisTurn ?? []) as Array<{ attackType?: unknown }>;
  return rows.some((r) => typeof r.attackType === 'string' && r.attackType !== 'none');
}

/**
 * True when the armed-units bullet can tell the model to order a shot for this unit.
 *
 * Purpose: Same-hex contact is stored as `melee`. Strategic infantry have no ranged attack, so naming them in
 * "order a ranged_attack or air strike" contradicts the combat rules. Armor and naval still qualify at distance 0,
 * because that hex is inside their strategic range, and air qualifies because the order is a strike.
 * When to use: The armed-units Attention Flags bullet, and the closer bullets that skip units already on that list.
 * Expected outcome: Strategic infantry are omitted. Other strategic units with any in-range row are included.
 * A tactical row counts only when its attack type is `ranged` or `air_strike`.
 * Exceptions: None.
 */
function hasOrderableShotThisTurn(
  assessment: UnitAssessmentResult,
  coordinateMode: 'strategic' | 'tactical'
): boolean {
  const rows = (assessment.result.canAttackThisTurn ?? []) as Array<{ attackType?: unknown }>;
  const shots = rows.filter((row) => typeof row.attackType === 'string' && row.attackType !== 'none');
  if (shots.length === 0) return false;
  if (coordinateMode === 'tactical') {
    return shots.some((row) => row.attackType === 'ranged' || row.attackType === 'air_strike');
  }
  return assessment.result.unit?.type !== 'infantry';
}

/**
 * True when the nearest observed enemy is at most one march/sail turn away.
 *
 * Purpose: A healthy standing order must not hide a this-turn move/melee close. Hop count is the same
 * basis Best Options uses; path ETA under fog can be longer than one turn even when a legal dest exists.
 * When to use: `needsAction` and Attention Flags when standing orders are active.
 * Expected outcome: True when grid hops fit this turn's movement budget (strategic only), or path ETA is at most one,
 * or same-hex melee when neither measure is present.
 * Exceptions: Air units never march; they only count as closing when they already share the enemy cell.
 * Tactical assessments must not use strategic movement budgets against hop counts.
 */
function canCloseThisTurn(assessment: UnitAssessmentResult, useGridHopBudget: boolean): boolean {
  const nearest = assessment.result.nearbyEnemies?.[0] as
    | {
        estimatedTurnsToReach?: unknown;
        inMeleeRange?: unknown;
        gridDistance?: unknown;
      }
    | undefined;
  if (!nearest) return false;
  const unitType = typeof assessment.result.unit?.type === 'string' ? assessment.result.unit.type : '';
  if (unitType === 'air') return nearest.inMeleeRange === true;
  if (useGridHopBudget && typeof nearest.gridDistance === 'number' && nearest.gridDistance < 900) {
    const stamped = assessment.result.unit?.movementBudget;
    const budget = typeof stamped === 'number' ? stamped : getMovementBudgetForUnit(unitType || 'infantry');
    if (budget > 0 && nearest.gridDistance <= budget) return true;
  }
  if (typeof nearest.estimatedTurnsToReach === 'number') {
    return nearest.estimatedTurnsToReach <= 1;
  }
  return nearest.inMeleeRange === true;
}

/**
 * True when a standing march's destination is farther from the nearest enemy than the unit's current cell.
 *
 * Purpose: Units with a healthy march away from contact were marked Action needed no and kept sailing.
 * When to use: `needsAction` after shots and this-turn closes are considered.
 * Expected outcome: True only for march orders with a destination that recedes in hops.
 * Exceptions: Missing geometry or unmeasurable hops return false.
 */
function standingMarchRecedesFromNearestEnemy(assessment: UnitAssessmentResult): boolean {
  const order = assessment.result.unit?.currentStandingOrder as
    | { type?: unknown; orderType?: unknown; destination?: unknown }
    | null
    | undefined;
  if (!order) return false;
  const orderType = typeof order.type === 'string' ? order.type : typeof order.orderType === 'string' ? order.orderType : '';
  if (orderType !== 'march') return false;
  const dest = order.destination;
  if (!Array.isArray(dest) || dest.length < 2) return false;
  const unitPos = assessment.result.unit?.position;
  if (!Array.isArray(unitPos) || unitPos.length < 2) return false;
  const nearest = assessment.result.nearbyEnemies?.[0] as { position?: unknown } | undefined;
  const enemyPos = nearest?.position;
  if (!Array.isArray(enemyPos) || enemyPos.length < 2) return false;
  try {
    const unitH3 = strategicCellAt(Number(unitPos[0]), Number(unitPos[1]));
    const destH3 = strategicCellAt(Number(dest[0]), Number(dest[1]));
    const enemyH3 = strategicCellAt(Number(enemyPos[0]), Number(enemyPos[1]));
    return marchStepRecedesFromEnemy(unitH3, destH3, enemyH3);
  } catch {
    return false;
  }
}

/**
 * True when a strategic armor or naval unit's only in-range fight is same-hex contact.
 *
 * Purpose: Those units stay on the armed-units bullet, and a ranged_attack order is not their listed fight.
 * When to use: Partitioning the ids already chosen for the armed-units bullet.
 * Expected outcome: True only for strategic armor or naval whose every non-none attack row is melee. False when the assessment is missing, the mode is tactical, the unit is another type, or any in-range row is not melee.
 * Exceptions: None.
 */
function isSameHexContactOnly(
  assessment: UnitAssessmentResult | undefined,
  coordinateMode: 'strategic' | 'tactical'
): boolean {
  if (!assessment || coordinateMode !== 'strategic') return false;
  const unitType = assessment.result.unit?.type;
  if (unitType !== 'armor' && unitType !== 'naval') return false;
  const rows = (assessment.result.canAttackThisTurn ?? []) as Array<{ attackType?: unknown }>;
  const attacks = rows.filter((row) => typeof row.attackType === 'string' && row.attackType !== 'none');
  return attacks.length > 0 && attacks.every((row) => row.attackType === 'melee');
}

/**
 * Writes the single armed-units bullet.
 *
 * Purpose: Same-hex armor and naval stay on the list, and the sentence must not tell them to order a ranged_attack.
 * When to use: After the armed-unit ids are sliced to `ATTENTION_ARMED_UNITS_LISTED`.
 * Expected outcome: One sentence. The shot clause names ranged, air-strike, and air ids. The contact clause names
 * strategic armor and naval whose only in-range row is melee. The overflow suffix counts the combined remainder.
 * Exceptions: None.
 */
function armedUnitsBulletText(args: {
  listedIds: readonly string[];
  overflow: number;
  assessmentsById: ReadonlyMap<string, UnitAssessmentResult>;
  coordinateMode: 'strategic' | 'tactical';
  period: 'beat' | 'turn';
  hasAirShooter: boolean;
}): string {
  const shotIds: string[] = [];
  const contactIds: string[] = [];
  for (const id of args.listedIds) {
    if (isSameHexContactOnly(args.assessmentsById.get(id), args.coordinateMode)) {
      contactIds.push(id);
    } else {
      shotIds.push(id);
    }
  }
  const count = args.listedIds.length + args.overflow;
  const overflowText = args.overflow > 0 ? `, and ${args.overflow} more marked Action needed = yes` : '';
  const attackKinds = args.hasAirShooter ? 'a ranged_attack or air strike' : 'a ranged_attack';
  const clauses: string[] = [];
  if (shotIds.length > 0) {
    clauses.push(`order ${attackKinds} for each and choose the targets yourself: ${shotIds.join(', ')}`);
  }
  if (contactIds.length > 0) {
    clauses.push(
      `copy a move/melee Target Hex for ${contactIds.join(', ')} and do not order a ranged_attack for them`
    );
  }
  return `${count} unit(s) have a legal attack this ${args.period} — ${clauses.join('; ')}${overflowText}.`;
}

/**
 * Marks units that deserve Attention Flags / Action needed = yes.
 *
 * Purpose: Triage Unit Status and Attention Flags without flooding on distant low threats, while never letting a
 * standing order hide a shot or a this-turn close the model should be choosing itself. Idle air holding on
 * defend is left off this flag; coaching still tells the model to ferry those units.
 * When to use: Unit Status rows and Attention Flags assembly.
 * Expected outcome: Always true when the unit has a legal attack, can close this turn under a moderate/critical
 * threat, or is on a standing march that recedes from the nearest enemy under a moderate/critical threat.
 * Otherwise: when standing orders are inactive, moderate/critical threats only; when active, also missing/warning
 * standing orders.
 * Exceptions: None.
 */
function needsAction(
  assessment: UnitAssessmentResult,
  standingOrdersActive: boolean,
  useGridHopBudget: boolean
): boolean {
  // A shot the model could take is always worth surfacing. Auto-fire is a backstop for a turn the model skips,
  // never a reason to tell it a unit needs nothing, or it loses the chance to pick a better target than the
  // nearest one.
  if (hasLegalAttackThisTurn(assessment)) return true;
  // A this-turn close is the other action the engine cannot choose a destination for. A healthy march to a
  // rear hex must not mark the unit as needing nothing while Best Options lists move/melee onto the enemy.
  if (canCloseThisTurn(assessment, useGridHopBudget) && hasActionableThreat(assessment)) return true;
  if (standingMarchRecedesFromNearestEnemy(assessment) && hasActionableThreat(assessment)) return true;
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
 * Expected outcome: false when standing orders are inactive, the unit has a legal attack, the march recedes from
 * the nearest enemy, or threats are non-low / order missing/warning.
 * Exceptions: None.
 */
function isQuiet(assessment: UnitAssessmentResult, standingOrdersActive: boolean): boolean {
  if (!standingOrdersActive) return false;
  if (hasLegalAttackThisTurn(assessment)) return false;
  if (standingMarchRecedesFromNearestEnemy(assessment)) return false;
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
 *   A Bonus column follows Hex when some assessment carries `originBonusHere` or a tech tier. A Weather column follows that only when some assessment carries `weatherTags`. The cell names the weather where the unit stands, with birth tags in parentheses. Otherwise the table is unchanged.
 * Exceptions: None; empty assessments yield an empty-state row.
 */
export function buildUnitStatusTable(
  unitAssessments: UnitAssessmentResult[],
  ctx: CoordinateContext,
  /**
   * When false, Action needed uses moderate/critical threats only (no standing-order gaps).
   */
  standingOrdersActive = true,
  /**
   * Match bonus settings, including tech.
   *
   * Contract: Optional. Missing means every bonus is off, so a Bonus cell does not name tech.
   * When to use: The strategic and tactical briefing callers, which have the snapshot.
   * Expected outcome: Advanced rows name the tech clause for the match level.
   * Exceptions: None.
   */
  originBonusSettings: OriginBonusSettings = ORIGIN_BONUS_OFF
): string {
  logDebug('briefingFormatter buildUnitStatusTable', {
    unitCount: unitAssessments.length,
    mode: ctx.mode,
    standingOrdersActive,
  });
  const showBonus = unitAssessments.some(
    (a) =>
      Array.isArray(a.result.unit?.originBonusHere) ||
      a.result.unit?.techLevel === 'basic' ||
      a.result.unit?.techLevel === 'advanced'
  );
  const showWeather = unitAssessments.some((a) => Array.isArray(a.result.unit?.weatherTags));
  const header = `| Unit ID | Type | Hex |${showBonus ? ' Bonus |' : ''}${showWeather ? ' Weather |' : ''} Nearest enemy + distance | Threat severity | Action needed |`;
  const sep = `|---------|------|-----|${showBonus ? '-------|' : ''}${showWeather ? '---------|' : ''}---------------------------|-----------------|---------------|`;
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
    const action = needsAction(a, standingOrdersActive, ctx.mode === 'strategic') ? 'yes' : 'no';
    const selfLabel = formatUnitDisplayRef(a.unitId);
    const actionCell =
      ctx.mode === 'strategic' && isQuiet(a, standingOrdersActive) ? `${action} (quiet)` : action;
    const techLevel = a.result.unit?.techLevel;
    const bonusCell = showBonus
      ? ` ${formatBonusTableCellWithTech({
          sources: a.result.unit?.originBonusHere ?? [],
          amount: a.result.unit?.originBonusAmount ?? 0,
          techLevel: techLevel === 'basic' || techLevel === 'advanced' ? techLevel : null,
          settings: originBonusSettings,
        })} |`
      : '';
    const weatherTags = a.result.unit?.weatherTags;
    const weatherHere = a.result.unit?.weatherHere;
    const weatherCell = showWeather
      ? ` ${formatBriefingWeatherCell({
          weatherHere: typeof weatherHere === 'string' ? weatherHere : null,
          tags: Array.isArray(weatherTags) ? weatherTags : [],
        })} |`
      : '';
    rows.push(`| ${selfLabel} | ${type} | ${pos} |${bonusCell}${weatherCell} ${nearestStr} | ${severity} | ${actionCell} |`);
  }
  if (rows.length === 0) return `${header}\n${sep}\n(No AI units)\n`;
  return `${[header, sep, ...rows].join('\n')}\n`;
}

/**
 * Formats the precomputed `assess_hex` results as one bullet per hex.
 *
 * Purpose: Shows the AI terrain and passability for hexes of interest without spending tool calls.
 * When to use: Strategic briefings, after precomputation has run the hex assessments.
 * Expected outcome: A section with one bullet per entry; `; country X` is added only when the assessment
 *   carried a country, meaning the country bonus is on. Empty string when there are no entries.
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
    const countryStr = typeof r.country === 'string' ? `; country ${r.country}` : '';
    bullets.push(`- ${posStr}: terrain ${terrain}; passableBy: ${passableBy || 'unknown'}${countryStr}${noteStr}`);
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
    if (!needsAction(a, soActive, coordinateMode === 'strategic')) continue;
    const threats = a.result.threats ?? [];
    const nearest = a.result.nearbyEnemies?.[0];
    if (hasOrderableShotThisTurn(a, coordinateMode)) armedUnitRefs.push(formatUnitDisplayRef(a.unitId));
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
    if (canCloseThisTurn(a, coordinateMode === 'strategic') && hasActionableThreat(a) && nearest && !hasOrderableShotThisTurn(a, coordinateMode)) {
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
    } else if (
      standingMarchRecedesFromNearestEnemy(a) &&
      hasActionableThreat(a) &&
      nearest &&
      !hasOrderableShotThisTurn(a, coordinateMode)
    ) {
      candidates.push({
        rank: 1,
        text:
          `${formatUnitDisplayRef(a.unitId)} standing march recedes from the nearest enemy ` +
          `(${formatUnitDisplayRef(nearest.unitId)}) — override it this turn.`,
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
    const period = coordinateMode === 'tactical' ? 'beat' : 'turn';
    const hasAirShooter = unitAssessments.some(
      (row) => row.result.unit?.type === 'air' && hasOrderableShotThisTurn(row, coordinateMode)
    );
    const assessmentsById = new Map(unitAssessments.map((row) => [formatUnitDisplayRef(row.unitId), row]));
    candidates.push({
      rank: 4,
      text: armedUnitsBulletText({
        listedIds: listed,
        overflow,
        assessmentsById,
        coordinateMode,
        period,
        hasAirShooter,
      }),
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
 * Expected outcome: The shared briefing line when fog is off and hexes are strategic; otherwise empty.
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
  const h3Index = state.hexes[0]?.h3Index;
  const fogPathLine =
    h3Index && usesFogPathDistanceBriefing({ fogOfWarEnabled: state.fogOfWarEnabled, h3Index })
      ? FOG_PATH_DISTANCE_BRIEFING_LINE
      : '';
  logDebug('briefingFormatter formatBriefing: distance caveat', {
    turnNumber: state.turnNumber,
    omniscient: gridProximityLine.length > 0,
    fogPath: fogPathLine.length > 0,
  });
  if (gridProximityLine.length > 0) {
    sections.push(gridProximityLine + '\n\n');
  } else {
    const caveatParts: string[] = [];
    if (state.fogOfWarEnabled === true) caveatParts.push(buildIntelStalenessRule());
    if (fogPathLine.length > 0) caveatParts.push(fogPathLine);
    if (caveatParts.length > 0) sections.push(caveatParts.join('\n\n') + '\n\n');
  }
  sections.push(
    buildUnitStatusTable(precomputed.unitAssessments, coordCtx, standingOrdersActive, originBonusSettingsFromSnapshot(state))
  );
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
