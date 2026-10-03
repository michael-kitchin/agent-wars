import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTacticalToolFixture } from '../tacticalBattle/testSupport/tacticalToolFixtures';
import { estimateTacticalMarch } from './tacticalMarchEstimate';

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

test('estimateTacticalMarch: air never marches', () => {
  const fx = buildTacticalToolFixture({
    battleId: 'march-estimate-air',
    units: [{ id: 'air', player: 'opponent', unitType: 'air', cell: 'near' }],
  });
  const estimate = estimateTacticalMarch(fx.battle, fx.battle.subUnits[0]!, fx.cells.far);
  assert.equal(estimate.reachable, false);
  assert.equal(estimate.estimatedBeats, 0);
});
