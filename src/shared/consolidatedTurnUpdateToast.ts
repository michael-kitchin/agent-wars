/**
 * Shared consolidated map-toast message builder (turn-report sentences and an Updates section).
 */

import { type SeatId, HUMAN_SEAT_ID, isSeatId, NEUTRAL_OWNER_ID } from './seatIds';
import { ALL_BUILD_UNIT_TYPES } from './ipc/productionTypes';
import type { BuildUnitType, ReadyResult } from './ipcTypes';
import { formatCreditsAddedLine } from './creditsRules';
import {
  formatHireOrdersUnfilledLine,
  formatMercenariesHiredLine,
  formatUnitsDesertedLine,
} from './mercenaryRules';
import { formatFortificationsBuiltLine } from './fortificationRules';
import { type TurnLossSummary } from './lossSummary';
import { composeResolutionMapToastBullets } from './orderPreviewBlockingCopy';
import { hexChangeLinesByOwner, type TurnReportInput } from './turnReportLines';
import { buildTurnLossSections } from './turnLossSections';

/** Prefix for bold section headers in `#map-toast` consolidated update messages. */
export const MAP_TOAST_SECTION_HEADER_PREFIX = '## ';

/** Section header label for non-loss deployment and fallback lines in map toasts. */
export const MAP_TOAST_UPDATES_SECTION_TITLE = 'Updates';

/**
 * Today's deployed-line order, with missiles last.
 *
 * Purpose: The sentence stays byte-identical for the original four types.
 * When to use: `formatDeployedUnitsLine` only.
 * Expected outcome: Armor, infantry, naval, air, then missile.
 * Exceptions: None.
 */
const DEPLOYED_LINE_TYPE_ORDER = ['armor', 'infantry', 'naval', 'air', 'missile'] as const;

/**
 * Joins phrases with a serial comma.
 *
 * Purpose: Deployment and cap sentences share one list style for any count.
 * When to use: When a sentence names one or more unit types.
 * Expected outcome: One phrase unchanged, two joined with "and", and three or more with a comma before "and".
 * Exceptions: None. An empty list returns an empty string.
 */
