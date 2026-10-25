/**
 * Strategic coaching items from strategic-prompt.md section 4, plus the context-block doctrine.
 *
 * Purpose: Nineteen gated bullets live here so the composer stays small and this file stays under the size limit.
 * When to use: Only via `buildCoachingBullets` / `buildContextCoaching`.
 * Expected outcome: Strategic-only items (win paths, production, memory, ferry, home overlap) never leak into tactical.
 * Exceptions: None.
 */

import { PRODUCTION_CAP_QUEUE_GUIDANCE } from '../../productionCaps';
import { logTrace } from '../../logger';
import { regionalWinPathsBullet } from '../scenarioGoals';
import { buildDoctrineBlock } from './doctrineText';
import {
  buildCasualtySortRule,
  buildDestinationOccupancyRule,
  buildHoldFireRule,
} from './gameRuleText';
import type { CoachingGates } from './coachingGates';
import { buildOptionCopyOrRoutingBullet } from './optionCopyText';

/**
 * Five-goal list, doctrine, and message guidance for the strategic context block.
 *
 * Purpose: These used to live in the assembler; they are coaching, not computed state.
 * When to use: `buildContextCoaching` in strategic mode.
 * Expected outcome: The existing `- Your goals are:` / strategy / message wording so matrix tests stay stable.
 * Exceptions: None.
 */
export function buildStrategicContextCoaching(gates: CoachingGates): string {
  const doctrine = buildDoctrineBlock(gates.doctrine ?? 'balanced');
  logTrace('promptSpec buildStrategicContextCoaching', {
    includeScenarioWinPaths: gates.includeScenarioWinPaths,
    doctrineBlock: doctrine.length > 0,
  });
  const doctrineLine = doctrine.length > 0 ? `\n${doctrine}` : '';
  return `${buildStrategicGoalsBlock(gates)}
${STRATEGY_BLOCK}${doctrineLine}
${MESSAGE_BLOCK}`;
}

/**
 * Section-4 strategic bullets for the current gates.
 *
 * Purpose: One list the composer can concatenate; each item is omitted when its gate is off.
 * When to use: `buildCoachingBullets` in strategic mode.
 * Expected outcome: Markdown bullets. Copy-row vs routing-tool is selected by `hasBestOptionsTable`.
 * Exceptions: None.
 */
export function buildStrategicCoachingBullets(gates: CoachingGates): readonly string[] {
  logTrace('promptSpec buildStrategicCoachingBullets', { ...gates });
  const bullets: string[] = [];
  if (gates.includeScenarioWinPaths) {
    const winPaths = typeof gates.controlWinMinUrbanShare === 'number'
      ? regionalWinPathsBullet(gates.controlWinMinUrbanShare)
      : WIN_PATHS_BULLET;
    bullets.push(gates.turnLimitVictory ? `${winPaths}${TURN_LIMIT_WIN_SENTENCE}` : winPaths);
  }
  if ((gates.seatCount ?? 0) >= 3) bullets.push(FREE_FOR_ALL_BULLET);
  bullets.push(RESOLUTION_ORDER_BULLET, tempoBullet(gates.hasAirUnits));
  if (gates.ordersEnabled) bullets.push(`- ${buildHoldFireRule()}`);
  bullets.push(`- ${buildCasualtySortRule()}`);
  bullets.push(buildOptionCopyOrRoutingBullet(gates, 'this-turn', 'unit'));
  bullets.push(`- ${buildDestinationOccupancyRule(gates.coordinateMode)}`);
  if (gates.ordersEnabled) {
    bullets.push(ORDERLESS_BULLET);
    bullets.push(LEAVE_MISSIONS_BULLET);
  }
  if (gates.hasAirUnits) bullets.push(IDLE_AIR_BULLET);
  if (gates.hasNavalUnits) {
    bullets.push(NAVAL_ROUTING_BULLET);
    bullets.push(SEALIFT_BULLET);
  }
  if (!gates.hasObservedEnemy) bullets.push(SCOUTING_BULLET);
  if (gates.productionEnabled) bullets.push(PRODUCTION_BULLET);
  if (gates.includeScenarioWinPaths && gates.homeRegionsOverlap) bullets.push(SHARED_HOME_BULLET);
  if (gates.memoryEnabled) bullets.push(MEMORY_BULLET);
  bullets.push(CALLBACK_BULLET);
  bullets.push(UNCONSULTED_TURN_BULLET);
  bullets.push(MESSAGE_DISCIPLINE_BULLET);
  bullets.push(TOOL_BUDGET_BULLET);
  return bullets;
}

