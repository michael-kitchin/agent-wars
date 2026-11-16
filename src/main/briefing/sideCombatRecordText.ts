/**
 * The words of a side combat record, as the commander's prompts print them.
 */

import type { SideStance } from '../../shared/sideMessages';
import { logTrace } from '../logger';
import type { CombatLossCounts, SideCombatRecord } from './sideCombatRecord';

/**
 * Joins the non-zero parts of one direction.
 *
 * Purpose: Both directions list the same four categories with different words.
 * When to use: `formatSideCombatRecord`, once per direction.
 * Expected outcome: The parts joined with a comma and a space, in the order given, with zero counts left out.
 * Exceptions: None.
 */
function joinParts(parts: readonly (readonly [number, string])[]): string {
  return parts
    .filter(([count]) => count > 0)
    .map(([count, words]) => `${count} ${words}`)
    .join(', ');
}

/**
 * Words what a side destroyed of the commander's units.
 *
 * Purpose: Names the count, the latest turn, and who started each fight.
 * When to use: `formatSideCombatRecord`.
 * Expected outcome: A sentence ending in a full stop.
 * Exceptions: None.
 */
function theirPart(counts: CombatLossCounts, sideCode: string, latestTurn: number | null): string {
  if (counts.total === 0) return `${sideCode} destroyed none of your units.`;
  const parts = joinParts([
    [counts.responsibleAttacked, `when ${sideCode} attacked`],
    [counts.victimAttacked, 'when you attacked'],
    [counts.closeCombat, 'in close combat or battle'],
    [counts.other, 'in other ways'],
  ]);
  return `${sideCode} destroyed ${counts.total} of your units (latest turn ${latestTurn}): ${parts}.`;
}

/**
 * Words what the commander destroyed of a side's units.
 *
 * Purpose: Names the count and who started each fight.
 * When to use: `formatSideCombatRecord`.
 * Expected outcome: A sentence ending in a full stop.
 * Exceptions: None.
 */
function yourPart(counts: CombatLossCounts, sideCode: string): string {
  if (counts.total === 0) return 'You destroyed none of theirs.';
  const parts = joinParts([
    [counts.responsibleAttacked, 'when you attacked'],
    [counts.victimAttacked, `when ${sideCode} attacked`],
    [counts.closeCombat, 'in close combat or battle'],
    [counts.other, 'in other ways'],
  ]);
  return `You destroyed ${counts.total} of theirs: ${parts}.`;
}

/**
 * Words one side's combat record.
 *
 * Purpose: The prompts show this line next to the commander's stance toward the side.
 * When to use: `readSideCombatRecords`, once per side.
 * Expected outcome: `Record, turns X to Y:` (or `Record, turn X:`) then either `no losses either way.` or the two sentences. The wording is quoted in the prompt documents.
 * Exceptions: None.
 */
export function formatSideCombatRecord(args: {
  readonly record: SideCombatRecord;
  readonly sideCode: string;
  readonly firstTurn: number;
  readonly lastTurn: number;
}): string {
  const { record, sideCode, firstTurn, lastTurn } = args;
  logTrace('sideCombatRecordText formatSideCombatRecord', { sideId: record.sideId, total: record.destroyedOfYours.total });
  const prefix = firstTurn === lastTurn ? `Record, turn ${firstTurn}:` : `Record, turns ${firstTurn} to ${lastTurn}:`;
  if (record.destroyedOfYours.total === 0 && record.destroyedOfTheirs.total === 0) return `${prefix} no losses either way.`;
  return `${prefix} ${theirPart(record.destroyedOfYours, sideCode, record.latestTurnDestroyedYours)} ${yourPart(record.destroyedOfTheirs, sideCode)}`;
}

/**
 * Newest turns, counted back from the current turn, in which an attack still contradicts a friendly stance.
 *
 * Purpose: An old attack should not be flagged forever, because a side may have changed.
 * When to use: `formatStanceConflict`.
 * Expected outcome: 2, so an attack on the current turn or the two turns before it is flagged.
 * Exceptions: None.
 */
const STANCE_CONFLICT_RECENT_TURNS = 2;

/**
 * Words a friendly stance that the record contradicts.
 *
 * Purpose: A model that keeps a cordial or friendly stance toward a side that is destroying its units should be told so next to the stance.
 * When to use: `readTalkSides`, once per side that has both a stance and a record.
 * Expected outcome: `Your stance toward {code} is {stance}, but {code} destroyed your units on turn {t}.` when the stance is cordial or friendly and `latestTurnAttackedYou` is within `STANCE_CONFLICT_RECENT_TURNS` turns of the current turn. The verb is "destroyed", not "attacked", because a close-combat or battle loss does not say which side started the fight. Otherwise null.
 * Exceptions: None.
 */
export function formatStanceConflict(args: {
  readonly sideCode: string;
  readonly stance: SideStance | null;
  readonly latestTurnAttackedYou: number | null;
  readonly currentTurnNumber: number;
}): string | null {
  const { sideCode, stance, latestTurnAttackedYou, currentTurnNumber } = args;
  logTrace('sideCombatRecordText formatStanceConflict', { sideCode, stance, latestTurnAttackedYou, currentTurnNumber });
  if (stance !== 'cordial' && stance !== 'friendly') return null;
  if (latestTurnAttackedYou === null || latestTurnAttackedYou < currentTurnNumber - STANCE_CONFLICT_RECENT_TURNS) return null;
  return `Your stance toward ${sideCode} is ${stance}, but ${sideCode} destroyed your units on turn ${latestTurnAttackedYou}.`;
}
