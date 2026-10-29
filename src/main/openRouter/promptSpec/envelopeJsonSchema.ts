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
import { ALL_BUILD_QUEUE_ITEM_TYPES } from '../../../shared/ipc/productionTypes';
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
 * Place and option keys every standing-order type branch lists.
 *
 * Purpose: A branch that omits a taught key would strip it under `additionalProperties: false`.
 * When to use: Each entry of `standingOrderSchema`, spread beside that type's `type` enum.
 * Expected outcome: String, string-array, number, and boolean leaves for every place and option key a type may carry.
 * Exceptions: None.
 */
const STANDING_ORDER_BRANCH_PROPERTIES: Readonly<Record<string, unknown>> = Object.freeze({
  destination: STRING_SCHEMA,
  defendHex: STRING_SCHEMA,
  waypoints: STRING_ARRAY_SCHEMA,
  targetUnitId: STRING_SCHEMA,
  engageRange: { type: 'number' },
  maxDistance: { type: 'number' },
  avoidEnemies: { type: 'boolean' },
  engageEnRoute: { type: 'boolean' },
});

/**
 * Required keys for each standing-order type, including `type`.
 *
 * Purpose: A march without a destination, and the other placed types without their place or target, must not match a branch.
 * When to use: `standingOrderSchema`.
 * Expected outcome: One required-key list per `STANDING_ORDER_TYPES` entry. `hold_fire` requires `type` only.
 * Exceptions: None.
 */
const STANDING_ORDER_REQUIRED_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  march: ['type', 'destination'],
  defend: ['type', 'defendHex'],
  pursue: ['type', 'targetUnitId'],
  patrol: ['type', 'waypoints'],
  hold_fire: ['type'],
});

/**
 * Builds the schema for an `assign_order` row's nested `order` object.
 *
 * Purpose: Each standing-order type is its own closed branch, so a march without a destination does not match.
 * When to use: Only when the action enum includes `assign_order`.
 * Expected outcome: A bare `anyOf` whose branches cover `STANDING_ORDER_TYPES`.
 * Exceptions: Throws when a standing-order type has no required-key list.
 */
