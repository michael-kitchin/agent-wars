import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOBAL_GAME_MAP, withGameMap } from './activeGameMap';
import { advancedTechMinUrbanCells, strategicUrbanCellsDestroyedPerHit, unitCostFor } from './gameRules';

test('leaving a regional profile restores the global prices', () => {
  const profile = {
    id: 'western_europe' as const,
    displayName: 'Western Europe',
    strategicResolution: 3,
    tacticalResolution: 6,
    controlWinMinUrbanShare: null,
    rules: {
      infantryCost: 60,
      armorCost: 120,
      navalCost: 300,
      airCost: 180,
      armorMinUrbanCells: 7,
      airMinUrbanCells: 17,
      navalMinUrbanCells: 31,
      advancedMinUrbanCells: 59,
      strategicStrikeUrbanCells: 26,
    },
    scaleranks: GLOBAL_GAME_MAP.scaleranks,
  };
  withGameMap(profile, () => {
    assert.equal(unitCostFor('infantry'), 60);
    assert.equal(advancedTechMinUrbanCells(), 59);
    assert.equal(strategicUrbanCellsDestroyedPerHit(), 26);
  });
  assert.equal(unitCostFor('infantry'), 20);
  assert.equal(advancedTechMinUrbanCells(), 21);
  assert.equal(strategicUrbanCellsDestroyedPerHit(), 9);
});
