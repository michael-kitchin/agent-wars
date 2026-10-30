/**
 * Bare section titles used by prompt assemblers, plus helpers that add ATX hashes.
 *
 * Purpose: One spelling of every briefing and status heading so strategic, tactical, and injection
 * blocks cannot drift. Hash level stays in the helpers (or in `markdownHeading1` / `markdownHeading2`)
 * because those already own spacing.
 * When to use: Any emitter of a named prompt section.
 * Expected outcome: Title text without leading hashes; callers choose the heading level.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';

/**
 * Title of the Commander's Briefing opener, without ATX hashes.
 *
 * Purpose: Names the situation dump the model reads first. assembly-contract.md section 3 and
 * strategic-prompt.md section 1.6 require this exact heading.
 * When to use: Pass to `markdownHeading1` or `topLevelHeading` at the start of both mode briefings.
 * Expected outcome: The model can find the briefing by this title.
 * Exceptions: None.
 */
export const SECTION_TITLE_COMMANDERS_BRIEFING = "Commander's Briefing" as const;

/**
 * Title of the per-unit status table, without ATX hashes.
 *
 * Purpose: The table the model uses to choose shots and moves. strategic-prompt.md section 2 and
 * tactical-prompt.md section 2 require this exact heading.
 * When to use: Pass to `markdownHeading2` / `subHeading` above the unit-status table.
 * Expected outcome: The heading matches both modes so coaching can name it once.
 * Exceptions: None.
 */
export const SECTION_TITLE_UNIT_STATUS_AND_THREATS = 'Unit Status and Threats' as const;

/**
 * Title of the capped attention-flag list, without ATX hashes.
 *
 * Purpose: Points the model at the five most urgent units. assembly-contract.md section 3.
 * When to use: Above the attention-flag bullets in both modes.
 * Expected outcome: The model treats this as a pointer into Unit Status, not a second roster.
 * Exceptions: None.
 */
export const SECTION_TITLE_ATTENTION_FLAGS = 'Attention Flags' as const;

/**
 * Title of the ASCII operational map, without ATX hashes.
 *
 * Purpose: The map is how the model binds briefing codes to geography. assembly-contract.md section 3.
 * When to use: Above the map in both modes; always H1 in current emitters.
 * Expected outcome: The model looks here for codes used in orders and tool calls.
 * Exceptions: None.
 */
export const SECTION_TITLE_OPERATIONAL_MAP = 'Operational Map' as const;

/**
 * Title of the Best Options table, without ATX hashes.
 *
 * Purpose: Legal this-period destinations the model should copy rather than re-plan.
 * strategic-prompt.md section 2 and tactical-prompt.md section 2.
 * When to use: The `###` subsection under the operational map when the table is non-empty.
 * Expected outcome: Coaching can name this table without restating the heading string.
 * Exceptions: None.
 */
export const SECTION_TITLE_BEST_OPTIONS_THIS_TURN = 'Best Options This Turn' as const;

/**
 * Title of the extra-hex intelligence list, without ATX hashes.
 *
 * Purpose: Hex facts that are not already in Unit Status. strategic-prompt.md section 1.6.
 * When to use: Strategic briefing only; omit in tactical.
 * Expected outcome: The model can look up a code mentioned in Best Options without a tool call.
 * Exceptions: None.
 */
export const SECTION_TITLE_SUPPLEMENTAL_HEX_INTELLIGENCE = 'Supplemental Hex Intelligence' as const;

/**
 * Title of the prior-period notes block, without ATX hashes.
 *
 * Purpose: Short memory of what the model said and what was lost. assembly-contract.md section 3.
 * When to use: Pass as the heading argument to `buildRecentTurnNotesSection`.
 * Expected outcome: Empty history omits the section rather than emitting a blank heading.
 * Exceptions: None.
 */
export const SECTION_TITLE_RECENT_TURN_NOTES = 'Recent Turn Notes' as const;

/**
 * Title of the production status block, without ATX hashes.
 *
 * Purpose: Queues, caps, and income for the strategic commander. strategic-prompt.md section 1.6.
 * When to use: Production injection and the production briefing builder; never in tactical.
 * Expected outcome: The model sees one production heading regardless of empty vs populated queues.
 * Exceptions: None.
 */
export const SECTION_TITLE_PRODUCTION_STATUS = 'Production Status' as const;

/**
 * Title of the per-hex production queue table, without ATX hashes.
 *
 * Purpose: The queue rows sit under Production Status. strategic-prompt.md section 2.
 * When to use: Inside the production briefing builder only.
 * Expected outcome: Nested H2 so it cannot be mistaken for a top-level section.
 * Exceptions: None.
 */
export const SECTION_TITLE_CONTROLLED_HEX_QUEUES = 'Controlled Hex Queues' as const;

