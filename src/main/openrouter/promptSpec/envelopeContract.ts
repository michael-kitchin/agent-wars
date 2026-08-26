/**
 * Single source for the response-envelope field order, legal actions, invalid-output rules,
 * callback contract, memory write limits, and repair-schema text.
 *
 * Purpose: The system-prompt header, the illustrative JSON example, and the parse-repair schema
 * used to describe the same object and used to disagree. assembly-contract.md section 5 is the
 * requirement; this module is the implementation every surface must call.
 * When to use: Any builder that tells the model the shape of the JSON it must submit.
 * Expected outcome: One field order and one gating rule for every combination of mode and tool flags.
 * Exceptions: None.
 */

import { logDebug, logTrace } from '../../logger';
import { CONTENT_MAX_LENGTH, KEY_MAX_LENGTH, KEY_PATTERN } from '../../tools/tool4Memory';
import { buildCallbackVocabularyClause } from './callbackVocabularyText';
import type { PromptCoordinateMode } from './promptCoordinateMode';

export type { PromptCoordinateMode } from './promptCoordinateMode';

/**
 * Gates that decide which optional envelope fields and actions a consultation may advertise.
 *
 * Purpose: One object so the system prompt, the example, and the repair schema cannot be passed
 * different combinations.
 * When to use: Build from the same flags `buildSystemPromptForTools` already computed.
 * Expected outcome: Tactical mode still drops memory and production even when the flags are true.
 * Exceptions: None.
 */
export interface EnvelopeGates {
  /**
   * Strategic turn vs tactical beat.
   *
   * Contract: Tactical consultations must not advertise standing-order actions or the memory/production tails.
   * When to use: Set from the same `coordinateContext.mode` the system prompt used.
   * Expected outcome: `'tactical'` drops `memoryUpdates` and `productionOrders` regardless of the other flags.
   * Exceptions: None.
   */
  readonly coordinateMode: PromptCoordinateMode;
  /**
   * Whether the opponent roster includes air units (or air sub-units in battle).
   *
   * Contract: The air tails are only legal when there is an air unit that could fill them.
   * When to use: Set from the opponent roster the system prompt already inspected.
   * Expected outcome: False omits `airStrikes` and `ferryOrders` from every envelope surface.
   * Exceptions: None.
   */
  readonly includeAirActions: boolean;
  /**
   * Whether the memory tool group is enabled for this consultation.
   *
   * Contract: Memory writes are JSON-only and only exist when the memory tools are on.
   * When to use: Set from `getToolFlags().memoryEnabled`.
   * Expected outcome: Ignored in tactical mode; otherwise controls `memoryUpdates`.
   * Exceptions: None.
   */
  readonly includeMemoryUpdates: boolean;
  /**
   * Whether the production tool group is enabled for this consultation.
   *
   * Contract: Queue writes are JSON-only and only exist when production tools are on.
   * When to use: Set from `getToolFlags().productionEnabled`.
   * Expected outcome: Ignored in tactical mode; otherwise controls `productionOrders`.
   * Exceptions: None.
   */
  readonly includeProductionOrders: boolean;
  /**
   * Whether standing-order assignment and cancellation are legal this consultation.
   *
   * Contract: False when the standing-order tool group is off, and always false in tactical mode.
   * When to use: Set from `getToolFlags().ordersEnabled` and mode. Optional; omitted means true for strategic callers that have not been updated.
   * Expected outcome: False omits `assign_order` and `cancel_order` from the action list, example, and repair schema.
   * Exceptions: None.
   */
  readonly includeStandingOrderActions?: boolean;
}

/**
 * Canonical envelope key sequence. Optional keys are dropped, never reordered.
 *
 * Purpose: The include/omit matrix in assembly-contract.md section 5.1.
 * When to use: Iterate this when assembling a header, an example object, or a repair schema.
 * Expected outcome: `callbacks` always follows the air tails and precedes memory and production.
 * Exceptions: None.
 */
export const ENVELOPE_FIELD_ORDER: readonly string[] = [
  'message',
  'strategy',
  'orders',
  'airStrikes',
  'ferryOrders',
  'callbacks',
  'memoryUpdates',
  'productionOrders',
] as const;

/**
 * Fields always present in the envelope regardless of roster or tool flags.
 *
 * Purpose: `message`, `strategy`, and `orders` are mandatory; `callbacks` is always offered so
 * omitting it can clear the subscription list.
 * When to use: Inside `envelopeFieldsForGates`.
 * Expected outcome: These four keys appear in every returned list, in canonical order.
 * Exceptions: None.
 */
