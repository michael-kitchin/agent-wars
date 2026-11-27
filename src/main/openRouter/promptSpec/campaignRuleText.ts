/**
 * System-prompt explanation of the campaign.
 *
 * Purpose: The cached system prompt teaches the campaign once, so the situation message only names this turn's target.
 * When to use: Strategic context coaching when the campaign gate is on.
 * Expected outcome: An H2 Campaign section. Battle prompts never include it.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import {
  CAMPAIGN_CONTACT_RADIUS,
  CAMPAIGN_HOME_DEFENSE_RADIUS,
  CAMPAIGN_MASS_RADIUS,
} from '../campaignRules';
import {
  CAMPAIGN_LIFT_FORCE_RATIO,
  CAMPAIGN_SEA_LAUNCH_WAIT_TURNS,
  CAMPAIGN_SEA_SKIP_TURNS,
  CAMPAIGN_SEA_STEP_PENALTY,
} from '../campaignSeaConstants';
import { CAMPAIGN_MAX_LAND_STEPS } from '../campaignTargetSelection';
import { LIFT_OBJECTIVE_CLEAR_RADIUS } from '../../operations/liftRules';
import { SECTION_TITLE_CAMPAIGN, subHeading } from './sectionHeadings';

/**
 * Writes the Campaign rules for the system prompt.
 *
 * Purpose: The model needs the phase, how many units stay home, the advance rows, how a campaign lift carries units to a target across the water, and how a new target is chosen.
 * When to use: After the strategic context block when `campaignEnabled` is true.
 * Expected outcome: The heading plus the paragraphs below, with the radii, the land and sea step limits, and the lift ratio and waits filled from the campaign constants. The menu sentence is present only when `operationsEnabled` is true. When `agreementsEnabled` is true, the last paragraph also says the engine never picks a pact partner's city and how to attack one.
 * Exceptions: None.
 */
export function buildCampaignRuleBlock(operationsEnabled = false, agreementsEnabled = false): string {
  logTrace('promptSpec buildCampaignRuleBlock', {
    massRadius: CAMPAIGN_MASS_RADIUS,
    homeDefenseRadius: CAMPAIGN_HOME_DEFENSE_RADIUS,
    contactRadius: CAMPAIGN_CONTACT_RADIUS,
    operationsEnabled,
    agreementsEnabled,
  });
  const pactSentences = agreementsEnabled
    ? ' The engine never picks a city held by a side you have an active non_aggression or ceasefire_in_place agreement with, and it drops a target it picked itself once you record one with that city\'s holder. To attack such a side, name its city in "campaignTarget".'
    : '';
  const paragraphs = [
    'The engine picks one enemy city for your ground units to take: the campaign target. The Campaign Objective section of the briefing names it, a staging hex near it, and the phase.',
    `In the assemble phase, campaign units march to the staging hex and hold there. When enough of them are within ${CAMPAIGN_MASS_RADIUS} hexes of it, the phase becomes assault and they march on the target together. Units that arrive one at a time are destroyed one at a time.`,
    `When enemy ground units are within ${CAMPAIGN_HOME_DEFENSE_RADIUS} hexes of your ground units at home, the engine keeps one home unit per enemy unit as a home defender, nearest the enemy first, and never more than half your ground units. Home defenders stay out of the campaign. A unit within ${CAMPAIGN_CONTACT_RADIUS} hex of an enemy keeps fighting it.`,
    'Campaign Orders, under Standing Order Status, lists each campaign unit whose standing order should change, and each home defender still marching on the campaign target or staging hex. Give each listed unit the order its row names. A campaign unit without a standing order has the campaign hex as its Suggested Destination.',
    'Best Options lists advance rows for campaign units. An advance row is a one-step move toward the campaign hex. Copy it into explicit_move like an approach row.',
    `A city your ground units cannot reach within ${CAMPAIGN_MAX_LAND_STEPS} land steps can still be the target when a campaign lift can carry them there. Its distance is the march to a port you hold, the sailing turns, and ${CAMPAIGN_SEA_STEP_PENALTY} turns for loading and landing. The engine gathers the ground units that cannot walk to the campaign at a port and sails them as a campaign lift. A lift carries at most your posture's lift share of your ground units, and it sails only with at least ${CAMPAIGN_LIFT_FORCE_RATIO} times the enemy units within ${LIFT_OBJECTIVE_CLEAR_RADIUS} hexes of the target and those that can reach it first, less your ground units already near it. Each later lift lands beside the target or on a hex you hold near it, so a landing is reinforced lift by lift. A target that waits ${CAMPAIGN_SEA_LAUNCH_WAIT_TURNS} turns with no campaign lift is dropped, and the engine does not pick it again for ${CAMPAIGN_SEA_SKIP_TURNS} turns.`,
    (operationsEnabled
      ? 'To choose a different target, set "campaignTarget" to the hex code of an enemy city in your final JSON. Omit it to keep the target. Sending the current target does not restart its phase. The engine keeps your target until you take it, it stops being an enemy city, or no ground unit can reach it by land or by a campaign lift. An unknown or unreachable city is dropped. You may instead launch a land row of Operation Options; both do the same thing.'
      : 'To choose a different target, set "campaignTarget" to the hex code of an enemy city in your final JSON. Omit it to keep the target. Sending the current target does not restart its phase. The engine keeps your target until you take it, it stops being an enemy city, or no ground unit can reach it by land or by a campaign lift. An unknown or unreachable city is dropped.') + pactSentences,
  ];
  return `${subHeading(SECTION_TITLE_CAMPAIGN)}\n\n${paragraphs.join('\n\n')}`;
}
