/**
 * Contracts for strategic duplicate detection helpers used by `executeSubmitOrders`.
 * Run with: node dist/main/gameActions/orderPlanSanitize.test.js
 */

import * as assert from 'assert';
import {
  strategicAirStrikeDuplicateReason,
  strategicFerryDuplicateReason,
  strategicMissileLaunchDuplicateReason,
  strategicMovementDuplicateReason,
  strategicRangedDuplicateReason,
} from './orderPlanSanitize';

/**
 * Defines the `label` function shape (function label(unitId: string): string).

 * Purpose: Stable fake display labels for duplicate reason strings in tests.
 * When to use: Passed as `displayLabelForUnit` to duplicate helpers.
 * Expected outcome: Deterministic substring in returned reasons.
 * Exceptions: None.
 */
function label(unitId: string): string {
  return `U:${unitId}`;
}

/**
 * Defines the `testStrategicDuplicateHelpersUniqueRowsReturnNull` function shape.

 * Purpose: Happy path — no duplicate unit ids in each order category.
 * When to use: Regression when editing `orderPlanSanitize` helpers.
 * Expected outcome: Every helper returns `null` for unique id lists.
 * Exceptions: None.
 */
function testStrategicDuplicateHelpersUniqueRowsReturnNull(): void {
  assert.strictEqual(
    strategicMovementDuplicateReason([{ unitId: 'a' }, { unitId: 'b' }], label),
    null
  );
  assert.strictEqual(strategicRangedDuplicateReason([{ unitId: 'a' }], label), null);
  assert.strictEqual(strategicAirStrikeDuplicateReason([{ unitId: 'x' }, { unitId: 'y' }], label), null);
  assert.strictEqual(strategicFerryDuplicateReason([{ unitId: 'f1' }], label), null);
  assert.strictEqual(
    strategicMissileLaunchDuplicateReason([{ unitId: 'm' }, { unitId: 'n' }], label),
    null
  );
}

/**
 * Defines the `testStrategicDuplicateHelpersDetectRepeatedUnitId` function shape.

 * Purpose: Essential failure — duplicate rows remain a hard submit error.
 * When to use: Guards message shape expected by `executeSubmitOrders` callers.
 * Expected outcome: Non-null reason strings containing the display label.
 * Exceptions: None.
 */
function testStrategicDuplicateHelpersDetectRepeatedUnitId(): void {
  assert.strictEqual(
    strategicMovementDuplicateReason([{ unitId: 'x' }, { unitId: 'x' }], label),
    'Duplicate order for U:x'
  );
  assert.strictEqual(
    strategicRangedDuplicateReason([{ unitId: 'r' }, { unitId: 'r' }], label),
    'Duplicate ranged order for U:r'
  );
  assert.strictEqual(
    strategicAirStrikeDuplicateReason([{ unitId: 'a' }, { unitId: 'a' }], label),
    'Duplicate strike order for U:a'
  );
  assert.strictEqual(
    strategicFerryDuplicateReason([{ unitId: 'f' }, { unitId: 'f' }], label),
    'Duplicate ferry order for U:f'
  );
  assert.strictEqual(
    strategicMissileLaunchDuplicateReason([{ unitId: 'm' }, { unitId: 'm' }], label),
    'Duplicate missile launch for U:m.'
  );
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Executes this test module from Node after `tsc`.
 * When to use: Invoked by `npm test` via compiled `.test.js`.
 * Expected outcome: Process exits after printing pass line.
 * Exceptions: None.
 */
function run(): void {
  testStrategicDuplicateHelpersUniqueRowsReturnNull();
  testStrategicDuplicateHelpersDetectRepeatedUnitId();
  console.log('orderPlanSanitize.test.ts passed');
}

run();
