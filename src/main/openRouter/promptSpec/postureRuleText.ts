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
import { SECTION_TITLE_POSTURE_RULES, subHeading } from './sectionHeadings';

/**
 * The Postures block of the system prompt.
 *
 * Purpose: The commander can choose a posture without the historical names being options.
 * When to use: After the Operations block, when `postureEnabled` is true.
 * Expected outcome: The heading from `subHeading` and the text below. The hold number is `POSTURE_MIN_HOLD_TURNS`.
 * Exceptions: None.
 */
export function buildPostureRuleBlock(): string {
  logTrace('promptSpec buildPostureRuleBlock', { holdTurns: POSTURE_MIN_HOLD_TURNS });
  return `${subHeading(SECTION_TITLE_POSTURE_RULES)}

Your posture is what you put your effort into. The engine remembers it and leans production, operations, and the campaign the same way until you change it. Set it with "posture" in your reply. It holds for ${POSTURE_MIN_HOLD_TURNS} turns before it can change. If you never set one you are on overland.

- overland: mass your ground units and march. Land options come first. Like the Soviet summer offensive of 1944: mass, then break through.
- maritime: build ships to your full cap and lift up to half your ground units. Sea and air options come first. Like the Pacific island-hopping campaign: land where the enemy is weak and bypass where it is strong.
- strangle: keep queuing a missile in a city that reaches an enemy city until you are at the missile cap, bank more credits, and strike city, airport, and seaport cells before units. Like the Combined Bomber Offensive and the Battle of the Atlantic: destroy what builds and moves the enemy's force.
- blitz: assault with half the usual mass, run twice the air operations, and let the engine launch against a lightly held objective. Like the 1940 campaign in France: strike before the enemy has massed, and accept thin odds for speed.

The historical names are illustrations of an idea. Decide from the map and the tables in front of you, not from how those campaigns went.`;
}
