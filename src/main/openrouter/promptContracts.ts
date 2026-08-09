import { logDebug } from '../logger';

/**
 * Defines the `buildFinalJsonContractInstruction` function shape (export function buildFinalJsonContractInstruction(args: { includeMemoryUpdates: boolean; includeProductionOrders: boolean; movementOrderInstruction: st).

 * Purpose: Supports maintainability by documenting why `buildFinalJsonContractInstruction` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildFinalJsonContractInstruction(args: {
  includeMemoryUpdates: boolean;
  includeProductionOrders: boolean;
  /**
   * When false, omit airStrikes/ferryOrders from the submit header and schema (no air units on the roster).
   *
   * Contract: Defaults to true for backward-compatible strategic prompts.
   * When to use: Pass from `buildSystemPromptForTools` based on opponent air presence.
   * Expected outcome: No-air consultations do not advertise unused air/ferry fields.
   * Exceptions: None.
   */
  includeAirActions?: boolean;
  movementOrderInstruction: string;
  submitMemoryClause: string;
  productionSubmitClause: string;
  /**
   * When `tactical`, expands the callbacks/orders clauses for in-battle consultations.
   *
   * Contract: Optional; omit or `strategic` for strategic Ready prompts.
   * When to use: Pass from `buildSystemPromptForTools` when assembling tactical system prompts.
   * Expected outcome: Tactical text omits live assign_order actions and expands callback beat guidance.
   * Exceptions: None.
   */
  coordinateMode?: 'strategic' | 'tactical';
}): string {
  const {
    includeMemoryUpdates,
    includeProductionOrders,
    includeAirActions = true,
    movementOrderInstruction,
    submitMemoryClause,
    productionSubmitClause,
    coordinateMode = 'strategic',
  } = args;
  const optionalTail =
    (includeMemoryUpdates ? ', "memoryUpdates": [...]' : '') +
    (includeProductionOrders ? ', "productionOrders": [...]' : '');
  const airFields = includeAirActions ? ', "airStrikes": [ ... ], "ferryOrders": [ ... ]' : '';
  const submitHeader =
    `Submit your final JSON only (valid JSON, no comments): { "strategy": "<one-line>", "orders": [ ... ]${airFields}, "callbacks": [...]${optionalTail} }.`;
  const strictSchemaClause =
    'Strict schema: top-level must be a JSON object with "strategy" (string) and "orders" (array); do not return a top-level array.';
  const airUnitOrderNote = includeAirActions
    ? ' Air units never move hex by hex, so "march", "patrol", and "pursue" are rejected for them — use airStrikes for attacks, ferryOrders to reposition, or a "defend" order to keep striking targets in range'
    : ' Air units never move hex by hex, so "march", "patrol", and "pursue" are rejected for them — give them a "defend" order instead';
  const ordersClause =
    coordinateMode === 'tactical'
      ? 'The "orders" array is processed in list order. Each entry includes "action" and usually "unitId". Actions: explicit_move (include "destination": briefing hex code for this beat\'s march; auto-debarks embarked cargo before marching), ranged_attack (include exactly one of targetHexCode or targetUnitId; ranged-only units/actions), transport_move (include "navalUnitId" and "destination" hex code), disembark (include "unitId" and "destination" hex code — clears cargo assignment then moves in one action), embark (include "unitId" and "navalUnitId"). Do not emit assign_order or cancel_order for tactical sub-unit ids.'
      : 'The "orders" array is processed in list order. Each entry includes "action" and usually "unitId". Actions: assign_order (include "order": { "type": "defend"|"march"|"pursue"|"patrol"|"hold_fire", ... } — required fields per type: "march" needs "destination" (one two-character briefing hex code); "defend" needs "defendHex" (one hex code); "patrol" needs "waypoints" (an array of two or more hex codes, visited in order then looped — a single "destination" is not a valid patrol); "pursue" needs "targetUnitId" (an enemy unit id string); "hold_fire" needs no extra fields.' +
        airUnitOrderNote +
        '), cancel_order, explicit_move (include "destination": briefing hex code for this turn\'s move; auto-debarks embarked cargo before marching), ranged_attack (include exactly one of targetHexCode or targetUnitId; ranged-only units/actions), transport_move (include "navalUnitId" and "destination" hex code), disembark (include "unitId" and "destination" hex code — clears cargo assignment then moves in one action), embark (include "unitId" and "navalUnitId").';
  const airClause = includeAirActions
    ? 'Optional top-level air actions: airStrikes[] entries use { "unitId": "...", exactly one of "targetHexCode" or "targetUnitId", "targetType": "units"|"urban"|"airport"|"seaport" }, ferryOrders[] entries use { "unitId": "...", "destination": "<hex code>" }. '
    : '';
  const legacyClause = 'Do not use top-level movementOrders or rangedAttacks (legacy).';
  const callbacksClause =
    coordinateMode === 'tactical'
      ? 'Include optional "callbacks" for re-consultation: use tactical sub-unit ids (not strategic parent ids) for unit-scoped events (e.g. unit_destroyed, unit_engaged); subscriptions are evaluated after each tactical beat when event-driven mode is on and are cleared when the battle ends; each consultation replaces the full callback list.'
      : 'Include optional "callbacks" for re-consultation planning.';
  return `${submitHeader} ${strictSchemaClause} ${ordersClause} ${airClause}${legacyClause}${movementOrderInstruction} ${callbacksClause}${submitMemoryClause} ${productionSubmitClause}`;
}

