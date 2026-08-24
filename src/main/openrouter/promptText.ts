import type { GameStateSnapshot } from '../gameDb';
import { computeRoundedPercentage } from '../../shared/progressFormatting';
import { getValidDestinations } from '../oneStepMoveDestinations';
import { PRODUCTION_CAP_QUEUE_GUIDANCE } from '../productionCaps';

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
 * Documents the module-scope binding `MOVEMENT_INSTRUCTION_MEMORY_SUFFIX` (MOVEMENT_INSTRUCTION_MEMORY_SUFFIX).

 * Purpose: Supports maintainability by documenting why `MOVEMENT_INSTRUCTION_MEMORY_SUFFIX` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const MOVEMENT_INSTRUCTION_MEMORY_SUFFIX =
  ' Include a memoryUpdates entry (e.g. write key "strategy" tier "persistent") in your final JSON to record your plan.';

/**
 * Documents the module-scope binding `PRODUCTION_REQUIREMENT_BASE` (PRODUCTION_REQUIREMENT_BASE).

 * Purpose: Supports maintainability by documenting why `PRODUCTION_REQUIREMENT_BASE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const PRODUCTION_REQUIREMENT_BASE = 'when at least one controlled hex has availableUnitTypes and an empty queue';
/**
 * Documents the module-scope binding `PRODUCTION_REQUIREMENT_PRIORITY` (PRODUCTION_REQUIREMENT_PRIORITY).

 * Purpose: Supports maintainability by documenting why `PRODUCTION_REQUIREMENT_PRIORITY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const PRODUCTION_REQUIREMENT_PRIORITY =
  'Set exactly one unit type/count per controlled hex queue; each new set replaces the previous queue for that hex.';
/**
 * Documents the module-scope binding `PRODUCTION_REQUIREMENT_PRIORITY_INITIAL` (PRODUCTION_REQUIREMENT_PRIORITY_INITIAL).

 * Purpose: Supports maintainability by documenting why `PRODUCTION_REQUIREMENT_PRIORITY_INITIAL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const PRODUCTION_REQUIREMENT_PRIORITY_INITIAL =
  'Set one unit type/count for each queue you choose to manage this turn.';
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
 * Explains the Best Options table's shared `Unit IDs` cell so a grouped row is not read as belonging to one unit.
 *
 * Purpose: Units stacked on a hex share identical options, and the table lists them together rather than repeating the
 * row per unit. Without this sentence the model can read a multi-id row as naming a single unit and skip the rest.
 * When to use: Best Options coaching in both coordinate modes; keep it adjacent to the copy-a-Target-Hex instruction.
 * Expected outcome: One sentence, embedded mid-bullet, so it stays next to the instruction it qualifies.
 * Exceptions: None.
 */
const BEST_OPTIONS_SHARED_ROW_NOTE =
  'One row can list several unit ids in Unit IDs when those units share the same option; every id listed there may use that row\'s Target Hex.';

/**
 * Tells the model to move air that has nothing in range, since air is the one arm that must relocate to matter.
 *
 * Purpose: Strike range is 3 and ferry range is 4, so a squadron based behind the line can never satisfy the tempo
 * rule from where it stands and is passed over turn after turn. A captured turn had every squadron parked at home
 * with ferry destinations listed in Best Options and no ferry orders issued at all. Like the tempo rule, this says
 * nothing about the engine's fallback: the model picks better bases than "closest to the nearest enemy" when it
 * engages with the decision, and stops picking at all once it believes the move happens regardless.
 * When to use: Strategic tool-usage guidance. Tactical beats bound ferrying to the battle footprint instead.
 * Expected outcome: One markdown bullet, worded for strategic ferry ranges.
 * Exceptions: None.
 */
const AIR_REPOSITIONING_LINE =
  '- Air repositioning: an air unit only contributes on a turn when an enemy is within strike range of its base, and ferrying costs it nothing else that turn. For every air unit with no strike listed in Best Options, take its ferry Target Hex toward the fighting and put it in ferryOrders; a squadron left at a quiet base is a whole unit contributing nothing. An air unit cannot strike and ferry on the same turn, so ferry only the ones with no shot.';

