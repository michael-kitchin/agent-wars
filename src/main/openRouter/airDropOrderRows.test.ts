/**
 * Locks the drop-row parser: a hex code becomes an H3 target, and a bad row is dropped with a reason.
 *
 * Purpose: The envelope shape matches ferry, and the engine still does the capacity check later.
 * When to use: After changes to `normalizeAirDropOrders`.
 * Expected outcome: One kept drop, and the missing-field sentence for a row without a destination.
 * Exceptions: Assertion failure names the drifted reason.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { codeToH3, h3ToCode } from '../briefing/map/hexCodeTranslator';
import { AIR_DROP_ENTRY_INVALID_REASON, normalizeAirDropOrders } from './airDropOrderRows';

const HEX = '891f1d48b9fffff';

test('normalizeAirDropOrders keeps a destination and drops a row that has none', () => {
  ensureStrategicCoordinateRegistryInitialized();
  const context = { mode: 'strategic' as const };
  const code = h3ToCode(HEX, context);
  const result = normalizeAirDropOrders(
    [{ unitId: 'air-1', destination: code }, { unitId: 'air-2' }],
    context
  );
  assert.deepEqual(result.airDropOrders, [{ unitId: 'air-1', targetH3Index: codeToH3(code, context) }]);
  assert.deepEqual(result.dropReasons, [AIR_DROP_ENTRY_INVALID_REASON]);
});