/**
 * Documents the `FinalJsonExampleFlags` interface as a named contract surface (export interface FinalJsonExampleFlags).

 * Purpose: Supports maintainability by documenting why `FinalJsonExampleFlags` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface FinalJsonExampleFlags {
    /**
   * Specifies the contract for the `includeMemoryUpdates` member (includeMemoryUpdates: boolean;).

   * Contract: Describes stable behavior for callers of `includeMemoryUpdates` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
includeMemoryUpdates: boolean;
    /**
   * Specifies the contract for the `includeProductionOrders` member (includeProductionOrders: boolean;).

   * Contract: Describes stable behavior for callers of `includeProductionOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
includeProductionOrders: boolean;
  /**
   * When false, illustrative JSON omits airStrikes/ferryOrders fields.
   *
   * Contract: Optional; defaults to true.
   * When to use: Pass false when the opponent roster has no air units.
   * Expected outcome: Example matches the contract instruction for the consultation.
   * Exceptions: None.
   */
  includeAirActions?: boolean;
  /**
   * When `tactical`, the illustrative orders[] example leads with explicit_move / ranged_attack (assign_order stays blocked for sub-unit ids).
   *
   * Contract: Optional coordinate mode for example/contract text; omit or `strategic` for strategic prompts.
   * When to use: Pass `tactical` from tactical `buildSystemPromptForTools` / contract builders.
   * Expected outcome: Callers get tactical-appropriate action lists and examples.
   * Exceptions: None.
   */
  coordinateMode?: 'strategic' | 'tactical';
}

/**
 * Documents the `FinalOrdersExamplePayload` interface as a named contract surface (interface FinalOrdersExamplePayload).

 * Purpose: Supports maintainability by documenting why `FinalOrdersExamplePayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface FinalOrdersExamplePayload {
    /**
   * Specifies the contract for the `strategy` member (strategy: string;).

   * Contract: Describes stable behavior for callers of `strategy` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
strategy: string;
    /**
   * Specifies the contract for the `orders` member (orders: Array<Record<string, unknown>>;).

   * Contract: Describes stable behavior for callers of `orders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
orders: Array<Record<string, unknown>>;
    /**
   * Specifies the contract for the `airStrikes` member (airStrikes: unknown[];).

   * Contract: Describes stable behavior for callers of `airStrikes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikes?: unknown[];
    /**
   * Specifies the contract for the `ferryOrders` member (ferryOrders: unknown[];).

   * Contract: Describes stable behavior for callers of `ferryOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ferryOrders?: unknown[];
    /**
   * Specifies the contract for the `callbacks` member (callbacks: unknown[];).

   * Contract: Describes stable behavior for callers of `callbacks` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
callbacks: unknown[];
    /**
   * Specifies the contract for the `memoryUpdates` member (memoryUpdates?: unknown[];).

   * Contract: Describes stable behavior for callers of `memoryUpdates` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
memoryUpdates?: unknown[];
    /**
   * Specifies the contract for the `productionOrders` member (productionOrders?: Array<Record<string, unknown>>;).

   * Contract: Describes stable behavior for callers of `productionOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
productionOrders?: Array<Record<string, unknown>>;
}

/**
 * Defines the `getFinalJsonOrdersExampleBlock` function shape (export function getFinalJsonOrdersExampleBlock(flags: FinalJsonExampleFlags): string).

 * Purpose: Supports maintainability by documenting why `getFinalJsonOrdersExampleBlock` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getFinalJsonOrdersExampleBlock(flags: FinalJsonExampleFlags): string {
  logDebug('promptContracts getFinalJsonOrdersExampleBlock', {
    includeMemoryUpdates: flags.includeMemoryUpdates,
    includeProductionOrders: flags.includeProductionOrders,
    includeAirActions: flags.includeAirActions !== false,
    coordinateMode: flags.coordinateMode ?? 'strategic',
  });
  const tactical = flags.coordinateMode === 'tactical';
  const includeAir = flags.includeAirActions !== false;
  const example: FinalOrdersExamplePayload = {
    strategy: tactical
      ? 'Close with observed enemies this beat using explicit moves and fire.'
      : 'Close with observed enemies and keep production moving.',
    orders: tactical
      ? [
          { action: 'explicit_move', unitId: 'opp-parent:01', destination: 'AB' },
          { action: 'ranged_attack', unitId: 'opp-parent:02', targetUnitId: 'hum-parent:01' },
        ]
      : [
          { action: 'assign_order', unitId: 'opponent-infantry-1', order: { type: 'march', destination: 'AB' } },
          { action: 'assign_order', unitId: 'opponent-naval-2', order: { type: 'patrol', waypoints: ['AB', 'CD'] } },
          { action: 'explicit_move', unitId: 'opponent-armor-2', destination: 'CD' },
          { action: 'ranged_attack', unitId: 'opponent-naval-1', targetUnitId: 'human-armor-1' },
        ],
    callbacks: [],
  };
  if (includeAir) {
    example.airStrikes = [];
    example.ferryOrders = [];
  }
  if (flags.includeMemoryUpdates) example.memoryUpdates = [];
  if (flags.includeProductionOrders) {
    example.productionOrders = [{ action: 'set_build_queue', hex: 'AB', unitType: 'infantry', count: 1 }];
  }
  const json = JSON.stringify(example, null, 2);
  return (
    'Example (illustrative only — use briefing hex codes and unit ids from this operational map, not these placeholders):\n```json\n' +
    json +
    '\n```'
  );
}
