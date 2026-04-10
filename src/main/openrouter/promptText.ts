import type { GameStateSnapshot } from '../gameDb';
import { computeRoundedPercentage } from '../../shared/progressFormatting';

export interface PromptToolFlags {
  planningEnabled: boolean;
  assessmentEnabled: boolean;
  estimationEnabled: boolean;
  memoryEnabled: boolean;
  ordersEnabled: boolean;
  productionEnabled: boolean;
  fallbackMovementEnabled: boolean;
}

/** Optional suffix when Memory is enabled: persistent strategy belongs in memoryUpdates in final JSON. */
const MOVEMENT_INSTRUCTION_MEMORY_SUFFIX =
  ' Include a memoryUpdates entry (e.g. write key "strategy" tier "persistent") in your final JSON to record your plan.';

const PRODUCTION_REQUIREMENT_BASE = 'when at least one controlled hex has availableUnitTypes and an empty queue';
const PRODUCTION_REQUIREMENT_PRIORITY =
  'Set exactly one unit type/count per controlled hex queue; each new set replaces the previous queue for that hex.';
const PRODUCTION_REQUIREMENT_PRIORITY_INITIAL =
  'Set one unit type/count for each queue you choose to manage this turn.';

export function buildLatLngPreamble(h3Resolution: number, decimalPlaces: number): string {
  return `Global Earth map, H3 resolution ${h3Resolution}. All positions are [lat, lng] at ${decimalPlaces} decimal places — copy exactly from lists/tables below; never invent coordinates. Distances are hex counts where shown.

Final JSON: place targets as [lat,lng]; standing-order pursue uses enemy unit id (targetUnitId). Never emit raw H3 strings.`;
}

/** Use this to format "<label>: X of Y ... (Z%)" progress bullets in the system prompt. */
export function formatControlProgressLine(label: string, controlled: number, total: number, subjectLabel = 'hexes'): string {
  return `- ${label}: ${controlled} of ${total} ${subjectLabel} (${computeRoundedPercentage(controlled, total)}%)`;
}

/** Formats [lat, lng] for prompts using fixed decimal precision. */
export function formatLatLng(ll: [number, number], decimalPlaces: number): string {
  return `[${ll[0].toFixed(decimalPlaces)}, ${ll[1].toFixed(decimalPlaces)}]`;
}

/**
 * Builds the "HOW TO USE TOOLS" guidance block, conditional on enabled tool groups.
 */
