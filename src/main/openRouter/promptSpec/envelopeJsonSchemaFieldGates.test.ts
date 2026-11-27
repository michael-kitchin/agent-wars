/**
 * Schema tests for the strategic optional fields that sit just before the always-offered last field.
 * Run with: node dist/main/openRouter/promptSpec/envelopeJsonSchemaFieldGates.test.js
 */

import assert from 'node:assert/strict';
import { buildOrdersEnvelopeResponseFormat } from './envelopeJsonSchema';
import type { EnvelopeGates } from './envelopeContract';
import { POSTURES } from '../../../shared/postureTypes';

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
  includeExitBattle: false,
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
  includeExitBattle: false,
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
 * Verifies `campaignTarget` is a string only when the strategic gate is on.
 *
 * Purpose: Structured output must not require a campaign city the prompt omitted.
 * When to use: After the envelope field list changes.
 * Expected outcome: The property is a string and not required when the gate is on, and absent when the gate is off or the mode is tactical.
 * Exceptions: None.
 */
function testCampaignTargetSchemaFollowsTheGate(): void {
  const onSchema = envelopeSchema({ ...STRATEGIC_ALL_ON, includeCampaignTarget: true });
  const on = asRecord(onSchema.properties, 'properties');
  assert.equal(asRecord(on.campaignTarget, 'campaignTarget').type, 'string');
  assert.ok(!(onSchema.required as string[]).includes('campaignTarget'));
  const names = Object.keys(on);
  assert.deepEqual(names.slice(-2), ['campaignTarget', 'holdAutomaticFireAgainst']);
  const off = asRecord(envelopeSchema(STRATEGIC_ALL_ON).properties, 'properties');
  assert.ok(!('campaignTarget' in off));
  const tactical = asRecord(
    envelopeSchema({ ...TACTICAL, includeCampaignTarget: true }).properties,
    'properties'
  );
  assert.ok(!('campaignTarget' in tactical));
}

/**
 * Verifies `operations` is an array of open command objects only when the strategic gate is on.
 *
 * Purpose: A bad letter must reach the parser as a drop reason, so the schema must not reject it.
 * When to use: After the envelope field list changes.
 * Expected outcome: The property is not required. `action`, `option`, `id`, `objective`, and `method` are optional strings, and `action` is not an enum. The property is absent when the gate is off or the mode is tactical.
 * Exceptions: None.
 */
function testOperationsSchemaFollowsTheGate(): void {
  const onSchema = envelopeSchema({ ...STRATEGIC_ALL_ON, includeOperations: true });
  const on = asRecord(onSchema.properties, 'properties');
  const operations = asRecord(on.operations, 'operations');
  assert.equal(operations.type, 'array');
  assert.ok(!(onSchema.required as string[]).includes('operations'));
  assert.deepEqual(Object.keys(on).slice(-2), ['operations', 'holdAutomaticFireAgainst']);
  const items = asRecord(operations.items, 'items');
  const properties = asRecord(items.properties, 'properties');
  const action = asRecord(properties.action, 'action');
  assert.equal(action.type, 'string');
  assert.ok(!('enum' in action));
  assert.equal(asRecord(properties.option, 'option').type, 'string');
  assert.equal(asRecord(properties.id, 'id').type, 'string');
  assert.equal(asRecord(properties.objective, 'objective').type, 'string');
  assert.equal(asRecord(properties.method, 'method').type, 'string');
  const required = items.required as readonly string[];
  assert.ok(!required.includes('objective'));
  assert.ok(!required.includes('method'));
  assert.ok(!('anyOf' in items));
  assert.ok(!('enum' in asRecord(properties.method, 'method')));
  const off = asRecord(envelopeSchema(STRATEGIC_ALL_ON).properties, 'properties');
  assert.ok(!('operations' in off));
  const tactical = asRecord(envelopeSchema({ ...TACTICAL, includeOperations: true }).properties, 'properties');
  assert.ok(!('operations' in tactical));
}

/**
 * Verifies `posture` is a required enum only when the strategic gate is on.
 *
 * Purpose: A model that follows the schema always names a posture from the list.
 * When to use: After the envelope field list changes.
 * Expected outcome: The property is an enum of `POSTURES` and is required. It is absent, and not required, when the gate is off or the mode is tactical.
 * Exceptions: None.
 */
function testPostureSchemaFollowsTheGate(): void {
  const onSchema = envelopeSchema({ ...STRATEGIC_ALL_ON, includeOperations: true, includePosture: true });
  const on = asRecord(onSchema.properties, 'properties');
  const posture = asRecord(on.posture, 'posture');
  assert.deepEqual(posture.enum, [...POSTURES]);
  assert.ok((onSchema.required as string[]).includes('posture'));
  assert.deepEqual(Object.keys(on).slice(-2), ['posture', 'holdAutomaticFireAgainst']);
  const off = asRecord(envelopeSchema(STRATEGIC_ALL_ON).properties, 'properties');
  assert.ok(!('posture' in off));
  const tactical = asRecord(envelopeSchema({ ...TACTICAL, includePosture: true }).properties, 'properties');
  assert.ok(!('posture' in tactical));
  const tacticalSchema = envelopeSchema({ ...TACTICAL, includePosture: true });
  assert.ok(!(tacticalSchema.required as string[]).includes('posture'));
}

/**
 * Runs the optional-field schema tests.
 *
 * Purpose: Node entrypoint for test discovery.
 * When to use: `node dist/main/openRouter/promptSpec/envelopeJsonSchemaFieldGates.test.js`.
 * Expected outcome: Throws on failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testCampaignTargetSchemaFollowsTheGate();
  testOperationsSchemaFollowsTheGate();
  testPostureSchemaFollowsTheGate();
  console.log('envelopeJsonSchemaFieldGates.test.ts passed');
}

run();
