/**
 * Strategic coaching items from strategic-prompt.md section 4, plus the context-block doctrine.
 *
 * Purpose: The gated strategic bullets live here so the composer stays small and this file stays under the size limit.
 * When to use: Only via `buildCoachingBullets` / `buildContextCoaching`.
 * Expected outcome: Strategic-only items (win paths, production, memory, ferry, home overlap) never leak into tactical.
 * Exceptions: None.
 */

import { getRange } from '../../combatConstants';
import { PRODUCTION_CAP_QUEUE_GUIDANCE } from '../../productionCaps';
import { PRODUCTION_EXPOSED_RADIUS } from '../productionExposure';
import { logTrace } from '../../logger';
import { missileRangeHexes } from '../../../shared/gameRules';
import { AIR_STRIKE_RANGE_HEXES } from '../../../shared/tacticalRanges';
import { regionalWinPathsBullet } from '../scenarioGoals';
import { buildStrategicDoctrineBlock } from './doctrineText';
import type { CoachingGates } from './coachingGates';
import { buildOptionCopyOrRoutingBullet } from './optionCopyText';
import { SECTION_TITLE_PAUSED_QUEUES, SECTION_TITLE_PRODUCTION_PRIORITIES, SECTION_TITLE_PRODUCTION_STATUS } from './sectionHeadings';
import {
  SECTION_TITLE_AIR_AND_NAVAL_UNITS,
  SECTION_TITLE_MEMORY_AND_CALLBACKS,
  SECTION_TITLE_MESSAGES_AND_ROUNDS,
  SECTION_TITLE_PRODUCTION_QUEUES,
  SECTION_TITLE_STANDING_ORDERS_GUIDANCE,
  SECTION_TITLE_USING_THE_BRIEFING,
  SECTION_TITLE_WINNING,
} from './subsectionHeadings';
import { buildCampaignRuleBlock } from './campaignRuleText';
import { buildOperationRuleBlock } from './operationRuleText';

/**
 * Five-goal list, doctrine, and message guidance for the strategic context block.
 *
 * Purpose: These used to live in the assembler; they are coaching, not computed state.
 * When to use: `buildContextCoaching` in strategic mode.
 * Expected outcome: The goals, the strategy lines, the tools block when a gate holds, the doctrine block, and the message. When `campaignEnabled` is true, the Campaign section follows that block. When `operationsEnabled` is true, the Operations section follows the campaign section, or the context block when the campaign section is absent.
 * Exceptions: None.
 */
export function buildStrategicContextCoaching(gates: CoachingGates): string {
  const campaignEnabled = gates.campaignEnabled === true;
  const doctrine = buildStrategicDoctrineBlock(gates.doctrine ?? 'balanced', campaignEnabled);
  const tools = buildStrategicToolsBlock(gates);
  logTrace('promptSpec buildStrategicContextCoaching', {
    includeScenarioWinPaths: gates.includeScenarioWinPaths,
    campaignEnabled,
    doctrineBlock: doctrine.length > 0,
    toolsBlock: tools.length > 0,
  });
  const doctrineLine = doctrine.length > 0 ? `\n${doctrine}` : '';
  const toolsLine = tools.length > 0 ? `\n${tools}` : '';
  const message = `${buildStrategicGoalsBlock(gates)}
${buildStrategyBlock('strategic')}${toolsLine}${doctrineLine}
${MESSAGE_BLOCK}`;
  const withCampaign = gates.campaignEnabled === true ? `${message}\n\n${buildCampaignRuleBlock()}` : message;
  return gates.operationsEnabled === true ? `${withCampaign}\n\n${buildOperationRuleBlock(gates.operationsEnabled === true)}` : withCampaign;
}

/**
 * Scouting reminder. It does not depend on whether an enemy is visible this turn.
 *
 * Purpose: The situation message no longer repeats a scouting sentence, and the cached coaching always carries it.
 * When to use: Every strategic coaching list, immediately after the copy-or-route bullet.
 * Expected outcome: One bullet telling the model to move along plausible approaches when the briefing shows no enemy.
 * Exceptions: None.
 */
const SCOUTING_BULLET =
  '- When the briefing shows no observed enemy unit, move to regain contact along plausible approaches rather than holding position.';