/**
 * Title of the memory injection block, without ATX hashes.
 *
 * Purpose: Persistent and triggered notes the model wrote for itself. assembly-contract.md section 3.
 * When to use: Memory injection text; omit when the memory tool group is off.
 * Expected outcome: The model can find its own notes under one heading.
 * Exceptions: None.
 */
export const SECTION_TITLE_STRATEGIC_MEMORY = 'Your Strategic Memory' as const;

/**
 * Title of the standing-order status block, without ATX hashes.
 *
 * Purpose: Active orders plus the orderless list. strategic-prompt.md section 1.6.
 * When to use: Standing-order injection; omit in tactical and when the orders tool group is off.
 * Expected outcome: Coaching can tell the model to assign orders by naming this section.
 * Exceptions: None.
 */
export const SECTION_TITLE_STANDING_ORDER_STATUS = 'Standing Order Status' as const;

/**
 * Title of the callback subscription list, without ATX hashes.
 *
 * Purpose: What events will bring the model back. assembly-contract.md section 5 and 7.
 * When to use: Both modes, after the situation dump.
 * Expected outcome: The model sees the current list it is about to replace.
 * Exceptions: None.
 */
export const SECTION_TITLE_ACTIVE_CALLBACKS = 'Active Callbacks' as const;

/**
 * Title of the air operations status block, without ATX hashes.
 *
 * Purpose: Strike and ferry facts for air units. strategic-prompt.md section 1.9; tactical-prompt.md section 2.9.
 * When to use: When the opponent roster includes air (tactical already omits otherwise).
 * Expected outcome: Air coaching can point at this section's columns.
 * Exceptions: None.
 */
export const SECTION_TITLE_AIR_OPERATIONS_STATUS = 'Air Operations Status' as const;

/**
 * Title of the missile forces block, without ATX hashes.
 *
 * Purpose: Own missiles and the enemy infrastructure they can reach.
 * When to use: Strategic prompts when the commander has a missile. Omitted in a battle and when the roster has none.
 * Expected outcome: Missile coaching can point at this section.
 * Exceptions: None.
 */
export const SECTION_TITLE_MISSILE_FORCES = 'Missile Forces' as const;

/**
 * Title of the mercenaries block, without ATX hashes.
 *
 * Purpose: Treasury, upkeep, and the units a seat can hire.
 * When to use: Strategic prompts when the seat has an economy. Omitted in a battle.
 * Expected outcome: Mercenary coaching can point at this section.
 * Exceptions: None.
 */
export const SECTION_TITLE_MERCENARIES = 'Mercenaries' as const;

/**
 * Title of the naval transport status block, without ATX hashes.
 *
 * Purpose: Capacity, cargo, and embark hexes. strategic-prompt.md section 1.10; tactical-prompt.md section 2.10.
 * When to use: When the opponent roster includes naval.
 * Expected outcome: Sealift coaching can point at this section.
 * Exceptions: None.
 */
export const SECTION_TITLE_NAVAL_TRANSPORT_STATUS = 'Naval Transport Status' as const;

/**
 * Title of the tool catalog, without ATX hashes.
 *
 * Purpose: The list of tools the model may call this consult. assembly-contract.md section 4.
 * When to use: Always in the system prompt, including the empty-tools form.
 * Expected outcome: The model looks here for tool names and the copy-don't-replan rule.
 * Exceptions: None.
 */
export const SECTION_TITLE_AVAILABLE_TOOLS = 'Available Tools' as const;

/**
 * Title of the scenario objective block, including the required marker, without ATX hashes.
 *
 * Purpose: Home-region win paths for the typed scenario. strategic-prompt.md section 1.7.
 * When to use: Strategic prompts when `scenarioId` is `region_vs_region`; omit otherwise and in tactical.
 * Expected outcome: The heading is unique enough that matrix tests can detect its presence.
 * Exceptions: None.
 */
export const SECTION_TITLE_SCENARIO_OBJECTIVE = 'Scenario Objective (Required)' as const;

/**
 * Formats a title as a Markdown H1 without surrounding blank lines.
 *
 * Purpose: Keeps hash level in one place for emitters that interpolate into their own spacing
 * (tactical briefing, production lines, tools section).
 * When to use: When the caller already owns newlines; use `markdownHeading1` when you want its spacing.
 * Expected outcome: `# ${title}` with no trailing newline.
 * Exceptions: None.
 */
export function topLevelHeading(title: string): string {
  logTrace('promptSpec topLevelHeading', { title });
  return `# ${title}`;
}

/**
 * Formats a title as a Markdown H2 without surrounding blank lines.
 *
 * Purpose: Same as `topLevelHeading` for nested sections.
 * When to use: When the caller already owns newlines; use `markdownHeading2` when you want its spacing.
 * Expected outcome: `## ${title}` with no trailing newline.
 * Exceptions: None.
 */
export function subHeading(title: string): string {
  logTrace('promptSpec subHeading', { title });
  return `## ${title}`;
}
