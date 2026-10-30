import type { GameStateSnapshot } from '../gameDb';
import { activeGameMap } from '../../shared/activeGameMap';
import { computeRoundedPercentage } from '../../shared/progressFormatting';
import { getValidDestinations } from '../oneStepMoveDestinations';
import { PRODUCTION_CAP_QUEUE_GUIDANCE } from '../productionCaps';
import { ALL_BUILD_QUEUE_ITEM_TYPES } from '../productionRules';
import { MERCENARY_ENVELOPE_ROWS_SENTENCE } from './promptSpec/gameRuleMercenaryText';
import { logDebug, logTrace } from '../logger';
import { buildCoachingBullets, type CoachingGates } from './promptSpec/coachingText';
import { buildToolsIntroCopySentence } from './promptSpec/optionCopyText';
import { buildOpeningUserMessage } from './promptSpec/consultationText';

/**
 * Documents the `PromptToolFlags` interface as a named contract surface (export interface PromptToolFlags).

 * Purpose: Supports maintainability by documenting why `PromptToolFlags` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface PromptToolFlags {
    /**
   * Specifies the contract for the `planningEnabled` member (planningEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `planningEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
planningEnabled: boolean;
    /**
   * Specifies the contract for the `assessmentEnabled` member (assessmentEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `assessmentEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
assessmentEnabled: boolean;
    /**
   * Specifies the contract for the `estimationEnabled` member (estimationEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `estimationEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
estimationEnabled: boolean;
    /**
   * Specifies the contract for the `memoryEnabled` member (memoryEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `memoryEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
memoryEnabled: boolean;
    /**
   * Specifies the contract for the `ordersEnabled` member (ordersEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `ordersEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ordersEnabled: boolean;
    /**
   * Specifies the contract for the `productionEnabled` member (productionEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `productionEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
productionEnabled: boolean;
    /**
   * Specifies the contract for the `fallbackMovementEnabled` member (fallbackMovementEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `fallbackMovementEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
fallbackMovementEnabled: boolean;
}

/**
 * Sentence appended when memory is on and the consult has no planning tools.
 *
 * Purpose: Those returns are the only place this sentence is taught, so the example must include content and tier.
 * When to use: Concatenated onto the orders-only and fallback returns of `getMovementOrderInstruction`.
 * Expected outcome: The model sees a write that names key, tier, and content. Planning returns do not append this.
 * Exceptions: None.
 */
const MOVEMENT_INSTRUCTION_MEMORY_SUFFIX =
  ' Include a memoryUpdates entry (e.g. write key "strategy" tier "persistent" content "this turn\'s objectives") in your final JSON to record your plan.';

/**
 * Condition under which the submit clause requires at least one `set_build_queue`.
 *
 * Purpose: Empty queues were the only mandated write, so cells queued with a capped type (infantry at
 * cap while air could still spawn) never became a required work item.
 * When to use: `buildProductionSubmitClause` when production tools are enabled.
 * Expected outcome: One sentence fragment covering empty queues and replaceable blocked-at-cap queues.
 * Exceptions: None. One replacement this turn is enough; every blocked hex need not be listed.
 */
const PRODUCTION_REQUIREMENT_BASE =
  'when at least one controlled hex has availableUnitTypes and an empty queue, or a queue blocked at cap while another type can still be built';
/**
 * Documents the module-scope binding `PRODUCTION_CAP_GUIDANCE` (PRODUCTION_CAP_GUIDANCE).
 *
 * Purpose: Stops the model from filling empty queues with types that cannot spawn because the player is at cap.
 * When to use: Production tool-guidance, user-message, and submit-clause copy when production tools are enabled.
 * Expected outcome: The sentence is included verbatim in those prompt surfaces.
 * Exceptions: None.
 */
const PRODUCTION_CAP_GUIDANCE = PRODUCTION_CAP_QUEUE_GUIDANCE;

/**
 * Opening geography clause for strategic AI prompts.
 *
 * Purpose: The model must be told which map is loaded and which strategic H3 resolution that map uses.
 * When to use: `buildSystemPromptForTools` when the consultation is strategic.
 * Expected outcome: `Global Earth map` at `strategicResolution` when the profile id is `global`. Any other map is named by `displayName` at that same field. The second paragraph still forbids raw H3 and latitude/longitude.
 * Exceptions: None.
 */