/**
 * One coaching section: a title and the bullets whose gates hold.
 *
 * Purpose: Orders Guidance prints these as subsections. The flat bullet list is their concatenation.
 * When to use: `buildCoachingSections` in strategic mode.
 * Expected outcome: Sections with no bullets are omitted. Scouting is always in Using the Briefing.
 * Exceptions: None.
 */
export function buildStrategicCoachingSections(gates: CoachingGates): readonly { readonly title: string; readonly bullets: readonly string[] }[] {
  logTrace('promptSpec buildStrategicCoachingSections', { ...gates });
  const winning: string[] = [];
  if (gates.includeScenarioWinPaths) {
    const winPaths = typeof gates.controlWinMinUrbanShare === 'number'
      ? regionalWinPathsBullet(gates.controlWinMinUrbanShare)
      : WIN_PATHS_BULLET;
    winning.push(gates.turnLimitVictory ? `${winPaths}${TURN_LIMIT_WIN_SENTENCE}` : winPaths);
  }
  if ((gates.seatCount ?? 0) >= 3) winning.push(FREE_FOR_ALL_BULLET);
  if (gates.includeScenarioWinPaths && gates.homeRegionsOverlap) winning.push(SHARED_HOME_BULLET);
  const usingTheBriefing = [
    buildOptionCopyOrRoutingBullet(gates, 'this-turn', 'unit'),
    SCOUTING_BULLET,
    FIRE_STILL_MOVES_BULLET,
    tempoBullet(gates.hasAirUnits),
  ];
  const standing: string[] = [];
  if (gates.ordersEnabled) standing.push(ORDERLESS_BULLET, LEAVE_MISSIONS_BULLET);
  const airAndNaval: string[] = [];
  if (gates.hasAirUnits) airAndNaval.push(IDLE_AIR_BULLET, AIRLIFT_PREFERENCE_BULLET);
  if (gates.hasNavalUnits) airAndNaval.push(NAVAL_ROUTING_BULLET, SEALIFT_BULLET);
  if (gates.hasMissileUnits === true) airAndNaval.push(MISSILE_LAUNCH_BULLET);
  const production = gates.productionEnabled ? [PRODUCTION_BULLET] : [];
  const memoryAndCallbacks = [
    ...(gates.memoryEnabled ? [memoryBullet(gates.campaignEnabled === true)] : []),
    CALLBACK_BULLET,
    UNCONSULTED_TURN_BULLET,
  ];
  const messages = [MESSAGE_DISCIPLINE_BULLET, TOOL_BUDGET_BULLET];
  return [
    { title: SECTION_TITLE_WINNING, bullets: winning },
    { title: SECTION_TITLE_USING_THE_BRIEFING, bullets: usingTheBriefing },
    { title: SECTION_TITLE_STANDING_ORDERS_GUIDANCE, bullets: standing },
    { title: SECTION_TITLE_AIR_AND_NAVAL_UNITS, bullets: airAndNaval },
    { title: SECTION_TITLE_PRODUCTION_QUEUES, bullets: production },
    { title: SECTION_TITLE_MEMORY_AND_CALLBACKS, bullets: memoryAndCallbacks },
    { title: SECTION_TITLE_MESSAGES_AND_ROUNDS, bullets: messages },
  ].filter((section) => section.bullets.length > 0);
}

/**
 * Section-4 strategic bullets for the current gates.
 *
 * Purpose: One flat list for tests that still read bullets rather than sections.
 * When to use: `buildCoachingBullets` in strategic mode.
 * Expected outcome: The section bullets, in section order. The scouting sentence is always present.
 * Exceptions: None.
 */
export function buildStrategicCoachingBullets(gates: CoachingGates): readonly string[] {
  logTrace('promptSpec buildStrategicCoachingBullets', { ...gates });
  return buildStrategicCoachingSections(gates).flatMap((section) => section.bullets);
}

/**
 * Capability lines for the strategic context block.
 *
 * Purpose: Each line ties one arm to a logistics goal, and only the arms this seat can use are numbered.
 * When to use: `buildStrategicContextCoaching`, between the strategy list and the doctrine block.
 * Expected outcome: An empty string when every gate is off. Otherwise a heading and lines numbered from 1.
 * Exceptions: None.
 */
