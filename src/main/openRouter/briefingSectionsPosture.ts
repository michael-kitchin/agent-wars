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
 * Expected outcome: The sentence for that posture. Without a campaign, overland omits the land-options clause and blitz omits the campaign-assault clause.
 * Exceptions: None.
 */
export function postureEffectLine(posture: Posture, campaignEnabled: boolean): string {
  const settings: PostureSettings = POSTURE_SETTINGS[posture];
  const line =
    posture === 'maritime'
      ? `Sea and air options are listed first. Production Priorities asks for ships up to your full naval cap, and up to ${percent(settings.liftGroundShare)} of your ground units may be lifted.`
      : posture === 'strangle'
        ? 'Production Priorities names another city for a missile even when one is already queued, and names a larger city for credits. Strike city, airport, and seaport cells before units.'
        : posture === 'blitz'
          ? campaignEnabled
            ? `Air options are listed first and you may run ${settings.airOperationSlotFactor} times as many. The campaign assaults with ${campaignAssaultMinUnitsFor(settings.campaignAssaultFactor)} ground units massed instead of ${CAMPAIGN_ASSAULT_MIN_UNITS}, and the engine launches against an objective with ${settings.engineLaunchMaxDefenders} defender.`
            : `Air options are listed first and you may run ${settings.airOperationSlotFactor} times as many, and the engine launches against an objective with ${settings.engineLaunchMaxDefenders} defender.`
          : campaignEnabled
            ? 'Land options are listed first, and the engine launches only against undefended objectives.'
            : 'The engine launches only against undefended objectives.';
  logTrace('briefingSectionsPosture postureEffectLine', { posture, campaignEnabled });
  return line;
}

/**
 * The posture section for one seat.
 *
 * Purpose: The commander can see the hold without a separate refusal note.
 * When to use: When standing orders are on and the consult is not a battle. Pass null when the seat has no stored row.
 * Expected outcome: The heading, the posture line, and the effect line, then each of `fitLines` on its own line when any are passed. The change sentence says the next turn while that turn is still ahead, and says the posture may change now otherwise.
 * Exceptions: None.
 */
export function buildPostureSection(args: {
  readonly stored: StoredPosture | null;
  readonly turnNumber: number;
  readonly campaignEnabled: boolean;
  /**
   * Extra lines printed after the effect line.
   *
   * Contract: Each entry is one complete line, printed as given and in order. Absent or empty prints nothing extra.
   * When to use: Pass the posture fit lines built for this consult.
   * Expected outcome: Each line on its own line at the end of the section.
   * Exceptions: None.
   */
  readonly fitLines?: readonly string[];
}): string {
  const posture = args.stored?.posture ?? DEFAULT_POSTURE;
  const status = args.stored === null
    ? `- Posture: ${DEFAULT_POSTURE}, the default. You have not declared one. Name one with "posture" in your reply.`
    : postureStatus(args.stored, args.turnNumber);
  logTrace('briefingSectionsPosture buildPostureSection', {
    posture,
    sinceTurn: args.stored?.sinceTurn ?? null,
    turnNumber: args.turnNumber,
    campaignEnabled: args.campaignEnabled,
  });
  const fitText = (args.fitLines ?? []).map((line) => `\n${line}`).join('');
  return `${topLevelHeading(SECTION_TITLE_POSTURE)}\n\n${status}\n- Effect: ${postureEffectLine(posture, args.campaignEnabled)}${fitText}`;
}

/**
 * The turn a stored posture's hold ends, while it still holds.
 *
 * Purpose: The Posture section and the posture attention flag name the same turn.
 * When to use: Whenever a briefing line says until when a posture holds.
 * Expected outcome: `sinceTurn + POSTURE_MIN_HOLD_TURNS` when a row is stored and that turn is later than `turnNumber`. Otherwise null.
 * Exceptions: None.
 */
export function postureHoldUntilTurn(stored: StoredPosture | null, turnNumber: number): number | null {
  if (stored === null) return null;
  const nextTurn = stored.sinceTurn + POSTURE_MIN_HOLD_TURNS;
  return nextTurn > turnNumber ? nextTurn : null;
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
  const nextTurn = postureHoldUntilTurn(stored, turnNumber);
  const when = nextTurn !== null ? `You may change it from turn ${nextTurn}.` : 'You may change it now.';
  return `- Posture: ${stored.posture}, set on turn ${stored.sinceTurn}. ${when}`;
}