/**
 * Builds the tempo-rule bullet telling the model to fire every unit that legally can, and to pick the targets itself.
 *
 * Purpose: Attacks resolve from turn-start positions and never cost a move, so declining one is always a loss. The
 * bullet also points at the two briefing surfaces that list the available shots, because a model reading a large
 * briefing otherwise has to rediscover them. It deliberately says nothing about any fallback that fires on the
 * model's behalf: a model told its units will shoot anyway stops choosing targets, and target choice is the part
 * only the model can do well.
 * When to use: Tool-usage guidance in both coordinate modes, which differ only in whether a period is a turn or a beat.
 * Expected outcome: One markdown bullet using the caller's noun for the period.
 * Exceptions: None.
 */
function buildTempoRuleLine(periodNoun: 'turn' | 'beat'): string {
  return `- Tempo rule: every unit that can legally attack this ${periodNoun} should be given a ranged_attack or air strike, and you choose each target. These resolve from ${periodNoun === 'beat' ? 'beat' : 'turn'}-start positions, so a unit can attack and move in the same ${periodNoun} — attacking never costs you a move. Work through the Best Options ranged and air strike rows, and the units whose Action needed is yes; every one you leave unfired is damage given up for free.`;
}

/**
 * Defines the `buildLatLngPreamble` function shape (export function buildLatLngPreamble(h3Resolution: number, decimalPlaces: number): string).

 * Purpose: Supports maintainability by documenting why `buildLatLngPreamble` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildLatLngPreamble(h3Resolution: number, decimalPlaces: number): string {
  void decimalPlaces;
  return `Global Earth map, H3 resolution ${h3Resolution}. Positions are two-character briefing hex codes (A–Z and 0–9) from the operational map and Unit Status table — copy exactly; never invent codes. Distances are hex counts where shown.

Final JSON: use briefing hex codes for cells; standing-order pursue uses enemy unit id (targetUnitId). Never emit raw H3 strings or latitude/longitude pairs.`;
}

/**
 * Opening geography clause for tactical (res4) AI prompts inside one strategic res1 footprint.
 *
 * Purpose: Avoids claiming “global res1” context when the operational map is the local res4 child grid.
 * When to use: `buildSystemPromptForTools` when `coordinateContext.mode === 'tactical'`.
 * Expected outcome: Two-character tactical codes and adjacency semantics aligned with the tactical operational map section.
 * Exceptions: None.
 */
