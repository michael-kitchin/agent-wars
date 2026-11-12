/**
 * Bare H2 titles inside the cached system prompt's Rules, Reading the Briefing, and Orders Guidance sections.
 *
 * Purpose: One spelling of every system-prompt subsection so the builders and the prompt docs cannot drift. The H1 titles and the heading helpers stay in `sectionHeadings`.
 * When to use: `buildRulesSections`, `buildBriefingGuideSection`, and the coaching section builders.
 * Expected outcome: Title text without leading hashes; callers add the level with `subHeading`.
 * Exceptions: None.
 */

/**
 * Title of the distance and intel-age subsection.
 *
 * Purpose: Names the caveat lines that used to sit in the briefing.
 * When to use: When a distance caveat applies and the briefing is precomputed.
 * Expected outcome: H2 text `Distances and Intel Age`.
 * Exceptions: None.
 */
export const SECTION_TITLE_DISTANCES_AND_INTEL_AGE = 'Distances and Intel Age' as const;

/**
 * Title of the map-legend subsection.
 *
 * Purpose: Names the legend that used to sit above the operational map.
 * When to use: When the briefing is precomputed.
 * Expected outcome: H2 text `Map Legend`.
 * Exceptions: None.
 */
export const SECTION_TITLE_MAP_LEGEND = 'Map Legend' as const;

/**
 * Title of the Best Options odds key.
 *
 * Purpose: Names the odds definitions that used to sit under the options table.
 * When to use: On a consultation in either mode whose briefing is precomputed.
 * Expected outcome: H2 text `Best Options Odds`.
 * Exceptions: None.
 */
export const SECTION_TITLE_BEST_OPTIONS_ODDS = 'Best Options Odds' as const;

/**
 * Title of the memory-slot rules.
 *
 * Purpose: Names the persistent-slot sentences that used to sit in the memory block.
 * When to use: When memory is on for a strategic consultation.
 * Expected outcome: H2 text `Memory Slots`.
 * Exceptions: None.
 */
export const SECTION_TITLE_MEMORY_SLOTS = 'Memory Slots' as const;

/**
 * Title of the air-operations rules.
 *
 * Purpose: Names the air-rules sentence that used to sit in Air Operations Status.
 * When to use: When the side has air units.
 * Expected outcome: H2 text `Air Operations Table`.
 * Exceptions: None.
 */
export const SECTION_TITLE_AIR_OPERATIONS_TABLE = 'Air Operations Table' as const;

/**
 * Title of the missile-target rule.
 *
 * Purpose: Names the missile-target sentence that used to introduce the target table.
 * When to use: When the side has missiles on a strategic consultation.
 * Expected outcome: H2 text `Missile Targets`.
 * Exceptions: None.
 */
export const SECTION_TITLE_MISSILE_TARGETS = 'Missile Targets' as const;

/**
 * Title of the embark and airlift rules.
 *
 * Purpose: Names the transport sentences that used to sit in the sealift block.
 * When to use: When the side has naval or air units.
 * Expected outcome: H2 text `Transport`.
 * Exceptions: None.
 */
export const SECTION_TITLE_TRANSPORT = 'Transport' as const;

/**
 * Title of the production rules under the rules section.
 *
 * Purpose: Names the production sentences that used to sit in Production Status.
 * When to use: When production is on for a strategic consultation.
 * Expected outcome: H2 text `Production`.
 * Exceptions: None.
 */
export const SECTION_TITLE_PRODUCTION = 'Production' as const;

/**
 * Title of the combat-stats subsection.
 *
 * Purpose: Stats, casualty order, and the no-briefing attack hint share one subsection.
 * When to use: The first subsection of Rules.
 * Expected outcome: H2 text `Combat`.
 * Exceptions: None.
 */
export const SECTION_TITLE_COMBAT = 'Combat' as const;

/**
 * Title of the bonus subsection.
 *
 * Purpose: Origin, tech, and the terrain bonus are one topic.
 * When to use: Under Rules when any bonus sentence applies.
 * Expected outcome: H2 text `Bonuses`.
 * Exceptions: None.
 */
export const SECTION_TITLE_BONUSES = 'Bonuses' as const;

/**
 * Title of the weather subsection.
 *
 * Purpose: Weather rules are separate from the bonus that enables them.
 * When to use: Under Rules when weather applies.
 * Expected outcome: H2 text `Weather`.
 * Exceptions: None.
 */
export const SECTION_TITLE_WEATHER = 'Weather' as const;

/**
 * Title of the terrain-cover subsection.
 *
 * Purpose: Cover is its own rule, present in both modes.
 * When to use: Under Rules.
 * Expected outcome: H2 text `Terrain Cover`.
 * Exceptions: None.
 */
export const SECTION_TITLE_TERRAIN_COVER = 'Terrain Cover' as const;

/**
 * Title of the resolution-order subsection.
 *
 * Purpose: Resolution order, the pre-move sentence, and the attack constraints stay together.
 * When to use: Under Rules.
 * Expected outcome: H2 text `Resolution Order`.
 * Exceptions: None.
 */
export const SECTION_TITLE_RESOLUTION_ORDER = 'Resolution Order' as const;

/**
 * Title of the movement subsection.
 *
 * Purpose: Budgets and destination occupancy are movement, not combat stats.
 * When to use: Under Rules.
 * Expected outcome: H2 text `Movement`.
 * Exceptions: None.
 */
