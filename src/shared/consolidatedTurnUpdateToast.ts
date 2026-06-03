/**
 * Shared consolidated map-toast message builder (Human Losses / AI Losses / Other sections).
 */

import { ALL_BUILD_UNIT_TYPES } from './ipc/productionTypes';
import type { BuildUnitType, ReadyResult } from './ipcTypes';
import {
  formatPlayerLossLinesMultiline,
  playerHasAnyLoss,
  type PlayerLossSummary,
  type TurnLossSummary,
} from './lossSummary';
import { composeResolutionMapToastBullets } from './orderPreviewBlockingCopy';

/** Prefix for bold section headers in `#map-toast` consolidated update messages. */
export const MAP_TOAST_SECTION_HEADER_PREFIX = '## ';

/** Section header label for non-loss deployment, infrastructure, and fallback lines in map toasts. */
export const MAP_TOAST_UPDATES_SECTION_TITLE = 'Updates';

/**
 * Formats a count with singular/plural noun labels for infrastructure toast lines.
 *
 * Purpose: Keeps air-strike infrastructure summaries readable in the Other section.
 * When to use: Inside `formatAirStrikeInfrastructureOtherLine` when rubble counts are non-zero.
 * Expected outcome: `"1 urban hex"` or `"3 urban hexes"` style strings.
 * Exceptions: None.
 */
