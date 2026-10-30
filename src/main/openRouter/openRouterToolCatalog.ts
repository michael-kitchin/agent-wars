import { ALL_BUILD_UNIT_TYPES } from '../../shared/ipc/productionTypes';
import { ALL_BUILD_QUEUE_ITEM_TYPES } from '../productionRules';
import { HIREABLE_UNIT_TYPES } from '../../shared/mercenaryRules';
import { NAVAL_PLAN_ROUTE_PROMPT_SUFFIX } from '../navalMovementMessages';
import { logTrace } from '../logger';

/** JSON Schema `enum` values for tool params that accept a `BuildUnitType`; mirrors `ALL_BUILD_UNIT_TYPES`. */
const BUILD_UNIT_TYPE_SCHEMA_ENUM = [...ALL_BUILD_UNIT_TYPES];

/** JSON Schema `enum` values for a build queue item, including fortification. */
const BUILD_QUEUE_ITEM_SCHEMA_ENUM = [...ALL_BUILD_QUEUE_ITEM_TYPES];

/**
 * Static OpenRouter tool metadata and JSON-schema definitions for chat completions.
 */
/**
 * Documents the `ToolDef` interface as a named contract surface (interface ToolDef).

 * Purpose: Supports maintainability by documenting why `ToolDef` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface ToolDef {
    /**
   * Specifies the contract for the `type` member (type: 'function';).

   * Contract: Describes stable behavior for callers of `type` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
type: 'function';
    /**
   * Specifies the contract for the `function` member (function: { name: string; description: string; parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] } };).

   * Contract: Describes stable behavior for callers of `function` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
function: { name: string; description: string; parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] } };
}

/**
 * Documents the `ToolMeta` interface as a named contract surface (interface ToolMeta).

 * Purpose: Supports maintainability by documenting why `ToolMeta` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface ToolMeta {
    /**
   * Specifies the contract for the `name` member (name: string;).

   * Contract: Describes stable behavior for callers of `name` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
name: string;
    /**
   * Specifies the contract for the `description` member (description: string;).

   * Contract: Describes stable behavior for callers of `description` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
description: string;
    /**
   * Specifies the contract for the `parameters` member (parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };).

   * Contract: Describes stable behavior for callers of `parameters` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
    /**
   * Specifies the contract for the `promptLine` member (promptLine: string;).

   * Contract: Describes stable behavior for callers of `promptLine` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
promptLine: string;
}

/**
 * Documents the module-scope binding `ALL_TOOL_METADATA` (ALL_TOOL_METADATA: ToolMeta[]).

 * Purpose: Supports maintainability by documenting why `ALL_TOOL_METADATA` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const ALL_TOOL_METADATA: ToolMeta[] = [
  {
    name: 'plan_route',
    description: 'Compute the optimal path for a unit to a destination hex. Returns the full multi-turn route with per-turn waypoints. Use to understand how long moves take before committing.',
    parameters: {
      type: 'object',
      properties: {
        unitId: { type: 'string', description: 'ID of the unit to route (e.g. a1-t1)' },
        destination: { type: 'string', pattern: '^[A-Z0-9]{2}$', description: 'Target cell as two-character briefing hex code from the operational map' },
        options: {
          type: 'object',
          properties: {
            avoidEnemies: { type: 'boolean', description: 'Route around known enemy positions (default true)' },
            maxTurns: { type: 'number', description: 'Stop if route exceeds this many turns' },
          },
        },
      },
      required: ['unitId', 'destination'],
    },
    promptLine: `plan_route(unitId, destination, options?) - Path and orderToHexCode. Skip this tool when the dest is already a Best Options This Turn Target Hex for that unit (copy approach/move/melee into explicit_move, ferry into ferryOrders). Otherwise copy orderToHexCode into explicit_move.destination.${NAVAL_PLAN_ROUTE_PROMPT_SUFFIX}`,
  },
  {
    name: 'check_distance',
    description: 'Quick distance and turn estimate between two hexes for a unit type. Use to compare options before requesting full routes.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', pattern: '^[A-Z0-9]{2}$', description: 'Origin briefing hex code' },
        to: { type: 'string', pattern: '^[A-Z0-9]{2}$', description: 'Destination briefing hex code' },
        unitType: { type: 'string', enum: ['infantry', 'armor', 'naval', 'air'], description: 'Unit type for movement budget' },
      },
      required: ['from', 'to', 'unitType'],
    },
    promptLine: 'check_distance(from, to, unitType) - Quick distance and turn estimate between two hexes. Use to compare options; skip plan_route when the dest is already a Best Options Target Hex for that unit.',
  },
  {
    name: 'assess_unit',
    description: 'Tactical briefing on one of your units: nearby enemies and friendlies, threats, and what you can attack now (this turn, or this beat in a battle).',
    parameters: {
      type: 'object',
      properties: {
        unitId: { type: 'string', description: 'ID of the unit to assess (e.g. a1-t1)' },
        radius: { type: 'number', description: 'How far out to scan in hexes (default 4); battle cells during a battle. Ignored when fog of war is off on the strategic map: all units are included using H3 grid hops.' },
      },
      required: ['unitId'],
    },
    promptLine: 'assess_unit(unitId, radius?) - Tactical briefing on one of your units: nearby enemies and friendlies, threats, and what you can attack this turn.',
  },
  {
    name: 'assess_hex',
    description: 'Intelligence on a hex: terrain, units present, units that can attack it, chokepoint analysis.',
    parameters: {
      type: 'object',
      properties: {
        position: { type: 'string', pattern: '^[A-Z0-9]{2}$', description: 'Cell to assess as briefing hex code' },
        forUnitType: { type: 'string', enum: BUILD_UNIT_TYPE_SCHEMA_ENUM, description: 'Assess from this unit type perspective (for chokepoint)' },
      },
      required: ['position'],
    },
    promptLine: 'assess_hex(position, forUnitType?) - Intelligence on a hex: terrain, units present, units in range, chokepoint analysis.',
  },
  {
    name: 'estimate_combat',
    description: 'Predict the outcome of a single ranged or melee engagement. Returns win probability, expected casualties, and a tactical assessment. Melee results average both random attacker/defender role assignments. During a battle, air strikes are not covered. Always check before committing to an attack.',
    parameters: {
      type: 'object',
      properties: {
        engagementType: { type: 'string', enum: ['ranged', 'melee'], description: 'Type of engagement' },
        attackers: {
          type: 'object',
          properties: {
            units: { type: 'array', items: { type: 'string' }, description: 'Attacking unit IDs' },
            assumed: {
              type: 'array',
              items: { type: 'object', properties: { type: { type: 'string' }, count: { type: 'number' } }, required: ['type', 'count'] },
              description: 'Hypothetical attackers by type and count (for what-if)',
            },
          },
          description: 'Attackers: either units (IDs) or assumed (type, count)',
        },
        targetHex: { type: 'string', pattern: '^[A-Z0-9]{2}$', description: 'Defender cell as briefing hex code' },
        defenders: {
          type: 'object',
          properties: {
            units: { type: 'array', items: { type: 'string' }, description: 'Defender unit IDs (overrides auto-detect)' },
            assumed: {
              type: 'array',
              items: { type: 'object', properties: { type: { type: 'string' }, count: { type: 'number' } }, required: ['type', 'count'] },
              description: 'Hypothetical defenders by type and count',
            },
          },
          description: 'Optional. If omitted, defenders at target hex are used.',
        },
      },
      required: ['engagementType', 'attackers', 'targetHex'],
    },
    promptLine: 'estimate_combat(engagementType, attackers, targetHex, defenders?) - Predict the outcome of a ranged or melee engagement. Returns win probability, expected casualties, and a tactical assessment. Always check before committing to an attack.',
  },
  {
    name: 'memory_read',
    description: 'Retrieve memories by key, tag, or tier. Use to access stored-tier memories.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Read a specific memory by key' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Memories matching any of these tags' },
        tier: { type: 'string', enum: ['persistent', 'stored'], description: 'Filter by tier' },
        all: { type: 'boolean', description: 'Read all active memories (default false)' },
      },
    },
    promptLine: 'memory_read(key?, tags?, tier?, all?) - Retrieve memories by key, tag, or tier.',
  },
  {
    name: 'query_orders',
    description: 'Check standing order statuses for a unit or all units.',
    parameters: {
      type: 'object',
      properties: {
        unitId: { type: 'string', description: 'Query a specific unit\'s standing order' },
        all: { type: 'boolean', description: 'Query all standing orders (default false)' },
      },
    },
    promptLine: 'query_orders(unitId?, all?) - Check standing order statuses.',
  },
  {
    name: 'query_production',
    description: 'Read production queue status for one controlled hex or all controlled hexes.',
    parameters: {
      type: 'object',
      properties: {
        hex: { type: 'string', pattern: '^[A-Z0-9]{2}$', description: 'Optional briefing hex code for one queue' },
        all: { type: 'boolean', description: 'When true, returns all controlled-hex production queues' },
      },
    },
    promptLine: 'query_production(hex?, all?) - Read production queue status and available unit types by controlled hex.',
  },
  {
    name: 'set_build_queue',
    description: 'Set one production unit type/count for a controlled hex, replacing existing queue entries.',
    parameters: {
      type: 'object',
      properties: {
        hex: { type: 'string', pattern: '^[A-Z0-9]{2}$', description: 'Controlled cell as briefing hex code' },
        unitType: { type: 'string', enum: BUILD_QUEUE_ITEM_SCHEMA_ENUM, description: 'Unit type to keep in queue' },
        count: { type: 'number', description: 'Build count (1..99) for the selected unit type' },
      },
      required: ['hex', 'unitType', 'count'],
    },
    promptLine: 'set_build_queue(hex, unitType, count) - Set one queue unit type/count and replace any previous entries for that hex.',
  },
  {
    name: 'query_mercenaries',
    description: 'Read your treasury, upkeep, and hire orders, or what you can hire in one cell.',
    parameters: {
      type: 'object',
      properties: {
        hex: { type: 'string', pattern: '^[A-Z0-9]{2}$', description: 'Optional briefing hex code for one cell' },
      },
    },
    promptLine: 'query_mercenaries(hex?) - Read your treasury, upkeep, and hire orders, or what you can hire in one cell.',
  },
  {
    name: 'hire_mercenaries',
    description: 'Raise mercenaries in a cell, rehire a Neutral unit, or cancel a hire order. The fee is taken when the order is placed and returned if you cancel it. Orders fill at the end of the turn.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['raise', 'rehire', 'cancel'], description: 'raise, rehire, or cancel' },
        hex: { type: 'string', pattern: '^[A-Z0-9]{2}$', description: 'Cell to raise in, as a briefing hex code' },
        unitType: { type: 'string', enum: [...HIREABLE_UNIT_TYPES], description: 'Unit type to raise' },
        count: { type: 'number', description: 'How many to raise (1..99)' },
        unitId: { type: 'string', description: 'Neutral unit to rehire' },
        orderId: { type: 'number', description: 'Hire order to cancel' },
      },
      required: ['action'],
    },
    promptLine: 'hire_mercenaries(action, hex?, unitType?, count?, unitId?, orderId?) - Raise mercenaries in a cell, rehire a Neutral unit, or cancel a hire order. The fee is taken when the order is placed and returned if you cancel it. Orders fill at the end of the turn.',
  },
];

/**
 * Battle-specific `# Available Tools` lines, keyed by frozen tool name.
 *
 * Purpose: Battle tools follow battle rules (cells, beats, battle range and line of sight), so their prompt lines
 * say so instead of reusing strategic-turn wording.
 * When to use: `getFilteredToolMetadata` in tactical mode.
 * Expected outcome: Tools without an entry keep their shared prompt line.
 * Exceptions: None.
 */
