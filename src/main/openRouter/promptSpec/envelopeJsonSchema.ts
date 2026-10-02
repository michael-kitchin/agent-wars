/**
 * JSON-schema `response_format` for the order envelope.
 *
 * Purpose: Lets providers that support structured outputs constrain the final reply to the envelope the prompt
 * teaches, so fewer replies need the client-side parse repair.
 * When to use: Built once per consultation for models that support structured outputs.
 * Expected outcome: A closed schema whose fields and enums follow the same gates as the envelope text.
 * Exceptions: None.
 */

import { logDebug } from '../../logger';
import { ALL_BUILD_UNIT_TYPES } from '../../../shared/ipc/productionTypes';
import { STANDING_ORDER_TYPES } from '../../tools/standingOrdersShared';
import { TAUGHT_CALLBACK_EVENTS } from './callbackVocabularyText';
import { envelopeFieldsForGates, legalOrderActionsForMode, type EnvelopeGates } from './envelopeContract';

/**
 * OpenRouter `json_schema.name` for the order envelope.
 *
 * Purpose: Frozen identifier providers echo in diagnostics.
 * When to use: Inside `buildOrdersEnvelopeResponseFormat`.
 * Expected outcome: Matches `^[a-zA-Z0-9_-]+$`.
 * Exceptions: None.
 */
export const ORDERS_ENVELOPE_SCHEMA_NAME = 'orders_envelope';

/**
 * Air strike target categories accepted by `normalizeAirStrikeOrders`.
 *
 * Purpose: Enum for `airStrikes[].targetType`.
 * When to use: Building the air strike row schema.
 * Expected outcome: Same values the parser accepts.
 * Exceptions: None.
 */
const AIR_STRIKE_TARGET_TYPES: readonly string[] = ['units', 'urban', 'airport', 'seaport'];

/**
 * Infrastructure categories the `infrastructure_destroyed` callback filters on.
 *
 * Purpose: Enum for `callbacks[].params.targetType`.
 * When to use: Building the callback params schema.
 * Expected outcome: Same values the callback evaluator matches.
 * Exceptions: None.
 */
const INFRASTRUCTURE_TARGET_TYPES: readonly string[] = ['urban', 'airport', 'seaport'];

/**
 * Memory update actions accepted by `normalizeMemoryUpdates`.
 *
 * Purpose: Enum for `memoryUpdates[].action`.
 * When to use: Building the memory row schema.
 * Expected outcome: Same values the parser accepts.
 * Exceptions: None.
 */
const MEMORY_UPDATE_ACTIONS: readonly string[] = ['write', 'delete'];

/**
 * Memory tiers accepted by `normalizeMemoryUpdates`.
 *
 * Purpose: Enum for `memoryUpdates[].tier`.
 * When to use: Building the memory row schema.
 * Expected outcome: Same values the parser accepts.
 * Exceptions: None.
 */
const MEMORY_TIERS: readonly string[] = ['persistent', 'stored'];

/**
 * Production order actions accepted by `normalizeProductionOrders`.
 *
 * Purpose: Enum for `productionOrders[].action`.
 * When to use: Building the production row schema.
 * Expected outcome: Same values the parser accepts.
 * Exceptions: None.
 */
const PRODUCTION_ORDER_ACTIONS: readonly string[] = ['set_build_queue'];

/**
 * Schema for a plain string value.
 *
 * Purpose: Shared leaf for ids, hex codes, and prose fields.
 * When to use: Any string-valued property.
 * Expected outcome: `{ type: 'string' }`.
 * Exceptions: None.
 */
const STRING_SCHEMA: Readonly<Record<string, unknown>> = Object.freeze({ type: 'string' });

/**
 * Schema for an array of strings.
 *
 * Purpose: Shared leaf for grouped `unitIds` and patrol `waypoints`.
 * When to use: Any string-list property.
 * Expected outcome: `{ type: 'array', items: { type: 'string' } }`.
 * Exceptions: None.
 */
