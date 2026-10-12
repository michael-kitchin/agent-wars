/**
 * Contracts for a battle cell the unit cannot enter.
 *
 * Purpose: Locks the entry block used by the march hover, including the road and terrain-bonus exceptions.
 * When to use: `node --test dist/shared/tacticalMarchDestinationBlock.test.js` after `tsc -p tsconfig.main.json`.
 * Expected outcome: Armor blocks match the Effects `x`. Naval blocks follow navigability. A terrain-bonus stop is not a block.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { tacticalCellBlocksEntry } from './tacticalMarchDestinationBlock';
import type { TerrainEffectsInput } from './terrainEffectsForTooltip';

/**
 * A land cell with no overlays, so each test sets only the field it cares about.
 *
 * Purpose: Keeps the block cases from repeating the shared flags.
 * When to use: Every case in this file.
 * Expected outcome: Plains on land, with no urban, rubble, seaport, road, or rail.
 * Exceptions: None.
 */
function cell(overrides: Partial<TerrainEffectsInput>): TerrainEffectsInput {
  return {
    terrainKind: 'plains',
    parentTerrain: 'land',
    parentTerrainKind: 'plains',
    isUrban: false,
    isRubble: false,
    isSeaport: false,
    hasRoad: false,
    hasRail: false,
    ...overrides,
  };
}

test('armor cannot enter mountain, wetlands, or arctic, and a road or terrain-bonus stop is not a block', () => {
  assert.equal(
    tacticalCellBlocksEntry({ input: cell({ terrainKind: 'mountain' }), moveType: 'armor', allowsTerrainBonusStop: false }),
    true
  );
  assert.equal(
    tacticalCellBlocksEntry({ input: cell({ terrainKind: 'wetlands' }), moveType: 'armor', allowsTerrainBonusStop: false }),
    true
  );
  assert.equal(
    tacticalCellBlocksEntry({ input: cell({ terrainKind: 'arctic' }), moveType: 'armor', allowsTerrainBonusStop: false }),
    true
  );
  assert.equal(
    tacticalCellBlocksEntry({
      input: cell({ terrainKind: 'mountain', hasRoad: true }),
      moveType: 'armor',
      allowsTerrainBonusStop: false,
    }),
    false
  );
  assert.equal(
    tacticalCellBlocksEntry({
      input: cell({ terrainKind: 'mountain', isRubble: true, hasRoad: true }),
      moveType: 'armor',
      allowsTerrainBonusStop: false,
    }),
    true
  );
  assert.equal(
    tacticalCellBlocksEntry({ input: cell({ terrainKind: 'mountain' }), moveType: 'armor', allowsTerrainBonusStop: true }),
    false
  );
});

test('naval cannot enter plains, and a seaport is navigable', () => {
  assert.equal(
    tacticalCellBlocksEntry({ input: cell({ terrainKind: 'plains' }), moveType: 'naval', allowsTerrainBonusStop: false }),
    true
  );
  assert.equal(
    tacticalCellBlocksEntry({
      input: cell({ terrainKind: 'plains', isSeaport: true }),
      moveType: 'naval',
      allowsTerrainBonusStop: false,
    }),
    false
  );
});

test('infantry can enter forest, and water stays hidden', () => {
  assert.equal(
    tacticalCellBlocksEntry({ input: cell({ terrainKind: 'forest' }), moveType: 'infantry', allowsTerrainBonusStop: false }),
    false
  );
  assert.equal(
    tacticalCellBlocksEntry({
      input: cell({ terrainKind: 'water', parentTerrain: 'water', parentTerrainKind: 'water' }),
      moveType: 'infantry',
      allowsTerrainBonusStop: false,
    }),
    false
  );
});