export function buildToolUsageGuidance(flags: PromptToolFlags, hasPrecomputedBriefing = false): string {
  const lines: string[] = [];
  if (hasPrecomputedBriefing) {
    lines.push(
      '- The COMMANDER\'S BRIEFING above already contains unit assessments, possible unit actions, and supplemental hex intelligence for this turn. Do NOT call assess_unit, assess_hex, or estimate_combat — that information is already in the briefing. Use the briefing to decide targets and priorities.'
    );
    if (flags.planningEnabled) {
      lines.push(
        '- Use plan_route only when you need the exact orderToXY for a unit\'s move. Call it sparingly (e.g. one per unit that needs to move); the briefing already summarizes nearest enemies, distances, and legal tactical options. After you have orderToXY for each unit that needs orders, submit — do not re-assess or re-route.'
      );
    }
    if (flags.ordersEnabled) {
      lines.push(
        '- Standing orders: for every unit listed as "Units without standing orders" in the briefing, add an orders[] entry with action assign_order (march/pursue for closing; defend to hold). Then use plan_route and explicit_move in orders[] only where you need a one-step move this turn.'
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
  if (flags.ordersEnabled) {
    lines.push('- Units with standing orders do not need explicit orders from you unless you want to override their current mission this turn.');
    if (flags.planningEnabled && !hasPrecomputedBriefing) {
      lines.push('- For units several turns from combat, use assign_order (march/pursue) in final JSON instead of re-planning every turn.');
    }
    lines.push('- Sealift: use === NAVAL TRANSPORT STATUS === for each naval unit (capacity, co-located land, nearest embark hex); issue embark / transport_move / disembark in orders[] when crossing water.');
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

/** Builds the "Adjacent cells (fallback)" block when Planning and Orders are both disabled. */
export function buildAdjacentCellsFallbackBlock(
  state: GameStateSnapshot,
  opponentUnits: { id: string; h3Index: string; unitType: string }[],
  coordMap: { latLngByH3: Map<string, [number, number]>; format: (h3: string) => string },
  getValidDestinationsUnoccupied: (unit: { h3Index: string; unitType: string }, state: GameStateSnapshot) => string[]
): string {
  const { latLngByH3, format } = coordMap;
  const lines: string[] = [];
  for (const u of opponentUnits.filter((unit) => latLngByH3.has(unit.h3Index))) {
    const current = format(u.h3Index);
    const dests = getValidDestinationsUnoccupied(u, state)
      .filter((h3) => latLngByH3.has(h3))
      .map((h3) => format(h3));
    const cells = dests.length ? `${current} (hold), or move to: ${dests.join(', ')}` : `${current} (hold only; no empty adjacent cells)`;
    lines.push(`${u.id}: ${cells}`);
  }
  if (lines.length === 0) return '';
  return `\nAdjacent cells (fallback for one-step moves when no planning/orders tools are available; prefer plan_route or standing orders when enabled):\n${lines.join('\n')}\n`;
}

/** Returns the movement-order instruction fragment for the system prompt. */
export function getMovementOrderInstruction(flags: PromptToolFlags): string {
  const memorySuffix = flags.memoryEnabled ? MOVEMENT_INSTRUCTION_MEMORY_SUFFIX : '';
  if (flags.planningEnabled) {
    return ' For each explicit_move entry: set "destination" to the exact orderToXY from that unit\'s plan_route result [lat,lng] (copy the two numbers exactly).';
  }
  if (flags.ordersEnabled) {
    return (
      ' You have no movement planning tools: you cannot compute valid one-step explicit_move destinations yourself. Use assign_order in orders[] for standing missions; leave explicit_move / ranged_attack out unless you can copy valid [lat,lng] from the briefing only.' +
      memorySuffix
    );
  }
  if (flags.fallbackMovementEnabled) {
    const memoryHint = flags.memoryEnabled ? ' After your analysis, add memoryUpdates in final JSON if needed. ' : '';
    return (
      memoryHint +
      'Without planning/standing-order tools, use explicit_move with "destination" [lat,lng] only from the "Adjacent cells (fallback)" list (current cell = hold, or an adjacent listed cell).' +
      memorySuffix
    );
  }
  return (
    ' You have no movement planning tools: submit orders[] without explicit_move unless coordinates are trivially valid from the briefing.' +
    memorySuffix
  );
}

export function buildProductionSubmitClause(flags: PromptToolFlags): string {
  if (!flags.productionEnabled) return '';
  return (
    ' "productionOrders" entries MUST include "action" on every item. Required forms:' +
    ' {"action":"set_build_queue","hex":[lat,lng],"unitType":"infantry|armor|naval|air","count":1..99}.' +
    ' Any productionOrders item missing "action" or required fields is dropped.' +
    ` ${PRODUCTION_REQUIREMENT_BASE}, include at least one set_build_queue this turn.` +
    ' Each set_build_queue item fully replaces the chosen hex queue with one unit type/count.'
  );
}

export function buildHumanUnitsPromptLine(humanRoster: string): string {
  if (humanRoster.length > 0) return `Human units (currently observed): ${humanRoster}`;
  return 'Human units (currently observed): none. Enemy units may be out of view; actively scout to reacquire contact.';
}

/** Returns the initial user message for the tool-calling flow. */
export function getInitialUserMessage(flags: PromptToolFlags, hasPrecomputedBriefing = false): string {
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
      const ordersNudge = flags.ordersEnabled
        ? ' For units without standing orders in the briefing, include assign_order entries in orders[]. Then use plan_route and explicit_move only where needed this turn. '
        : '';
      return `Use the COMMANDER'S BRIEFING above for unit status, possible unit actions, and supplemental hex intelligence.${ordersNudge}Call plan_route for each unit that needs a move (orderToXY).${memoryNote}${productionNote} Then submit final JSON with "strategy", "orders" (assign_order / explicit_move / ranged_attack / cancel_order as needed)${jsonOptionalTail}.`;
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
