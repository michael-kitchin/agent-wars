/**
 * Bare section titles used by prompt assemblers, plus helpers that add ATX hashes.
 *
 * Purpose: One spelling of every briefing and status heading so strategic, tactical, and injection
 * blocks cannot drift. Hash level stays in the helpers (or in `markdownHeading1` / `markdownHeading2`)
 * because those already own spacing. The H2 titles inside the system prompt's Rules, Reading the
 * Briefing, and Orders Guidance sections are in `subsectionHeadings`.
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
 * When to use: Above the map in both modes. H2 inside both briefings.
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
 * Title of the paused-queue subsection, without ATX hashes.
 *
 * Purpose: The production section names paused queues under their own heading.
 * When to use: `subHeading` in the production briefing, the attention pointer, and the coaching sentence.
 * Expected outcome: The words `Paused Queues`.
 * Exceptions: None.
 */
export const SECTION_TITLE_PAUSED_QUEUES = 'Paused Queues' as const;

/**
 * Title of the production-priority subsection, without ATX hashes.
 *
 * Purpose: The production section names one city for a missile, a naval unit, or credits when that build is worth starting.
 * When to use: `subHeading` in the production briefing, and the production coaching sentence that points at it.
 * Expected outcome: The words `Production Priorities`.
 * Exceptions: None.
 */
export const SECTION_TITLE_PRODUCTION_PRIORITIES = 'Production Priorities' as const;

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
 * Title of the campaign objective block, without ATX hashes.
 *
 * Purpose: The situation message names the city, the staging hex, and the phase.
 * When to use: Strategic consults that have a campaign plan. H1 alone, H2 inside the briefing.
 * Expected outcome: Coaching can point at this section without restating the heading string.
 * Exceptions: None.
 */
export const SECTION_TITLE_CAMPAIGN_OBJECTIVE = 'Campaign Objective' as const;

/**
 * Title of the campaign-orders table, without ATX hashes.
 *
 * Purpose: Lists campaign units whose standing order should change, and home defenders still marching on the campaign.
 * When to use: A subsection under Standing Order Status when a campaign plan exists.
 * Expected outcome: The model copies each row into an assign_order entry.
 * Exceptions: None.
 */
export const SECTION_TITLE_CAMPAIGN_ORDERS = 'Campaign Orders' as const;

/**
 * Title of the live operations block, without ATX hashes.
 *
 * Purpose: The situation message lists each sea operation and how far it has got.
 * When to use: Strategic consults when standing orders are on. This is not Air Operations Status.
 * Expected outcome: Coaching can point at this section without restating the heading string.
 * Exceptions: None.
 */
export const SECTION_TITLE_OPERATIONS = 'Active Operations' as const;

/**
 * Title of the campaign rules in the system prompt, without ATX hashes.
 *
 * Purpose: The cached explanation of assemble, assault, defenders, and advance rows.
 * When to use: Strategic context coaching when the campaign gate is on.
 * Expected outcome: An H2 under Strategic Context. Battle prompts omit it.
 * Exceptions: None.
 */
export const SECTION_TITLE_CAMPAIGN = 'Campaign' as const;

/**
 * Title of the operation rules in the system prompt, without ATX hashes.
 *
 * Purpose: The cached explanation of muster, loading, release, and a unit that is already aboard.
 * When to use: Strategic context coaching when standing orders are on and the consult is not a battle.
 * Expected outcome: An H2 under Strategic Context, after the Campaign section when that section is present. Battle prompts omit it.
 * Exceptions: None.
 */
export const SECTION_TITLE_OPERATION_RULES = 'Operations' as const;

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
 * Title of the cached section that explains how to read a precomputed briefing.
 *
 * Purpose: Names the section that holds turn-invariant briefing rules.
 * When to use: When the briefing was precomputed for this consultation.
 * Expected outcome: H1 text `Reading the Briefing`.
 * Exceptions: None.
 */
export const SECTION_TITLE_READING_THE_BRIEFING = 'Reading the Briefing' as const;

/**
 * Title of the turn-varying scenario progress.
 *
 * Purpose: Names the control and urban-share lines that stay in the situation message.
 * When to use: On every strategic consultation. Explored and controlled lines are always present. Home-control and urban-share lines are added only for region versus region.
 * Expected outcome: The bare title. The situation message prints it as H1, or as H2 inside a precomputed briefing.
 * Exceptions: None.
 */
export const SECTION_TITLE_SCENARIO_PROGRESS = 'Scenario Progress' as const;

/**
 * Title of the opening identity line, without ATX hashes.
 *
 * Purpose: The role sentence needs a heading so a reader can find who is being briefed.
 * When to use: The first line of both system prompts.
 * Expected outcome: H1 before the role sentence.
 * Exceptions: None.
 */
export const SECTION_TITLE_YOUR_COMMAND = 'Your Command' as const;