export function joinWithSerialComma(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/**
 * Builds the deployment summary line for the Updates section when new units entered play.
 *
 * Purpose: Surfaces production/deployment outcomes separate from combat losses.
 * When to use: `buildOtherTurnUpdatePrimaryLines` for strategic Ready results with `deployedUnitsByType`.
 * Expected outcome: Human-readable counts by type or null when nothing deployed. The noun is "unit" when exactly
 *   one unit deployed in all, and "units" otherwise.
 * Exceptions: None.
 */
function formatDeployedUnitsLine(
  deployed: { armor?: number; infantry?: number; naval?: number; air?: number; missile?: number } | undefined
): string | null {
  if (!deployed) return null;
  const parts: string[] = [];
  for (const unitType of DEPLOYED_LINE_TYPE_ORDER) {
    const count = deployed[unitType] ?? 0;
    if (count > 0) parts.push(`${count.toLocaleString()} ${unitType}`);
  }
  if (parts.length === 0) return null;
  const total = DEPLOYED_LINE_TYPE_ORDER.reduce((sum, unitType) => sum + (deployed[unitType] ?? 0), 0);
  const noun = total === 1 ? 'unit' : 'units';
  return `${joinWithSerialComma(parts)} ${noun} deployed`;
}

/**
 * Builds the human deployment cap message when a unit type hit its on-map limit.
 *
 * Purpose: Alerts the player in the Updates section without mixing into loss buckets.
 * When to use: When `humanDeploymentCapReachedUnitTypes` is populated on Ready results.
 * Expected outcome: Single sentence listing capped types or null when none capped.
 * Exceptions: None.
 */
function formatDeploymentCapReachedLine(
  cappedTypes: BuildUnitType[] | undefined,
  player: SeatId
): string | null {
  if (player !== HUMAN_SEAT_ID) return null;
  if (!cappedTypes || cappedTypes.length === 0) return null;
  const ordered = ALL_BUILD_UNIT_TYPES.filter((unitType) => cappedTypes.includes(unitType));
  if (ordered.length === 0) return null;
  return `Maximum human ${joinWithSerialComma([...ordered])} units deployed.`;
}

/**
 * Builds the deployment lines for the Updates section.
 *
 * Purpose: Feeds the consolidated popup Updates section without repeating territory changes, which live in the side sections.
 * When to use: Inside `buildConsolidatedTurnUpdateToastMessage` before optional combat fallbacks.
 * Expected outcome: Plain strings without leading bullets. A count of one uses the singular noun. A hex-lost count on the result is ignored.
 * Exceptions: None.
 */
export function buildOtherTurnUpdatePrimaryLines(readyResult: ReadyResult): string[] {
  const lines: string[] = [];
  const deployedLine = formatDeployedUnitsLine(readyResult.deployedUnitsByType);
  if (deployedLine) lines.push(deployedLine);
  const fortifiedCount = readyResult.humanFortificationsBuilt ?? 0;
  if (fortifiedCount > 0) lines.push(formatFortificationsBuiltLine(fortifiedCount));
  const creditsAdded = readyResult.humanCreditsAdded ?? 0;
  if (creditsAdded > 0) lines.push(formatCreditsAddedLine(creditsAdded));
  const mercenariesHired = readyResult.humanMercenariesHired ?? 0;
  if (mercenariesHired > 0) lines.push(formatMercenariesHiredLine(mercenariesHired));
  const unitsDeserted = readyResult.humanUnitsDeserted ?? 0;
  if (unitsDeserted > 0) lines.push(formatUnitsDesertedLine(unitsDeserted));
  const hireOrdersUnfilled = readyResult.humanHireOrdersUnfilled ?? 0;
  if (hireOrdersUnfilled > 0) lines.push(formatHireOrdersUnfilledLine(hireOrdersUnfilled));
  const deploymentCapLine = formatDeploymentCapReachedLine(readyResult.humanDeploymentCapReachedUnitTypes, HUMAN_SEAT_ID);
  if (deploymentCapLine) lines.push(deploymentCapLine);
  return lines;
}

/**
 * Arguments for building a consolidated map toast after turn or beat resolution.
 */
export interface ConsolidatedTurnUpdateToastArgs {
  /**
   * Ready-shaped resolution slice for deployment Updates lines.
   *
   * Contract: Same fields as strategic `ReadyResult` or tactical toast adapter output.
   * When to use: Pass the same object used for visibility classification.
   * Expected outcome: Drives `buildOtherTurnUpdatePrimaryLines` only. Unit losses come from `turnLossSummary`. Hex changes come from `turnReport`.
   * Exceptions: None.
   */
  readyResult: ReadyResult;
  /**
   * Per-player loss summary after fog filtering (popup) or full record (not used in renderer with filter).
   *
   * Contract: Output of `buildTurnLossSummary` with visibility predicate applied for opponent victims.
   * When to use: Required for the per-side loss sections.
   * Expected outcome: A side with no unit losses is omitted here. A side that lost hexes is added from `turnReport`. The viewer is "Your Losses". Each other side uses its full home name. Neutral is last.
   * Exceptions: None.
   */
  turnLossSummary: TurnLossSummary;
  /**
   * Combat-activity fallback lines when no losses or primary other content exists.
   *
   * Contract: Output of `buildCombatActivityFallbackBullets`; engagement-only lines may be suppressed.
   * When to use: Appended into Updates when appropriate via `composeResolutionMapToastBullets` policy.
   * Expected outcome: May be empty; never duplicates loss cause lines.
   * Exceptions: None.
   */
  combatFallbackBullets: string[];
  /**
   * Who lost hexes, and which seat the loss sections call "you".
   *
   * Contract: The viewer's seat, the roster, and transitions. This builder puts the hex sentences in the side sections.
   * When to use: Strategic Ready and a tactical commit.
   * Expected outcome: Loss sections come first and include that side's hex sentences. A missing report uses no viewer and no hex sentences.
   * Exceptions: None.
   */
  turnReport?: TurnReportInput;
  /**
   * Unknown-battle sentence for the end of the Updates section.
   *
   * Contract: Output of `formatUnknownBattleAnnouncement`, or omitted when combat was inside vision.
   * When to use: Pass it only when a hex or victim was outside vision. A blank or whitespace value is omitted.
   * Expected outcome: The last Updates line, after deployments, caps, the combat-activity fallback, and any missile sentence that stays in Updates.
   * Exceptions: None. It does not replace loss sections or deployment lines.
   */
  unknownBattleLine?: string | null;
  /**
   * Missile strike sentences, each with the hex controller at launch.
   *
   * Contract: One entry per launch the viewer may see. `line` is already formatted. `controllerId` is a seat id, `neutral`, or null.
   * When to use: Strategic Ready after visibility filtering.
   * Expected outcome: A seat controller's line is that side's loss section, after the cause lines and before the hex sentences. `neutral` and null stay in Updates, after deployments or the combat-activity fallback, and before the unknown-battle line.
   * Exceptions: None. Omitted, or a blank line, adds nothing. A seat line is not copied into Updates.
   */
  missileStrikeLines?: readonly MissileStrikeToastLine[];
  /**
   * Paused-fortification sentences for the Updates section.
   *
   * Contract: The renderer names the hexes, because this builder does not look up places.
   * When to use: Strategic Ready, after the paused-hex names are known.
   * Expected outcome: Trimmed lines are appended after missile sentences that stay in Updates, and before the unknown-battle line.
   * Exceptions: None. Blank lines are dropped.
   */
  fortificationLines?: readonly string[];
  /**
   * Sentences for production that paused away from the seat's units.
   *
   * Contract: The renderer names the hexes.
   * When to use: Strategic Ready, after the paused-hex names are known.
   * Expected outcome: Trimmed lines follow the fortification pause lines.
   * Exceptions: None. Blank lines are dropped.
   */
  productionPauseLines?: readonly string[];
  /**
   * Fortification sentences, each with the owner who held the hex.
   *
   * Contract: The toast files a seat or Neutral line in that side's section, after its missile sentences.
   * When to use: Strategic Ready, after visibility filtering.
   * Expected outcome: A null owner goes to Updates, after missile sentences that stay there and before the paused-queue lines.
   * Exceptions: None. A blank line is dropped.
   */
  fortificationReportLines?: readonly FortificationToastLine[];
}

/**
 * One fortification sentence and the side that owned the hex.
 *
 * Purpose: The toast can file the sentence under that side, or under Updates when the hex had no owner.
 * When to use: `buildConsolidatedTurnUpdateToastMessage`.
 * Expected outcome: A seat id or `neutral` means that side's loss section. Null means Updates.
 * Exceptions: None.
 */
export interface FortificationToastLine {
  /**
   * Who controlled the hex while the fortifications were lost.
   *
   * Contract: A seat id, `neutral`, or null.
   * When to use: Choosing the section.
   * Expected outcome: `isSeatId` or `neutral` selects a loss section. Null selects Updates.
   * Exceptions: None.
   */
  readonly ownerId: string | null;
  /**
   * The formatted fortification sentence.
   *
   * Contract: Output of `formatFortificationReportLine`, possibly with surrounding whitespace.
   * When to use: The body line. A blank value is dropped.
   * Expected outcome: The trimmed sentence.
   * Exceptions: None.
   */
  readonly line: string;
}

/**
 * One missile strike sentence and the side that controlled the target.
 *
 * Purpose: The toast can file the sentence under that side, or under Updates when the hex has no seat controller.
 * When to use: `buildConsolidatedTurnUpdateToastMessage`.
 * Expected outcome: A seat id means that side's loss section. Null, `neutral`, and every other value mean Updates.
 * Exceptions: None.
 */
export interface MissileStrikeToastLine {
  /**
   * Who controlled the target hex when the missile launched.
   *
   * Contract: A seat id, `neutral`, or null when the hex has no controller.
   * When to use: Choosing the section.
   * Expected outcome: `isSeatId` selects a loss section. Every other value selects Updates.
   * Exceptions: None.
   */
  readonly controllerId: string | null;
  /**
   * The formatted strike sentence.
   *
   * Contract: Output of `formatMissileStrikeLine`, possibly with surrounding whitespace.
   * When to use: The body line. A blank value is dropped.
   * Expected outcome: The trimmed sentence.
   * Exceptions: None.
   */
  readonly line: string;
}

/**
 * Strips a leading bullet character from fallback combat-activity lines before Updates insertion.
 *
 * Purpose: Normalizes `composeResolutionMapToastBullets` output for consolidated section layout.
 * When to use: When promoting fallback lines into the Updates section body.
 * Expected outcome: Plain text without a leading `•`.
 * Exceptions: None.
 */
function stripLeadingBullet(line: string): string {
  return line.replace(/^\u2022\s*/, '');
}

/**
 * Splits missile sentences by who controlled the target.
 *
 * Purpose: A seat's damage belongs in that side's loss section. A neutral or uncontrolled hex stays in Updates.
 * When to use: `buildConsolidatedTurnUpdateToastMessage` before the loss sections are built.
 * Expected outcome: `byOwner` keeps launch order for each seat. `updates` keeps launch order for every other controller. A blank line is dropped.
 * Exceptions: None.
 */
function splitMissileStrikeLines(lines: readonly MissileStrikeToastLine[] | undefined): {
  readonly byOwner: ReadonlyMap<string, readonly string[]>;
  readonly updates: readonly string[];
} {
  const byOwner = new Map<string, string[]>();
  const updates: string[] = [];
  for (const entry of lines ?? []) {
    const line = entry.line.trim();
    if (line.length === 0) continue;
    const controllerId = entry.controllerId;
    if (controllerId !== null && isSeatId(controllerId)) {
      const existing = byOwner.get(controllerId);
      if (existing) existing.push(line);
      else byOwner.set(controllerId, [line]);
    } else {
      updates.push(line);
    }
  }
  return { byOwner, updates };
}

/**
 * Splits fortification sentences by who owned the hex.
 *
 * Purpose: A seat's or Neutral's losses belong in that side's section. A hex with no owner stays in Updates.
 * When to use: After missile sentences are split, so the two maps can be merged.
 * Expected outcome: `byOwner` keeps report order for each seat and for Neutral. `updates` keeps report order for a null owner. A blank line is dropped.
 * Exceptions: None.
 */
function splitFortificationReportLines(lines: readonly FortificationToastLine[] | undefined): {
  readonly byOwner: ReadonlyMap<string, readonly string[]>;
  readonly updates: readonly string[];
} {
  const byOwner = new Map<string, string[]>();
  const updates: string[] = [];
  for (const entry of lines ?? []) {
    const line = entry.line.trim();
    if (line.length === 0) continue;
    const ownerId = entry.ownerId;
    if (ownerId !== null && (isSeatId(ownerId) || ownerId === NEUTRAL_OWNER_ID)) {
      const existing = byOwner.get(ownerId);
      if (existing) existing.push(line);
      else byOwner.set(ownerId, [line]);
    } else {
      updates.push(line);
    }
  }
  return { byOwner, updates };
}

/**
 * Puts missile sentences before fortification sentences for each owner.
 *
 * Purpose: One loss section lists missiles first, then fortifications.
 * When to use: After both splits.
 * Expected outcome: A new map. An owner present in only one source keeps that source's lines.
 * Exceptions: None.
 */
function mergeStrikeLines(
  missileLines: ReadonlyMap<string, readonly string[]>,
  fortificationLines: ReadonlyMap<string, readonly string[]>
): ReadonlyMap<string, readonly string[]> {
  const merged = new Map<string, string[]>();
  for (const [ownerId, lines] of missileLines) merged.set(ownerId, [...lines]);
  for (const [ownerId, lines] of fortificationLines) {
    const existing = merged.get(ownerId);
    if (existing) existing.push(...lines);
    else merged.set(ownerId, [...lines]);
  }
  return merged;
}

/**
 * Builds the consolidated map toast message with turn-report sentences and an Updates section.
 *
 * Purpose: Single popup formatter replacing flat direct-fire/melee bullet lists.
 * When to use: Strategic Ready and tactical commit paths in `readyHandler` before `showMapToast`.
 * Expected outcome: Newline-separated message with `##` section headers; `null` when all sections would be empty.
 *   Side sections come first. A seat-controlled missile sentence follows that side's cause lines and precedes its hex sentences.
 *   Updates holds deployments, caps, the fallback, and a missile sentence whose hex is neutral or uncontrolled.
 *   A non-empty `unknownBattleLine` is the last Updates line.
 * Exceptions: None.
 */
export function buildConsolidatedTurnUpdateToastMessage(args: ConsolidatedTurnUpdateToastArgs): string | null {
  const { readyResult, combatFallbackBullets, turnReport } = args;
  const missileLines = splitMissileStrikeLines(args.missileStrikeLines);
  const fortificationReports = splitFortificationReportLines(args.fortificationReportLines);
  const sections: string[] = [];
  const lossSections = buildTurnLossSections(
    args.turnLossSummary,
    turnReport?.viewerSeatId ?? null,
    turnReport?.seats ?? [],
    turnReport ? hexChangeLinesByOwner(turnReport) : undefined,
    mergeStrikeLines(missileLines.byOwner, fortificationReports.byOwner)
  );
  sections.push(...lossSections);
  let otherLines = buildOtherTurnUpdatePrimaryLines(readyResult);
  if (lossSections.length === 0 && otherLines.length === 0) {
    otherLines = composeResolutionMapToastBullets([], combatFallbackBullets).map(stripLeadingBullet);
  }
  const unknownBattleLine = args.unknownBattleLine?.trim() ?? '';
  const fortificationLines = (args.fortificationLines ?? []).map((line) => line.trim()).filter((line) => line.length > 0);
  if (missileLines.updates.length > 0) otherLines = [...otherLines, ...missileLines.updates];
  if (fortificationReports.updates.length > 0) otherLines = [...otherLines, ...fortificationReports.updates];
  if (fortificationLines.length > 0) otherLines = [...otherLines, ...fortificationLines];
  const productionPauseLines = (args.productionPauseLines ?? []).map((line) => line.trim()).filter((line) => line.length > 0);
  if (productionPauseLines.length > 0) otherLines = [...otherLines, ...productionPauseLines];
  if (unknownBattleLine.length > 0) otherLines = [...otherLines, unknownBattleLine];
  if (otherLines.length > 0) {
    sections.push(`${MAP_TOAST_SECTION_HEADER_PREFIX}${MAP_TOAST_UPDATES_SECTION_TITLE}`);
    sections.push(...otherLines);
  }
  if (sections.length === 0) return null;
  return sections.join('\n');
}
