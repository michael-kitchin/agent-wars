/**
 * One hit on a fortified core cell saves the controller's sub-unit.
 *
 * Purpose: Battle soak strips the flag once and never saves an attacker or a margin cell.
 * When to use: After changing `createTacticalFortificationHooks`.
 * Expected outcome: The defender is absorbed once. The attacker and a cell outside the core are not.
 * Exceptions: None. The case removes its temporary match.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tacticalBattleFootprint } from '../../shared/tacticalBattleFootprint';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import {
  dbGetOne,
  getHexController,
  isTacticalCellFortified,
  listFortifiableCellsForHex,
  setHexController,
  setTacticalCellFortified,
} from '../gameDb';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { createTacticalFortificationHooks } from './tacticalFortificationSoak';

test('a fortified core cell absorbs one hit on the controller and none on anyone else', () => {
  withSeatedTempGameDb('aw-tact-fort-soak-', { fogOfWarEnabled: false }, () => {
    const row = dbGetOne<{ h3Index: string }>(
      `SELECT h3_index AS h3Index FROM res_s_infrastructure WHERE fortifiable_count >= 1 ORDER BY h3_index ASC LIMIT 1`
    );
    assert.ok(row);
    setHexController(row.h3Index, HUMAN_SEAT_ID);
    const footprint = tacticalBattleFootprint(row.h3Index);
    const core = new Set(footprint.coreChildH3Indexes);
    const fortified = listFortifiableCellsForHex(row.h3Index).find((cell) => core.has(cell));
    assert.ok(fortified, 'hex needs one fortifiable core cell');
    setTacticalCellFortified(fortified, true);
    const margin = footprint.h3Indexes.find((cell) => !core.has(cell));
    assert.ok(margin, 'hex needs a margin cell');
    const hooks = createTacticalFortificationHooks({
      enclosingStrategicH3Index: row.h3Index,
      coreChildH3Indexes: footprint.coreChildH3Indexes,
      tacticalChildH3Indexes: [...footprint.h3Indexes],
    });
    assert.equal(getHexController(row.h3Index), HUMAN_SEAT_ID);
    assert.equal(hooks.absorbHit({ player: AI_SEAT_IDS[0], h3Index: fortified }), false);
    assert.equal(isTacticalCellFortified(fortified), true);
    assert.equal(hooks.absorbHit({ player: HUMAN_SEAT_ID, h3Index: margin }), false);
    assert.equal(hooks.absorbHit({ player: HUMAN_SEAT_ID, h3Index: fortified }), true);
    assert.equal(isTacticalCellFortified(fortified), false);
    assert.equal(hooks.absorbHit({ player: HUMAN_SEAT_ID, h3Index: fortified }), false);
    assert.equal(hooks.isEnemyFortifiedHex, undefined);
    assert.equal(hooks.stripOne, undefined);
  });
});
