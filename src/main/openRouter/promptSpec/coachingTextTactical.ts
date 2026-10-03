/**
 * Tactical coaching items from tactical-prompt.md section 4, plus the context-block doctrine.
 *
 * Purpose: Battle consultations must not carry strategic win, production, or memory advice.
 * When to use: Only via `buildCoachingBullets` / `buildContextCoaching`.
 * Expected outcome: Eleven-plus required items, gated on air, naval, and the options table.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import { RANGED_RANGE_BY_UNIT_TYPE } from '../../../shared/tacticalRanges';
import {
  buildCasualtySortRule,
  buildDestinationOccupancyRule,
  tacticalLandEnterCostRule,
} from './gameRuleText';
import type { CoachingGates } from './coachingGates';
import { MESSAGE_BLOCK, MESSAGE_DISCIPLINE_BULLET, STRATEGY_BLOCK } from './coachingTextStrategic';
import { buildOptionCopyMappingClause } from './optionCopyText';

/**
 * Engage-priority, doctrine, and message guidance for the tactical context block.
 *
 * Purpose: Battle prompts keep a single engage priority instead of the five strategic goals.
 * When to use: `buildContextCoaching` in tactical mode.
 * Expected outcome: Existing `- Your priority is:` / strategy / message wording.
 * Exceptions: None.
 */
export function buildTacticalContextCoaching(): string {
  logTrace('promptSpec buildTacticalContextCoaching', {});
  return `${TACTICAL_PRIORITY_BLOCK}
${STRATEGY_BLOCK}
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
    optionCopyOrRoutingBullet(gates),
    REACH_BULLET,
    INFANTRY_REACH_BULLET,
  ];
  if (gates.hasAirUnits) bullets.push(AIR_STRIKE_BULLET);
  bullets.push(`- ${buildCasualtySortRule()}`);
  bullets.push(`- ${buildDestinationOccupancyRule(gates.coordinateMode)}`);
  if (gates.hasNavalUnits) bullets.push(SEALIFT_BULLET);
  bullets.push(CALLBACK_BULLET);
  bullets.push(UNCONSULTED_BEAT_BULLET);
  bullets.push(MESSAGE_DISCIPLINE_BULLET);
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
 * Expected outcome: Names air strike only when an air sub-unit exists; mentions that firing does not consume the move.
 * Exceptions: None.
 */
function tempoBullet(hasAirUnits: boolean): string {
  const shot = hasAirUnits ? 'a ranged_attack or air strike' : 'a ranged_attack';
  return `- Every sub-unit with a legal shot should be given ${shot}, and you choose each target, because attacks resolve from beat-start positions and firing does not consume the move.`;
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
 * Expected outcome: Mentions clamping to the first reachable leg, the one-point urban or rubble budget, and the shared land enter-cost rule.
 * Exceptions: None.
 */
const REACH_BULLET =
  "- A destination beyond this beat's point budget is clamped to the first reachable leg rather than rejected. Infantry or armor whose current cell is urban or rubble has a 1-point budget this beat. " +
  tacticalLandEnterCostRule();

/**
 * Infantry and armor have res4 reach, with terrain caps the strategic rule does not have.
 *
 * Purpose: A model carrying strategic melee-only infantry or baseline-5 armor into a beat will order illegal shots.
 * When to use: Always in tactical coaching.
 * Expected outcome: States res4 baselines, the range-1 cap, mountain line of sight for armor and naval, and that air strikes and ferry are not blocked by mountains.
 * Exceptions: None.
 */
const INFANTRY_REACH_BULLET =
  `- Infantry and armor fire at res4 baselines of ${RANGED_RANGE_BY_UNIT_TYPE.infantry} and ${RANGED_RANGE_BY_UNIT_TYPE.armor}; forest, urban, or rubble caps them to range 1. Mountain along the line of sight blocks armor and naval. Air strikes and ferry are not blocked by mountains. Close to melee when out of reach.`;

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
 * Purpose: Under event-driven policy, standing orders are inert, so a skipped beat is idle.
 * When to use: Always in tactical coaching.
 * Expected outcome: Consulted only when a subscribed event fires; otherwise the sub-units issued nothing.
 * Exceptions: None.
 */
const UNCONSULTED_BEAT_BULLET =
  '- The model is consulted only when a subscribed event fires; a beat it is not consulted for is a beat in which its sub-units issued nothing.';

/**
 * Copy listed option rows, or send the model to the routing tool.
 *
 * Purpose: Same no-options failure mode as strategic, with sub-unit wording.
 * When to use: Tactical option-copy item.
 * Expected outcome: Copy-row wording when the table exists; otherwise the routing tool when planning is on.
 * Exceptions: None.
 */
function optionCopyOrRoutingBullet(gates: CoachingGates): string {
  if (gates.hasBestOptionsTable) {
    const routing = gates.planningEnabled
      ? ' Call plan_route only for a destination the table does not list for that sub-unit.'
      : '';
    return (
      '- Best Options This Turn Target Hexes are already this-beat legal destinations. ' +
      buildOptionCopyMappingClause({
        actorNoun: 'sub-unit',
        hasAirUnits: gates.hasAirUnits,
        includeFerryMapping: gates.hasAirUnits,
      }) +
      routing
    );
  }
  if (gates.planningEnabled) {
    return '- No options are listed this period. Destinations must come from the routing tool, not from an absent options table.';
  }
  return '- No options are listed this period. Destinations come only from the adjacent-cell listing; the sub-unit\'s own cell means hold.';
}