export function buildLatLngPreamble(): string {
  const map = activeGameMap();
  const label = map.id === 'global' ? 'Global Earth map' : map.displayName;
  logDebug('promptText buildLatLngPreamble', {
    id: map.id,
    label,
    strategicResolution: map.strategicResolution,
  });
  return `${label}, H3 resolution ${map.strategicResolution}. Positions are two-character briefing hex codes (A–Z and 0–9) from the operational map and Unit Status table — copy exactly; never invent codes. Distances are hex counts where shown.

Final JSON: use briefing hex codes for cells; standing-order pursue uses enemy unit id (targetUnitId). Never emit raw H3 strings or latitude/longitude pairs.`;
}

/**
 * Opening geography clause for tactical AI prompts.
 *
 * Purpose: Avoids claiming a global strategic context when the operational map is the battle footprint.
 * When to use: `buildSystemPromptForTools` when `coordinateContext.mode === 'tactical'`.
 * Expected outcome: Two-character tactical codes and adjacency semantics aligned with the tactical operational map section. Cells beyond a regional map's edge are named as outside the battle.
 * Exceptions: None.
 */
export function buildTacticalLatLngPreamble(decimalPlaces: number): string {
  void decimalPlaces;
  return `Tactical battle map: the enclosing strategic hex's tactical cells plus up to three neighboring rings (cells beyond a regional map's edge are not part of the battle). Positions are two-character tactical briefing hex codes (A–Z and 0–9) from the operational map and Unit Status table — copy exactly; never invent codes. Distances are tactical hex steps where shown.

Final JSON: use tactical briefing hex codes for cells and enemy sub-unit ids for targetUnitId. Never emit raw H3 strings or latitude/longitude pairs.`;
}

/**
 * Defines the `formatControlProgressLine` function shape (export function formatControlProgressLine(label: string, controlled: number, total: number, subjectLabel = 'hexes'): string).

 * Purpose: Supports maintainability by documenting why `formatControlProgressLine` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatControlProgressLine(label: string, controlled: number, total: number, subjectLabel = 'hexes'): string {
  return `- ${label}: ${controlled} of ${total} ${subjectLabel} (${computeRoundedPercentage(controlled, total)}%)`;
}

/**
 * Defines the `formatLatLng` function shape (export function formatLatLng(ll: [number, number], decimalPlaces: number): string).

 * Purpose: Supports maintainability by documenting why `formatLatLng` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatLatLng(ll: [number, number], decimalPlaces: number): string {
  return `[${ll[0].toFixed(decimalPlaces)}, ${ll[1].toFixed(decimalPlaces)}]`;
}

/**
 * Roster and options-table gates for the Available Tools intro paragraph.
 *
 * Purpose: Air/ferry copy and options-table copy must match the rest of the prompt.
 * When to use: Fourth argument to `buildAvailableToolsIntro`.
 * Expected outcome: Omitted fields default to air-present and table-present-iff-briefing.
 * Exceptions: None.
 */
export interface ToolsIntroRosterGates {
  /**
   * Whether the opponent roster includes an air unit.
   *
   * Contract: False omits ferry and air-strike copy clauses.
   * When to use: From the same air check as the envelope.
   * Expected outcome: Defaults to true when omitted so older callers keep ferry copy.
   * Exceptions: None.
   */
  readonly hasAirUnits?: boolean;
  /**
   * Whether the briefing includes a Best Options table with rows.
   *
   * Contract: False replaces copy-row wording with the routing-tool instruction.
   * When to use: True only when the briefing contains the Best Options heading.
   * Expected outcome: Defaults to `hasPrecomputedBriefing` when omitted.
   * Exceptions: None.
   */
  readonly hasBestOptionsTable?: boolean;
}

/**
 * Builds the intro sentence above the numbered `# Available Tools` list.
 *
 * Purpose: Tells the model when to rely on the briefing and when to call tools, naming only tools it can call.
 * When to use: `buildSystemPromptForTools` after computing flags, briefing presence, and roster gates.
 * Expected outcome: A generic "listed tools only" line when neither planning nor assessment is enabled; otherwise
 * mode- and briefing-specific guidance. A strategic briefing with standing-order tools on says standing-order status
 * is already present and limits `query_orders` to a rare detail. Battle intros name `plan_route` only when planning is on.
 * Exceptions: None.
 */