export function buildTacticalLatLngPreamble(decimalPlaces: number): string {
  void decimalPlaces;
  return `Tactical battle map: H3 resolution 4 children inside the enclosing strategic res1 hex. Positions are two-character tactical briefing hex codes (A–Z and 0–9) from the operational map and Unit Status table — copy exactly; never invent codes. Distances are res4 hex steps where shown.

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
 * Builds the Available Tools intro paragraph (before numbered tool lines).
 *
 * Purpose: One source for the briefing vs no-briefing tool intro, including Best Options dest copy and strategic standing-order primacy.
 * When to use: `buildSystemPromptForTools` after computing tool flags and whether a briefing override is attached.
 * Expected outcome: A single paragraph. Briefing+planning tells the model to copy approach/move/melee Target Hexes into explicit_move, ferry Target Hexes into ferryOrders, and to call plan_route only for dests not listed for that unit. Strategic adds optional query_orders / memory / production hints and does not tell the model to explicit_move every unit.
 * Exceptions: None.
 */
export function buildAvailableToolsIntro(
  flags: PromptToolFlags,
  hasPrecomputedBriefing = false,
  coordinateMode: 'strategic' | 'tactical' = 'strategic'
): string {
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
    return "Use the Commander's Briefing above for assessments and possible unit actions. Copy Best Options This Turn approach and move/melee Target Hexes into explicit_move; copy air strike Target Hexes into airStrikes; use plan_route only for dests not listed for that sub-unit.";
  }
  const extraHints: string[] = [];
  if (flags.ordersEnabled) {
    extraHints.push('standing-order status is already in the briefing (query_orders only for rare detail)');
  }
  if (flags.memoryEnabled) extraHints.push('memory lookup (memory_read)');
  if (flags.productionEnabled) extraHints.push('production queue checks/sets');
  const extra = extraHints.length > 0 ? ` Use tools selectively for ${extraHints.join(', ')} when needed.` : '';
  return (
    "Use the Commander's Briefing above for assessments and possible unit actions. Copy Best Options This Turn approach and move/melee Target Hexes into explicit_move when you need a one-step move; copy ferry Target Hexes into ferryOrders. Use plan_route only for dests not listed for that unit." +
    extra
  );
}

/**
 * Builds mode-aware tool-usage coaching bullets for the Available Tools section.
 *
 * Purpose: Keeps strategic vs tactical briefing guidance aligned with which sections and tools are actually present, including copying Best Options dests by action type (explicit_move vs ferryOrders vs airStrikes) instead of one plan_route per unit.
 * When to use: `buildSystemPromptForTools` after computing tool flags and whether a briefing override is attached.
 * Expected outcome: Markdown bullet lines; tactical mode omits supplemental-hex / assign_order coaching that does not apply in-battle.
 * Exceptions: None.
 */
export function buildToolUsageGuidance(
  flags: PromptToolFlags,
  hasPrecomputedBriefing = false,
  coordinateMode: 'strategic' | 'tactical' = 'strategic'
): string {
  const lines: string[] = [];
  if (hasPrecomputedBriefing) {
    lines.push(
      coordinateMode === 'tactical'
        ? '- The Commander\'s Briefing above already contains unit status, attention flags, and possible unit actions for this tactical beat. Do NOT call assess_unit, assess_hex, or estimate_combat — that information is already in the briefing. Use the briefing to decide targets and priorities.'
        : '- The Commander\'s Briefing above already contains unit status, attention flags, possible unit actions, and supplemental hex intelligence for this turn. Do NOT call assess_unit, assess_hex, or estimate_combat — that information is already in the briefing. Use the briefing to decide targets and priorities.'
    );
    if (flags.planningEnabled) {
      lines.push(
        coordinateMode === 'tactical'
          ? `- Best Options This Turn Target Hexes are already this-beat legal destinations. ${BEST_OPTIONS_SHARED_ROW_NOTE} Copy a Target Hex from a row listing that sub-unit into explicit_move.destination; copy an air strike Target Hex into airStrikes. Do not call plan_route for those dests. Call plan_route only when you need a destination not listed for that sub-unit. After dests are chosen, submit — do not re-assess or re-route.`
          : `- Best Options This Turn Target Hexes are already this-turn legal destinations. ${BEST_OPTIONS_SHARED_ROW_NOTE} Copy a Target Hex from a row listing that unit into explicit_move.destination when you need a one-step move; copy a ferry Target Hex into ferryOrders; copy an air strike Target Hex into airStrikes. Do not call plan_route for those dests. Call plan_route only when you need a destination not listed for that unit. After dests are chosen, submit — do not re-assess or re-route.`
      );
    }
    if (coordinateMode === 'tactical') {
      lines.push(
        '- Do not emit assign_order or cancel_order for tactical sub-unit ids (blocked this beat). Issue explicit_move for every sub-unit that has a Best Options approach or move/melee row this beat, plus ranged_attack and air strikes as needed. Standing orders do not move units in tactical battle.'
      );
      lines.push(buildTempoRuleLine('beat'));
      lines.push(
        '- Sealift (when Naval Transport Status is present): issue embark / transport_move / disembark in orders[] as needed; while embarked, explicit_move and disembark both clear cargo and march in one action.'
      );
    } else if (flags.ordersEnabled) {
      lines.push(
        '- Standing orders: for every unit listed under ## Units Without Standing Orders in the briefing, add an orders[] entry with action assign_order (march/pursue for closing; defend to hold). That table\'s Suggested Destination column already holds a legal hex that closes on the nearest enemy — march there unless you have a better destination in mind, and use defend only when you actually want the unit to hold. Never march to the unit\'s current Hex; that order is dropped as already arrived and the unit stays idle. When you need a one-step explicit_move this turn, copy a Best Options approach or move/melee Target Hex that is not the current cell, or assign defend to hold. Copy ferry Target Hexes into ferryOrders. Call plan_route only for dests not listed there.'
      );
      lines.push(buildTempoRuleLine('turn'));
      lines.push(AIR_REPOSITIONING_LINE);
    }
    if (flags.memoryEnabled) {
      lines.push(
        '- Put concise plan intent in the final JSON memoryUpdates (write) instead of ad-hoc memory_write tool calls.'
      );
    }
  } else {
    if (flags.ordersEnabled || flags.memoryEnabled) {
      lines.push('- Start by reviewing your standing order statuses and persistent strategic memory (both are shown above).');
    }
    if (flags.assessmentEnabled) {
      lines.push('- Use assess_unit on units near the enemy to understand the tactical picture. Skip assessment for rear-echelon units far from all enemies — their situation rarely changes turn to turn. If multiple units share the same hex, assess only one — the results will be identical.');
    }
    if (flags.estimationEnabled) {
      lines.push('- Use estimate_combat before any attack. Do not guess at combat odds.');
    }
    if (flags.planningEnabled) {
      lines.push('- Use plan_route to understand multi-turn moves before issuing orders.');
    }
  }
  if (flags.memoryEnabled) {
    lines.push(
      '- memoryUpdates / tiers: "persistent" entries appear in every briefing (limit 5); "stored" are retrieved via memory_read (limit 15).'
    );
  }
  if (flags.ordersEnabled && coordinateMode !== 'tactical') {
    lines.push('- Units with standing orders do not need explicit orders from you unless you want to override their current mission this turn.');
    if (flags.planningEnabled && !hasPrecomputedBriefing) {
      lines.push('- For units several turns from combat, use assign_order (march/pursue) in final JSON instead of re-planning every turn.');
    }
    lines.push('- Sealift: use the # Naval Transport Status section for each naval unit (capacity, cargo already aboard, nearest embark hex); issue embark / transport_move / disembark in orders[] when crossing water. While embarked, explicit_move and disembark both clear cargo and march in one action.');
  }
  if (flags.memoryEnabled) {
    lines.push(
      '- BEFORE finishing: include memoryUpdates write key "strategy" tier "persistent" with specific unit-to-target ETAs and priorities.' +
      ' Do NOT store enemy positions or rosters (already in the briefing). Do not claim "no observed human units" when the briefing lists observed human units. Keep it concise.'
    );
  }
  if (flags.productionEnabled) {
    lines.push(
      '- Production: use query_production to inspect controlled-hex queues and constraints; use set_build_queue to set one unit type/count for a queue (this replaces existing queue entries). If skipping tools, you may include productionOrders in final JSON.'
    );
    lines.push(
      `- Production requirement: ${PRODUCTION_REQUIREMENT_BASE}, queue at least one build this turn (via tools or productionOrders). ${PRODUCTION_REQUIREMENT_PRIORITY}`
    );
    lines.push(`- ${PRODUCTION_CAP_GUIDANCE}`);
    lines.push(
      '- Queue production aggressively: set_build_queue on every controlled hex that can build, so queues keep running if you lose hexes and reinforcements spawn closer to the front.'
    );
  }
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
    ' {"action":"set_build_queue","hex":"<two-char code>","unitType":"infantry|armor|naval|air","count":1..99}.' +
    ' Any productionOrders item missing "action" or required fields is dropped.' +
    ` ${PRODUCTION_REQUIREMENT_BASE}, include at least one set_build_queue this turn.` +
    ` ${PRODUCTION_CAP_GUIDANCE}` +
    ' Each set_build_queue item fully replaces the chosen hex queue with one unit type/count.'
  );
}

/**
 * Defines the `buildHumanUnitsPromptLine` function shape (export function buildHumanUnitsPromptLine(humanRoster: string): string).

 * Purpose: Supports maintainability by documenting why `buildHumanUnitsPromptLine` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildHumanUnitsPromptLine(humanRoster: string): string {
  if (humanRoster.length > 0) return `Human units (currently observed): ${humanRoster}`;
  return 'Human units (currently observed): none. Enemy units may be out of view; actively scout to reacquire contact.';
}

/**
 * Builds the first user turn that asks the model to consult the briefing and submit orders JSON.

 * Purpose: With a precomputed briefing, tells the model to copy Best Options dests by action type (explicit_move vs ferryOrders vs airStrikes) and to call plan_route only for dests not listed for that unit.
 * When to use: `requestOrdersFlow` after the system prompt and briefing are assembled.
 * Expected outcome: One user-message string; tactical mode omits assign_order/cancel_order.
 * Exceptions: None.
 */
export function getInitialUserMessage(
  flags: PromptToolFlags,
  hasPrecomputedBriefing = false,
  coordinateMode: 'strategic' | 'tactical' = 'strategic'
): string {
  const productionSuffix = flags.productionEnabled
    ? ', optional "productionOrders" (EVERY item must include action + required fields)'
    : '';
  const jsonOptionalTail = flags.memoryEnabled
    ? `, optional "callbacks", optional "memoryUpdates"${productionSuffix}`
    : `, optional "callbacks"${productionSuffix}`;
  if (flags.planningEnabled) {
    const memoryNote = flags.memoryEnabled
      ? ' After your analysis, include memoryUpdates in your final JSON for strategy notes. '
      : '';
    const productionNote = flags.productionEnabled
      ? ` Also ensure production is actively queued when viable: ${PRODUCTION_REQUIREMENT_BASE}, include at least one production action. ${PRODUCTION_REQUIREMENT_PRIORITY_INITIAL} ${PRODUCTION_CAP_GUIDANCE} Prefer setting queues on every eligible controlled hex so production survives territory swings and reinforcements stay close to the front. `
      : '';
    if (hasPrecomputedBriefing) {
      if (coordinateMode === 'tactical') {
        return `Use the Commander's Briefing above for unit status, attention flags, and possible unit actions this tactical beat. For every sub-unit with a Best Options approach or move/melee row, copy a Target Hex from that sub-unit's Best Options This Turn row into explicit_move.destination. Call plan_route only if you need a dest not listed for that sub-unit. Then submit final JSON with "message", "strategy", "orders" (explicit_move / ranged_attack as needed; do not use assign_order or cancel_order)${jsonOptionalTail}.`;
      }
      const ordersNudge = flags.ordersEnabled
        ? ' For units without standing orders in the briefing, include assign_order entries in orders[]. '
        : '';
      return `Use the Commander's Briefing above for unit status, attention flags, possible unit actions, and supplemental hex intelligence.${ordersNudge}Copy Best Options approach and move/melee Target Hexes into explicit_move when you need a one-step move this turn; copy ferry Target Hexes into ferryOrders. Call plan_route only if you need a dest not listed for that unit.${memoryNote}${productionNote} Then submit final JSON with "message", "strategy", "orders" (assign_order / explicit_move / ranged_attack / cancel_order as needed)${jsonOptionalTail}.`;
    }
    return `Use the tools as needed to plan movement.${memoryNote}${productionNote} Then submit final JSON with "message", "strategy", "orders"${jsonOptionalTail}.`;
  }

  const submitEmpty =
    ' Then submit final JSON with "message": "<one-line taunt or threat>", "strategy": "<one-line>", "orders": [].';
  if (flags.ordersEnabled && flags.memoryEnabled) {
    return `You have no movement planning tools: use assign_order in orders[] and memoryUpdates for notes.${submitEmpty}`;
  }
  if (flags.ordersEnabled) {
    return `You have no movement planning tools: use assign_order in orders[] for future turns.${submitEmpty}`;
  }
  if (flags.fallbackMovementEnabled) {
    const memoryNudge = flags.memoryEnabled ? ' Include memoryUpdates if needed. ' : '';
    return `${memoryNudge}Use explicit_move from the Adjacent cells list only. Submit JSON with "message", "strategy", "orders"${jsonOptionalTail}.`;
  }
  if (flags.memoryEnabled) {
    return `You have no movement planning tools. Use memoryUpdates in final JSON.${submitEmpty}`;
  }

  return 'You have no movement planning tools. Submit JSON with "message", "strategy", "orders": [].';
}
