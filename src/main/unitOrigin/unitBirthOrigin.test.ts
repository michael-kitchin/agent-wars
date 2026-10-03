import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToParent } from 'h3-js';
import { isPipelineTerrainKind } from '../../shared/pipelineTerrain';
import { getGameState } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';

test('every seeded unit is born in its starting hex, in a cell inside that hex', () => {
  withTempGameDb('aw-unit-birth-origin-', () => {
    const units = getGameState().units;
    assert.ok(units.length > 0, 'a new match seeds units');
    for (const unit of units) {
      assert.equal(unit.origin?.birthH3Index, unit.h3Index, `unit ${unit.id} birth hex`);
    }
    const withCell = units.filter((unit) => unit.origin?.birthRes4H3Index);
    assert.ok(withCell.length > 0, 'at least one seeded unit has a birth cell');
    for (const unit of withCell) {
      const origin = unit.origin!;
      assert.equal(cellToParent(origin.birthRes4H3Index!, 1), unit.h3Index, `unit ${unit.id} birth cell parent`);
      assert.ok(origin.birthTerrainKind && isPipelineTerrainKind(origin.birthTerrainKind), `unit ${unit.id} terrain`);
      assert.equal(typeof origin.birthIsUrban, 'boolean', `unit ${unit.id} urban flag`);
    }
    assert.ok(
      withCell.some((unit) => unit.origin?.birthIsUrban),
      'at least one seeded unit is born in an intact urban cell'
    );
  });
});