export function buildStrategicToolsBlock(gates: CoachingGates): string {
  const objective = gates.campaignEnabled === true ? 'the campaign target' : 'your objective';
  const candidates = [
    {
      include: gates.hasMissileUnits === true || gates.canBuildMissile === true,
      text: `Missiles destroy city cells, airports, and seaports up to ${missileRangeHexes()} hexes away, beyond the reach of aircraft. Build one in a city that reaches a large enemy city, then launch it.`,
    },
    {
      include: gates.hasNavalUnits || gates.canBuildNaval === true,
      text: `Naval units shell any hex within ${getRange('naval')} of them, and carry ground units to a coast the enemy has left open.`,
    },
    {
      include: gates.hasAirUnits,
      text: `Air units strike within ${AIR_STRIKE_RANGE_HEXES} hexes of their airport, carry one infantry unit between airports, and drop it within ${AIR_STRIKE_RANGE_HEXES} hexes.`,
    },
    {
      include: gates.mercenariesAvailable === true,
      text: `Mercenaries are raised for credits in any explored city outside an enemy home region that holds no enemy unit. They do not count toward unit caps. Raise them beside ${objective}, or behind the enemy to split its force.`,
    },
  ];
  const kept = candidates.filter((line) => line.include);
  logTrace('promptSpec buildStrategicToolsBlock', { kept: kept.length });
  if (kept.length === 0) return '';
  const lines = kept.map((line, index) => `    (${index + 1}) ${line.text}`);
  return `- Your tools are:\n${lines.join('\n')}`;
}

/**
 * Goals list for the strategic context block.
 *
 * Purpose: Taking cities wins, so it is ranked first; massing comes second because piecemeal attacks fail.
 * When to use: `buildStrategicContextCoaching`.
 * Expected outcome: Six numbered objectives when the region-versus-region scenario is active; otherwise four.
 * Exceptions: None.
 */
function buildStrategicGoalsBlock(gates: CoachingGates): string {
  logTrace('promptSpec buildStrategicGoalsBlock', { includeScenarioWinPaths: gates.includeScenarioWinPaths });
  if (gates.includeScenarioWinPaths) {
    return `- Your goals are, in priority order:
    (1) Take and hold enemy cities. Taking cities is how you knock sides out.
    (2) Bring more force to each fight than the enemy can. Mass your ground units before an attack, and use ships, aircraft, and mercenaries to put units where the enemy is weak.
    (3) Stop the enemy doing the same. Destroy the city cells, airports, and seaports that build and move its units.
    (4) Keep enough units at home to stop a raid on your cities.
    (5) Keep every city building, and keep credits coming in for mercenaries.
    (6) Scout with a few units, not your main force.`;
  }
  return `- Your goals are, in priority order:
    (1) Destroy enemy forces where you outnumber them.
    (2) Mass your ground units before each attack. Units that arrive one at a time are destroyed one at a time.
    (3) Destroy the city cells, airports, and seaports that build and move enemy units.
    (4) Keep every city building.`;
}

/**
 * Strategy lines shared with the tactical context block.
 *
 * Purpose: Judgment aids with no engine symbol; presented as strategy, not as rules.
 * When to use: Both mode context builders. Pass the mode so the period word matches the consult.
 * Expected outcome: Outnumber, gaps, and a move toward the objective every turn or beat.
 * Exceptions: None.
 */
export function buildStrategyBlock(mode: 'strategic' | 'tactical'): string {
  const period = mode === 'tactical' ? 'beat' : 'turn';
  logTrace('promptSpec buildStrategyBlock', { mode });
  return `- Your strategy is:
    (1) Attack where you outnumber the defenders, and avoid fights where you do not.
    (2) Strike gaps the enemy cannot reinforce quickly.
    (3) Keep the initiative: move toward your objective every ${period}.`;
}

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
 * Expected outcome: A unit that fires can still move, and a ferried air unit arrives after ground movement. The full resolution order stays in the combat rules.
 * Exceptions: None.
 */
const FIRE_STILL_MOVES_BULLET =
  '- A unit that fires can still move, and a ferried air unit arrives after ground movement.';

/**
 * A listed shot costs no movement, so copy it from Best Options.
 *
 * Purpose: The model copies listed rows and must not invent a target. The sentence does not describe the engine filling omitted shots.
 * When to use: Always in strategic coaching.
 * Expected outcome: Names an air-strike row only when an air unit exists. Tells the model to skip a row whose Odds show Kill below 50% and Loss at least 50%, and not to invent a target. Mentions that firing does not use the move.
 * Exceptions: None.
 */
