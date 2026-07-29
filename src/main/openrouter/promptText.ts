import type { GameStateSnapshot } from '../gameDb';
import { computeRoundedPercentage } from '../../shared/progressFormatting';
import { getValidDestinations } from '../oneStepMoveDestinations';

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
 * Builds mode-aware tool-usage coaching bullets for the Available Tools section.
 *
 * Purpose: Keeps strategic vs tactical briefing guidance aligned with which sections and tools are actually present.
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
        '- Use plan_route only when you need the exact orderToHexCode for a unit\'s move. Call it sparingly (e.g. one per unit that needs to move); the briefing already summarizes nearest enemies, distances, and legal options. After you have orderToHexCode for each unit that needs orders, submit — do not re-assess or re-route.'
      );
    }
    if (coordinateMode === 'tactical') {
      lines.push(
        '- Do not emit assign_order or cancel_order for tactical sub-unit ids (blocked this beat). Issue explicit_move for every sub-unit that should march this beat, plus ranged_attack and air strikes as needed. Standing orders do not move units in tactical battle.'
      );
      lines.push(
        '- Tempo rule: if any unit can make a legal ranged_attack or air strike this turn, do it now. Ranged attacks and air strikes use turn-start positions and can be combined with movement orders in the same turn.'
      );
      lines.push(
        '- Sealift (when Naval Transport Status is present): issue embark / transport_move / disembark in orders[] as needed; while embarked, explicit_move and disembark both clear cargo and march in one action.'
      );
    } else if (flags.ordersEnabled) {
      lines.push(
        '- Standing orders: for every unit listed under ## Units Without Standing Orders in the briefing, add an orders[] entry with action assign_order (march/pursue for closing; defend to hold). Then use plan_route and explicit_move in orders[] only where you need a one-step move this turn.'
      );
      lines.push(
        '- Tempo rule: if any unit can make a legal ranged_attack or air strike this turn, do it now. Ranged attacks and air strikes use turn-start positions and can be combined with movement orders in the same turn.'
      );
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
    lines.push('- Sealift: use the # Naval Transport Status section for each naval unit (capacity, co-located land, nearest embark hex); issue embark / transport_move / disembark in orders[] when crossing water. While embarked, explicit_move and disembark both clear cargo and march in one action.');
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
 * Defines the `getMovementOrderInstruction` function shape (export function getMovementOrderInstruction(flags: PromptToolFlags, coordinateMode?: 'strategic' | 'tactical'): string).

 * Purpose: Supports maintainability by documenting why `getMovementOrderInstruction` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getMovementOrderInstruction(
  flags: PromptToolFlags,
  /**
   * When `tactical`, appends march reachability guidance so explicit_move rows match terrain-weighted tactical validation (same checks as Ready commit).
   */
  coordinateMode: 'strategic' | 'tactical' = 'strategic'
): string {
  const memorySuffix = flags.memoryEnabled ? MOVEMENT_INSTRUCTION_MEMORY_SUFFIX : '';
  const tacticalMarchReachabilityClause =
    coordinateMode === 'tactical'
      ? ' Tactical marches use terrain-weighted MP budgets per beat; when a finite-cost path exists, the server applies at most the first leg toward each explicit_move destination (same truncation as human Ready). When the continuity planner rejects the full destination but a footprint neighbor still advances you on the H3 grid toward that hex, the server may take that one-step fallback. Copy plan_route\'s orderToHexCode exactly, not a guessed adjacent code.'
      : '';
  if (flags.planningEnabled) {
    return (
      ' For each explicit_move entry: set "destination" to the exact orderToHexCode from that unit\'s plan_route result (copy the two-character code exactly).' +
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
 * Defines the `getInitialUserMessage` function shape (export function getInitialUserMessage(flags: PromptToolFlags, hasPrecomputedBriefing = false, coordinateMode?: 'strategic' | 'tactical'): string).

 * Purpose: Supports maintainability by documenting why `getInitialUserMessage` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
      ? ` Also ensure production is actively queued when viable: ${PRODUCTION_REQUIREMENT_BASE}, include at least one production action. ${PRODUCTION_REQUIREMENT_PRIORITY_INITIAL} Prefer setting queues on every eligible controlled hex so production survives territory swings and reinforcements stay close to the front. `
      : '';
    if (hasPrecomputedBriefing) {
      if (coordinateMode === 'tactical') {
        return `Use the Commander's Briefing above for unit status, attention flags, and possible unit actions this tactical beat. Call plan_route for each sub-unit that needs a move (orderToHexCode). Then submit final JSON with "strategy", "orders" (explicit_move / ranged_attack as needed; do not use assign_order or cancel_order)${jsonOptionalTail}.`;
      }
      const ordersNudge = flags.ordersEnabled
        ? ' For units without standing orders in the briefing, include assign_order entries in orders[]. Then use plan_route and explicit_move only where needed this turn. '
        : '';
      return `Use the Commander's Briefing above for unit status, attention flags, possible unit actions, and supplemental hex intelligence.${ordersNudge}Call plan_route for each unit that needs a move (orderToHexCode).${memoryNote}${productionNote} Then submit final JSON with "strategy", "orders" (assign_order / explicit_move / ranged_attack / cancel_order as needed)${jsonOptionalTail}.`;
    }
    return `Use the tools as needed to plan movement.${memoryNote}${productionNote} Then submit final JSON with "strategy", "orders"${jsonOptionalTail}.`;
  }

  const submitEmpty = ' Then submit final JSON with "strategy": "<one-line>", "orders": [].';
  if (flags.ordersEnabled && flags.memoryEnabled) {
    return `You have no movement planning tools: use assign_order in orders[] and memoryUpdates for notes.${submitEmpty}`;
  }
  if (flags.ordersEnabled) {
    return `You have no movement planning tools: use assign_order in orders[] for future turns.${submitEmpty}`;
  }
  if (flags.fallbackMovementEnabled) {
    const memoryNudge = flags.memoryEnabled ? ' Include memoryUpdates if needed. ' : '';
    return `${memoryNudge}Use explicit_move from the Adjacent cells list only. Submit JSON with "strategy", "orders"${jsonOptionalTail}.`;
  }
  if (flags.memoryEnabled) {
    return `You have no movement planning tools. Use memoryUpdates in final JSON.${submitEmpty}`;
  }

  return 'You have no movement planning tools. Submit JSON with "strategy", "orders": [].';
}
