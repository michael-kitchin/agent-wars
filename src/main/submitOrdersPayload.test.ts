import * as assert from 'assert';
import { normalizeSubmitOrdersPayload } from './submitOrdersPayload';

function testLegacyArrayPayloadKeepsMovementOrders(): void {
  const normalized = normalizeSubmitOrdersPayload([{ unitId: 'human-infantry-1', toH3Index: '8123fffffffffff' }]);
  assert.deepStrictEqual(normalized, {
    movementOrders: [{ unitId: 'human-infantry-1', toH3Index: '8123fffffffffff' }],
  });
}

function testStructuredPayloadPreservesAirAndFerryOrders(): void {
  const normalized = normalizeSubmitOrdersPayload({
    movementOrders: [{ unitId: 'human-armor-1', toH3Index: '8125fffffffffff' }],
    rangedAttacks: [{ unitId: 'human-armor-1', targetH3Index: '8127fffffffffff' }],
    airStrikes: [{ unitId: 'human-air-1', targetH3Index: '8129fffffffffff', targetType: 'airport' }],
    ferryOrders: [{ unitId: 'human-air-2', destinationH3Index: '812bfffffffffff' }],
  });
  assert.deepStrictEqual(normalized, {
    movementOrders: [{ unitId: 'human-armor-1', toH3Index: '8125fffffffffff' }],
    rangedAttacks: [{ unitId: 'human-armor-1', targetH3Index: '8127fffffffffff' }],
    airStrikes: [{ unitId: 'human-air-1', targetH3Index: '8129fffffffffff', targetType: 'airport' }],
    ferryOrders: [{ unitId: 'human-air-2', destinationH3Index: '812bfffffffffff' }],
  });
}

function run(): void {
  testLegacyArrayPayloadKeepsMovementOrders();
  testStructuredPayloadPreservesAirAndFerryOrders();
  // eslint-disable-next-line no-console
  console.log('submitOrdersPayload.test.ts passed');
}

run();