function tempoBullet(hasAirUnits: boolean): string {
  const listed = hasAirUnits
    ? 'Copy a listed shot, including an air-strike row, from Best Options'
    : 'Copy a listed shot from Best Options';
  return `- ${listed} unless its Odds show Kill below 50% and Loss at least 50%. An em dash is not that case. A shot resolves before movement and does not use the move. Do not invent a target.`;
}

/**
 * Orderless units need a mission this turn.
 *
 * Purpose: The orderless table is the worklist. A bare hex is a march, including a home-region hex that may be beyond this turn's budget. A cell that starts with defend is defend, including when no enemy is observed. An em dash is neither a march nor a defend.
 * When to use: When standing-order tools are enabled.
 * Expected outcome: A bare hex is marched to and may be enemy-occupied. A defend cell is defend on that hex, including when no enemy is observed. An em dash is not a march and not a defend. An explicit move copies a Best Options hex, not a farther suggested march.
 * Exceptions: None.
 */
const ORDERLESS_BULLET =
  '- For every unit listed in the Units Without Standing Orders table, add an orders[] entry with action assign_order. When Suggested Destination is a bare hex, march there. That hex may be the enemy-occupied hex. When an enemy is observed, it is a legal destination that closes on the nearest enemy. When no enemy is observed, that hex may lie beyond this turn\'s movement budget; it is still the march destination. Use pursue only when you supply an enemy unit id, not in place of that hex.' +
  '\n\n  When Suggested Destination starts with defend, assign defend on that hex, including when no enemy is observed. Do not march an air unit. When the cell is —, do not invent a march and do not invent a defend. Never march to the unit\'s current Hex; that order is ignored as already arrived and the unit holds. An explicit_move to the unit\'s current Hex is ignored as already arrived and the unit holds.' +
  '\n\n  Copy a Suggested Destination hex into explicit_move only when Best Options lists that same hex for that unit this turn. Otherwise, when you need a one-step explicit_move this turn, copy a Best Options approach, advance, or move/melee Target Hex for that unit. That hex is already inside this turn\'s movement budget, including weather. Do not copy a farther hex from the printed nearest-enemy path.';

/**
 * Working standing orders should be left alone.
 *
 * Purpose: Re-issuing a healthy order wastes the turn and can stall the unit.
 * When to use: When standing-order tools are enabled.
 * Expected outcome: Mentions a healthy standing order, the attention column, and this-turn move/melee as an override.
 * Exceptions: None.
 */
const LEAVE_MISSIONS_BULLET =
  '- Units with a healthy standing order do not need explicit orders from you unless you want to override their current mission this turn; the attention column marks stalled orders, and marches or defend orders whose next move recedes from the nearest enemy.' +
  '\n\n  A defend order with status en_route walks the unit back to its defend post; to keep the unit where it is, assign defend on its current hex.' +
  '\n\n  An explicit_move that takes a unit off its defend post moves the post to that destination.' +
  '\n\n  A this-turn move/melee Target Hex is such an override — copy it even when the unit is already marching. After a unit fires, do not leave it on a standing march that recedes from that enemy: assign defend to hold contact, cancel the march, or remarch toward the enemy.';

/**
 * Idle air should ferry toward the fight when its base can still launch.
 *
 * Purpose: An air unit only contributes inside strike radius; rebasing is free of other actions that turn.
 * When to use: When the opponent has air units.
 * Expected outcome: Ferry toward the fighting only when Base Intact and Base Controlled are yes, even on defend; never strike and ferry.
 * Exceptions: None.
 */
const IDLE_AIR_BULLET =
  '- For every air unit with no strike and no drop, ferry along owned airports toward the fighting, but only when Air Operations Status shows that unit\'s Base Intact and Base Controlled columns as yes. Air-drop embarked infantry onto the fight when the target is within 3 and a land march cannot reach it this turn. An air unit cannot strike and drop, or drop and ferry, on the same turn.';

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
  '- When land force must cross water, embark at a legal cell, move the transport, then disembark; loading requires a coastal cell, a land seaport, or a controlled seaport on transit water. Use the Naval Transport Status section for each naval unit (capacity, cargo already aboard, nearest embark hex). While embarked, explicit_move and disembark both clear cargo and march in one action.';