export const SECTION_TITLE_MOVEMENT = 'Movement' as const;

/**
 * Title of the naval-rules subsection.
 *
 * Purpose: The naval clause and the plan_route land-target hint belong together.
 * When to use: Under Rules when the side has naval units.
 * Expected outcome: H2 text `Naval Units`.
 * Exceptions: None.
 */
export const SECTION_TITLE_NAVAL_UNITS = 'Naval Units' as const;

/**
 * Title of the air-employment subsection.
 *
 * Purpose: Air employment is separate from the air-operations table.
 * When to use: Under Rules when the side has air units.
 * Expected outcome: H2 text `Air Units`.
 * Exceptions: None.
 */
export const SECTION_TITLE_AIR_UNITS = 'Air Units' as const;

/**
 * Title of the missile-employment subsection.
 *
 * Purpose: Missile employment is separate from the missile-target table.
 * When to use: Under Rules when the side has missiles.
 * Expected outcome: H2 text `Missiles`.
 * Exceptions: None.
 */
export const SECTION_TITLE_MISSILES = 'Missiles' as const;

/**
 * Title of the fortification-combat subsection.
 *
 * Purpose: The fortification combat sentence is not a production sentence.
 * When to use: Under Rules when the fortification rule applies.
 * Expected outcome: H2 text `Fortifications`.
 * Exceptions: None.
 */
export const SECTION_TITLE_FORTIFICATIONS = 'Fortifications' as const;

/**
 * Title of the hold-fire subsection.
 *
 * Purpose: Hold-fire is only taught when standing orders can be issued.
 * When to use: Under Rules when orders are on.
 * Expected outcome: H2 text `Holding Fire`.
 * Exceptions: None.
 */
export const SECTION_TITLE_HOLDING_FIRE = 'Holding Fire' as const;

/**
 * Title of the rules-tool pointer.
 *
 * Purpose: The pointer is a rule about looking rules up, not a tool-usage bullet.
 * When to use: Under Rules when the rules tool is enabled.
 * Expected outcome: H2 text `Rule Lookup`.
 * Exceptions: None.
 */
export const SECTION_TITLE_RULE_LOOKUP = 'Rule Lookup' as const;

/**
 * Title of the winning coaching section.
 *
 * Purpose: Win paths, free-for-all, and shared homes are one topic.
 * When to use: Under Orders Guidance on a strategic consultation.
 * Expected outcome: H2 text `Winning`.
 * Exceptions: None.
 */
export const SECTION_TITLE_WINNING = 'Winning' as const;

/**
 * Title of the briefing-use coaching section.
 *
 * Purpose: Copying rows, scouting, and tempo are about the briefing.
 * When to use: Under Orders Guidance.
 * Expected outcome: H2 text `Using the Briefing`.
 * Exceptions: None.
 */
export const SECTION_TITLE_USING_THE_BRIEFING = 'Using the Briefing' as const;

/**
 * Title of the standing-order coaching section.
 *
 * Purpose: Orderless units and leaving missions are standing-order guidance.
 * When to use: Under Orders Guidance when orders are on.
 * Expected outcome: H2 text `Standing Orders`.
 * Exceptions: None.
 */
export const SECTION_TITLE_STANDING_ORDERS_GUIDANCE = 'Standing Orders' as const;

/**
 * Title of the air and naval coaching section.
 *
 * Purpose: Idle air, airlift, naval routing, and sealift are one topic.
 * When to use: Under Orders Guidance when the side has air or naval units.
 * Expected outcome: H2 text `Air and Naval Units`.
 * Exceptions: None.
 */
export const SECTION_TITLE_AIR_AND_NAVAL_UNITS = 'Air and Naval Units' as const;

/**
 * Title of the production-queue coaching section.
 *
 * Purpose: Queue coaching is not the production rule text.
 * When to use: Under Orders Guidance when production is on.
 * Expected outcome: H2 text `Production Queues`.
 * Exceptions: None.
 */
export const SECTION_TITLE_PRODUCTION_QUEUES = 'Production Queues' as const;

/**
 * Title of the memory and callback coaching section.
 *
 * Purpose: Memory, callbacks, and the unconsulted-turn reminder are one topic.
 * When to use: Under Orders Guidance on a strategic consultation.
 * Expected outcome: H2 text `Memory and Callbacks`.
 * Exceptions: None.
 */
export const SECTION_TITLE_MEMORY_AND_CALLBACKS = 'Memory and Callbacks' as const;

/**
 * Title of the message and round coaching section.
 *
 * Purpose: Message discipline and the tool-round budget are one topic.
 * When to use: Under Orders Guidance on a strategic consultation.
 * Expected outcome: H2 text `Messages and Rounds`.
 * Exceptions: None.
 */
export const SECTION_TITLE_MESSAGES_AND_ROUNDS = 'Messages and Rounds' as const;

/**
 * Title of the battle callback and message coaching section.
 *
 * Purpose: Battle coaching keeps callbacks, the unconsulted beat, messages, and exit together.
 * When to use: Under Orders Guidance in a battle.
 * Expected outcome: H2 text `Callbacks and Messages`.
 * Exceptions: None.
 */
export const SECTION_TITLE_CALLBACKS_AND_MESSAGES = 'Callbacks and Messages' as const;