/**
 * Title of the live situation message, without ATX hashes.
 *
 * Purpose: The clock, briefing, and opening sit in their own message so the system text can stay stable.
 * When to use: The first heading of the situation message.
 * Expected outcome: H1.
 * Exceptions: None.
 */
export const SECTION_TITLE_CURRENT_SITUATION = 'Current Situation' as const;

/**
 * Title of the coordinate preamble, without ATX hashes.
 *
 * Purpose: Lat/lng rules are their own block, not a continuation of the role sentence.
 * When to use: Immediately before the coordinate preamble in both modes.
 * Expected outcome: H1.
 * Exceptions: None.
 */
export const SECTION_TITLE_COORDINATES = 'Coordinates' as const;

/**
 * Title of the rules section.
 *
 * Purpose: Combat, movement, and production rules share one heading.
 * When to use: Immediately before `buildRulesSections` in both modes.
 * Expected outcome: H1 text `Rules`.
 * Exceptions: None.
 */
export const SECTION_TITLE_RULES = 'Rules' as const;

/**
 * Title of the orders-guidance section.
 *
 * Purpose: Coaching bullets are guidance, not tool instructions.
 * When to use: After Available Tools and before Response Format.
 * Expected outcome: H1 text `Orders Guidance`.
 * Exceptions: None.
 */
export const SECTION_TITLE_ORDERS_GUIDANCE = 'Orders Guidance' as const;

/**
 * Title of the strategic situation block, without ATX hashes.
 *
 * Purpose: Replaces the unheaded `Strategic context:` label on a strategic turn.
 * When to use: The strategic branch of the context block.
 * Expected outcome: H1.
 * Exceptions: None.
 */
export const SECTION_TITLE_STRATEGIC_CONTEXT = 'Strategic Context' as const;

/**
 * Title of the battle situation block, without ATX hashes.
 *
 * Purpose: Replaces the unheaded `Strategic context:` label during a battle.
 * When to use: The tactical branch of the context block.
 * Expected outcome: H1.
 * Exceptions: None.
 */
export const SECTION_TITLE_BATTLE_CONTEXT = 'Battle Context' as const;

/**
 * Title of the tool-use coaching list, without ATX hashes.
 *
 * Purpose: Replaces the unheaded `HOW TO USE THESE TOOLS EFFECTIVELY:` label.
 * When to use: Under Available Tools, before the mechanic and coaching bullets.
 * Expected outcome: H2.
 * Exceptions: None.
 */
export const SECTION_TITLE_TOOL_USAGE_GUIDANCE = 'How to Use These Tools Effectively' as const;

/**
 * Title of the unit listing, without ATX hashes.
 *
 * Purpose: Own and enemy roster lines are a section, not a trailing paragraph.
 * When to use: Before the roster lines in both system-prompt branches.
 * Expected outcome: H1.
 * Exceptions: None.
 */
export const SECTION_TITLE_UNIT_ROSTER = 'Unit Roster' as const;

/**
 * Title of the response contract, without ATX hashes.
 *
 * Purpose: The JSON instructions are a section a reviewer can find.
 * When to use: Immediately before `buildFinalJsonContractInstruction`.
 * Expected outcome: H1.
 * Exceptions: None.
 */
export const SECTION_TITLE_RESPONSE_FORMAT = 'Response Format' as const;

/**
 * Title of the illustrative JSON, without ATX hashes.
 *
 * Purpose: The example sits under the response contract.
 * When to use: Immediately before `getFinalJsonOrdersExampleBlock`.
 * Expected outcome: H2.
 * Exceptions: None.
 */
export const SECTION_TITLE_EXAMPLE_RESPONSE = 'Example Response' as const;

/**
 * Title of the orderless-unit table, without ATX hashes.
 *
 * Purpose: The worklist is a subsection of Standing Order Status.
 * When to use: `subHeading` inside the standing-order injection. Briefing assembly shifts it one level down.
 * Expected outcome: H2 from the builder.
 * Exceptions: None.
 */
export const SECTION_TITLE_UNITS_WITHOUT_STANDING_ORDERS = 'Units Without Standing Orders' as const;

/**
 * Title of the side table, without ATX hashes.
 *
 * Purpose: Who is still playing. Standalone prompts shift this heading up to H1.
 * When to use: `subHeading` in the sides builder.
 * Expected outcome: H2 from the builder.
 * Exceptions: None.
 */
export const SECTION_TITLE_SIDES = 'Sides' as const;

/**
 * Title of the seat's hired units, without ATX hashes.
 *
 * Purpose: Replaces the unheaded mercenary label.
 * When to use: Inside Mercenaries, only when the seat has a mercenary.
 * Expected outcome: H2.
 * Exceptions: None.
 */
export const SECTION_TITLE_YOUR_MERCENARIES = 'Your Mercenaries' as const;

/**
 * Title of the neutral units that can be rehired, without ATX hashes.
 *
 * Purpose: Replaces the unheaded rehire label.
 * When to use: Inside Mercenaries when production is on and a candidate exists.
 * Expected outcome: H2.
 * Exceptions: None.
 */