export function buildAvailableToolsIntro(
  flags: PromptToolFlags,
  hasPrecomputedBriefing = false,
  coordinateMode: 'strategic' | 'tactical' = 'strategic',
  roster: ToolsIntroRosterGates = {}
): string {
  const hasAirUnits = roster.hasAirUnits !== false;
  const hasBestOptionsTable = roster.hasBestOptionsTable ?? hasPrecomputedBriefing;
  logDebug('promptText buildAvailableToolsIntro', {
    coordinateMode,
    hasPrecomputedBriefing,
    hasBestOptionsTable,
    ordersEnabled: flags.ordersEnabled,
    memoryEnabled: flags.memoryEnabled,
    productionEnabled: flags.productionEnabled,
  });
  const toolsIntroPurpose = flags.planningEnabled
    ? 'plan movement and assess the battlefield'
    : flags.assessmentEnabled
      ? 'assess the tactical situation'
      : undefined;
  if (!toolsIntroPurpose) {
    return 'Use only the tools listed below. Do not call tools that are not in the list.';
  }
  if (!hasPrecomputedBriefing) {
    return (
      `Use these tools to ${toolsIntroPurpose} before submitting orders. You may use multiple rounds of tool calls and mix tool types if that helps.` +
      (flags.memoryEnabled ? ' Memory: use memory_read as needed; persist notes via memoryUpdates in your final JSON.' : '')
    );
  }
  if (coordinateMode === 'tactical') {
    const briefingLead = 'Use the Commander\'s Briefing above for assessments and possible unit actions.';
    if (!hasBestOptionsTable) {
      const routing = flags.planningEnabled
        ? ' Destinations must come from the routing tool, not from an absent options table.'
        : '';
      return `${briefingLead} No options are listed this period.${routing}`;
    }
    const copy = buildToolsIntroCopySentence({ coordinateMode: 'tactical', hasAirUnits });
    const routing = flags.planningEnabled ? ' Use plan_route only for dests not listed for that sub-unit.' : '';
    return `${briefingLead} ${copy}${routing}`;
  }
  const selectiveTools: string[] = [];
  if (flags.memoryEnabled) selectiveTools.push('memory lookup (memory_read)');
  if (flags.productionEnabled) selectiveTools.push('production queue checks/sets');
  const standingOrderNote = flags.ordersEnabled
    ? ' Standing-order status is already in the briefing; call query_orders only for a rare detail.'
    : '';
  const selective =
    selectiveTools.length > 0
      ? ` Use tools selectively for ${selectiveTools.join(' and ')} when needed.`
      : '';
  const extra = `${standingOrderNote}${selective}`;
  if (!hasBestOptionsTable) {
    return (
      'Use the Commander\'s Briefing above for assessments and possible unit actions. No options are listed this period. Destinations must come from the routing tool, not from an absent options table.' +
      extra
    );
  }
  const copy = buildToolsIntroCopySentence({ coordinateMode: 'strategic', hasAirUnits });
  return (
    `Use the Commander's Briefing above for assessments and possible unit actions. ${copy} Use plan_route only for dests not listed for that unit.` +
    extra
  );
}

/**
 * Builds tool-mechanic bullets, then appends the gated coaching list.
 *
 * Purpose: The HOW TO USE header owns tool mechanics (when to call which tool). Rules and heuristics come from
 * `buildCoachingBullets` so they have one home and one test.
 * When to use: `buildSystemPromptForTools` after computing flags, briefing presence, and coaching gates.
 * Expected outcome: Markdown bullets under `HOW TO USE THESE TOOLS EFFECTIVELY:`.
 * Exceptions: None.
 */
