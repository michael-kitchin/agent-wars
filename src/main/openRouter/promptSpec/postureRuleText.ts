/**
 * The cached explanation of the four postures.
 *
 * Purpose: The system prompt lists what each posture shifts and one historical illustration, and says the names are illustrations.
 * When to use: Strategic context coaching when standing orders are on. Battle prompts omit it.
 * Expected outcome: The Postures heading and the five paragraphs below. The hold comes from `POSTURE_MIN_HOLD_TURNS`.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import { POSTURE_MIN_HOLD_TURNS } from '../../../shared/postureTypes';
import { CAMPAIGN_MAX_LAND_STEPS } from '../campaignTargetSelection';
import { SECTION_TITLE_POSTURE_RULES, subHeading } from './sectionHeadings';

/**
 * The paragraph that says which posture fits which enemy.
 *
 * Purpose: The commander picks the posture, so the rules explain when each one fits and point to the Posture section's per-enemy lines.
 * When to use: In the Postures block, between the posture bullets and the note on historical names, when the campaign is on.
 * Expected outcome: One paragraph of plain text.
 * Exceptions: None.
 */
const POSTURE_FIT_PARAGRAPH =
  `Which posture fits depends on how you can reach the enemy you mean to beat. Overland fits an enemy whose home a real force of your ground units can reach by land within ${CAMPAIGN_MAX_LAND_STEPS} land steps, or one you can reach only by a longer march. Blitz fits one of those whose home is lightly held. Maritime fits an enemy you can reach only by sea: its full naval cap and larger lift share are what a campaign lift needs. Strangle fits an enemy you cannot reach, or one whose home holds more ground units than you could land. The Posture section lists each enemy and the postures that fit it. When your posture does not fit the side that holds your campaign target, Attention Flags says so.`;

/**
 * The Postures block of the system prompt.
 *
 * Purpose: The commander can choose a posture without the historical names being options.
 * When to use: After the Operations block, when `postureEnabled` is true.
 * Expected outcome: The heading from `subHeading` and the text below. The hold number is `POSTURE_MIN_HOLD_TURNS`. Without a campaign, the opening, the overland bullet, and the blitz bullet omit the campaign and land clauses, and the paragraph on which posture fits which enemy is left out.
 * Exceptions: None.
 */
export function buildPostureRuleBlock(campaignEnabled: boolean): string {
  logTrace('promptSpec buildPostureRuleBlock', { holdTurns: POSTURE_MIN_HOLD_TURNS, campaignEnabled });
  const effort = campaignEnabled
    ? 'leans production, operations, and the campaign the same way'
    : 'leans production and operations the same way';
  const overland = campaignEnabled
    ? '- overland: mass your ground units and march. Land options come first. Like the Soviet summer offensive of 1944: mass, then break through.'
    : '- overland: mass your ground units and march. Like the Soviet summer offensive of 1944: mass, then break through.';
  const blitz = campaignEnabled
    ? '- blitz: assault with half the usual mass, run twice the air operations, and let the engine launch against a lightly held objective. Like the 1940 campaign in France: strike before the enemy has massed, and accept thin odds for speed.'
    : '- blitz: run twice the air operations, and let the engine launch against a lightly held objective. Like the 1940 campaign in France: strike before the enemy has massed, and accept thin odds for speed.';
  const fitParagraph = campaignEnabled
    ? `\n${POSTURE_FIT_PARAGRAPH}\n`
    : '';
  return `${subHeading(SECTION_TITLE_POSTURE_RULES)}

Your posture is what you put your effort into. The engine remembers it and ${effort} until you change it. Name it with "posture" in every reply. It holds for ${POSTURE_MIN_HOLD_TURNS} turns before it can change. Until you name one you are on overland by default.

${overland}
- maritime: build ships to your full cap and lift up to half your ground units. Sea and air options come first. Like the Pacific island-hopping campaign: land where the enemy is weak and bypass where it is strong.
- strangle: keep queuing a missile in a city that reaches an enemy city until you are at the missile cap, bank more credits, and strike city, airport, and seaport cells before units. Like the Combined Bomber Offensive and the Battle of the Atlantic: destroy what builds and moves the enemy's force.
${blitz}
${fitParagraph}
The historical names are illustrations of an idea. Decide from the map and the tables in front of you, not from how those campaigns went.`;
}
