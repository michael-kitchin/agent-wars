/**
 * Tactical ranged rubble persistence including INSERT for transport-only cells.
 * Run: `node dist/main/game-actions/tacticalRangedInfrastructureRubble.test.js`
 */

import assert from 'node:assert/strict';
import { cellToParent } from 'h3-js';
import { test } from 'node:test';
import { dbGetOne } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { tacticalRes4Cell } from '../tacticalBattle/testSupport/tacticalRes4HexFixtures';
import { applyTacticalRangedRubbleToRes4Cell } from './tacticalRangedInfrastructureRubble';

test('applyTacticalRangedRubbleToRes4Cell inserts rubble row when transport insert flags are set and no row exists', () => {
  withTempGameDb('tactical-rubble-insert', () => {
    const child = tacticalRes4Cell(56, 66);
    const parent = cellToParent(child, 1);
    const { changed, destroyedAirUnitsCount } = applyTacticalRangedRubbleToRes4Cell(child, parent, {
      mergedTerrainKindForInsert: 'plains',
      insertStrikeableTransportCorridor: true,
    });
    assert.equal(changed, true);
    assert.equal(destroyedAirUnitsCount, 0);
    const row = dbGetOne<{ isRubble: number }>(
      'SELECT is_rubble AS isRubble FROM res4_feature_overrides WHERE h3_index = ?',
      [child]
    );
    assert.equal(row?.isRubble, 1);
  });
});
