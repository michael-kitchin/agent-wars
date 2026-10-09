/**
 * Tactical ranged rubble persistence including INSERT for transport-only cells.
 * Run: `node dist/main/gameActions/tacticalRangedInfrastructureRubble.test.js`
 */

import assert from 'node:assert/strict';
import { cellToParent } from 'h3-js';
import { test } from 'node:test';
import { GLOBAL_GAME_MAP, withGameMap } from '../../shared/activeGameMap';
import { tacticalBattleFootprint } from '../../shared/tacticalBattleFootprint';
import { dbGetOne } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { tacticalCell } from '../tacticalBattle/testSupport/tacticalHexFixtures';
import { applyTacticalRangedRubbleToCell } from './tacticalRangedInfrastructureRubble';

test('applyTacticalRangedRubbleToRes4Cell inserts rubble row when transport insert flags are set and no row exists', () => {
  withTempGameDb('tactical-rubble-insert', () => {
    const child = tacticalCell(56, 66);
    const parent = cellToParent(child, 1);
    const { changed, destroyedAirUnitsCount } = applyTacticalRangedRubbleToCell(child, parent, {
      mergedTerrainKindForInsert: 'plains',
      insertStrikeableTransportCorridor: true,
    });
    assert.equal(changed, true);
    assert.equal(destroyedAirUnitsCount, 0);
    const row = dbGetOne<{ isRubble: number }>(
      'SELECT is_rubble AS isRubble FROM res_t_feature_overrides WHERE h3_index = ?',
      [child]
    );
    assert.equal(row?.isRubble, 1);
  });
});

test('applyTacticalRangedRubbleToRes4Cell does not insert a row for a margin cell', () => {
  withTempGameDb('tactical-rubble-margin', () => {
    withGameMap(GLOBAL_GAME_MAP, () => {
      const enclosing = cellToParent(tacticalCell(56, 66), 1);
      const footprint = tacticalBattleFootprint(enclosing);
      const core = new Set(footprint.coreChildH3Indexes);
      const margin = footprint.h3Indexes.find((cell) => !core.has(cell));
      assert.ok(margin);
      const { changed, destroyedAirUnitsCount } = applyTacticalRangedRubbleToCell(margin, enclosing, {
        mergedTerrainKindForInsert: 'plains',
        insertStrikeableTransportCorridor: true,
      });
      assert.equal(changed, false);
      assert.equal(destroyedAirUnitsCount, 0);
      const row = dbGetOne<{ isRubble: number }>(
        'SELECT is_rubble AS isRubble FROM res_t_feature_overrides WHERE h3_index = ?',
        [margin]
      );
      assert.equal(row, undefined);
    });
  });
});