export function buildToolUsageGuidance(
  flags: PromptToolFlags,
  hasPrecomputedBriefing = false,
  coordinateMode: 'strategic' | 'tactical' = 'strategic',
  coachingGates?: CoachingGates
): string {
  logDebug('promptText buildToolUsageGuidance', {
    coordinateMode,
    hasPrecomputedBriefing,
    hasExplicitGates: coachingGates != null,
  });
  const lines: string[] = [];
  if (hasPrecomputedBriefing) {
    lines.push(
      coordinateMode === 'tactical'
        ? '- The Commander\'s Briefing above already contains unit status, attention flags, and possible unit actions for this tactical beat. Use the briefing to decide targets and priorities.'
        : '- The Commander\'s Briefing above already contains unit status, attention flags, possible unit actions, and supplemental hex intelligence for this turn. Use the briefing to decide targets and priorities.'
    );
    if (coordinateMode === 'tactical' && flags.assessmentEnabled) {
      lines.push('- Use assess_unit on sub-units near the enemy to understand the tactical picture. Skip assessment for sub-units far from all enemies. Sub-units of one parent on the same cell match, so assess one of them; assess another sub-unit on that cell when its parent differs.');
    }
    if (coordinateMode === 'tactical' && flags.estimationEnabled) {
      lines.push('- Use estimate_combat before any ranged or melee attack. Do not guess at combat odds.');
    }
  } else {
    if (flags.ordersEnabled || flags.memoryEnabled) {
      lines.push('- Start by reviewing your standing order statuses and persistent strategic memory (both are shown above).');
    }
    if (flags.assessmentEnabled) {
      lines.push('- Use assess_unit on units near the enemy to understand the tactical picture. Skip assessment for rear-echelon units far from all enemies — their situation rarely changes turn to turn. Units that share a hex can differ by type and birth country, so assess each one.');
    }
    if (flags.estimationEnabled) {
      lines.push('- Use estimate_combat before any attack. Do not guess at combat odds.');
    }
    if (flags.planningEnabled) {
      lines.push('- Use plan_route to understand multi-turn moves before issuing orders.');
    }
  }
  lines.push(
    '- Batch independent tool calls: when you need the same tool for several units or hexes, request all of those calls together in one reply as parallel tool calls instead of one call per reply. Wait for a result only when the next call\'s arguments depend on it.'
  );
  if (flags.memoryEnabled && coordinateMode !== 'tactical') {
    lines.push(
      '- memoryUpdates / tiers: "persistent" entries appear in every briefing (limit 5); "stored" are retrieved via memory_read (limit 15).'
    );
  }
  if (flags.productionEnabled && coordinateMode !== 'tactical') {
    lines.push(
      '- Production: use query_production to inspect controlled-hex queues and constraints; use set_build_queue to set one unit type/count for a queue (this replaces existing queue entries). If skipping tools, you may include productionOrders in final JSON.'
    );
  }
  const resolvedGates: CoachingGates = coachingGates ?? {
    coordinateMode,
    planningEnabled: flags.planningEnabled,
    ordersEnabled: flags.ordersEnabled && coordinateMode !== 'tactical',
    memoryEnabled: flags.memoryEnabled && coordinateMode !== 'tactical',
    productionEnabled: flags.productionEnabled && coordinateMode !== 'tactical',
    hasAirUnits: true,
    hasNavalUnits: true,
    hasBestOptionsTable: hasPrecomputedBriefing,
    homeRegionsOverlap: false,
    hasObservedEnemy: true,
    includeScenarioWinPaths: coordinateMode !== 'tactical',
  };
  lines.push(...buildCoachingBullets(resolvedGates));
  if (lines.length === 0) return '';
  return '\n\nHOW TO USE THESE TOOLS EFFECTIVELY:\n' + lines.join('\n');
}

/**
 * Defines the `buildAdjacentCellsFallbackBlock` function shape (export function buildAdjacentCellsFallbackBlock( state: GameStateSnapshot, opponentUnits: { id: string; h3Index: string; unitType: string }[], coordMap).

 * Purpose: Supports maintainability by documenting why `buildAdjacentCellsFallbackBlock` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildAdjacentCellsFallbackBlock(
  state: GameStateSnapshot,
  opponentUnits: { id: string; h3Index: string; unitType: string }[],
  coordMap: { latLngByH3: Map<string, [number, number]>; format: (h3: string) => string },
  getValidDestinationsUnoccupied: (unit: { h3Index: string; unitType: string }, state: GameStateSnapshot) => string[]
): string {
  const { latLngByH3, format } = coordMap;
  const occupied = new Set(state.units.map((row) => row.h3Index));
  const lines: string[] = [];
  for (const u of opponentUnits.filter((unit) => latLngByH3.has(unit.h3Index))) {
    const current = format(u.h3Index);
    const snapshotUnit = state.units.find((row) => row.id === u.id);
    const assumeDebarkedForReachability = !!snapshotUnit?.embarkedOnNavalUnitId;
    const dests = (
      assumeDebarkedForReachability
        ? getValidDestinations(
            { id: u.id, h3Index: u.h3Index, unitType: u.unitType },
            state,
            { assumeDebarkedForReachability: true }
          )
        : getValidDestinationsUnoccupied(u, state)
    )
      .filter((h3) => h3 === u.h3Index || !occupied.has(h3))
      .filter((h3) => latLngByH3.has(h3))
      .map((h3) => format(h3));
    const cells = dests.length ? `${current} (hold), or move to: ${dests.join(', ')}` : `${current} (hold only; no empty adjacent cells)`;
    lines.push(`${u.id}: ${cells}`);
  }
  if (lines.length === 0) return '';
  return `\nAdjacent cells (fallback for one-step moves when no planning/orders tools are available; prefer plan_route or standing orders when enabled):\n${lines.join('\n')}\n`;
}

/**
 * Builds the JSON-contract sentence that tells the model how to fill explicit_move.destination.

 * Purpose: When planning tools are on and a briefing is present, approach/move/melee dests may be copied from Best Options This Turn Target Hexes into explicit_move, or from plan_route orderToHexCode. Without a briefing, dests come from plan_route only.
 * When to use: `buildFinalJsonContractInstruction` after computing tool flags.
 * Expected outcome: One or more sentences appended to the final JSON schema block; tactical mode also describes first-leg truncation.
 * Exceptions: None.
 */
