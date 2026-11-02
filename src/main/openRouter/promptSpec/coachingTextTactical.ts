/**
 * Tactical coaching items from tactical-prompt.md section 4, plus the context-block doctrine.
 *
 * Purpose: Battle consultations must not carry strategic win, production, or memory advice.
 * When to use: Only via `buildCoachingBullets` / `buildContextCoaching`.
 * Expected outcome: The beat coaching list, gated on air, naval, and the AI-only exit flag. The copy-or-route sentence stays the same when Best Options has no rows.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import type { CoachingGates } from './coachingGates';
import { buildDoctrineBlock } from './doctrineText';
import { MESSAGE_BLOCK, MESSAGE_DISCIPLINE_BULLET, STRATEGY_BLOCK } from './coachingTextStrategic';
import { buildOptionCopyOrRoutingBullet } from './optionCopyText';

/**
 * Engage-priority, doctrine, and message guidance for the tactical context block.
 *
 * Purpose: Battle prompts keep a single engage priority instead of the five strategic goals.
 * When to use: `buildContextCoaching` in tactical mode.
 * Expected outcome: The priority, the strategy list, an aggressive or cautious block when that doctrine is set, and the message. Balanced adds nothing between the strategy list and the message.
 * Exceptions: None.
 */
export function buildTacticalContextCoaching(gates: CoachingGates): string {
  const doctrine = buildDoctrineBlock(gates.doctrine ?? 'balanced');
  logTrace('promptSpec buildTacticalContextCoaching', { doctrineBlock: doctrine.length > 0 });
  const doctrineLine = doctrine.length > 0 ? `\n${doctrine}` : '';
  return `${TACTICAL_PRIORITY_BLOCK}
${STRATEGY_BLOCK}${doctrineLine}
${MESSAGE_BLOCK}`;
}

/**
 * Section-4 tactical bullets for the current gates.
 *
 * Purpose: Same membership test as strategic, with battle substitutions.
 * When to use: `buildCoachingBullets` in tactical mode.
 * Expected outcome: No home-region, production, memory, or assign_order coaching.
 * Exceptions: None.
 */
export function buildTacticalCoachingBullets(gates: CoachingGates): readonly string[] {
  logTrace('promptSpec buildTacticalCoachingBullets', { ...gates });
  const bullets: string[] = [
    tempoBullet(gates.hasAirUnits),
    STANDING_ORDERS_INERT_BULLET,
    buildOptionCopyOrRoutingBullet(gates, 'this-beat', 'sub-unit'),
    REACH_BULLET,
  ];
  if (gates.hasAirUnits) bullets.push(AIR_STRIKE_BULLET);
  if (gates.hasNavalUnits) bullets.push(SEALIFT_BULLET);
  bullets.push(CALLBACK_BULLET);
  bullets.push(UNCONSULTED_BEAT_BULLET);
  bullets.push(MESSAGE_DISCIPLINE_BULLET);
  if (gates.includeExitBattle === true) bullets.push(EXIT_BATTLE_BULLET);
  return bullets;
}

/**
 * Single engage priority for the tactical context block.
 *
 * Purpose: Regional win wording in a beat sends the model chasing territory it cannot reach.
 * When to use: `buildTacticalContextCoaching`.
 * Expected outcome: One priority line.
 * Exceptions: None.
 */
const TACTICAL_PRIORITY_BLOCK =
  '- Your priority is to engage enemy forces and inflict losses when advantageous';

/**
 * Fire every beat; shots cost no movement.
 *
 * Purpose: Same tempo rule as strategic, with beat nouns.
 * When to use: Always in tactical coaching.
 * Expected outcome: Names an air-strike row only when an air sub-unit exists. Tells the model to skip a row whose Odds show wipe below 50% and lose at least 50%, and not to invent a target. Mentions that firing does not use the move.
 * Exceptions: None.
 */
function tempoBullet(hasAirUnits: boolean): string {
  const listed = hasAirUnits
    ? 'Copy a listed shot, including an air-strike row, from Best Options'
    : 'Copy a listed shot from Best Options';
  return `- ${listed} unless its Odds show wipe below 50% and lose at least 50%. An em dash is not that case. A shot resolves before movement and does not use the move. Do not invent a target.`;
}