function formatCountLabel(value: number, singular: string, plural: string): string {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

/**
 * Builds the deployment summary line for the Other toast section when new units entered play.
 *
 * Purpose: Surfaces production/deployment outcomes separate from combat losses.
 * When to use: `buildOtherTurnUpdatePrimaryLines` for strategic Ready results with `deployedUnitsByType`.
 * Expected outcome: Human-readable counts by type or null when nothing deployed.
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
  if (parts.length === 1) return `${parts[0]} units deployed`;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]} units deployed`;
  if (parts.length === 3) return `${parts[0]}, ${parts[1]}, and ${parts[2]} units deployed`;
  return `${parts[0]}, ${parts[1]}, ${parts[2]}, and ${parts[3]} units deployed`;
}

/**
 * Builds the human deployment cap message when a unit type hit its on-map limit.
 *
 * Purpose: Alerts the player in the Other section without mixing into loss buckets.
 * When to use: When `humanDeploymentCapReachedUnitTypes` is populated on Ready results.
 * Expected outcome: Single sentence listing capped types or null when none capped.
 * Exceptions: None.
 */
function formatDeploymentCapReachedLine(
  cappedTypes: BuildUnitType[] | undefined,
  player: 'human' | 'opponent'
): string | null {
  if (player !== 'human') return null;
  if (!cappedTypes || cappedTypes.length === 0) return null;
  const ordered = ALL_BUILD_UNIT_TYPES.filter((unitType) => cappedTypes.includes(unitType));
  if (ordered.length === 0) return null;
  if (ordered.length === 1) return `Maximum human ${ordered[0]} units deployed.`;
  if (ordered.length === 2) return `Maximum human ${ordered[0]} and ${ordered[1]} units deployed.`;
  if (ordered.length === 3) return `Maximum human ${ordered[0]}, ${ordered[1]}, and ${ordered[2]} units deployed.`;
  return `Maximum human ${ordered[0]}, ${ordered[1]}, ${ordered[2]}, and ${ordered[3]} units deployed.`;
}

/**
 * Summarizes air-strike attempts and infrastructure destroyed (excludes unit losses).
 *
 * Purpose: Keeps infrastructure outcomes in Other while unit victims flow through loss summaries.
 * When to use: When `airStrikeAttemptCount` is positive on a Ready-shaped slice.
 * Expected outcome: Attempt count plus destroyed urban/airport/seaport phrase or null when no attempts.
 * Exceptions: None.
 */
function formatAirStrikeInfrastructureOtherLine(readyResult: ReadyResult): string | null {
  const attempts = readyResult.airStrikeAttemptCount ?? 0;
  if (attempts <= 0) return null;
  const destroyedByFeature = { urban: 0, airport: 0, seaport: 0 };
  for (const event of readyResult.infrastructureDestroyedEvents ?? []) {
    const rubbleCells = event.changedRubbleCount ?? 0;
    if (event.targetType === 'urban') destroyedByFeature.urban += rubbleCells;
    else if (event.targetType === 'airport') destroyedByFeature.airport += rubbleCells;
    else if (event.targetType === 'seaport') destroyedByFeature.seaport += rubbleCells;
  }
  const destroyedParts: string[] = [];
  if (destroyedByFeature.urban > 0) destroyedParts.push(formatCountLabel(destroyedByFeature.urban, 'urban hex', 'urban hexes'));
  if (destroyedByFeature.airport > 0) destroyedParts.push(formatCountLabel(destroyedByFeature.airport, 'airport', 'airports'));
  if (destroyedByFeature.seaport > 0) destroyedParts.push(formatCountLabel(destroyedByFeature.seaport, 'seaport', 'seaports'));
  const destroyedPart = destroyedParts.length > 0 ? `destroyed ${destroyedParts.join(', ')}` : 'destroyed nothing';
  return `Air strikes: ${attempts.toLocaleString()} attempted; ${destroyedPart}`;
}

/**
 * Builds non-loss "Other" section lines (deployment, caps, hexes lost, air-strike infrastructure).
 *
 * Purpose: Feeds the consolidated popup `Other` section without duplicating unit loss reporting.
 * When to use: Inside `buildConsolidatedTurnUpdateToastMessage` before optional combat fallbacks.
 * Expected outcome: Plain strings without leading bullets.
 * Exceptions: None.
 */
export function buildOtherTurnUpdatePrimaryLines(readyResult: ReadyResult): string[] {
  const lines: string[] = [];
  const deployedLine = formatDeployedUnitsLine(readyResult.deployedUnitsByType);
  if (deployedLine) lines.push(deployedLine);
  const deploymentCapLine = formatDeploymentCapReachedLine(readyResult.humanDeploymentCapReachedUnitTypes, 'human');
  if (deploymentCapLine) lines.push(deploymentCapLine);
  const airStrikeInfraLine = formatAirStrikeInfrastructureOtherLine(readyResult);
  if (airStrikeInfraLine) lines.push(airStrikeInfraLine);
  if ((readyResult.humanHexesLostCount ?? 0) > 0) {
    lines.push(`${readyResult.humanHexesLostCount!.toLocaleString()} hexes lost to opponent`);
  }
  return lines;
}

/**
 * Arguments for building a consolidated Human/AI/Other map toast after turn or beat resolution.
 */
export interface ConsolidatedTurnUpdateToastArgs {
  /**
   * Ready-shaped resolution slice for non-loss "Other" lines (deployment, infrastructure, hexes lost).
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
   * When to use: Required for Human Losses and AI Losses sections.
   * Expected outcome: Empty player sections are omitted from the toast.
   * Exceptions: None.
   */
  turnLossSummary: TurnLossSummary;
  /**
   * Combat-activity fallback lines when no losses or primary other content exists.
   *
   * Contract: Output of `buildCombatActivityFallbackBullets`; engagement-only lines may be suppressed.
   * When to use: Appended into `Other` when appropriate via `composeResolutionMapToastBullets` policy.
   * Expected outcome: May be empty; never duplicates loss cause lines.
   * Exceptions: None.
   */
  combatFallbackBullets: string[];
}

/**
 * Strips a leading bullet character from fallback combat-activity lines before Other section insertion.
 *
 * Purpose: Normalizes `composeResolutionMapToastBullets` output for consolidated section layout.
 * When to use: When promoting fallback lines into the Other section body.
 * Expected outcome: Plain text without a leading `•`.
 * Exceptions: None.
 */
function stripLeadingBullet(line: string): string {
  return line.replace(/^\u2022\s*/, '');
}

/**
 * Appends one player loss section (header plus cause sub-lines) when that player lost units.
 *
 * Purpose: Shared helper for Human Losses and AI Losses section assembly.
 * When to use: Inside `buildConsolidatedTurnUpdateToastMessage` for each player bucket.
 * Expected outcome: Section omitted entirely when the player summary has no losses.
 * Exceptions: None.
 */
function appendLossSection(out: string[], header: string, summary: PlayerLossSummary): void {
  if (!playerHasAnyLoss(summary)) return;
  out.push(`${MAP_TOAST_SECTION_HEADER_PREFIX}${header}`);
  for (const line of formatPlayerLossLinesMultiline(summary)) {
    out.push(`${line.causeLabel}: ${line.text}`);
  }
}

/**
 * Builds the consolidated map toast message with Human Losses, AI Losses, and Other sections.
 *
 * Purpose: Single popup formatter replacing flat direct-fire/melee bullet lists.
 * When to use: Strategic Ready and tactical commit paths in `readyHandler` before `showMapToast`.
 * Expected outcome: Newline-separated message with `##` section headers; `null` when all sections would be empty.
 * Exceptions: None.
 */
export function buildConsolidatedTurnUpdateToastMessage(args: ConsolidatedTurnUpdateToastArgs): string | null {
  const { readyResult, turnLossSummary, combatFallbackBullets } = args;
  const sections: string[] = [];
  appendLossSection(sections, 'Human Losses', turnLossSummary.human);
  appendLossSection(sections, 'AI Losses', turnLossSummary.ai);
  const hasLossSections =
    playerHasAnyLoss(turnLossSummary.human) || playerHasAnyLoss(turnLossSummary.ai);
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