const STRING_ARRAY_SCHEMA: Readonly<Record<string, unknown>> = Object.freeze({ type: 'array', items: STRING_SCHEMA });

/**
 * Builds a string enum schema.
 *
 * Purpose: Restricts a field to the values the parser accepts.
 * When to use: Actions, order types, target types, tiers, and unit types.
 * Expected outcome: A fresh `{ type: 'string', enum }` with a copied value list.
 * Exceptions: None.
 */
function enumSchema(values: readonly string[]): Record<string, unknown> {
  return { type: 'string', enum: [...values] };
}

/**
 * Builds an object schema that allows only the listed properties.
 *
 * Purpose: Some providers strip keys a schema does not list; closing every object makes every taught key explicit.
 * When to use: Every object in the envelope schema, at every depth.
 * Expected outcome: `additionalProperties: false` with the given properties and required keys.
 * Exceptions: None.
 */
function closedObjectSchema(
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[]
): Record<string, unknown> {
  return { type: 'object', properties: { ...properties }, required: [...required], additionalProperties: false };
}

/**
 * Builds an array schema with the given item schema.
 *
 * Purpose: Every envelope list holds one kind of row.
 * When to use: The `orders`, air, callback, memory, and production lists.
 * Expected outcome: `{ type: 'array', items }`.
 * Exceptions: None.
 */
function arraySchema(items: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return { type: 'array', items };
}

/**
 * Builds the schema for an `assign_order` row's nested `order` object.
 *
 * Purpose: Lists every `AssignOrderParams` key the parser translates.
 * When to use: Only when the action enum includes `assign_order`.
 * Expected outcome: `type` is required and limited to the standing-order types.
 * Exceptions: None.
 */
function standingOrderSchema(): Record<string, unknown> {
  return closedObjectSchema(
    {
      type: enumSchema(STANDING_ORDER_TYPES),
      destination: STRING_SCHEMA,
      defendHex: STRING_SCHEMA,
      waypoints: STRING_ARRAY_SCHEMA,
      targetUnitId: STRING_SCHEMA,
      engageRange: { type: 'number' },
      maxDistance: { type: 'number' },
      avoidEnemies: { type: 'boolean' },
      engageEnRoute: { type: 'boolean' },
    },
    ['type']
  );
}

/**
 * The keys one `orders[]` action uses besides `action`, `unitId`, and `unitIds`.
 *
 * Purpose: Lets each action's row schema list only its own keys and require the ones the parser cannot do without.
 * When to use: `ORDER_ACTION_ROW_SHAPES` entries.
 * Expected outcome: `required` is a subset of `keys`.
 * Exceptions: None.
 */
interface OrderActionRowShape {
  /**
   * Action-specific keys the row may carry.
   *
   * Contract: Each name must have an entry in the row property table built by `orderRowProperties`.
   * When to use: Building the action's row schema.
   * Expected outcome: Listed in the action's closed row alongside `action`, `unitId`, and `unitIds`.
   * Exceptions: None.
   */
  readonly keys: readonly string[];
  /**
   * Keys without which `processV3OrdersArray` drops the row.
   *
   * Contract: Subset of `keys`. Leave a key out when the parser accepts one of several alternatives (ranged targets).
   * When to use: Building the action's row schema.
   * Expected outcome: Added to `required` after `action`.
   * Exceptions: None.
   */
  readonly required: readonly string[];
}

/**
 * Row shape for every action `legalOrderActionsForMode` can return.
 *
 * Purpose: Moves, transport moves, and disembarks must carry a destination; embark and transport moves must name the
 * naval unit; standing orders must carry the order.
 * When to use: `orderActionRowSchema`.
 * Expected outcome: One entry per legal action name.
 * Exceptions: None.
 */
