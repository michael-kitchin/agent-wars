import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOBAL_GAME_MAP, withGameMap } from './activeGameMap';
import { advancedTechMinUrbanCells, strategicUrbanCellsDestroyedPerHit, unitCostFor } from './gameRules';
import { REGIONAL_RULES_BY_ID } from './regionalRulesCatalog';

test('western europe profile changes cost, Advanced threshold, and strike cells', () => {
  const row = REGIONAL_RULES_BY_ID.western_europe;
  const profile = {
    id: 'western_europe' as const,
    displayName: 'Western Europe',
    strategicResolution: row.strategicResolution,
    tacticalResolution: row.tacticalResolution,
    rules: row.rules,
    scaleranks: GLOBAL_GAME_MAP.scaleranks,
  };
  withGameMap(profile, () => {
    assert.equal(unitCostFor('infantry'), 65);
    assert.equal(advancedTechMinUrbanCells(), 60);
    assert.equal(strategicUrbanCellsDestroyedPerHit(), 29);
  });
  assert.equal(unitCostFor('infantry'), 20);
  assert.equal(advancedTechMinUrbanCells(), 21);
  assert.equal(strategicUrbanCellsDestroyedPerHit(), 9);
});