const ALWAYS_PRESENT_FIELDS: ReadonlySet<string> = new Set(['message', 'strategy', 'orders', 'callbacks']);

/**
 * Tactical prohibition on standing-order actions, worded once for the envelope and the opening message.
 *
 * Purpose: The beat opening message is allowed to repeat this sentence because it is the most common carry-over error.
 * When to use: Invalid-output rules, the tactical orders clause, and the tactical opening user message.
 * Expected outcome: Identical wording on every surface that restates the prohibition.
 * Exceptions: None.
 */
export const TACTICAL_STANDING_ORDER_PROHIBITION =
  'Do not emit assign_order or cancel_order for tactical sub-unit ids.';

/**
 * Standing-order actions that are legal only in strategic consultations.
 *
 * Purpose: Tactical sub-unit ids must not receive assign/cancel; listing them in the beat contract
 * is the carry-over the spec exists to stop.
 * When to use: `legalOrderActionsForMode` and the repair-schema action examples.
 * Expected outcome: Present in the strategic list, absent from the tactical list.
 * Exceptions: None.
 */
const STRATEGIC_ONLY_ORDER_ACTIONS: readonly string[] = ['assign_order', 'cancel_order'];

/**
 * Actions both modes may put in `orders`.
 *
 * Purpose: Shared movement, fire, and sealift verbs so the two lists cannot drift on the common set.
 * When to use: Concatenated into `legalOrderActionsForMode`.
 * Expected outcome: Tactical list equals this array; strategic list prepends the standing-order pair.
 * Exceptions: None.
 */
const SHARED_ORDER_ACTIONS: readonly string[] = [
  'explicit_move',
  'ranged_attack',
  'embark',
  'transport_move',
  'disembark',
];

/**
 * Sealift verbs that are only legal when the opponent roster includes a naval unit.
 *
 * Purpose: Teaching embark/transport/disembark with no ship invites orders the model cannot fill.
 * When to use: Filtered out of `legalOrderActionsForMode` when `includeNavalActions` is false.
 * Expected outcome: These three names appear in the action list only when a naval unit exists.
 * Exceptions: None.
 */
const SEALIFT_ORDER_ACTIONS: ReadonlySet<string> = new Set(['embark', 'transport_move', 'disembark']);

/**
 * Returns the envelope keys that this consultation may advertise, in canonical order.
 *
 * Purpose: The system-prompt header, the example object, and the repair schema must name the same
 * fields. Tactical consultations never advertise memory or production even if the UI flags are on.
 * When to use: Before building any surface that lists envelope keys.
 * Expected outcome: A subsequence of `ENVELOPE_FIELD_ORDER`.
 * Exceptions: None.
 */
export function envelopeFieldsForGates(gates: EnvelopeGates): readonly string[] {
  logDebug('promptSpec envelopeFieldsForGates', { ...gates });
  const includeMemory = gates.coordinateMode !== 'tactical' && gates.includeMemoryUpdates;
  const includeProduction = gates.coordinateMode !== 'tactical' && gates.includeProductionOrders;
  return ENVELOPE_FIELD_ORDER.filter((field) => {
    if (ALWAYS_PRESENT_FIELDS.has(field)) return true;
    if (field === 'airStrikes' || field === 'ferryOrders') return gates.includeAirActions;
    if (field === 'memoryUpdates') return includeMemory;
    if (field === 'productionOrders') return includeProduction;
    return false;
  });
}

/**
 * Returns the `orders[].action` verbs this mode may list.
 *
 * Purpose: The contract instruction and the repair-schema examples must not advertise a forbidden
 * standing-order action in a beat.
 * When to use: When writing the orders clause or choosing repair-schema example rows.
 * Expected outcome: Tactical never includes `assign_order` or `cancel_order`. Sealift verbs drop when there is no naval unit.
 * Exceptions: None.
 */
export function legalOrderActionsForMode(
  mode: PromptCoordinateMode,
  includeNavalActions = true,
  includeStandingOrderActions = true
): readonly string[] {
  logTrace('promptSpec legalOrderActionsForMode', { mode, includeNavalActions, includeStandingOrderActions });
  const includeStanding = mode === 'strategic' && includeStandingOrderActions;
  const actions = includeStanding
    ? [...STRATEGIC_ONLY_ORDER_ACTIONS, ...SHARED_ORDER_ACTIONS]
    : SHARED_ORDER_ACTIONS;
  return includeNavalActions ? actions : actions.filter((action) => !SEALIFT_ORDER_ACTIONS.has(action));
}

