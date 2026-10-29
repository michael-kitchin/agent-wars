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
 * Expected outcome: Every strategic envelope field present, including missile launches.
 * Exceptions: None.
 */
const STRATEGIC_ALL_ON: EnvelopeGates = {
  coordinateMode: 'strategic',
  includeAirActions: true,
  includeMissileActions: true,
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
 * Reports whether a value matches any bare or sibling `anyOf` branch.
 *
 * Purpose: Order rows and standing-order objects are unions, so a single property table cannot accept them.
 * When to use: `schemaMismatch`, when the node has `anyOf`.
 * Expected outcome: `undefined` when one branch fits. Otherwise every branch mismatch, joined.
 * Exceptions: AssertionError when a branch is not an object schema.
 */
function anyOfMismatch(value: unknown, schema: Record<string, unknown>, path: string): string | undefined {
  const variantMismatches = (schema.anyOf as unknown[]).map((variant, index) =>
    schemaMismatch(value, asRecord(variant, `${path}.anyOf[${index}]`), `${path}.anyOf[${index}]`)
  );
  return variantMismatches.some((mismatch) => mismatch === undefined)
    ? undefined
    : `${path} matches no anyOf variant: ${variantMismatches.join('; ')}`;
}

/**
 * Finds the first way a value fails a schema node, by keys, required keys, enums, and `anyOf` variants.
 *
 * Purpose: Shared by the example-fit drift guard and the per-action row checks.
 * When to use: Checking whether a value would be accepted by a schema node.
 * Expected outcome: `undefined` when the value fits. Otherwise a message naming the first unlisted or missing key,
 * the first value outside an enum, or every variant's mismatch when no `anyOf` variant fits.
 * Exceptions: AssertionError when a schema node that should have `properties` or `items` does not.
 */
function schemaMismatch(value: unknown, schema: Record<string, unknown>, path: string): string | undefined {
  if (Array.isArray(schema.anyOf) && schema.properties === undefined) return anyOfMismatch(value, schema, path);
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
    return anyOfMismatch(value, schema, path);
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
  const branches = orderRow.anyOf as unknown[];
  assert.ok(Array.isArray(branches));
  const actions = branches.flatMap((branch) => {
    const branchProperties = asRecord(asRecord(branch, 'tactical branch').properties, 'tactical branch.properties');
    assert.ok(!('order' in branchProperties));
    return asRecord(branchProperties.action, 'action').enum as unknown[];
  });
  assert.ok(!actions.includes('assign_order'));
  assert.ok(!actions.includes('cancel_order'));
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
        includeMissileActions: true,
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
 * Verifies an order row is a bare union and still accepts both actor-id shapes.
 *
 * Purpose: A sibling property table would let Gemini omit `destination` and `order`.
 * When to use: After changing `orderRowSchema`.
 * Expected outcome: The items node has only `anyOf`. A move fits with `unitId` or `unitIds`. An assign without `order` fails.
 * Exceptions: None.
 */
function testOrderRowIsBareUnion(): void {
  [STRATEGIC_ALL_ON, TACTICAL].forEach((gates) => {
    const orderRow = orderRowSchemaFor(gates);
    assert.deepEqual(Object.keys(orderRow), ['anyOf']);
    const path = gates.coordinateMode;
    assert.equal(
      schemaMismatch({ action: 'explicit_move', unitId: 'a1-t1', destination: 'AB' }, orderRow, path),
      undefined
    );
    assert.equal(
      schemaMismatch({ action: 'explicit_move', unitIds: ['a1-t1'], destination: 'AB' }, orderRow, path),
      undefined
    );
    assert.ok(schemaMismatch({ action: 'explicit_move', unitId: 'a1-t1' }, orderRow, path));
  });
  const strategic = orderRowSchemaFor(STRATEGIC_ALL_ON);
  assert.equal(
    schemaMismatch(
      { action: 'assign_order', unitId: 'a1-t1', order: { type: 'hold_fire' } },
      strategic,
      'assign'
    ),
    undefined
  );
  assert.ok(schemaMismatch({ action: 'assign_order', unitId: 'a1-t1' }, strategic, 'assign without order'));
}

/**
 * Verifies each standing-order type requires its own place or target field.
 *
 * Purpose: A march object whose only key is `type` is what the loose order schema used to allow.
 * When to use: After changing `standingOrderSchema`.
 * Expected outcome: Each type fits with its required field and fails without it. `hold_fire` fits with `type` alone.
 * Exceptions: None.
 */
function testStandingOrderBranchesRequireTypeFields(): void {
  const orderRow = orderRowSchemaFor(STRATEGIC_ALL_ON);
  const cases: ReadonlyArray<{ readonly order: Record<string, unknown>; readonly fits: boolean }> = [
    { order: { type: 'march', destination: 'CF' }, fits: true },
    { order: { type: 'march' }, fits: false },
    { order: { type: 'defend', defendHex: 'CF' }, fits: true },
    { order: { type: 'defend' }, fits: false },
    { order: { type: 'pursue', targetUnitId: 'h1-i1' }, fits: true },
    { order: { type: 'pursue' }, fits: false },
    { order: { type: 'patrol', waypoints: ['CD', 'CF'] }, fits: true },
    { order: { type: 'patrol' }, fits: false },
    { order: { type: 'hold_fire' }, fits: true },
  ];
  cases.forEach(({ order, fits }) => {
    const row = { action: 'assign_order', unitId: 'a1-t1', order };
    const mismatch = schemaMismatch(row, orderRow, String(order.type));
    assert.equal(mismatch === undefined, fits, mismatch ?? `${String(order.type)} should not fit`);
  });
}

/**
 * Verifies a memory write must name content and tier, and a delete must not.
 *
 * Purpose: Gemini ignores `anyOf` when the items node also has `type` or `properties`, so this locks a bare union.
 * When to use: After changing the `memoryUpdates` schema.
 * Expected outcome: The items node is only `anyOf`. A complete write and a bare delete fit. A write missing content
 * or tier, and a delete that includes content, do not.
 * Exceptions: AssertionError when the schema accepts a partial write or a delete that carries content.
 */
function testMemoryUpdateRowsRequireContentAndTier(): void {
  const properties = asRecord(envelopeSchema(STRATEGIC_ALL_ON).properties, 'properties');
  const items = asRecord(asRecord(properties.memoryUpdates, 'memoryUpdates').items, 'memoryUpdates.items');
  assert.deepEqual(Object.keys(items), ['anyOf']);
  const path = 'memoryUpdates';
  assert.equal(
    schemaMismatch(
      { action: 'write', key: 'turn_objectives', tier: 'persistent', content: 'Hold the coast.' },
      items,
      path
    ),
    undefined
  );
  assert.ok(
    schemaMismatch({ action: 'write', key: 'turn_objectives', tier: 'persistent' }, items, path),
    'write without content must not fit'
  );
  assert.ok(
    schemaMismatch({ action: 'write', key: 'turn_objectives', content: 'Hold the coast.' }, items, path),
    'write without tier must not fit'
  );
  assert.equal(schemaMismatch({ action: 'delete', key: 'turn_objectives' }, items, path), undefined);
  assert.ok(
    schemaMismatch({ action: 'delete', key: 'turn_objectives', content: 'gone' }, items, path),
    'delete with content must not fit'
  );
}

/**
 * Verifies ranged rows and air strikes accept exactly one target key.
 *
 * Purpose: A row with both targets, or with neither, is dropped by the parser.
 * When to use: After changing the ranged branches or `airStrikeRowSchema`.
 * Expected outcome: One target fits. Neither or both fails. Ferry still requires `destination` and nothing else new.
 * Exceptions: None.
 */
function testRangedAndAirStrikeTargets(): void {
  [STRATEGIC_ALL_ON, TACTICAL].forEach((gates) => {
    const orderRow = orderRowSchemaFor(gates);
    const path = gates.coordinateMode;
    assert.equal(
      schemaMismatch({ action: 'ranged_attack', unitId: 'a1-n1', targetHexCode: 'AB' }, orderRow, path),
      undefined
    );
    assert.equal(
      schemaMismatch({ action: 'ranged_attack', unitId: 'a1-n1', targetUnitId: 'h1-i1' }, orderRow, path),
      undefined
    );
    assert.ok(schemaMismatch({ action: 'ranged_attack', unitId: 'a1-n1' }, orderRow, path));
    assert.ok(
      schemaMismatch(
        { action: 'ranged_attack', unitId: 'a1-n1', targetHexCode: 'AB', targetUnitId: 'h1-i1' },
        orderRow,
        path
      )
    );
  });
  const properties = asRecord(envelopeSchema(STRATEGIC_ALL_ON).properties, 'properties');
  const airRow = asRecord(asRecord(properties.airStrikes, 'airStrikes').items, 'airStrikes.items');
  assert.deepEqual(Object.keys(airRow), ['anyOf']);
  assert.equal(
    schemaMismatch({ unitId: 'a1-a1', targetType: 'units', targetHexCode: 'CI' }, airRow, 'air hex'),
    undefined
  );
  assert.equal(
    schemaMismatch({ unitId: 'a1-a1', targetType: 'units', targetUnitId: 'h1-i1' }, airRow, 'air unit'),
    undefined
  );
  assert.ok(schemaMismatch({ unitId: 'a1-a1', targetType: 'units' }, airRow, 'air type only'));
  assert.ok(
    schemaMismatch(
      { unitId: 'a1-a1', targetType: 'units', targetHexCode: 'CI', targetUnitId: 'h1-i1' },
      airRow,
      'air both'
    )
  );
  const ferryRow = asRecord(asRecord(properties.ferryOrders, 'ferryOrders').items, 'ferryOrders.items');
  assert.equal(schemaMismatch({ unitId: 'a1-a2', destination: 'CJ' }, ferryRow, 'ferry'), undefined);
  assert.ok(schemaMismatch({ unitId: 'a1-a2' }, ferryRow, 'ferry without destination'));
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
  testOrderRowIsBareUnion();
  testStandingOrderBranchesRequireTypeFields();
  testRangedAndAirStrikeTargets();
  testMemoryUpdateRowsRequireContentAndTier();
  testTaughtExamplesFitSchema();
  testTaughtCallbackParametersFitSchema();
  testMissileLaunchesSchemaFollowsTheFlag();
  console.log('envelopeJsonSchema.test.ts passed');
}

/**
 * Verifies `missileLaunches` is on the strategic schema only when the gate is on, and never on a tactical schema.
 *
 * Purpose: Structured output must not invite a launch the prompt omitted.
 * When to use: After the envelope field list changes.
 * Expected outcome: The property exists for the widest strategic gates and is absent when the flag is false or the mode is tactical.
 * Exceptions: None.
 */
function testMissileLaunchesSchemaFollowsTheFlag(): void {
  const on = asRecord(envelopeSchema(STRATEGIC_ALL_ON).properties, 'properties');
  assert.ok('missileLaunches' in on);
  const off = asRecord(
    envelopeSchema({ ...STRATEGIC_ALL_ON, includeMissileActions: false }).properties,
    'properties'
  );
  assert.ok(!('missileLaunches' in off));
  const tactical = asRecord(
    envelopeSchema({ ...TACTICAL, includeMissileActions: true }).properties,
    'properties'
  );
  assert.ok(!('missileLaunches' in tactical));
}

run();
