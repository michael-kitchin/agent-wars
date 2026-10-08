/**
 * One-turn armor orders cannot pass a hex that ends the move.
 * Run: `npm run build:main` then `node dist/main/gameActions/armorMoveEndsOrderValidation.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARMOR_MOVE_ENDS_ON_ENTER_REASON, setStrategicTerrainFlags } from '../../shared/strategicTerrainFlags';
import { dbGetAll, dbRun } from '../gameDb';
import { findGeodesicLandMassChain } from '../testSupport/strategicLandChainFixtures';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { validateOrder } from './strategicOrderValidation';

/**
 * Human armor row from the seeded match.
 *
 * Purpose: Order validation only accepts a human armor unit.
 * When to use: After `resetGameForNewMatch`.
 * Expected outcome: One armor id.
 * Exceptions: Throws when the seed has no human armor.
 */
function humanArmorId(): string {
  const rows = dbGetAll<{ id: string }>(
    "SELECT id FROM units WHERE player = 'human' AND unit_type = 'armor' ORDER BY id LIMIT 1"
  );
  const id = rows[0]?.id;
  assert.ok(id, 'expected a seeded human armor unit');
  return id!;
}

test('validateOrder rejects an armor hop past a stop and accepts the stop hex', () => {
  withTempGameDb('aw-armor-stop-order-', () => {
    const chain = findGeodesicLandMassChain(2);
    assert.equal(chain.length, 3);
    const unitId = humanArmorId();
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [chain[0], unitId]);
    setStrategicTerrainFlags({ rugged: [chain[1]!], arctic: [], city: [] });
    try {
      const far = validateOrder(unitId, chain[2]!, (id) => id);
      if (far.valid) assert.fail('a hop past the stop hex should be rejected');
      assert.equal(far.reason, ARMOR_MOVE_ENDS_ON_ENTER_REASON);
      const mid = validateOrder(unitId, chain[1]!, (id) => id);
      assert.equal(mid.valid, true);
    } finally {
      setStrategicTerrainFlags(null);
    }
  });
});