/**
 * Goals list for the strategic context block.
 *
 * Purpose: Five numbered objectives so territorial and production effort has a named target.
 * When to use: `buildStrategicContextCoaching`.
 * Expected outcome: Five numbered objectives when the region-versus-region scenario is active; otherwise the first three only.
 * Exceptions: None.
 */
function buildStrategicGoalsBlock(gates: CoachingGates): string {
  const homeRegionGoals = gates.includeScenarioWinPaths
    ? `
    (4) Protect your home region's production capacity
    (5) Degrade or eliminate enemy home regions' urban production capacity`
    : '';
  return `- Your goals are:
    (1) Engage enemy forces to reduce their combat effectiveness
    (2) Disperse your units to maximize visibility
    (3) Maximize your own unit production${homeRegionGoals}`;
}

/**
 * Doctrine lines shared with the tactical context block.
 *
 * Purpose: Judgment aids with no engine symbol; presented as doctrine, not as rules.
 * When to use: Both mode context builders.
 * Expected outcome: Speed, gaps, and disruption.
 * Exceptions: None.
 */
export const STRATEGY_BLOCK = `- Your strategy is:
    (1) Use speed, surprise, and initiative to break the enemy's cohesion and morale
    (2) Attack the enemy's weaknesses (gaps) and avoid their strengths (surfaces)
    (3) Create maximum disruption with minimum force`;

/**
 * Player-facing message discipline for the context block.
 *
 * Purpose: `message` is psychological warfare and must not leak operations.
 * When to use: Both mode context builders.
 * Expected outcome: Taunt-or-threat wording with no cells, ids, or intent.
 * Exceptions: None.
 */
export const MESSAGE_BLOCK = `- Your message is:
    Address your enemies in character, as their enemy commander. Deliver a one-line taunt or threat meant to unnerve them. Psychological warfare only — do not reveal real orders, hex codes, unit ids, or operational intent.`;

/**
 * Names the two strategic win paths.
 *
 * Purpose: Territorial effort needs a target; the scenario-objective section is easy to skip.
 * When to use: When `includeScenarioWinPaths` is true.
 * Expected outcome: Control of enemy home hexes, or destruction of enemy home production.
 * Exceptions: None.
 */
const WIN_PATHS_BULLET =
  '- Win by being the last side standing: knock out each enemy by controlling its home region, or by destroying or taking all of its cities. Those are the cells that matter.';

/**
 * Free-for-all reminder for a match of three or more seats.
 *
 * Purpose: With more than one enemy, a side fighting someone else is not an ally.
 * When to use: Immediately after the win-path bullet when `seatCount` is at least 3.
 * Expected outcome: The bullet. Neutral garrisons hold and fire, and a loaded ship still sails, unloads, and holds.
 * Exceptions: None.
 */
const FREE_FOR_ALL_BULLET =
  '- Every other side is your enemy, and they are enemies of each other. A side busy fighting a third side is exposed; a side about to knock out another may become the strongest. Neutral garrisons hold their hexes and fire on anything in range. A loaded ship sails to a landing, unloads, and then holds.';

/**
 * Extra win-path sentence for a turn-limit match.
 *
 * Purpose: Last-side-standing is not the only ending when a turn limit is stored.
 * When to use: Appended to the win-path bullet when `turnLimitVictory` is true.
 * Expected outcome: A leading space and the most-city-hexes sentence.
 * Exceptions: None.
 */
const TURN_LIMIT_WIN_SENTENCE = ' If the turn limit arrives first, the most city hexes wins.';

/**
 * Restates the full turn resolution order.
 *
 * Purpose: Firing-then-closing and ferry-after-movement cannot be inferred from "ranged uses pre-move positions" alone.
 * When to use: Always in strategic coaching.
 * Expected outcome: Embark, air strikes, ranged fire, movement, cargo sync, ferry, melee.
 * Exceptions: None.
 */
const RESOLUTION_ORDER_BULLET =
  '- This turn resolves as embark, then air strikes, then ranged fire, then movement, then cargo sync, then ferry, then melee. A unit that fires can still move, and a ferried air unit arrives after ground movement.';

/**
 * A listed shot costs no movement, so copy it from Best Options.
 *
 * Purpose: The model copies listed rows and must not invent a target. The sentence does not describe the engine filling omitted shots.
 * When to use: Always in strategic coaching.
 * Expected outcome: Names an air-strike row only when an air unit exists. Tells the model not to invent a target. Mentions that firing does not consume the move.
 * Exceptions: None.
 */