/**
 * Builds the invalid-output rules the system prompt must state for this consultation.
 *
 * Purpose: strategic-prompt.md section 3.4 and tactical-prompt.md section 3.4. The model needs to
 * know what the parser will drop rather than guessing from examples.
 * When to use: Appended to the JSON contract instruction.
 * Expected outcome: Top-level array and legacy field bans in both modes; standing-order and
 * memory/production bans only in tactical; current-cell march ban only in strategic.
 * Exceptions: None.
 */
export function buildInvalidOutputRulesClause(gates: EnvelopeGates): string {
  logDebug('promptSpec buildInvalidOutputRulesClause', { ...gates });
  const shared = [
    'The top level must be a JSON object; a top-level array is invalid.',
    'Do not use top-level movementOrders or rangedAttacks (legacy).',
    'An entry missing a required field is dropped without comment.',
    'More than one ranged or air action for the same unit in the same period is not honoured.',
    'Raw H3 strings and latitude/longitude pairs are never valid field values.',
    "A ranged action's target must not be the acting unit's own move destination.",
    'A one-step destination that holds a friendly unit is not legal.',
  ];
  if (gates.coordinateMode === 'tactical') {
    return [
      ...shared,
      TACTICAL_STANDING_ORDER_PROHIBITION,
      'memoryUpdates and productionOrders are not accepted this beat.',
      'Strategic res1 codes are never valid field values this beat.',
    ].join(' ');
  }
  return [
    ...shared,
    "A march to the unit's current cell is dropped as already arrived.",
    ...(gates.includeAirActions ? ['Air units cannot be given march, patrol, or pursue orders.'] : []),
    'Infantry cannot be given a strategic ranged_attack.',
  ].join(' ');
}

/**
 * Builds the callback-field sentence for the JSON contract.
 *
 * Purpose: assembly-contract.md section 5.1 item 3. The response replaces the whole subscription
 * list, and omitting the array clears it. Strategic copy used to say neither.
 * When to use: The callbacks clause of `buildFinalJsonContractInstruction`.
 * Expected outcome: Both modes state replace-and-clear; tactical also names beat evaluation and
 * sub-unit ids.
 * Exceptions: None.
 */
export function buildCallbackContractClause(mode: PromptCoordinateMode): string {
  logDebug('promptSpec buildCallbackContractClause', { mode });
  const replaceRule =
    'Each response replaces the whole callbacks list; omit the array or send [] to clear every subscription.';
  if (mode === 'tactical') {
    return (
      'Include optional "callbacks" for re-consultation: use tactical sub-unit ids (not strategic parent ids) ' +
      'for unit-scoped events (e.g. unit_destroyed, unit_engaged); subscriptions are evaluated after each ' +
      `tactical beat when event-driven mode is on and are cleared when the battle ends. ${replaceRule}` +
      buildCallbackVocabularyClause(mode)
    );
  }
  return `Include optional "callbacks" for re-consultation planning. ${replaceRule}` + buildCallbackVocabularyClause(mode);
}

/**
 * Builds the memory-write limit sentence from the engine constants.
 *
 * Purpose: The contract must quote the same key length, content length, and key pattern the writer
 * enforces, not a restated literal.
 * When to use: Appended to the JSON contract when memory updates are offered.
 * Expected outcome: The sentence contains `KEY_MAX_LENGTH` and `CONTENT_MAX_LENGTH` as decimal digits.
 * Exceptions: None.
 */
export function buildMemoryWriteLimitsClause(): string {
  logDebug('promptSpec buildMemoryWriteLimitsClause', {
    KEY_MAX_LENGTH,
    CONTENT_MAX_LENGTH,
    keyPattern: KEY_PATTERN.source,
  });
  return (
    ` Memory write keys are at most ${KEY_MAX_LENGTH} characters and may contain only letters, digits, hyphen, and underscore; ` +
    `content is at most ${CONTENT_MAX_LENGTH} characters.`
  );
}

/**
 * Compact JSON example row used in the strategic repair schema.
 *
 * Purpose: Shows assign, move, fire, and cancel — the four strategic verbs the repair schema is
 * allowed to illustrate. consultation-flow.md section 5.1 item 4.
 * When to use: Inside `buildRepairSchemaText` for strategic gates.
 * Expected outcome: `example-` ids so a repair round cannot copy live roster prefixes; surrounding
 * repair text still marks them as placeholders.
 * Exceptions: None.
 */
