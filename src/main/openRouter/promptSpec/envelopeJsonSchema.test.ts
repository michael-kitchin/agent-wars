/**
 * Tests for the structured-output envelope schema.
 * Run with: node dist/main/openRouter/promptSpec/envelopeJsonSchema.test.js
 */

import assert from 'node:assert/strict';
import { buildOrdersEnvelopeResponseFormat } from './envelopeJsonSchema';
import { buildRepairSchemaText, envelopeFieldsForGates, type EnvelopeGates } from './envelopeContract';
import { getFinalJsonOrdersExampleBlock } from '../promptContracts';
import { TAUGHT_CALLBACK_EVENTS } from './callbackVocabularyText';

/**
 * Strategic gates with every optional envelope field enabled.
 *
 * Purpose: Widest strategic schema.
 * When to use: Field-order, closure, and example-fit checks.
 * Expected outcome: All eight envelope fields present.
 * Exceptions: None.
 */
const STRATEGIC_ALL_ON: EnvelopeGates = {
  coordinateMode: 'strategic',
  includeAirActions: true,
  includeMemoryUpdates: true,
  includeProductionOrders: true,
  includeStandingOrderActions: true,
};

/**
 * Tactical gates with every flag the flow may still pass as true.
 *
 * Purpose: Proves tactical mode drops strategic-only fields even when flags are on.
 * When to use: Tactical exclusion and example-fit checks.
 * Expected outcome: No memory, production, or standing-order surface.
 * Exceptions: None.
 */
const TACTICAL: EnvelopeGates = {
  coordinateMode: 'tactical',
  includeAirActions: true,
  includeMemoryUpdates: true,
  includeProductionOrders: true,
  includeStandingOrderActions: false,
};

/**
 * Narrows an unknown schema node to a record.
 *
 * Purpose: Keeps assertions readable without repeated casts.
 * When to use: Walking schema and example objects.
 * Expected outcome: The value as a record; fails the test when it is not a plain object.
 * Exceptions: AssertionError when the value is not an object.
 */