const TACTICAL_TOOL_PROMPT_LINES: Readonly<Record<string, string>> = {
  assess_unit:
    'assess_unit(unitId, radius?) - Battle briefing on one sub-unit: enemies and friendlies within radius cells, which enemies it can shoot and which can shoot it this beat, whether it can make melee contact this beat, and beats to reach each unit.',
  estimate_combat:
    'estimate_combat(engagementType, attackers, targetHex, defenders?) - Predict a ranged or melee engagement under battle range, terrain, and line-of-sight rules, from beat-start positions. Returns win probability, expected casualties, and an assessment. Does not cover air strikes. Always check before committing to an attack.',
};

/**
 * Returns metadata for the enabled tools, with prompt lines for the consultation mode.
 *
 * Purpose: Single source for the numbered tool list in the system prompt.
 * When to use: `buildSystemPromptForTools` (pass the coordinate mode) and `buildToolDefinitions`.
 * Expected outcome: Catalog order; all tools when `enabledToolNames` is undefined. In tactical mode, tools with a
 * battle prompt line use it; schemas and descriptions are shared across modes.
 * Exceptions: None.
 */
export function getFilteredToolMetadata(
  enabledToolNames?: string[],
  coordinateMode: 'strategic' | 'tactical' = 'strategic'
): ToolMeta[] {
  logTrace('openRouter getFilteredToolMetadata', {
    hasList: enabledToolNames !== undefined,
    count: enabledToolNames?.length ?? 0,
    coordinateMode,
  });
  const set = enabledToolNames === undefined ? undefined : new Set(enabledToolNames);
  return ALL_TOOL_METADATA.filter((m) => !set || set.has(m.name)).map((m) => {
    const battleLine = coordinateMode === 'tactical' ? TACTICAL_TOOL_PROMPT_LINES[m.name] : undefined;
    return battleLine ? { ...m, promptLine: battleLine } : m;
  });
}

/**
 * Defines the `buildToolDefinitions` function shape (function buildToolDefinitions(enabledToolNames?: string[]): ToolDef[]).

 * Purpose: Supports maintainability by documenting why `buildToolDefinitions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildToolDefinitions(enabledToolNames?: string[]): ToolDef[] {
  logTrace('openRouter buildToolDefinitions', { hasList: enabledToolNames !== undefined, count: enabledToolNames?.length ?? 0 });
  return getFilteredToolMetadata(enabledToolNames).map((m) => ({
    type: 'function' as const,
    function: { name: m.name, description: m.description, parameters: m.parameters },
  }));
}
