/**
 * Shared Best Options row-to-envelope mapping for both consultation modes.
 *
 * Purpose: Ranged (and air-when-present) mapping used to be omitted from the copy instruction, so the
 * model never copied the compact ranged rows. Overlapping rows also need an explicit one-row-per-actor rule
 * so a large roster does not explode the completion.
 * When to use: Coaching option-copy bullets and `# Available Tools` intros.
 * Expected outcome: Approach/move map to explicit_move, ranged maps to ranged_attack, ferry/air only when
 * present, each actor is copied from at most one row per action, and a Target Hex listed only for other
 * actors is never reused.
 * Exceptions: None.
 */

import { logDebug } from '../../logger';
import type { CoachingGates } from './coachingGates';
import type { PromptCoordinateMode } from './promptCoordinateMode';

/**
 * Builds the mapping sentence that turns one Best Options row into envelope fields.
 *
 * Purpose: One wording for both mode coaching bullets so strategic and tactical cannot drift.
 * When to use: The options-table branch of each mode's option-copy bullet.
 * Expected outcome: Names approach/move, ranged, optional ferry/air, unitIds grouping, and the one-row rule.
 * Exceptions: None.
 */
export function buildOptionCopyMappingClause(args: {
  actorNoun: 'unit' | 'sub-unit';
  hasAirUnits: boolean;
  includeFerryMapping: boolean;
}): string {
  logDebug('promptSpec buildOptionCopyMappingClause', args);
  const actor = args.actorNoun;
  const ferry = args.includeFerryMapping ? '; copy a ferry Target Hex into ferryOrders' : '';
  const air = args.hasAirUnits ? '; copy an air strike Target Hex into airStrikes' : '';
  return (
    `Copy a Target Hex from a row listing that ${actor} into explicit_move.destination (approach or move/melee); ` +
    `copy a ranged Target Hex or Target Unit into a ranged_attack entry` +
    ferry +
    air +
    `. Each ${actor} gets at most one move and one shot: pick one row per action type and copy its Unit IDs into one unitIds array; ` +
    `do not copy overlapping rows that relist the same ${actor}. ` +
    `Never copy a Target Hex from a row that does not list that ${actor}; if that ${actor} has no row, call plan_route or leave it idle.`
  );
}

/**
 * Builds the option-copy coaching bullet for one consultation mode.
 *
 * Purpose: Strategic and tactical bullets share the table, routing, and hold branches, and differ by actor noun and period word.
 * When to use: The option-copy item in each mode's coaching list.
 * Expected outcome: The historical sentence for that mode's noun and period, including the mapping clause when a table is present.
 * Exceptions: None.
 */
export function buildOptionCopyOrRoutingBullet(
  gates: CoachingGates,
  periodWord: 'this-turn' | 'this-beat',
  actorNoun: 'unit' | 'sub-unit'
): string {
  logDebug('promptSpec buildOptionCopyOrRoutingBullet', {
    periodWord,
    actorNoun,
    hasBestOptionsTable: gates.hasBestOptionsTable,
    planningEnabled: gates.planningEnabled,
    hasAirUnits: gates.hasAirUnits,
  });
  if (gates.hasBestOptionsTable) {
    const routing = gates.planningEnabled
      ? ` Call plan_route only for a destination the table does not list for that ${actorNoun}.`
      : '';
    return (
      `- Best Options This Turn Target Hexes are already ${periodWord} legal destinations. ` +
      buildOptionCopyMappingClause({
        actorNoun,
        hasAirUnits: gates.hasAirUnits,
        includeFerryMapping: gates.hasAirUnits,
      }) +
      routing
    );
  }
  if (gates.planningEnabled) {
    return '- No options are listed this period. Destinations must come from the routing tool, not from an absent options table.';
  }
  return `- No options are listed this period. Destinations come only from the adjacent-cell listing; the ${actorNoun}'s own cell means hold.`;
}

/**
 * Builds the short copy-then-submit sentence for `# Available Tools`.
 *
 * Purpose: The intro must name the same mapping as the coaching bullet, including ranged rows.
 * When to use: `buildAvailableToolsIntro` when a Best Options table is present.
 * Expected outcome: Approach/move into explicit_move, ranged into ranged_attack, optional ferry/air, one-row rule.
 * Exceptions: None.
 */
export function buildToolsIntroCopySentence(args: {
  coordinateMode: PromptCoordinateMode;
  hasAirUnits: boolean;
}): string {
  logDebug('promptSpec buildToolsIntroCopySentence', args);
  const actor = args.coordinateMode === 'tactical' ? 'sub-unit' : 'unit';
  const oneStep = args.coordinateMode === 'strategic' ? ' when you need a one-step move' : '';
  const ferry = args.hasAirUnits ? '; copy ferry Target Hexes into ferryOrders' : '';
  const air = args.hasAirUnits ? '; copy air strike Target Hexes into airStrikes' : '';
  return (
    `Copy Best Options This Turn approach and move/melee Target Hexes into explicit_move${oneStep}; ` +
    `copy ranged Target Hexes or Target Units into ranged_attack${ferry}${air}; ` +
    `pick one row per ${actor} per action. ` +
    `Never copy a Target Hex from a row that does not list that ${actor}.`
  );
}