export const SECTION_TITLE_REHIRE_CANDIDATES = 'Rehire Candidates' as const;

/**
 * Title of the hexes where a new mercenary can be raised, without ATX hashes.
 *
 * Purpose: Replaces the unheaded raise label.
 * When to use: Inside Mercenaries when production is on and a hex can hire.
 * Expected outcome: H2.
 * Exceptions: None.
 */
export const SECTION_TITLE_RAISE_OPTIONS = 'Raise Options' as const;

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

/**
 * Moves every ATX heading outside a fence by `delta` levels.
 *
 * Purpose: A section builder emits the level it has when it stands alone. Nesting it inside the briefing, or lifting Sides beside standalone H1 sections, must not edit each builder.
 * When to use: `formatBriefing` for production, memory, and standing orders. The no-briefing system prompt for Sides.
 * Expected outcome: A heading line `#{n} title` becomes level `n + delta`, clamped from 1 to 6. A line inside a fence, and every non-heading line, is unchanged. A line of three backticks toggles the fence.
 * Exceptions: None.
 */
export function shiftMarkdownHeadings(markdown: string, delta: number): string {
  const lines = markdown.split('\n');
  logTrace('promptSpec shiftMarkdownHeadings', { delta, lineCount: lines.length });
  let fenced = false;
  return lines
    .map((line) => {
      if (line.startsWith('```')) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      const match = /^(#{1,6}) (.*)$/.exec(line);
      if (!match || !match[1] || match[2] === undefined) return line;
      const level = Math.min(6, Math.max(1, match[1].length + delta));
      return `${'#'.repeat(level)} ${match[2]}`;
    })
    .join('\n');
}

/**
 * Breaks one prose line into lines no longer than `budget`, on sentence boundaries when it can.
 *
 * Purpose: A paragraph stays one paragraph (single newlines, not a blank line) while each line stays reviewable.
 * When to use: `wrapLongProseLines` for a line that is over the limit and is not a table, heading, or JSON row.
 * Expected outcome: The same words. A line that starts with a bullet indents the wrapped tail by two spaces.
 * Exceptions: A single word longer than the budget is left on its own line.
 */
function wrapOneProseLine(line: string, limit: number): string {
  const indent = /^(\s*)/.exec(line)?.[1] ?? '';
  const body = line.slice(indent.length);
  const continuation = body.startsWith('- ') ? `${indent}  ` : indent;
  const budget = Math.max(40, limit - Math.max(indent.length, continuation.length));
  const sentences = body.split(/(?<=\.)\s+(?=\S)/);
  const rows: string[] = [];
  let current = '';
  const pushSentence = (sentence: string): void => {
    if (sentence.length <= budget) {
      rows.push(sentence);
      return;
    }
    const words = sentence.split(' ');
    let piece = '';
    words.forEach((word) => {
      const next = piece.length === 0 ? word : `${piece} ${word}`;
      if (next.length <= budget) {
        piece = next;
        return;
      }
      if (piece.length > 0) rows.push(piece);
      piece = word;
    });
    if (piece.length > 0) rows.push(piece);
  };
  sentences.forEach((sentence) => {
    const next = current.length === 0 ? sentence : `${current} ${sentence}`;
    if (next.length <= budget) {
      current = next;
      return;
    }
    if (current.length > 0) pushSentence(current);
    current = sentence.length <= budget ? sentence : '';
    if (sentence.length > budget) pushSentence(sentence);
  });
  if (current.length > 0) pushSentence(current);
  return rows.map((row, index) => `${index === 0 ? indent : continuation}${row}`).join('\n');
}

/**
 * Wraps prose lines that are longer than a review can comfortably read.
 *
 * Purpose: Paragraph breaks stay where the builders put them. A line inside those paragraphs still has to stay short.
 * When to use: The last step of `buildSystemPromptForTools`, after every section is assembled.
 * Expected outcome: Lines outside fences, tables, headings, compact JSON, and the home-region hex list are at most `limit` characters. Words are unchanged.
 * Exceptions: A fenced line, a table row, a heading, a line starting with `{`, and a home-region hex list are left as written.
 */
export function wrapLongProseLines(markdown: string, limit = 700): string {
  const lines = markdown.split('\n');
  logTrace('promptSpec wrapLongProseLines', { limit, lineCount: lines.length });
  let fenced = false;
  return lines
    .map((line) => {
      if (line.startsWith('```')) {
        fenced = !fenced;
        return line;
      }
      if (fenced || line.length <= limit) return line;
      const trimmed = line.trimStart();
      if (trimmed.startsWith('|') || trimmed.startsWith('#') || trimmed.startsWith('{')) return line;
      if (line.includes('home region hexes are')) return line;
      return wrapOneProseLine(line, limit);
    })
    .join('\n');
}