function tempoBullet(hasAirUnits: boolean): string {
  const listedRows = hasAirUnits ? 'a ranged or air-strike row' : 'a ranged row';
  return `- Every unit with ${listedRows} in Best Options This Turn should be given that shot, chosen from the listed rows, because the shot resolves from the turn-start position and does not consume the move. Do not invent a target the table does not list.`;
}

/**
 * Orderless units need a mission this turn.
 *
 * Purpose: The orderless table is the worklist. A bare hex is a march, including a home-region hex that may be beyond this turn's budget. A cell that starts with defend is defend. An em dash is not a march.
 * When to use: When standing-order tools are enabled.
 * Expected outcome: A bare hex is marched to and may be enemy-occupied. A defend cell is defend on that hex, including a striking air unit. An em dash is not a march. Defend on the current hex is only for an already observed enemy the unit is on, or cannot close on. An explicit move copies a Best Options hex, not a farther suggested march.
 * Exceptions: None.
 */
const ORDERLESS_BULLET =
  '- For every unit listed under ## Units Without Standing Orders, add an orders[] entry with action assign_order. When Suggested Destination is a bare hex, march there. That hex may be the enemy-occupied hex. When an enemy is observed, it is a legal destination that closes on the nearest enemy. When no enemy is observed, that hex may lie beyond this turn\'s movement budget; it is still the march destination. Use pursue only when you supply an enemy unit id, not in place of that hex. When Suggested Destination starts with defend, assign defend on that hex, including an air unit that can strike. Do not march an air unit. When the cell is —, do not invent a march. Assign defend on its current hex only when an enemy is already observed and the unit is on that enemy or has no closing step. Never march to the unit\'s current Hex; that order is dropped as already arrived and the unit stays idle. Copy a Suggested Destination hex into explicit_move only when Best Options lists that same hex for that unit this turn. Otherwise, when you need a one-step explicit_move this turn, copy a Best Options approach or move/melee Target Hex for that unit. That hex is already inside this turn\'s movement budget, including weather. Do not copy a farther hex from the printed nearest-enemy path.';

/**
 * Working standing orders should be left alone.
 *
 * Purpose: Re-issuing a healthy order wastes the turn and can stall the unit.
 * When to use: When standing-order tools are enabled.
 * Expected outcome: Mentions a healthy standing order, the attention column, and this-turn move/melee as an override.
 * Exceptions: None.
 */
const LEAVE_MISSIONS_BULLET =
  '- Units with a healthy standing order do not need explicit orders from you unless you want to override their current mission this turn; the attention column marks stalled orders and marches whose next move recedes from the nearest enemy. A this-turn move/melee Target Hex is such an override — copy it even when the unit is already marching. After a unit fires, do not leave it on a standing march that recedes from that enemy: assign defend to hold contact, cancel the march, or remarch toward the enemy.';

/**
 * Idle air should ferry toward the fight when its base can still launch.
 *
 * Purpose: An air unit only contributes inside strike radius; rebasing is free of other actions that turn.
 * When to use: When the opponent has air units.
 * Expected outcome: Ferry toward the fighting only when Base Intact and Base Controlled are yes, even on defend; never strike and ferry.
 * Exceptions: None.
 */
const IDLE_AIR_BULLET =
  '- For every air unit with no strike listed in Best Options, take its ferry Target Hex toward the fighting, but only when Air Operations Status shows that unit\'s Base Intact and Base Controlled columns as yes. Issue that ferry even when the unit is holding on defend. An air unit cannot strike and ferry on the same turn.';

/**
 * Naval units reach land targets from water or coastal cells.
 *
 * Purpose: Naval units cannot enter land cells.
 * When to use: When the opponent has naval units.
 * Expected outcome: Route to the nearest water or coastal cell within range.
 * Exceptions: None.
 */
const NAVAL_ROUTING_BULLET =
  '- Naval units cannot enter land cells; to engage a land target, move to the nearest water or coastal cell within range.';

/**
 * Sealift is embark, move, disembark from a legal cell.
 *
 * Purpose: Crossing water is a three-step action with an embark-legality rule.
 * When to use: When the opponent has naval units.
 * Expected outcome: Mentions embark at a legal cell, then transport, then disembark.
 * Exceptions: None.
 */
