/**
 * Shared consolidated map-toast message builder (turn-report sentences and an Updates section).
 */

import { type SeatId, HUMAN_SEAT_ID } from './seatIds';
import { ALL_BUILD_UNIT_TYPES } from './ipc/productionTypes';
import type { BuildUnitType, ReadyResult } from './ipcTypes';
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
   * Expected outcome: The last Updates line, after deployments, caps, and any combat-activity fallback.
   * Exceptions: None. It does not replace loss sections or deployment lines.
   */
  unknownBattleLine?: string | null;
  /**
   * Missile strike sentences for the Updates section.
   *
   * Contract: One line per launch the viewer may see, already formatted.
   * When to use: Strategic Ready after visibility filtering.
   * Expected outcome: Appended after the other Updates lines and before the unknown-battle line.
   * Exceptions: None. Omitted or empty adds nothing.
   */
  missileStrikeLines?: readonly string[];
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
 * Builds the consolidated map toast message with turn-report sentences and an Updates section.
 *
 * Purpose: Single popup formatter replacing flat direct-fire/melee bullet lists.
 * When to use: Strategic Ready and tactical commit paths in `readyHandler` before `showMapToast`.
 * Expected outcome: Newline-separated message with `##` section headers; `null` when all sections would be empty.
 *   Side sections come first, with hex sentences after that side's cause lines. Updates holds deployments, caps, and the fallback.
 *   A non-empty `unknownBattleLine` is the last Updates line.
 * Exceptions: None.
 */
export function buildConsolidatedTurnUpdateToastMessage(args: ConsolidatedTurnUpdateToastArgs): string | null {
  const { readyResult, combatFallbackBullets, turnReport } = args;
  const sections: string[] = [];
  const lossSections = buildTurnLossSections(
    args.turnLossSummary,
    turnReport?.viewerSeatId ?? null,
    turnReport?.seats ?? [],
    turnReport ? hexChangeLinesByOwner(turnReport) : undefined
  );
  sections.push(...lossSections);
  let otherLines = buildOtherTurnUpdatePrimaryLines(readyResult);
  if (lossSections.length === 0 && otherLines.length === 0) {
    otherLines = composeResolutionMapToastBullets([], combatFallbackBullets).map(stripLeadingBullet);
  }
  const unknownBattleLine = args.unknownBattleLine?.trim() ?? '';
  const missileStrikeLines = (args.missileStrikeLines ?? []).map((line) => line.trim()).filter((line) => line.length > 0);
  if (missileStrikeLines.length > 0) otherLines = [...otherLines, ...missileStrikeLines];
  if (unknownBattleLine.length > 0) otherLines = [...otherLines, unknownBattleLine];
  if (otherLines.length > 0) {
    sections.push(`${MAP_TOAST_SECTION_HEADER_PREFIX}${MAP_TOAST_UPDATES_SECTION_TITLE}`);
    sections.push(...otherLines);
  }
  if (sections.length === 0) return null;
  return sections.join('\n');
}