/**
 * Standing orders do not move sub-units in battle.
 *
 * Purpose: A sub-unit with a move option and no order is idle for the beat.
 * When to use: Always in tactical coaching.
 * Expected outcome: Mentions that standing orders do not move sub-units.
 * Exceptions: None.
 */
const STANDING_ORDERS_INERT_BULLET =
  '- Standing orders do not move sub-units in battle, so a sub-unit with a move option and no order is idle for the beat.';

/**
 * A too-far destination is clamped, not rejected.
 *
 * Purpose: Ordering a far cell advances the sub-unit rather than failing, but does not teleport it.
 * When to use: Always in tactical coaching.
 * Expected outcome: Mentions clamping to the first reachable leg, and the hold when that shortened step would leave a cell the sub-unit can already shoot from.
 * Exceptions: None.
 */
const REACH_BULLET =
  "- A destination beyond this beat's point budget is clamped to the first reachable leg. When that shortened step is not the ordered cell and the sub-unit can already shoot, the move is dropped unless the step enters a cell that holds an enemy.";

/**
 * Air strikes reach the whole battle, once.
 *
 * Purpose: The strategic strike radius does not apply; strike or ferry to an intact airport, not both.
 * When to use: When the opponent has air sub-units.
 * Expected outcome: Strike any cell in the footprint or ferry to an airport cell; cannot do both.
 * Exceptions: None.
 */
const AIR_STRIKE_BULLET =
  '- An air sub-unit may strike any cell in the footprint or ferry to an intact airport cell in the footprint; it cannot strike and ferry in the same beat.';

/**
 * Sealift still works inside the footprint.
 *
 * Purpose: Included only when the naval status section is present.
 * When to use: When the opponent has naval sub-units.
 * Expected outcome: Mentions Naval Transport Status and embark / transport_move / disembark.
 * Exceptions: None.
 */
const SEALIFT_BULLET =
  '- Sealift (when Naval Transport Status is present): issue embark / transport_move / disembark in orders[] as needed; while embarked, explicit_move and disembark both clear cargo and march in one action.';

/**
 * Callbacks use sub-unit ids and die with the battle.
 *
 * Purpose: Strategic unit ids are not valid in a beat, and leftover subscriptions would fire on the wrong roster.
 * When to use: Always in tactical coaching.
 * Expected outcome: Sub-unit ids, replace-whole-list including omit/[] clear, and cleared when the battle ends.
 * Exceptions: None.
 */
const CALLBACK_BULLET =
  '- Unit-scoped callbacks use sub-unit ids; the response replaces the entire subscription list, so omit the array or send [] to clear every subscription this beat; all of them are also cleared when the battle ends. An empty Active Callbacks table means you have no self-chosen triggers; under event-driven policy only engine-forced consultations remain unless you subscribe now.';

/**
 * An unconsulted beat is a beat the model did not act in.
 *
 * Purpose: Under event-driven policy the model is asked when a subscribed event fires or the engine forces a consult. Standing orders do not move sub-units, so a skipped beat is idle.
 * When to use: Always in tactical coaching.
 * Expected outcome: Consulted when a subscribed event fires or when the engine forces a consultation; otherwise the sub-units issued nothing.
 * Exceptions: None.
 */
const UNCONSULTED_BEAT_BULLET =
  '- The model is consulted when a subscribed event fires or when the engine forces a consultation; a beat it is not consulted for is a beat in which its sub-units issued nothing.';

/**
 * Tells an AI-only commander when to leave the battle.
 *
 * Purpose: The beat still resolves this reply's orders. The flag only asks to end the battle afterward.
 * When to use: `buildTacticalCoachingBullets` when `includeExitBattle` is true.
 * Expected outcome: The locked sentence, including that a missing or false flag stays in the battle.
 * Exceptions: None.
 */
const EXIT_BATTLE_BULLET =
  '- Set exitBattle to true when your side has an overwhelming numerical advantage, or when you have no order you can legally give. Set it to false otherwise. Orders in this reply still resolve for this beat.';

