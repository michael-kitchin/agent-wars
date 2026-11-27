/**
 * The truce text of a battle between two AI commanders.
 *
 * Purpose: The talk prompt and the orders prompt show the same agreements with the opponent and the same count of last beat's fire.
 * When to use: A prompt for a battle with a lead party, while the talk stage is on.
 * Expected outcome: Pure text built from plain inputs. This module does not read the database.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import type { TacticalBeatActivity } from '../../../shared/tacticalBattleTypes';
import type { SideAgreementView } from '../../sideAgreements/sideAgreementLedger';
import { formatSideAgreementLines } from './sideAgreementPromptLines';

/**
 * What the truce text is built from.
 *
 * Contract: `agreementViews` holds only agreements with the opponent. `activity` is the battle's `lastBeatActivity`.
 * When to use: `buildBattleTruceText`.
 * Expected outcome: One opponent and what to show about it.
 * Exceptions: None.
 */
export interface BattleTruceTextArgs {
  /**
   * The opponent's side name.
   *
   * Contract: The label the Sides table uses.
   * When to use: The agreement heading and the no-agreement line.
   * Expected outcome: A name.
   * Exceptions: None.
   */
  readonly opponentLabel: string;
  /**
   * The opponent's side code.
   *
   * Contract: The code the Sides table uses.
   * When to use: Every sentence that names the opponent.
   * Expected outcome: A side code.
   * Exceptions: None.
   */
  readonly opponentCode: string;
  /**
   * The commander's own agreements with the opponent, or null to leave that part out.
   *
   * Contract: An empty list means no agreement is on record with this opponent.
   * When to use: The agreement part.
   * Expected outcome: Views, an empty list, or null.
   * Exceptions: None.
   */
  readonly agreementViews: readonly SideAgreementView[] | null;
  /**
   * What the last beat did, or null before the first beat.
   *
   * Contract: The counts the game stored for the last completed beat.
   * When to use: The last-beat part.
   * Expected outcome: A beat record, or null.
   * Exceptions: None.
   */
  readonly activity: TacticalBeatActivity | null;
  /**
   * Whether the commander the text is written for is the battle's lead side.
   *
   * Contract: True when `leadShots` counts the commander's own shots.
   * When to use: Reading the two counts.
   * Expected outcome: True or false.
   * Exceptions: None.
   */
  readonly ownIsLead: boolean;
}

/**
 * Writes a shot count with its noun.
 *
 * Purpose: Both counts read the same way.
 * When to use: The last-beat line.
 * Expected outcome: `1 shot`, or `{n} shots` for any other count.
 * Exceptions: None.
 */
function shotCount(count: number): string {
  return count === 1 ? '1 shot' : `${count} shots`;
}

/**
 * The commander's agreements with the opponent.
 *
 * Purpose: A commander in a battle can read what it recorded with this side, and is told it cannot change it there.
 * When to use: When agreements are shown.
 * Expected outcome: The heading, the agreement lines, and the read-only sentence, or the one line saying there is no agreement.
 * Exceptions: None.
 */
function agreementPart(args: BattleTruceTextArgs, views: readonly SideAgreementView[]): string {
  const opponent = `${args.opponentLabel} (${args.opponentCode})`;
  if (views.length === 0) return `You have no agreement on record with ${opponent}.`;
  return [
    `Your agreements with ${opponent}, shown for reference:`,
    formatSideAgreementLines(views),
    'These are your own records. You cannot make or change an agreement during a battle, and hex codes inside an agreement are world-map codes, not codes of this battle.',
  ].join('\n');
}

/**
 * The game's count of the last beat's fire.
 *
 * Purpose: A commander can check a promise to hold fire against what was rolled.
 * When to use: When a beat has completed.
 * Expected outcome: One line with the opponent's count, the commander's own count, and whether there was melee.
 * Exceptions: None.
 */
function lastBeatPart(args: BattleTruceTextArgs, activity: TacticalBeatActivity): string {
  const yours = args.ownIsLead ? activity.leadShots : activity.opposingShots;
  const theirs = args.ownIsLead ? activity.opposingShots : activity.leadShots;
  const melee = activity.meleeFought ? 'Units of both sides fought in melee.' : 'There was no melee.';
  return `Last beat, counted by the game: ${args.opponentCode} fired ${shotCount(theirs)}, and you fired ${shotCount(yours)}. ${melee}`;
}

/**
 * Builds the truce text of one commander in one battle.
 *
 * Purpose: Shows the commander's agreements with the opponent, then the game's count of the last beat.
 * When to use: Once per battle talk prompt and once per battle orders prompt.
 * Expected outcome: Null when both parts are left out. Otherwise the parts that apply, one blank line between them.
 * Exceptions: None.
 */
export function buildBattleTruceText(args: BattleTruceTextArgs): string | null {
  logTrace('battleTruceText buildBattleTruceText', {
    opponentCode: args.opponentCode,
    agreementCount: args.agreementViews?.length ?? null,
    beatNumber: args.activity?.beatNumber ?? null,
    ownIsLead: args.ownIsLead,
  });
  const parts = [
    ...(args.agreementViews !== null ? [agreementPart(args, args.agreementViews)] : []),
    ...(args.activity !== null ? [lastBeatPart(args, args.activity)] : []),
  ];
  return parts.length > 0 ? parts.join('\n\n') : null;
}
