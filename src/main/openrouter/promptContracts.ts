import { logDebug } from '../logger';

/**
 * Why this exists:
 *     Centralizes final JSON contract wording used in OpenRouter system prompts.
 * When to use:
 *     Building the final "Submit your final JSON only..." instruction block.
 * What to expect:
 *     Stable, explicit schema guidance for movement, air, callbacks, and optional memory/production payloads.
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

export interface FinalJsonExampleFlags {
  includeMemoryUpdates: boolean;
  includeProductionOrders: boolean;
}

interface FinalOrdersExamplePayload {
  strategy: string;
  orders: Array<Record<string, unknown>>;
  airStrikes: unknown[];
  ferryOrders: unknown[];
  callbacks: unknown[];
  memoryUpdates?: unknown[];
  productionOrders?: Array<Record<string, unknown>>;
}

/**
 * Why this exists:
 *     Provides a concrete multi-order JSON example below the schema paragraph so models (especially via OpenRouter)
 *     see valid nesting and field names without replacing the formal contract text.
 * When to use:
 *     Append immediately after `buildFinalJsonContractInstruction` in the system prompt.
 * What to expect:
 *     A fenced JSON block with 2–3 sample orders; optional memory/production keys match enabled tool flags.
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
