/**
 * Shared consolidated map-toast message builder (turn-report sentences and an Updates section).
 */

import { type SeatId, HUMAN_SEAT_ID } from './seatIds';
import { ALL_BUILD_UNIT_TYPES } from './ipc/productionTypes';
import type { BuildUnitType, ReadyResult } from './ipcTypes';
import { type TurnLossSummary } from './lossSummary';
import { composeResolutionMapToastBullets } from './orderPreviewBlockingCopy';
import { buildTurnReportLines, type TurnReportInput } from './turnReportLines';
import { buildTurnLossSections } from './turnLossSections';

/** Prefix for bold section headers in `#map-toast` consolidated update messages. */
export const MAP_TOAST_SECTION_HEADER_PREFIX = '## ';

/** Section header label for non-loss deployment and fallback lines in map toasts. */
export const MAP_TOAST_UPDATES_SECTION_TITLE = 'Updates';

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
  deployed: { armor?: number; infantry?: number; naval?: number; air?: number } | undefined
): string | null {
  if (!deployed) return null;
  const parts: string[] = [];
  if ((deployed.armor ?? 0) > 0) parts.push(`${deployed.armor!.toLocaleString()} armor`);
  if ((deployed.infantry ?? 0) > 0) parts.push(`${deployed.infantry!.toLocaleString()} infantry`);
  if ((deployed.naval ?? 0) > 0) parts.push(`${deployed.naval!.toLocaleString()} naval`);
  if ((deployed.air ?? 0) > 0) parts.push(`${deployed.air!.toLocaleString()} air`);
  if (parts.length === 0) return null;
  const total = (deployed.armor ?? 0) + (deployed.infantry ?? 0) + (deployed.naval ?? 0) + (deployed.air ?? 0);
  const noun = total === 1 ? 'unit' : 'units';
  if (parts.length === 1) return `${parts[0]} ${noun} deployed`;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]} ${noun} deployed`;
  if (parts.length === 3) return `${parts[0]}, ${parts[1]}, and ${parts[2]} ${noun} deployed`;
  return `${parts[0]}, ${parts[1]}, ${parts[2]}, and ${parts[3]} ${noun} deployed`;
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
  if (ordered.length === 1) return `Maximum human ${ordered[0]} units deployed.`;
  if (ordered.length === 2) return `Maximum human ${ordered[0]} and ${ordered[1]} units deployed.`;
  if (ordered.length === 3) return `Maximum human ${ordered[0]}, ${ordered[1]}, and ${ordered[2]} units deployed.`;
  return `Maximum human ${ordered[0]}, ${ordered[1]}, ${ordered[2]}, and ${ordered[3]} units deployed.`;
}

/**
 * Builds non-loss "Updates" section lines (deployment, caps, hexes lost).
 *
 * Purpose: Feeds the consolidated popup Updates section without duplicating unit loss reporting.
 * When to use: Inside `buildConsolidatedTurnUpdateToastMessage` before optional combat fallbacks.
 * Expected outcome: Plain strings without leading bullets. A count of one uses the singular noun.
 * Exceptions: None.
 */
export function buildOtherTurnUpdatePrimaryLines(readyResult: ReadyResult): string[] {
  const lines: string[] = [];
  const deployedLine = formatDeployedUnitsLine(readyResult.deployedUnitsByType);
  if (deployedLine) lines.push(deployedLine);
  const deploymentCapLine = formatDeploymentCapReachedLine(readyResult.humanDeploymentCapReachedUnitTypes, HUMAN_SEAT_ID);
  if (deploymentCapLine) lines.push(deploymentCapLine);
  const hexesLost = readyResult.humanHexesLostCount ?? 0;
  if (hexesLost > 0) {
    lines.push(`${hexesLost.toLocaleString()} ${hexesLost === 1 ? 'hex' : 'hexes'} lost to opponent`);
  }
  return lines;
}

/**
 * Arguments for building a consolidated map toast after turn or beat resolution.
 */
export interface ConsolidatedTurnUpdateToastArgs {
  /**
   * Ready-shaped resolution slice for non-loss Updates lines (deployment, infrastructure, hexes lost).
   *
   * Contract: Same fields as strategic `ReadyResult` or tactical toast adapter output.
   * When to use: Pass the same object used for visibility classification.
   * Expected outcome: Drives `buildOtherTurnUpdatePrimaryLines` only; unit losses come from `turnLossSummary`.
   * Exceptions: None.
   */
  readyResult: ReadyResult;
  /**
   * Per-player loss summary after fog filtering (popup) or full record (not used in renderer with filter).
   *
   * Contract: Output of `buildTurnLossSummary` with visibility predicate applied for opponent victims.
   * When to use: Required for the per-side loss sections.
   * Expected outcome: A side with no losses is omitted. The viewer is "Your Losses". Each other side uses its full home name. Neutral is last.
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
   * Who took hexes, and which seat the loss sections call "you".
   *
   * Contract: The viewer's seat, the roster, and transitions. Omit `otherLines`; this builder appends Updates itself.
   * When to use: Strategic Ready and a tactical commit.
   * Expected outcome: Hex sentences lead the toast. Loss sections follow. A missing report uses no viewer.
   * Exceptions: None.
   */
  turnReport?: Omit<TurnReportInput, 'otherLines'>;
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
 * Exceptions: None.
 */
export function buildConsolidatedTurnUpdateToastMessage(args: ConsolidatedTurnUpdateToastArgs): string | null {
  const { readyResult, combatFallbackBullets, turnReport } = args;
  const sections: string[] = [];
  const reportLines = turnReport ? buildTurnReportLines({ ...turnReport, otherLines: [] }) : [];
  const lossSections = buildTurnLossSections(
    args.turnLossSummary,
    turnReport?.viewerSeatId ?? null,
    turnReport?.seats ?? []
  );
  sections.push(...reportLines);
  sections.push(...lossSections);
  const hasLossSections = reportLines.length > 0 || lossSections.length > 0;
  let otherLines = buildOtherTurnUpdatePrimaryLines(readyResult);
  if (!hasLossSections && otherLines.length === 0) {
    otherLines = composeResolutionMapToastBullets([], combatFallbackBullets).map(stripLeadingBullet);
  }
  if (otherLines.length > 0) {
    sections.push(`${MAP_TOAST_SECTION_HEADER_PREFIX}${MAP_TOAST_UPDATES_SECTION_TITLE}`);
    sections.push(...otherLines);
  }
  if (sections.length === 0) return null;
  return sections.join('\n');
}
