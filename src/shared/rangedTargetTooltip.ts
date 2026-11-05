/**
 * Body of the effects tooltip while a ranged attack is aimed.
 *
 * Purpose: Opponent lines come first, then the Effects and Cover lines, then Kill, Hurt, and Loss.
 * When to use: When a legal ranged hover is published.
 * Expected outcome: One HTML string, or null when there is nothing to show. This module does not log.
 * Exceptions: None.
 */

import { escapeHtmlText } from './htmlTextFormatting';
import type { RangedTargetRosterLine } from './rangedTargetRoster';
import { TOOLTIP_SECTION_GAP_HTML } from './tooltipSectionGap';

/**
 * Trusted mark-up the renderer has already built for one roster.
 *
 * Purpose: Flag and type-icon elements stay in the renderer, where the DOM helpers live.
 * When to use: `buildRangedTargetRosterHtml`.
 * Expected outcome: Each callback returns HTML that is safe to concatenate. Names are escaped here.
 * Exceptions: None.
 */
export interface RangedTargetRosterMarks {
  /**
   * Number flag for one opponent, or an empty string when that seat has no flag.
   *
   * Purpose: The nickname still shows when this is empty.
   * When to use: Once per roster line.
   * Expected outcome: `outerHTML` of `createSideNumberFlag`, or `''`.
   * Exceptions: None.
   */
  readonly sideFlagHtml: (seatId: string) => string;
  /**
   * Origin flag for one named unit, or an empty string when it has no origin.
   *
   * Purpose: The name still shows when this is empty.
   * When to use: Once per named token.
   * Expected outcome: An `<img>` with no origin-tooltip attribute, or `''`.
   * Exceptions: None.
   */
  readonly originFlagHtml: (unitId: string) => string;
  /**
   * Type icon for one collapsed group.
   *
   * Purpose: A group has no origin flag.
   * When to use: Once per group token.
   * Expected outcome: `outerHTML` of `createLossTypeToken`.
   * Exceptions: None.
   */
  readonly groupMarkHtml: (seatId: string, unitType: string) => string;
}

/**
 * Pieces of one ranged-target tooltip.
 *
 * Purpose: The roster, the effects lines, and the Kill, Hurt, and Loss line are optional. Present parts stay in that order.
 * When to use: `composeRangedTargetTooltipHtml`.
 * Expected outcome: A null percent on any of the three drops the odds line.
 * Exceptions: None.
 */
export interface RangedTargetTooltipParts {
  /**
   * Effects and Cover HTML already produced for this order.
   *
   * Purpose: Those lines follow the opponent list.
   * When to use: The result of `resolveOrderPreviewEffectsTooltipHtml`.
   * Expected outcome: Null or empty when nothing slows the shot.
   * Exceptions: None.
   */
  readonly effectsHtml: string | null;
  /**
   * Opponent lines for the counted defenders.
   *
   * Purpose: One line per opponent seat.
   * When to use: The result of `buildRangedTargetRosterHtml`.
   * Expected outcome: Null or empty when no opponent was counted.
   * Exceptions: None.
   */
  readonly rosterHtml: string | null;
  /**
   * Wipe chance as a whole percent.
   *
   * Purpose: The Kill number. The odds line is omitted when this is null.
   * When to use: The odds result for this target.
   * Expected outcome: A number, or null.
   * Exceptions: None.
   */
  readonly killPercent: number | null;
  /**
   * Chance the attackers lose at least one unit, as a whole percent.
   *
   * Purpose: The Loss number. The odds line is omitted when this is null.
   * When to use: The odds result for this target.
   * Expected outcome: A number, or null.
   * Exceptions: None.
   */
  readonly lossPercent: number | null;
  /**
   * Chance the attackers score at least one hit, as a whole percent.
   *
   * Purpose: The Hurt number. The odds line is omitted when this is null.
   * When to use: The odds result for this target.
   * Expected outcome: `Math.round(probabilityAtLeastOneHit * 100)`, or null when any of the three chances is missing.
   * Exceptions: None.
   */
  readonly hurtPercent: number | null;
}

/**
 * Writes the opponent lines for a ranged target.
 *
 * Purpose: Names are escaped. Flag and icon markup is inserted as the renderer built it.
 * When to use: After `buildRangedTargetRosterLines`, with the marks for those seats and units.
 * Expected outcome: One HTML block, or null when there are no lines. Each opponent is its own line, separated like a hex tooltip. The nickname and its colon are bold.
 * Exceptions: None.
 */
export function buildRangedTargetRosterHtml(
  lines: readonly RangedTargetRosterLine[],
  marks: RangedTargetRosterMarks,
): string | null {
  if (lines.length === 0) return null;
  const rows = lines.map((line) => {
    const tokens = line.tokens.map((token) => {
      if (token.kind === 'unit') {
        return `${marks.originFlagHtml(token.unitId)}${escapeHtmlText(token.displayName)}`;
      }
      return `${marks.groupMarkHtml(line.seatId, token.unitType)}${escapeHtmlText(token.text)}`;
    });
    return `${marks.sideFlagHtml(line.seatId)}<strong>${escapeHtmlText(line.nickname)}:</strong> ${tokens.join(', ')}`;
  });
  return rows.join(TOOLTIP_SECTION_GAP_HTML);
}

/**
 * Joins the opponent lines, the Effects and Cover lines, and Kill, Hurt, and Loss.
 *
 * Purpose: A legal ranged hover uses one tooltip body. Air, missile, march, and ferry stay on the effects HTML alone.
 * When to use: From the hover publisher when the preview is a ranged attack.
 * Expected outcome: Present blocks in that order, separated by `TOOLTIP_SECTION_GAP_HTML`. `Kill:`, `Hurt:`, and `Loss:` are bold on one line.
 *   All three numbers, or none. Null when every part is absent.
 * Exceptions: None.
 */
export function composeRangedTargetTooltipHtml(parts: RangedTargetTooltipParts): string | null {
  const blocks: string[] = [];
  if (parts.rosterHtml) blocks.push(parts.rosterHtml);
  if (parts.effectsHtml) blocks.push(parts.effectsHtml);
  if (parts.killPercent != null && parts.hurtPercent != null && parts.lossPercent != null) {
    blocks.push(
      `<strong>Kill:</strong> ${parts.killPercent}%, <strong>Hurt:</strong> ${parts.hurtPercent}%, <strong>Loss:</strong> ${parts.lossPercent}%`,
    );
  }
  if (blocks.length === 0) return null;
  return blocks.join(TOOLTIP_SECTION_GAP_HTML);
}