export function getMovementOrderInstruction(
  flags: PromptToolFlags,
  /**
   * When `tactical`, appends march reachability guidance so explicit_move rows match terrain-weighted tactical validation (same checks as Ready commit).
   */
  coordinateMode: 'strategic' | 'tactical' = 'strategic',
  /**
   * When false, there is no Best Options table; dests must come from plan_route orderToHexCode.
   */
  hasPrecomputedBriefing = true
): string {
  const memorySuffix = flags.memoryEnabled ? MOVEMENT_INSTRUCTION_MEMORY_SUFFIX : '';
  const tacticalMarchReachabilityClause =
    coordinateMode === 'tactical'
      ? hasPrecomputedBriefing
        ? ' Tactical marches use terrain-weighted MP budgets per beat; when a finite-cost path exists, the server applies at most the first leg toward each explicit_move destination (same truncation as human Ready). When the continuity planner rejects the full destination but a footprint neighbor still advances you on the H3 grid toward that hex, the server may take that one-step fallback. Copy a Best Options This Turn approach or move/melee Target Hex for that unit, or plan_route\'s orderToHexCode, not a guessed adjacent code.'
        : ' Tactical marches use terrain-weighted MP budgets per beat; when a finite-cost path exists, the server applies at most the first leg toward each explicit_move destination (same truncation as human Ready). When the continuity planner rejects the full destination but a footprint neighbor still advances you on the H3 grid toward that hex, the server may take that one-step fallback. Copy plan_route\'s orderToHexCode exactly, not a guessed adjacent code.'
      : '';
  if (flags.planningEnabled) {
    if (!hasPrecomputedBriefing) {
      return (
        ' For each explicit_move entry: set "destination" to the exact orderToHexCode from that unit\'s plan_route result (copy the two-character code exactly).' +
        tacticalMarchReachabilityClause
      );
    }
    return (
      ' For each explicit_move entry: set "destination" to a Target Hex from that unit\'s Best Options This Turn approach or move/melee row (copy the two-character code exactly), or to the exact orderToHexCode from that unit\'s plan_route result when the dest is not listed there.' +
      tacticalMarchReachabilityClause
    );
  }
  if (flags.ordersEnabled) {
    return (
      ' You have no movement planning tools: you cannot compute valid one-step explicit_move destinations yourself. Use assign_order in orders[] for standing missions; leave explicit_move / ranged_attack out unless you can copy valid briefing hex codes from the operational map only.' +
      memorySuffix
    );
  }
  if (flags.fallbackMovementEnabled) {
    const memoryHint = flags.memoryEnabled ? ' After your analysis, add memoryUpdates in final JSON if needed. ' : '';
    return (
      memoryHint +
      'Without planning/standing-order tools, use explicit_move with "destination" set only to a briefing hex code from the "Adjacent cells (fallback)" list (current cell = hold, or an adjacent listed cell).' +
      memorySuffix
    );
  }
  return (
    ' You have no movement planning tools: submit orders[] without explicit_move unless coordinates are trivially valid from the briefing.' +
    memorySuffix
  );
}

