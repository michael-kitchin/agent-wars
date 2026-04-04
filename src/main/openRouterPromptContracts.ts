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
    'The "orders" array is processed in list order. Each entry includes "action" and usually "unitId". Actions: assign_order (include "order": { "type": "defend"|"march"|"pursue"|"patrol"|"hold_fire", ... } — pursue uses targetUnitId string for the enemy only; march/patrol/defend use [lat,lng] where a place is required), cancel_order, explicit_move (include "destination": [lat,lng] for this turn\'s move), explicit_attack (include "targetHex": [lat,lng] OR enemy unit id string).';
  const airClause =
    'Optional top-level air actions: airStrikes[] entries use { "unitId": "...", "targetHex": [lat,lng], "targetType": "units"|"urban"|"airport"|"seaport" }, ferryOrders[] entries use { "unitId": "...", "destination": [lat,lng] }.';
  const legacyClause = 'Do not use top-level movementOrders or rangedAttacks (legacy).';
  const callbacksClause = 'Include optional "callbacks" for re-consultation planning.';
  return `${submitHeader} ${strictSchemaClause} ${ordersClause} ${airClause} ${legacyClause}${movementOrderInstruction} ${callbacksClause}${submitMemoryClause} ${productionSubmitClause}`;
}