const ORDER_ACTION_ROW_SHAPES: Readonly<Record<string, OrderActionRowShape>> = Object.freeze({
  explicit_move: { keys: ['destination'], required: ['destination'] },
  ranged_attack: { keys: ['targetHexCode', 'targetUnitId'], required: [] },
  embark: { keys: ['navalUnitId'], required: ['navalUnitId'] },
  transport_move: { keys: ['navalUnitId', 'destination'], required: ['navalUnitId', 'destination'] },
  disembark: { keys: ['destination'], required: ['destination'] },
  assign_order: { keys: ['order'], required: ['order'] },
  cancel_order: { keys: [], required: [] },
});

/**
 * Builds the property table for an `orders[]` row.
 *
 * Purpose: One source for every row key's schema, shared by the combined row and the per-action rows.
 * When to use: `orderRowSchema` and `orderActionRowSchema`.
 * Expected outcome: `action` limited to `actions`; `order` present only when `assign_order` is legal.
 * Exceptions: None.
 */
function orderRowProperties(actions: readonly string[]): Record<string, unknown> {
  return {
    action: enumSchema(actions),
    unitId: STRING_SCHEMA,
    unitIds: STRING_ARRAY_SCHEMA,
    destination: STRING_SCHEMA,
    targetHexCode: STRING_SCHEMA,
    targetUnitId: STRING_SCHEMA,
    navalUnitId: STRING_SCHEMA,
    ...(actions.includes('assign_order') ? { order: standingOrderSchema() } : {}),
  };
}

/**
 * Builds the closed row schema for one action.
 *
 * Purpose: Ties the action name to the keys it needs, so a move row without a destination does not match.
 * When to use: Once per legal action inside `orderRowSchema`.
 * Expected outcome: `action` limited to this one action; `action` plus the shape's required keys are required.
 * Exceptions: Throws when the action has no `ORDER_ACTION_ROW_SHAPES` entry, which means the legal action list grew
 * without a row shape.
 */
function orderActionRowSchema(action: string, allProperties: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const shape = ORDER_ACTION_ROW_SHAPES[action];
  if (!shape) throw new Error(`envelopeJsonSchema: no row shape for order action "${action}"`);
  const properties = Object.fromEntries(
    ['unitId', 'unitIds', ...shape.keys].map((key) => [key, allProperties[key]])
  );
  return closedObjectSchema({ action: enumSchema([action]), ...properties }, ['action', ...shape.required]);
}

/**
 * Builds the schema for one `orders[]` row.
 *
 * The row is the combined closed row (every action's keys, only `action` required) plus an `anyOf` of one closed
 * row per action. A provider that honors `anyOf` enforces the per-action required keys. One that ignores `anyOf`,
 * or ignores the sibling keys, still sees a complete valid row. `type: 'object'` must stay beside `anyOf`: DeepSeek
 * rejects an `anyOf` without a sibling `type`.
 *
 * Purpose: Requires a destination on move, transport, and disembark rows while every other action keeps its own keys.
 * When to use: The `orders` property.
 * Expected outcome: `action` is limited to the mode's legal actions; `order` appears only when standing orders are
 * legal.
 * Exceptions: Throws when a legal action has no row shape.
 */
function orderRowSchema(gates: EnvelopeGates): Record<string, unknown> {
  const actions = legalOrderActionsForMode(gates.coordinateMode, true, gates.includeStandingOrderActions !== false);
  const properties = orderRowProperties(actions);
  return {
    ...closedObjectSchema(properties, ['action']),
    anyOf: actions.map((action) => orderActionRowSchema(action, properties)),
  };
}

/**
 * Builds the schema for one `callbacks[]` row.
 *
 * Purpose: Limits subscriptions to the events the prompt teaches in this mode, in object form only.
 * When to use: The `callbacks` property.
 * Expected outcome: `event` is required; `params` lists every taught parameter name.
 * Exceptions: None.
 */
function callbackRowSchema(gates: EnvelopeGates): Record<string, unknown> {
  const taughtEvents = TAUGHT_CALLBACK_EVENTS.filter(
    (row) => !row.modes || row.modes.includes(gates.coordinateMode)
  ).map((row) => row.event);
  const paramsSchema = closedObjectSchema(
    {
      n: { type: 'integer' },
      unitId: STRING_SCHEMA,
      side: STRING_SCHEMA,
      severity: STRING_SCHEMA,
      targetType: enumSchema(INFRASTRUCTURE_TARGET_TYPES),
      hex: STRING_SCHEMA,
    },
    []
  );
  return closedObjectSchema({ event: enumSchema(taughtEvents), params: paramsSchema }, ['event']);
}