function standingOrderSchema(): Record<string, unknown> {
  return {
    anyOf: STANDING_ORDER_TYPES.map((orderType) => {
      const required = STANDING_ORDER_REQUIRED_KEYS[orderType];
      if (!required) throw new Error(`envelopeJsonSchema: no required keys for standing order "${orderType}"`);
      return closedObjectSchema({ type: enumSchema([orderType]), ...STANDING_ORDER_BRANCH_PROPERTIES }, required);
    }),
  };
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
   * Contract: Subset of `keys`. `ranged_attack` is not listed here; it is two branches in `rangedAttackRowSchemas`.
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
 * Expected outcome: One entry per legal action except `ranged_attack`, which `rangedAttackRowSchemas` builds as two branches.
 * Exceptions: None.
 */
const ORDER_ACTION_ROW_SHAPES: Readonly<Record<string, OrderActionRowShape>> = Object.freeze({
  explicit_move: { keys: ['destination'], required: ['destination'] },
  embark: { keys: ['navalUnitId'], required: ['navalUnitId'] },
  transport_move: { keys: ['navalUnitId', 'destination'], required: ['navalUnitId', 'destination'] },
  disembark: { keys: ['destination'], required: ['destination'] },
  assign_order: { keys: ['order'], required: ['order'] },
  cancel_order: { keys: [], required: [] },
});

/**
 * Builds the property table for an `orders[]` row.
 *
 * Purpose: One source for every row key's schema, shared by the per-action branches.
 * When to use: `orderRowSchema`, `orderActionRowSchema`, and `rangedAttackRowSchemas`.
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
 * Builds the two `memoryUpdates` branches.
 *
 * The items node that holds this array must stay a bare `anyOf`. A sibling `type` or `properties` makes Gemini
 * ignore the branches and accept a write that has no content.
 *
 * Purpose: A write must name content and tier. A delete names only the action and the key.
 * When to use: The `memoryUpdates` property.
 * Expected outcome: Two closed objects. The write branch requires `action`, `key`, `content`, and `tier`. The delete
 * branch requires `action` and `key` and does not list `content` or `tier`.
 * Exceptions: None.
 */
function memoryUpdateRowSchemas(): Record<string, unknown>[] {
  return [
    closedObjectSchema(
      {
        action: enumSchema(['write']),
        key: STRING_SCHEMA,
        content: STRING_SCHEMA,
        tier: enumSchema(MEMORY_TIERS),
      },
      ['action', 'key', 'content', 'tier']
    ),
    closedObjectSchema(
      {
        action: enumSchema(['delete']),
        key: STRING_SCHEMA,
      },
      ['action', 'key']
    ),
  ];
}

/**
 * Builds the two `ranged_attack` branches.
 *
 * Purpose: A shot must name a hex or a unit, and a row that names both matches neither branch.
 * When to use: `orderRowSchema`, in place of `orderActionRowSchema` for `ranged_attack`.
 * Expected outcome: Two closed objects. One requires `targetHexCode` and omits `targetUnitId`. The other does the reverse.
 * Exceptions: None.
 */
function rangedAttackRowSchemas(allProperties: Readonly<Record<string, unknown>>): Record<string, unknown>[] {
  const actors = { unitId: allProperties.unitId, unitIds: allProperties.unitIds };
  return [
    closedObjectSchema(
      { action: enumSchema(['ranged_attack']), ...actors, targetHexCode: allProperties.targetHexCode },
      ['action', 'targetHexCode']
    ),
    closedObjectSchema(
      { action: enumSchema(['ranged_attack']), ...actors, targetUnitId: allProperties.targetUnitId },
      ['action', 'targetUnitId']
    ),
  ];
}

/**
 * Builds the schema for one `orders[]` row.
 *
 * The node is a bare `anyOf`. Sibling `type` or `properties` would make Gemini ignore the branches and accept a
 * move that has no destination.
 *
 * Purpose: Requires a destination on move, transport, and disembark rows, and a target on ranged rows.
 * When to use: The `orders` property.
 * Expected outcome: `action` is limited to the mode's legal actions; `order` appears only when standing orders are
 * legal. `unitId` and `unitIds` stay optional on every branch.
 * Exceptions: Throws when a legal action other than `ranged_attack` has no row shape.
 */
function orderRowSchema(gates: EnvelopeGates): Record<string, unknown> {
  const actions = legalOrderActionsForMode(gates.coordinateMode, true, gates.includeStandingOrderActions !== false);
  const properties = orderRowProperties(actions);
  return {
    anyOf: actions.flatMap((action) =>
      action === 'ranged_attack' ? rangedAttackRowSchemas(properties) : [orderActionRowSchema(action, properties)]
    ),
  };
}

/**
 * Builds the schema for one `airStrikes[]` row.
 *
 * Purpose: A strike must name a hex or a unit, and a row that names both matches neither branch.
 * When to use: The `airStrikes` property.
 * Expected outcome: A bare `anyOf` of two closed objects. `targetType` is required on both. `unitId` and `unitIds` stay optional.
 * Exceptions: None.
 */
function airStrikeRowSchema(): Record<string, unknown> {
  const actors = {
    unitId: STRING_SCHEMA,
    unitIds: STRING_ARRAY_SCHEMA,
    targetType: enumSchema(AIR_STRIKE_TARGET_TYPES),
  };
  return {
    anyOf: [
      closedObjectSchema({ ...actors, targetHexCode: STRING_SCHEMA }, ['targetType', 'targetHexCode']),
      closedObjectSchema({ ...actors, targetUnitId: STRING_SCHEMA }, ['targetType', 'targetUnitId']),
    ],
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
      return arraySchema(airStrikeRowSchema());
    case 'ferryOrders':
      return arraySchema(
        closedObjectSchema({ unitId: STRING_SCHEMA, unitIds: STRING_ARRAY_SCHEMA, destination: STRING_SCHEMA }, [
          'destination',
        ])
      );
    case 'missileLaunches':
      return arraySchema(
        closedObjectSchema({ unitId: STRING_SCHEMA, unitIds: STRING_ARRAY_SCHEMA, targetHexCode: STRING_SCHEMA }, [
          'targetHexCode',
        ])
      );
    case 'callbacks':
      return arraySchema(callbackRowSchema(gates));
    case 'memoryUpdates':
      return arraySchema({ anyOf: memoryUpdateRowSchemas() });
    case 'productionOrders':
      return arraySchema(
        closedObjectSchema(
          {
            action: enumSchema(PRODUCTION_ORDER_ACTIONS),
            hex: STRING_SCHEMA,
            unitType: enumSchema(ALL_BUILD_QUEUE_ITEM_TYPES),
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
 * `anyOf` (inline, never with `$ref`). An `anyOf` that constrains a row is the only key on that node, because a
 * sibling `type` or `properties` makes Gemini ignore the branches. `strict` stays false: strict mode would require
 * every property.
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