const STRATEGIC_REPAIR_ORDERS: readonly Record<string, unknown>[] = [
  { unitId: 'example-armor-1', action: 'assign_order', order: { type: 'march', destination: 'CF' } },
  { unitId: 'example-armor-1', action: 'explicit_move', destination: 'CG' },
  { unitId: 'example-armor-1', action: 'ranged_attack', targetHexCode: 'CH' },
  { unitId: 'example-armor-1', action: 'cancel_order' },
];

/**
 * Strategic repair rows when standing-order actions are not issuable.
 *
 * Purpose: The standing-order tool group may be off while movement and fire remain legal.
 * When to use: `buildRepairSchemaText` for strategic gates with `includeStandingOrderActions` false.
 * Expected outcome: Movement and fire placeholders only; no assign or cancel.
 * Exceptions: None.
 */
const STRATEGIC_REPAIR_ORDERS_WITHOUT_STANDING: readonly Record<string, unknown>[] =
  STRATEGIC_REPAIR_ORDERS.filter((row) => row.action !== 'assign_order' && row.action !== 'cancel_order');

/**
 * Compact JSON example rows used in the tactical repair schema.
 *
 * Purpose: Tactical repair may illustrate grouped movement and a ranged action only.
 * When to use: Inside `buildRepairSchemaText` for tactical gates.
 * Expected outcome: Placeholder `example-` sub-unit ids; grouped `unitIds` on the move row; no standing-order action keys.
 * Exceptions: None.
 */
const TACTICAL_REPAIR_ORDERS: readonly Record<string, unknown>[] = [
  { unitIds: ['example-armor-1:01', 'example-armor-1:02'], action: 'explicit_move', destination: 'AB' },
  { unitId: 'example-armor-1:03', action: 'ranged_attack', targetUnitId: 'example-human-1:01' },
];

/**
 * Builds the inlined repair-schema text, including the legacy-array prohibition.
 *
 * Purpose: consultation-flow.md section 5.1. The schema must list the same fields, in the same
 * order, as `envelopeFieldsForGates`, and must not teach a game rule beyond the envelope shape.
 * When to use: The parse-repair user message.
 * Expected outcome: Tactical text contains no assign_order, cancel_order, memoryUpdates, or
 * productionOrders; every gate combination mentions fields in canonical relative order.
 * Exceptions: None.
 */
export function buildRepairSchemaText(gates: EnvelopeGates): string {
  logDebug('promptSpec buildRepairSchemaText', { ...gates });
  const fields = envelopeFieldsForGates(gates);
  const example: Record<string, unknown> = {};
  const standingOrdersIssuable =
    gates.coordinateMode === 'strategic' && gates.includeStandingOrderActions !== false;
  const orders =
    gates.coordinateMode === 'tactical'
      ? TACTICAL_REPAIR_ORDERS
      : standingOrdersIssuable
        ? STRATEGIC_REPAIR_ORDERS
        : STRATEGIC_REPAIR_ORDERS_WITHOUT_STANDING;
  for (const field of fields) {
    if (field === 'message') example.message = '...';
    else if (field === 'strategy') example.strategy = '...';
    else if (field === 'orders') example.orders = orders;
    else if (field === 'airStrikes') {
      example.airStrikes = [{ unitId: 'example-air-1', targetHexCode: 'CI', targetType: 'units' }];
    } else if (field === 'ferryOrders') {
      example.ferryOrders = [{ unitId: 'example-air-2', destination: 'CJ' }];
    } else if (field === 'callbacks') {
      example.callbacks = [{ event: 'infrastructure_destroyed', params: { targetType: 'airport', hex: 'CD' } }];
    } else if (field === 'memoryUpdates') {
      example.memoryUpdates = [
        {
          action: 'write',
          key: 'turn_objectives',
          tier: 'persistent',
          content: 'Close with observed enemies; keep air and naval production moving.',
        },
      ];
    } else if (field === 'productionOrders') {
      example.productionOrders = [{ action: 'set_build_queue', hex: 'CF', unitType: 'air', count: 1 }];
    }
  }
  const json = JSON.stringify(example);
  return `${json} (orders[] only; no movementOrders/rangedAttacks; never a top-level array)`;
}