/**
 * Defines the `buildProductionSubmitClause` function shape (export function buildProductionSubmitClause(flags: PromptToolFlags): string).

 * Purpose: Supports maintainability by documenting why `buildProductionSubmitClause` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildProductionSubmitClause(flags: PromptToolFlags): string {
  if (!flags.productionEnabled) return '';
  return (
    ' "productionOrders" entries MUST include "action" on every item. Required forms:' +
    ` {"action":"set_build_queue","hex":"<two-char code>","unitType":"${ALL_BUILD_QUEUE_ITEM_TYPES.join('|')}","count":1..99}.` +
    ' Any productionOrders item missing "action" or required fields is dropped.' +
    ` ${PRODUCTION_REQUIREMENT_BASE}, include at least one set_build_queue this turn.` +
    ` ${PRODUCTION_CAP_GUIDANCE}` +
    ' Each set_build_queue item fully replaces the chosen hex queue with one unit type/count.' +
    ` ${MERCENARY_ENVELOPE_ROWS_SENTENCE}`
  );
}

/**
 * One side's observed units, already formatted as id, type, and cell.
 *
 * Purpose: The roster line groups those summaries under the side's home name, then Neutral.
 * When to use: `buildEnemyUnitsPromptLine`.
 * Expected outcome: `roster` is empty when that side has nothing observed. The line omits empty groups.
 * Exceptions: None.
 */
export type EnemyRosterGroup = {
  /**
   * Home display name, or `Neutral`.
   *
   * Contract: The side's `homeRegion`. Neutral uses the word Neutral.
   * When to use: The group label before the colon.
   * Expected outcome: A non-empty name.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * Semicolon-joined unit summaries for this group.
   *
   * Contract: Each summary is `id (type) at cell`. Empty when nothing of this side is observed.
   * When to use: After the colon. Empty groups are omitted.
   * Expected outcome: An empty string or a semicolon-joined list.
   * Exceptions: None.
   */
  readonly roster: string;
};

/**
 * Observed-enemy line, grouped by side and then Neutral.
 *
 * Purpose: The commander sees which enemy each observed unit belongs to.
 * When to use: The system prompt after the tools section. Pass groups in seat order, with Neutral last.
 * Expected outcome: `Enemy units (currently observed): {name}: {roster}; ...`, or the none sentence when every roster is empty.
 * Exceptions: None.
 */
export function buildEnemyUnitsPromptLine(groups: readonly EnemyRosterGroup[]): string {
  const present = groups.filter((group) => group.roster.length > 0);
  logTrace('promptText buildEnemyUnitsPromptLine', { groupCount: present.length });
  if (present.length === 0) {
    return 'Enemy units (currently observed): none. Enemy units may be out of view; actively scout to reacquire contact.';
  }
  return `Enemy units (currently observed): ${present.map((group) => `${group.name}: ${group.roster}`).join('; ')}`;
}

/**
 * Thin adapter from tool flags to the submit-only opening user message.

 * Purpose: Call sites that already hold `PromptToolFlags` should not reconstruct `OpeningMessageGates` by hand.
 * When to use: `requestOrdersFlow` after the system prompt and briefing are assembled.
 * Expected outcome: Delegates to `buildOpeningUserMessage`. Tactical mode never names memory or production tails.
 * Exceptions: None.
 */
export function getInitialUserMessage(
  flags: PromptToolFlags,
  hasPrecomputedBriefing = false,
  coordinateMode: 'strategic' | 'tactical' = 'strategic',
  roster: { readonly hasAirUnits?: boolean; readonly hasMissileUnits?: boolean; readonly hasBestOptionsTable?: boolean } = {}
): string {
  logDebug('promptText getInitialUserMessage', {
    coordinateMode,
    hasPrecomputedBriefing,
    hasAirUnits: roster.hasAirUnits !== false,
    hasMissileUnits: roster.hasMissileUnits === true,
    hasBestOptionsTable: roster.hasBestOptionsTable ?? hasPrecomputedBriefing,
  });
  return buildOpeningUserMessage({
    coordinateMode,
    planningEnabled: flags.planningEnabled,
    ordersEnabled: flags.ordersEnabled && coordinateMode !== 'tactical',
    memoryEnabled: flags.memoryEnabled && coordinateMode !== 'tactical',
    productionEnabled: flags.productionEnabled && coordinateMode !== 'tactical',
    fallbackMovementEnabled: flags.fallbackMovementEnabled,
    hasBriefing: hasPrecomputedBriefing,
    hasAirUnits: roster.hasAirUnits !== false,
    hasMissileUnits: roster.hasMissileUnits === true,
    hasBestOptionsTable: roster.hasBestOptionsTable ?? hasPrecomputedBriefing,
  });
}
