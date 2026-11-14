/**
 * The Posture block of a strategic briefing.
 *
 * Purpose: The commander sees the posture it is on, when it may change, and what that posture shifts.
 * When to use: Strategic consults with standing orders on. The block is prepended to the Active Operations string.
 * Expected outcome: An H1, the posture line, and one effect line. A missing row is the default posture.
 * Exceptions: None.
 */

import { logTrace } from '../logger';
import type { StoredPosture } from '../gameDb/postureMemory';
import {
  CAMPAIGN_ASSAULT_MIN_UNITS,
  campaignAssaultMinUnitsFor,
} from './campaignRules';
import { SECTION_TITLE_POSTURE, topLevelHeading } from './promptSpec/sectionHeadings';
import {
  DEFAULT_POSTURE,
  POSTURE_MIN_HOLD_TURNS,
  POSTURE_SETTINGS,
  type Posture,
  type PostureSettings,
} from '../../shared/postureTypes';

/**
 * Formats a share as a whole-number percent.
 *
 * Purpose: The maritime effect line states the lift share without a second copy of the number.
 * When to use: `postureEffectLine` for `liftGroundShare`.
 * Expected outcome: `50%` for 0.5. The value is rounded to the nearest percent.
 * Exceptions: None.
 */
function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/**
 * One sentence saying what this posture changes.
 *
 * Purpose: The numbers come from `POSTURE_SETTINGS`, so the sentence cannot drift from the row.
 * When to use: The effect line of `buildPostureSection`.
 * Expected outcome: The sentence for that posture. `overland` says land options come first and only undefended objectives are launched.
 * Exceptions: None.
 */
export function postureEffectLine(posture: Posture): string {
  const settings: PostureSettings = POSTURE_SETTINGS[posture];
  const line =
    posture === 'maritime'
      ? `Sea and air options are listed first. Production Priorities asks for ships up to your full naval cap, and up to ${percent(settings.liftGroundShare)} of your ground units may be lifted.`
      : posture === 'strangle'
        ? 'Production Priorities names another city for a missile even when one is already queued, and names a larger city for credits. Strike city, airport, and seaport cells before units.'
        : posture === 'blitz'
          ? `Air options are listed first and you may run ${settings.airOperationSlotFactor} times as many. The campaign assaults with ${campaignAssaultMinUnitsFor(settings.campaignAssaultFactor)} ground units massed instead of ${CAMPAIGN_ASSAULT_MIN_UNITS}, and the engine launches against an objective with ${settings.engineLaunchMaxDefenders} defender.`
          : 'Land options are listed first, and the engine launches only against undefended objectives.';
  logTrace('briefingSectionsPosture postureEffectLine', { posture });
  return line;
}

/**
 * The posture section for one seat.
 *
 * Purpose: The commander can see the hold without a separate refusal note.
 * When to use: When standing orders are on and the consult is not a battle. Pass null when the seat has no stored row.
 * Expected outcome: The heading, the posture line, and the effect line. The change sentence says the next turn while that turn is still ahead, and says the posture may change now otherwise.
 * Exceptions: None.
 */
export function buildPostureSection(args: { readonly stored: StoredPosture | null; readonly turnNumber: number }): string {
  const posture = args.stored?.posture ?? DEFAULT_POSTURE;
  const status = args.stored === null
    ? `- Posture: ${DEFAULT_POSTURE}, the default. You may set another at any time.`
    : postureStatus(args.stored, args.turnNumber);
  logTrace('briefingSectionsPosture buildPostureSection', {
    posture,
    sinceTurn: args.stored?.sinceTurn ?? null,
    turnNumber: args.turnNumber,
  });
  return `${topLevelHeading(SECTION_TITLE_POSTURE)}\n\n${status}\n- Effect: ${postureEffectLine(posture)}`;
}

/**
 * The posture line for a stored row.
 *
 * Purpose: The second sentence depends on whether the hold has elapsed.
 * When to use: `buildPostureSection` when a row exists.
 * Expected outcome: The set turn, then either the next change turn or that a change is allowed now.
 * Exceptions: None.
 */
function postureStatus(stored: StoredPosture, turnNumber: number): string {
  const nextTurn = stored.sinceTurn + POSTURE_MIN_HOLD_TURNS;
  const when = nextTurn > turnNumber ? `You may change it from turn ${nextTurn}.` : 'You may change it now.';
  return `- Posture: ${stored.posture}, set on turn ${stored.sinceTurn}. ${when}`;
}
