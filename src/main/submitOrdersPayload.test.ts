import * as assert from 'assert';
import { normalizeSubmitOrdersPayload } from './submitOrdersPayload';

/**
 * Defines the `testLegacyArrayPayloadKeepsMovementOrders` function shape (function testLegacyArrayPayloadKeepsMovementOrders(): void).

 * Purpose: Supports maintainability by documenting why `testLegacyArrayPayloadKeepsMovementOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testLegacyArrayPayloadKeepsMovementOrders(): void {
  const normalized = normalizeSubmitOrdersPayload([{ unitId: 'human-infantry-1', toH3Index: '8123fffffffffff' }]);
  assert.deepStrictEqual(normalized, {
    movementOrders: [{ unitId: 'human-infantry-1', toH3Index: '8123fffffffffff' }],
  });
}

/**
 * Defines the `testStructuredPayloadPreservesAirAndFerryOrders` function shape (function testStructuredPayloadPreservesAirAndFerryOrders(): void).

 * Purpose: Supports maintainability by documenting why `testStructuredPayloadPreservesAirAndFerryOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testStructuredPayloadPreservesAirAndFerryOrders(): void {
  const normalized = normalizeSubmitOrdersPayload({
    movementOrders: [{ unitId: 'human-armor-1', toH3Index: '8125fffffffffff' }],
    rangedAttacks: [{ unitId: 'human-armor-1', targetH3Index: '8127fffffffffff' }],
    airStrikes: [{ unitId: 'human-air-1', targetH3Index: '8129fffffffffff', targetType: 'airport' }],
    ferryOrders: [{ unitId: 'human-air-2', destinationH3Index: '812bfffffffffff' }],
    missileLaunches: [{ unitId: 'human-missile-1', targetH3Index: '812dfffffffffff' }],
  });
  assert.deepStrictEqual(normalized, {
    movementOrders: [{ unitId: 'human-armor-1', toH3Index: '8125fffffffffff' }],
    rangedAttacks: [{ unitId: 'human-armor-1', targetH3Index: '8127fffffffffff' }],
    airStrikes: [{ unitId: 'human-air-1', targetH3Index: '8129fffffffffff', targetType: 'airport' }],
    ferryOrders: [{ unitId: 'human-air-2', destinationH3Index: '812bfffffffffff' }],
    missileLaunches: [{ unitId: 'human-missile-1', targetH3Index: '812dfffffffffff' }],
  });
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testLegacyArrayPayloadKeepsMovementOrders();
  testStructuredPayloadPreservesAirAndFerryOrders();
  console.log('submitOrdersPayload.test.ts passed');
}

run();