/**
 * A missile with a listed target should be launched this turn.
 *
 * Purpose: Holding a missile that can reach a city spends the turn it could have removed production.
 * When to use: When the seat already has a missile. The attention line names the target.
 * Expected outcome: One bullet telling the commander to copy the first matching Missile Forces row.
 * Exceptions: None.
 */
const MISSILE_LAUNCH_BULLET =
  '- Launch every missile that Missile Forces lists a target for. Copy the first target row that names the missile into missileLaunches. A missile that is never launched destroys nothing.';

/**
 * Airlift is the faster crossing when an airport chain already reaches.
 *
 * Purpose: A ship remains available. The model should not wait on it when air can arrive sooner.
 * When to use: When the roster has air, including a roster with no ships.
 * Expected outcome: One sentence. Ship embark coaching stays on its own bullet.
 * Exceptions: None.
 */
const AIRLIFT_PREFERENCE_BULLET =
  '- Prefer airlift when an airport chain reaches and a ship would take longer.';

/**
 * Keep production queued, including the cap-swap rule.
 *
 * Purpose: An empty legal queue is wasted income; a capped queue should be swapped unless every type is capped.
 * When to use: When production tools are enabled.
 * Expected outcome: Queue something when empty. When every unit type is capped, queue credits and fortify only an exposed city. The last paragraph says a city is exposed within `PRODUCTION_EXPOSED_RADIUS` hexes of a seen or remembered enemy. The Production attention sentence tells the model to queue the hexes the flag names. The next paragraph tells the model to apply the fix in Paused Queues under Production Status.
 * Exceptions: None.
 */
const PRODUCTION_BULLET =
  '- When a controlled cell can build and its queue is empty, queue something.' +
  '\n\n  Keep one city queued on credits at all times. Credits are the only way to raise mercenaries, and mercenaries are the only units you can place away from your own cities.' +
  `\n\n  ${SECTION_TITLE_PRODUCTION_PRIORITIES}, under ${SECTION_TITLE_PRODUCTION_STATUS}, names a city for a missile, a naval unit, or credits when one is worth building. Queue what it names before filling the other cities.\n\n  ` +
  PRODUCTION_CAP_QUEUE_GUIDANCE.replace(
    '. A hex whose available types',
    '.\n\n  A hex whose available types'
  ) +
  '\n\n  When every unit type for that cell is capped and it lists neither fortification nor credits, leave the queue alone so it resumes when the cap frees.' +
  '\n\n  When the Production attention flag is present, it names the hexes to queue and the types they can still build.' +
  `\n\n  When an attention bullet names paused queues, apply the fix in ${SECTION_TITLE_PAUSED_QUEUES} under ${SECTION_TITLE_PRODUCTION_STATUS}.` +
  `\n\n  A city is exposed when an enemy unit you can see or remember is within ${PRODUCTION_EXPOSED_RADIUS} hexes.`;

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
 * When to use: When memory tools are enabled. Pass whether this consult has a campaign.
 * Expected outcome: A short persistent note every strategic turn. A new key at capacity replaces the oldest persistent note. Enemy positions and rosters stay out of memory. With a campaign, the campaign target stays out too.
 * Exceptions: None.
 */
function memoryBullet(campaignEnabled: boolean): string {
  const campaignNote = campaignEnabled
    ? ' Do not persist the campaign target either; the Campaign Objective section supplies it.'
    : '';
  logTrace('promptSpec memoryBullet', { campaignEnabled });
  return (
    '- Write a short persistent note under the key turn_objectives, naming this turn\'s objectives and the units assigned to them. Overwrite that same key every strategic turn. Never put the turn number in a key. When all 5 persistent slots are full, a new key replaces the oldest persistent note. Do not persist enemy positions or rosters, which the briefing already supplies fresh each turn.' +
    campaignNote
  );
}

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
 * Tool rounds are limited, and the last chance to submit is one reply with tools withdrawn.
 *
 * Purpose: Spending the budget on known facts leaves only that last reply.
 * When to use: Always in strategic coaching.
 * Expected outcome: Says tools are withdrawn for one reply after the last round, and to submit once destinations are chosen.
 * Exceptions: None.
 */
const TOOL_BUDGET_BULLET =
  '- Rounds are limited. After the last round, tools are withdrawn and you get one reply to submit orders; once destinations are chosen, submit.';
