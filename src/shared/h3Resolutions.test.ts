import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getResolution } from 'h3-js';
import { getOrderedHexList } from '../main/mapData';
import { GLOBAL_GAME_MAP, withGameMap } from './activeGameMap';
import {
  isStrategicCell,
  isTacticalCell,
  strategicCellAt,
  strategicH3Resolution,
  strategicParentOf,
  tacticalChildrenOf,
  tacticalH3Resolution,
} from './h3Resolutions';

test('strategic parent and tactical children follow a resolution 3 and 6 profile', () => {
  const profile = {
    ...GLOBAL_GAME_MAP,
    strategicResolution: 3,
    tacticalResolution: 6,
  };
  withGameMap(profile, () => {
    assert.equal(strategicH3Resolution(), 3);
    assert.equal(tacticalH3Resolution(), 6);
    const strategic = strategicCellAt(12, 34);
    assert.equal(getResolution(strategic), 3);
    assert.equal(isStrategicCell(strategic), true);
    const children = tacticalChildrenOf(strategic);
    assert.equal(children.length, 343);
    assert.equal(isTacticalCell(children[0]!), true);
    assert.equal(strategicParentOf(children[0]!), strategic);
  });
  assert.equal(strategicH3Resolution(), 1);
  assert.equal(tacticalH3Resolution(), 4);
});

test('ordered hex list follows the active strategic resolution and then restores', () => {
  assert.equal(getOrderedHexList().length, 842);
  const profile = {
    ...GLOBAL_GAME_MAP,
    strategicResolution: 3,
    tacticalResolution: 6,
  };
  withGameMap(profile, () => {
    const cells = getOrderedHexList();
    assert.equal(getResolution(cells[0]!), 3);
    assert.notEqual(cells.length, 842);
  });
  assert.equal(getOrderedHexList().length, 842);
  assert.equal(getResolution(getOrderedHexList()[0]!), 1);
});
