/**
 * The structured-output schema offers `holdAutomaticFireAgainst` in both theaters and never requires it.
 * Run with: node dist/main/openRouter/promptSpec/envelopeJsonSchemaHoldAutomaticFireAgainst.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOrdersEnvelopeResponseFormat } from './envelopeJsonSchema';
import type { EnvelopeGates } from './envelopeContract';

/** The parts of the top-level schema these cases read. */
type EnvelopeSchema = {
  readonly properties: Readonly<Record<string, unknown>>;
  /**
   * The required keys of the built schema.
   *
   * Contract: Read from the schema object.
   * When to use: Checking the field is not required.
   * Expected outcome: Names of required fields.
   * Exceptions: None.
   */
  readonly required: readonly string[];
};

const GATES: readonly EnvelopeGates[] = [
  { coordinateMode: 'strategic', includeAirActions: true, includeMemoryUpdates: true, includeProductionOrders: true, includePosture: true },
  { coordinateMode: 'tactical', includeAirActions: true, includeMemoryUpdates: false, includeProductionOrders: false, includeExitBattle: true },
];

for (const gates of GATES) {
  test(`the ${gates.coordinateMode} schema offers an optional list of strings`, () => {
    const format = buildOrdersEnvelopeResponseFormat(gates) as { json_schema: { schema: EnvelopeSchema } };
    const schema = format.json_schema.schema;
    assert.deepEqual(schema.properties.holdAutomaticFireAgainst, { type: 'array', items: { type: 'string' } });
    assert.equal(schema.required.includes('holdAutomaticFireAgainst'), false);
  });
}