function asRecord(value: unknown, path: string): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${path} must be an object`);
  return value as Record<string, unknown>;
}

/**
 * Returns the top-level envelope schema for the given gates.
 *
 * Purpose: Skips the `response_format` wrapper in each test.
 * When to use: Every schema assertion.
 * Expected outcome: The `json_schema.schema` object.
 * Exceptions: AssertionError when the wrapper shape changes.
 */
function envelopeSchema(gates: EnvelopeGates): Record<string, unknown> {
  const responseFormat = buildOrdersEnvelopeResponseFormat(gates);
  return asRecord(asRecord(responseFormat.json_schema, 'json_schema').schema, 'schema');
}

/**
 * Asserts every object schema below `node` is closed.
 *
 * Purpose: Providers that strip unlisted keys must find every object closed.
 * When to use: After building a schema.
 * Expected outcome: `additionalProperties === false` wherever `type === 'object'`.
 * Exceptions: AssertionError naming the open path.
 */
function assertEveryObjectClosed(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => assertEveryObjectClosed(child, `${path}[${index}]`));
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (record.type === 'object') assert.equal(record.additionalProperties, false, `${path} must be closed`);
  Object.entries(record).forEach(([key, child]) => assertEveryObjectClosed(child, `${path}.${key}`));
}

/**
 * Finds the first way a value fails a schema node, by keys, required keys, enums, and `anyOf` variants.
 *
 * Purpose: Shared by the example-fit drift guard and the per-action row checks.
 * When to use: Checking whether a value would be accepted by a schema node.
 * Expected outcome: `undefined` when the value fits. Otherwise a message naming the first unlisted or missing key,
 * the first value outside an enum, or every variant's mismatch when no `anyOf` variant fits.
 * Exceptions: AssertionError when the schema itself is malformed (missing `properties` or `items`).
 */
function schemaMismatch(value: unknown, schema: Record<string, unknown>, path: string): string | undefined {
  if (Array.isArray(value)) {
    if (schema.type !== 'array') return `${path} must be an array schema`;
    const items = asRecord(schema.items, `${path}.items`);
    return value.map((item, index) => schemaMismatch(item, items, `${path}[${index}]`)).find((m) => m !== undefined);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const properties = asRecord(schema.properties, `${path}.properties`);
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    const missing = required.find((key) => !(key in record));
    if (missing) return `${path}.${missing} is required by the schema but missing`;
    const keyMismatch = Object.entries(record)
      .map(([key, child]) =>
        key in properties
          ? schemaMismatch(child, asRecord(properties[key], `${path}.${key}`), `${path}.${key}`)
          : `${path}.${key} is not listed in the schema`
      )
      .find((m) => m !== undefined);
    if (keyMismatch) return keyMismatch;
    if (!Array.isArray(schema.anyOf)) return undefined;
    const variantMismatches = schema.anyOf.map((variant, index) =>
      schemaMismatch(value, asRecord(variant, `${path}.anyOf[${index}]`), `${path}.anyOf[${index}]`)
    );
    return variantMismatches.some((m) => m === undefined)
      ? undefined
      : `${path} matches no anyOf variant: ${variantMismatches.join('; ')}`;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return `${path} value ${String(value)} is not in the schema enum`;
  }
  return undefined;
}

/**
 * Asserts an example value is accepted by a schema node.
 *
 * Purpose: Any key or enum value taught in a prompt example must be allowed by the schema.
 * When to use: The example-fit drift guard.
 * Expected outcome: Passes when `schemaMismatch` finds nothing.
 * Exceptions: AssertionError carrying the mismatch message.
 */
function assertValueFitsSchema(value: unknown, schema: Record<string, unknown>, path: string): void {
  const mismatch = schemaMismatch(value, schema, path);
  assert.equal(mismatch, undefined, mismatch);
}

/**
 * Returns the `orders[]` row schema for the given gates.
 *
 * Purpose: Several tests inspect the row schema directly.
 * When to use: Row action, key, and variant checks.
 * Expected outcome: The `orders.items` node.
 * Exceptions: AssertionError when the envelope shape changes.
 */
function orderRowSchemaFor(gates: EnvelopeGates): Record<string, unknown> {
  const properties = asRecord(envelopeSchema(gates).properties, 'properties');
  return asRecord(asRecord(properties.orders, 'orders').items, 'orders.items');
}

/**
 * Parses the JSON object embedded in a prompt text block.
 *
 * Purpose: Repair and example blocks wrap their JSON in prose.
 * When to use: The example-fit drift guard.
 * Expected outcome: The parsed object between the first `{` and the last `}`.
 * Exceptions: Throws when the block holds no parseable JSON object.
 */
function parseEmbeddedJson(text: string): unknown {
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

/**
 * Verifies field order, the strict flag, and closure for the widest strategic schema.
 *
 * Purpose: Strategy before orders must survive, and every object must be closed.
 * When to use: After changing the schema builder.
 * Expected outcome: Property order equals the envelope field order; `strict === false`; every object closed.
 * Exceptions: None.
 */
function testStrategicFieldOrderAndClosure(): void {
  const responseFormat = buildOrdersEnvelopeResponseFormat(STRATEGIC_ALL_ON);
  assert.equal(asRecord(responseFormat.json_schema, 'json_schema').strict, false);
  const schema = envelopeSchema(STRATEGIC_ALL_ON);
  assert.deepEqual(Object.keys(asRecord(schema.properties, 'properties')), [...envelopeFieldsForGates(STRATEGIC_ALL_ON)]);
  assertEveryObjectClosed(schema, 'schema');
}

/**
 * Verifies tactical gates drop strategic-only actions, fields, and events.
 *
 * Purpose: A beat must not be steered toward standing orders, memory, production, or arrival callbacks.
 * When to use: After changing gating in the schema builder.
 * Expected outcome: No `assign_order` / `cancel_order`, no `order` property, no `unit_arrived`, no memory or production.
 * Exceptions: None.
 */
function testTacticalDropsStrategicOnlySurface(): void {
  const properties = asRecord(envelopeSchema(TACTICAL).properties, 'properties');
  const orderRow = orderRowSchemaFor(TACTICAL);
  const actions = asRecord(asRecord(orderRow.properties, 'orders.items.properties').action, 'action').enum as unknown[];
  assert.ok(!actions.includes('assign_order'));
  assert.ok(!actions.includes('cancel_order'));
  assert.ok(!('order' in asRecord(orderRow.properties, 'orders.items.properties')));
  const callbackRow = asRecord(asRecord(properties.callbacks, 'callbacks').items, 'callbacks.items');
  const events = asRecord(asRecord(callbackRow.properties, 'callbacks.items.properties').event, 'event').enum as unknown[];
  assert.ok(!events.includes('unit_arrived'));
  assert.ok(!('memoryUpdates' in properties));
  assert.ok(!('productionOrders' in properties));
}

/**
 * Verifies move, transport, and disembark rows fit only when they carry a destination.
 *
 * Purpose: A move row with no destination is dropped by the parser, so the schema must not accept one.
 * When to use: After changing the row schema or the action row shapes.
 * Expected outcome: For both modes, each of the three actions fits with a destination and fails without one.
 * Exceptions: None.
 */
function testMoveRowsRequireDestination(): void {
  [STRATEGIC_ALL_ON, TACTICAL].forEach((gates) => {
    const orderRow = orderRowSchemaFor(gates);
    ['explicit_move', 'transport_move', 'disembark'].forEach((action) => {
      const path = `${gates.coordinateMode} ${action}`;
      const withoutDestination =
        action === 'transport_move' ? { action, unitId: 'u1', navalUnitId: 'n1' } : { action, unitId: 'u1' };
      assert.equal(schemaMismatch({ ...withoutDestination, destination: 'AB' }, orderRow, path), undefined);
      assert.ok(schemaMismatch(withoutDestination, orderRow, path), `${path} without destination must not fit`);
    });
  });
}

/**
 * Verifies the taught JSON examples fit the schema.
 *
 * Purpose: Drift guard; a key taught in a prompt example but missing from the schema would be stripped or rejected.
 * When to use: After changing prompt examples or the schema.
 * Expected outcome: Repair and system-prompt examples fit for strategic and tactical gates.
 * Exceptions: None.
 */
function testTaughtExamplesFitSchema(): void {
  const cases: ReadonlyArray<{ readonly gates: EnvelopeGates; readonly exampleText: string }> = [
    {
      gates: STRATEGIC_ALL_ON,
      exampleText: getFinalJsonOrdersExampleBlock({
        includeMemoryUpdates: true,
        includeProductionOrders: true,
        includeAirActions: true,
        includeStandingOrderActions: true,
        coordinateMode: 'strategic',
      }),
    },
    {
      gates: TACTICAL,
      exampleText: getFinalJsonOrdersExampleBlock({
        includeMemoryUpdates: true,
        includeProductionOrders: true,
        includeAirActions: true,
        coordinateMode: 'tactical',
      }),
    },
  ];
  cases.forEach(({ gates, exampleText }) => {
    const schema = envelopeSchema(gates);
    assertValueFitsSchema(parseEmbeddedJson(buildRepairSchemaText(gates)), schema, `${gates.coordinateMode} repair`);
    assertValueFitsSchema(parseEmbeddedJson(exampleText), schema, `${gates.coordinateMode} example`);
  });
}

/**
 * Verifies every taught callback parameter name is allowed by the callback params schema.
 *
 * Purpose: Drift guard; the prompt teaches parameters from `TAUGHT_CALLBACK_EVENTS`, and the closed params schema
 * would block any parameter it does not list.
 * When to use: After changing the taught callback vocabulary or the callback schema.
 * Expected outcome: Each name before the first `(` in a `parameters` phrase, split on commas and "or", is a schema property.
 * Exceptions: None.
 */
function testTaughtCallbackParametersFitSchema(): void {
  const properties = asRecord(envelopeSchema(STRATEGIC_ALL_ON).properties, 'properties');
  const callbackRow = asRecord(asRecord(properties.callbacks, 'callbacks').items, 'callbacks.items');
  const callbackRowProperties = asRecord(callbackRow.properties, 'callbacks.items.properties');
  const paramProperties = asRecord(asRecord(callbackRowProperties.params, 'params').properties, 'params.properties');
  TAUGHT_CALLBACK_EVENTS.forEach(({ event, parameters }) => {
    const names = parameters
      .split('(')[0]
      .split(/,|\bor\b/)
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    assert.ok(names.length > 0, `${event} teaches no parameter names`);
    names.forEach((name) => assert.ok(name in paramProperties, `${event} parameter ${name} is missing from the schema`));
  });
}

/**
 * Runs envelope schema tests.
 *
 * Purpose: Node entrypoint for test discovery.
 * When to use: `node dist/main/openRouter/promptSpec/envelopeJsonSchema.test.js`.
 * Expected outcome: Throws on failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testStrategicFieldOrderAndClosure();
  testTacticalDropsStrategicOnlySurface();
  testMoveRowsRequireDestination();
  testTaughtExamplesFitSchema();
  testTaughtCallbackParametersFitSchema();
  console.log('envelopeJsonSchema.test.ts passed');
}

run();
