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
  movementOrderInstruction: string;
  submitMemoryClause: string;
  productionSubmitClause: string;
}): string {
  const {
    includeMemoryUpdates,
    includeProductionOrders,
    movementOrderInstruction,
    submitMemoryClause,
    productionSubmitClause,
  } = args;
  const optionalTail =
    (includeMemoryUpdates ? ', "memoryUpdates": [...]' : '') +
    (includeProductionOrders ? ', "productionOrders": [...]' : '');
  const submitHeader =
    `Submit your final JSON only (valid JSON, no comments): { "strategy": "<one-line>", "orders": [ ... ], "airStrikes": [ ... ], "ferryOrders": [ ... ], "callbacks": [...]${optionalTail} }.`;
  const strictSchemaClause =
    'Strict schema: top-level must be a JSON object with "strategy" (string) and "orders" (array); do not return a top-level array.';
  const ordersClause =
    'The "orders" array is processed in list order. Each entry includes "action" and usually "unitId". Actions: assign_order (include "order": { "type": "defend"|"march"|"pursue"|"patrol"|"hold_fire", ... } — pursue uses targetUnitId string for the enemy only; march/patrol/defend use [lat,lng] where a place is required), cancel_order, explicit_move (include "destination": [lat,lng] for this turn\'s move), ranged_attack (include "targetHex": [lat,lng] OR enemy unit id string; ranged-only units/actions), transport_move (include "navalUnitId" and "destination": [lat,lng]), disembark (include "unitId" and "destination": [lat,lng]), embark (include "unitId" and "navalUnitId").';
  const airClause =
    'Optional top-level air actions: airStrikes[] entries use { "unitId": "...", "targetHex": [lat,lng], "targetType": "units"|"urban"|"airport"|"seaport" }, ferryOrders[] entries use { "unitId": "...", "destination": [lat,lng] }.';
  const legacyClause = 'Do not use top-level movementOrders or rangedAttacks (legacy).';
  const callbacksClause = 'Include optional "callbacks" for re-consultation planning.';
  return `${submitHeader} ${strictSchemaClause} ${ordersClause} ${airClause} ${legacyClause}${movementOrderInstruction} ${callbacksClause}${submitMemoryClause} ${productionSubmitClause}`;
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
airStrikes: unknown[];
    /**
   * Specifies the contract for the `ferryOrders` member (ferryOrders: unknown[];).

   * Contract: Describes stable behavior for callers of `ferryOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ferryOrders: unknown[];
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
  });
  const example: FinalOrdersExamplePayload = {
    strategy: 'Close with observed enemies and keep production moving.',
    orders: [
      { action: 'assign_order', unitId: 'opponent-infantry-1', order: { type: 'march', destination: [12.34, 56.78] } },
      { action: 'explicit_move', unitId: 'opponent-armor-2', destination: [12.35, 56.79] },
      { action: 'ranged_attack', unitId: 'opponent-naval-1', targetHex: 'human-armor-1' },
    ],
    airStrikes: [],
    ferryOrders: [],
    callbacks: [],
  };
  if (flags.includeMemoryUpdates) example.memoryUpdates = [];
  if (flags.includeProductionOrders) {
    example.productionOrders = [{ action: 'set_build_queue', hex: [12.34, 56.78], unitType: 'infantry', count: 1 }];
  }
  const json = JSON.stringify(example, null, 2);
  return (
    'Example (illustrative only — use [lat,lng] and unit ids from this briefing, not these placeholders):\n```json\n' +
    json +
    '\n```'
  );
}
