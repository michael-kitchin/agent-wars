import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPentagons, gridDisk, gridDistance } from 'h3-js';
import { GLOBAL_GAME_MAP, withGameMap } from './activeGameMap';
import { strategicCellAt, strategicParentOf, tacticalChildrenOf } from './h3Resolutions';
import { tacticalBattleFootprint, tacticalBattleHexCode } from './tacticalBattleFootprint';

const GLOBAL_FIXTURE = '81263ffffffffff';

/**
 * Returns a tactical cell whose nearest core cell is exactly four rings away.
 *
 * Purpose: The battle margin is three rings, so this cell must stay outside the footprint.
 * When to use: The absence assertion for one hexagon.
 * Expected outcome: An H3 index built from `gridDisk` on a core boundary cell.
 * Exceptions: Throws when the core has no such cell.
 */
function cellFourRingsOutsideCore(core: readonly string[]): string {
  const coreSet = new Set(core);
  const boundary = core.find((cell) => gridDisk(cell, 1).some((neighbor) => !coreSet.has(neighbor)));
  if (!boundary) throw new Error('core has no boundary cell');
  const outside = gridDisk(boundary, 4).find((cell) => nearestCoreDistance(cell, core) === 4);
  if (!outside) throw new Error('no cell four rings outside the core');
  return outside;
}

/**
 * Returns the grid distance from a cell to the nearest core cell.
 *
 * Purpose: A face-crossing pair throws, and another core cell can still measure the ring.
 * When to use: Filtering `gridDisk` candidates.
 * Expected outcome: The smallest successful distance, or infinity when every pair throws.
 * Exceptions: None. A thrown H3 distance is skipped.
 */
function nearestCoreDistance(cell: string, core: readonly string[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const coreCell of core) {
    try {
      const distance = gridDistance(coreCell, cell);
      if (distance < nearest) nearest = distance;
    } catch {
      continue;
    }
  }
  return nearest;
}

test('a global hexagon battle footprint adds three rings around 343 children', () => {
  withGameMap(GLOBAL_GAME_MAP, () => {
    const footprint = tacticalBattleFootprint(GLOBAL_FIXTURE);
    const core = new Set(footprint.coreChildH3Indexes);
    assert.equal(footprint.coreChildH3Indexes.length, 343);
    assert.equal(footprint.h3Indexes.length, 607);
    assert.equal(core.size, tacticalChildrenOf(GLOBAL_FIXTURE).length);
    for (const cell of tacticalChildrenOf(GLOBAL_FIXTURE)) {
      assert.equal(core.has(cell), true);
      assert.equal(footprint.h3Indexes.includes(cell), true);
    }
    for (const cell of footprint.h3Indexes) {
      if (core.has(cell)) continue;
      assert.notEqual(strategicParentOf(cell), GLOBAL_FIXTURE);
    }
    const again = tacticalBattleFootprint(GLOBAL_FIXTURE);
    assert.equal(again.coreChildH3Indexes, footprint.coreChildH3Indexes);
    assert.equal(again.h3Indexes, footprint.h3Indexes);
    assert.equal(again.codeByH3, footprint.codeByH3);
    assert.throws(() => {
      (footprint.h3Indexes as string[]).push('nope');
    });
    const other = tacticalBattleFootprint(strategicCellAt(10, 10));
    assert.notEqual(other.h3Indexes, footprint.h3Indexes);
    const outside = cellFourRingsOutsideCore(footprint.coreChildH3Indexes);
    assert.equal(footprint.h3Indexes.includes(outside), false);
    assert.equal(tacticalBattleHexCode(GLOBAL_FIXTURE, outside), undefined);
    const coded = footprint.h3Indexes[0]!;
    assert.equal(tacticalBattleHexCode(GLOBAL_FIXTURE, coded), footprint.codeByH3.get(coded));
  });
});

test('a resolution 3 hexagon has the same 343 and 607 footprint', () => {
  const profile = {
    ...GLOBAL_GAME_MAP,
    strategicResolution: 3,
    tacticalResolution: 6,
  };
  withGameMap(profile, () => {
    const strategic = strategicCellAt(12, 34);
    const footprint = tacticalBattleFootprint(strategic);
    assert.equal(footprint.coreChildH3Indexes.length, 343);
    assert.equal(footprint.h3Indexes.length, 607);
  });
});

test('a resolution 1 pentagon footprint is non-empty', () => {
  withGameMap(GLOBAL_GAME_MAP, () => {
    const pentagon = getPentagons(1)[0];
    assert.ok(pentagon);
    const footprint = tacticalBattleFootprint(pentagon);
    assert.ok(footprint.coreChildH3Indexes.length > 0);
    assert.ok(footprint.h3Indexes.length >= footprint.coreChildH3Indexes.length);
  });
});
