import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTacticalToolFixture } from '../tacticalBattle/testSupport/tacticalToolFixtures';
import { estimateTacticalMarch } from './tacticalMarchEstimate';
import type { TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import type { UnitOrigin } from '../../shared/unitOriginTypes';

/**
 * Builds a birth record with only the terrain kind set.
 *
 * Purpose: The terrain-bonus rule reads the birth terrain kind alone.
 * When to use: Fixture units in terrain-bonus tests.
 * Expected outcome: A `UnitOrigin` whose other fields are absent.
 * Exceptions: None.
 */
const birth = (birthTerrainKind: string): UnitOrigin => ({ birthTerrainKind }) as UnitOrigin;

test('estimateTacticalMarch: infantry crosses two plains cells in one beat', () => {
  const fx = buildTacticalToolFixture({
    battleId: 'march-estimate-infantry',
    units: [{ id: 'inf', player: 'opponent', unitType: 'infantry', cell: 'near' }],
  });
  const estimate = estimateTacticalMarch(fx.battle, fx.battle.subUnits[0]!, fx.cells.far);
  assert.equal(estimate.reachable, true);
  assert.equal(estimate.reachableThisBeat, true);
  assert.equal(estimate.pathStepCount, 2);
  assert.equal(estimate.estimatedBeats, 1);
  assert.equal(estimate.movementPointBudget, 2);
});

test('estimateTacticalMarch: only mountain-born armor may stop on a mountain, from the same cell', () => {
  const fx = buildTacticalToolFixture({
    battleId: 'march-estimate-terrain-bonus',
    units: [
      { id: 'born-mountain', player: 'opponent', unitType: 'armor', cell: 'near', origin: birth('mountain') },
      { id: 'born-plains', player: 'opponent', unitType: 'armor', cell: 'near', origin: birth('plains') },
    ],
    terrainByCell: { mid: 'mountain' },
  });
  const battle = { ...fx.battle, terrainBonusEnabled: true };
  const [mountainBorn, plainsBorn] = battle.subUnits as [TacticalSubUnitSnapshot, TacticalSubUnitSnapshot];

  const stop = estimateTacticalMarch(battle, mountainBorn, fx.cells.mid);
  assert.equal(stop.reachableThisBeat, true);
  assert.equal(stop.estimatedBeats, 1);
  assert.equal(estimateTacticalMarch(battle, plainsBorn, fx.cells.mid).reachable, false);

  const line = new Set([fx.cells.near, fx.cells.mid, fx.cells.far]);
  const across = estimateTacticalMarch(battle, mountainBorn, fx.cells.far, line);
  assert.equal(across.reachableThisBeat, false);
  assert.equal(across.estimatedBeats, 2);
});

test('estimateTacticalMarch: air never marches', () => {
  const fx = buildTacticalToolFixture({
    battleId: 'march-estimate-air',
    units: [{ id: 'air', player: 'opponent', unitType: 'air', cell: 'near' }],
  });
  const estimate = estimateTacticalMarch(fx.battle, fx.battle.subUnits[0]!, fx.cells.far);
  assert.equal(estimate.reachable, false);
  assert.equal(estimate.estimatedBeats, 0);
});