/**
 * Builds the schema for one envelope field.
 *
 * Purpose: Maps each field name from `envelopeFieldsForGates` to its schema.
 * When to use: Inside `buildOrdersEnvelopeResponseFormat`.
 * Expected outcome: A schema for every known field name.
 * Exceptions: Throws for an unknown field name, which means the envelope field list grew without a schema.
 */
function envelopeFieldSchema(field: string, gates: EnvelopeGates): Record<string, unknown> {
  switch (field) {
    case 'message':
    case 'strategy':
      return { ...STRING_SCHEMA };
    case 'orders':
      return arraySchema(orderRowSchema(gates));
    case 'airStrikes':
      return arraySchema(
        closedObjectSchema(
          {
            unitId: STRING_SCHEMA,
            unitIds: STRING_ARRAY_SCHEMA,
            targetHexCode: STRING_SCHEMA,
            targetUnitId: STRING_SCHEMA,
            targetType: enumSchema(AIR_STRIKE_TARGET_TYPES),
          },
          ['targetType']
        )
      );
    case 'ferryOrders':
      return arraySchema(
        closedObjectSchema({ unitId: STRING_SCHEMA, unitIds: STRING_ARRAY_SCHEMA, destination: STRING_SCHEMA }, [
          'destination',
        ])
      );
    case 'callbacks':
      return arraySchema(callbackRowSchema(gates));
    case 'memoryUpdates':
      return arraySchema(
        closedObjectSchema(
          {
            action: enumSchema(MEMORY_UPDATE_ACTIONS),
            key: STRING_SCHEMA,
            content: STRING_SCHEMA,
            tier: enumSchema(MEMORY_TIERS),
          },
          ['action', 'key']
        )
      );
    case 'productionOrders':
      return arraySchema(
        closedObjectSchema(
          {
            action: enumSchema(PRODUCTION_ORDER_ACTIONS),
            hex: STRING_SCHEMA,
            unitType: enumSchema(ALL_BUILD_UNIT_TYPES),
            count: { type: 'integer' },
          },
          ['action', 'hex', 'unitType', 'count']
        )
      );
    default:
      throw new Error(`envelopeJsonSchema: no schema for envelope field "${field}"`);
  }
}

/**
 * Builds the OpenRouter `response_format` for the order envelope.
 *
 * The schema is closed at every depth (`additionalProperties: false`) because some providers strip keys a schema
 * does not list. It may use only `type`, `properties`, `required`, `additionalProperties`, `items`, `enum`, and
 * `anyOf` (inline, beside `type`, never with `$ref`), because providers reject other keywords. `strict` stays false:
 * strict mode would require every property.
 *
 * Purpose: Constrains the final reply to the envelope the system prompt teaches.
 * When to use: Once per consultation for models that support structured outputs.
 * Expected outcome: Fields in `envelopeFieldsForGates` order; `message`, `strategy`, and `orders` required.
 * Exceptions: Throws only if the envelope field list contains a field with no schema.
 */
export function buildOrdersEnvelopeResponseFormat(gates: EnvelopeGates): Record<string, unknown> {
  const fields = envelopeFieldsForGates(gates);
  logDebug('promptSpec buildOrdersEnvelopeResponseFormat', { ...gates, fieldCount: fields.length });
  const properties = Object.fromEntries(fields.map((field) => [field, envelopeFieldSchema(field, gates)]));
  return {
    type: 'json_schema',
    json_schema: {
      name: ORDERS_ENVELOPE_SCHEMA_NAME,
      strict: false,
      schema: closedObjectSchema(properties, ['message', 'strategy', 'orders']),
    },
  };
}
