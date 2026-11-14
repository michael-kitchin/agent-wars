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
import { SECTION_TITLE_CAMPAIGN, subHeading } from './sectionHeadings';

/**
 * Writes the Campaign rules for the system prompt.
 *
 * Purpose: The model needs the phase, how many units stay home, the advance rows, and how a new target is chosen.
 * When to use: After the strategic context block when `campaignEnabled` is true.
 * Expected outcome: The heading plus the paragraphs below, with the radii filled from the campaign constants. The menu sentence is present only when `operationsEnabled` is true.
 * Exceptions: None.
 */
export function buildCampaignRuleBlock(operationsEnabled = false): string {
  logTrace('promptSpec buildCampaignRuleBlock', {
    massRadius: CAMPAIGN_MASS_RADIUS,
    homeDefenseRadius: CAMPAIGN_HOME_DEFENSE_RADIUS,
    contactRadius: CAMPAIGN_CONTACT_RADIUS,
    operationsEnabled,
  });
  const paragraphs = [
    'The engine picks one enemy city for your ground units to take: the campaign target. The Campaign Objective section of the briefing names it, a staging hex near it, and the phase.',
    `In the assemble phase, campaign units march to the staging hex and hold there. When enough of them are within ${CAMPAIGN_MASS_RADIUS} hexes of it, the phase becomes assault and they march on the target together. Units that arrive one at a time are destroyed one at a time.`,
    `When enemy ground units are within ${CAMPAIGN_HOME_DEFENSE_RADIUS} hexes of your ground units at home, the engine keeps one home unit per enemy unit as a home defender, nearest the enemy first, and never more than half your ground units. Home defenders stay out of the campaign. A unit within ${CAMPAIGN_CONTACT_RADIUS} hex of an enemy keeps fighting it.`,
    'Campaign Orders, under Standing Order Status, lists each campaign unit whose standing order should change, and each home defender still marching on the campaign target or staging hex. Give each listed unit the order its row names. A campaign unit without a standing order has the campaign hex as its Suggested Destination.',
    'Best Options lists advance rows for campaign units. An advance row is a one-step move toward the campaign hex. Copy it into explicit_move like an approach row.',
    operationsEnabled
      ? 'To choose a different target, set "campaignTarget" to the hex code of an enemy city in your final JSON. Omit it to keep the target. Sending the current target changes nothing. The engine keeps your target until you take it, it stops being an enemy city, or no ground unit can reach it by land. An unknown or unreachable city is dropped. You may instead launch a land row of Operation Options; both do the same thing.'
      : 'To choose a different target, set "campaignTarget" to the hex code of an enemy city in your final JSON. Omit it to keep the target. Sending the current target changes nothing. The engine keeps your target until you take it, it stops being an enemy city, or no ground unit can reach it by land. An unknown or unreachable city is dropped.',
  ];
  return `${subHeading(SECTION_TITLE_CAMPAIGN)}\n\n${paragraphs.join('\n\n')}`;
}