const SEALIFT_BULLET =
  '- When land force must cross water, embark at a legal cell, move the transport, then disembark; loading requires a coastal cell, a land seaport, or a controlled seaport on transit water. Use the # Naval Transport Status section for each naval unit (capacity, cargo already aboard, nearest embark hex). While embarked, explicit_move and disembark both clear cargo and march in one action.';

/**
 * Scout when the observed roster is empty.
 *
 * Purpose: Holding still when blind never restores contact.
 * When to use: When no enemy unit is observed.
 * Expected outcome: Move to regain contact rather than hold.
 * Exceptions: None.
 */
const SCOUTING_BULLET =
  '- With no enemy observed, move to regain contact along plausible approaches rather than holding position.';

/**
 * Keep production queued, including the cap-swap rule.
 *
 * Purpose: An empty legal queue is wasted income; a capped queue should be swapped unless every type is capped.
 * When to use: When production tools are enabled.
 * Expected outcome: Queue something when empty; leave the queue when every available type is capped.
 * Exceptions: None.
 */
const PRODUCTION_BULLET =
  '- When a controlled cell can build and its queue is empty, queue something. ' +
  PRODUCTION_CAP_QUEUE_GUIDANCE +
  ' When every available type for that cell is capped, leave the queue alone so it resumes when the cap frees.';

/**
 * Shared home cells count for every home that lists them.
 *
 * Purpose: Holding the intersection is both defence and attack.
 * When to use: When more than one home region lists the same cells.
 * Expected outcome: Mentions that shared cells count toward each of those sides.
 * Exceptions: None.
 */
const SHARED_HOME_BULLET =
  '- When more than one home region lists the same cells, the listed shared cells count toward each of those sides, so holding them serves defence and attack at once.';

/**
 * Persist intent, not briefing data.
 *
 * Purpose: Enemy positions are supplied fresh each turn; persisting them wastes slots and goes stale.
 * When to use: When memory tools are enabled.
 * Expected outcome: Short persistent note of objectives; do not persist enemy positions or rosters.
 * Exceptions: None.
 */
const MEMORY_BULLET =
  '- Write a short persistent note naming this turn\'s objectives and the units assigned to them. Always include a memoryUpdates write this turn when persistent slots are unused. Do not persist enemy positions or rosters, which the briefing already supplies fresh each turn.';

/**
 * Callbacks replace the whole subscription list.
 *
 * Purpose: Omitting a still-wanted subscription clears it.
 * When to use: Always in strategic coaching.
 * Expected outcome: Mentions the event vocabulary, that the response replaces the entire subscription list, and that omit or [] clears.
 * Exceptions: None.
 */
const CALLBACK_BULLET =
  '- Subscribe only to events from the engine\'s event vocabulary; the response replaces the entire subscription list, so repeat every subscription you still want. Omit the array or send [] to clear every subscription. An empty Active Callbacks table means you have no self-chosen triggers; under event-driven policy only engine-forced consultations remain unless you subscribe now.';

/**
 * A turn without a consultation is a turn the model did not act in.
 *
 * Purpose: Under event-driven policy the model is asked only when an event fires or the engine forces a consult.
 * When to use: Always in strategic coaching, matching the battle unconsulted-beat item.
 * Expected outcome: Names subscribed events, engine-forced consults, and that a skipped turn issued nothing.
 * Exceptions: None.
 */
const UNCONSULTED_TURN_BULLET =
  '- The model is consulted when a subscribed event fires or when the engine forces a consultation; a turn it is not consulted for is a turn in which it issued nothing.';

/**
 * Message field discipline, as a section-4 item.
 *
 * Purpose: Same rule as the context-block message lines, restated where the model looks for "what to do".
 * When to use: Always in both modes.
 * Expected outcome: Taunt or threat; must not reveal orders, cells, ids, or intent.
 * Exceptions: None.
 */
export const MESSAGE_DISCIPLINE_BULLET =
  '- The message field is a taunt or threat and must not reveal orders, cells, unit ids, or intent.';

/**
 * Tool rounds are limited and exhaustion submits nothing.
 *
 * Purpose: Spending the budget on known facts loses the turn.
 * When to use: Always in strategic coaching.
 * Expected outcome: Mentions that exhausting them submits nothing; submit once destinations are chosen.
 * Exceptions: None.
 */
const TOOL_BUDGET_BULLET =
  '- Rounds are limited and exhausting them submits nothing at all; once destinations are chosen, submit.';
