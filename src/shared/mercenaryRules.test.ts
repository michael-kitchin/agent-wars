/**
 * Mercenary prices and the hire-panel labels.
 *
 * Purpose: Upkeep stays on the global prices, and the hire menu shows the compact price.
 * When to use: After changing `mercenaryUpkeepFor`, `mercenaryHireFee`, `raiseCapacityForHex`, `formatHireOptionLabel`, or `formatHireOrderLabel`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOBAL_GAME_MAP, withGameMap } from './activeGameMap';
import { formatCompactHireCost, formatCompactRaiseCost } from './economySymbols';
import { unitCostFor } from './gameRules';
import { formatHireOptionLabel, formatHireOrderLabel, mercenaryHireFee, mercenaryUpkeepFor, raiseCapacityForHex } from './mercenaryRules';
import { getPlayerUnitCountsByType } from './unitCountsByType';

const regionalProfile = {
  ...GLOBAL_GAME_MAP,
  id: 'western_europe' as const,
  rules: { ...GLOBAL_GAME_MAP.rules, infantryCost: 60 },
};

test('mercenary upkeep uses the global prices on every map', () => {
  const expectUpkeep = (): void => {
    assert.equal(mercenaryUpkeepFor('infantry', undefined), 3);
    assert.equal(mercenaryUpkeepFor('infantry', 'advanced'), 5);
    assert.equal(mercenaryUpkeepFor('naval', undefined), 13);
    assert.equal(mercenaryUpkeepFor('naval', 'advanced'), 25);
  };
  expectUpkeep();
  withGameMap(regionalProfile, expectUpkeep);
});

test('a rehire costs two turns of upkeep and a neutral border cannot raise', () => {
  assert.equal(mercenaryHireFee('rehire', 5), 10);
  assert.equal(raiseCapacityForHex(12, false), 24);
  assert.equal(raiseCapacityForHex(12, true), 0);
});

test('mercenaries do not count toward unit caps', () => {
  const counts = getPlayerUnitCountsByType(
    [
      { player: 'human', unitType: 'infantry', isMercenary: true },
      { player: 'human', unitType: 'infantry' },
    ],
    'human'
  );
  assert.equal(counts.infantry, 1);
});

test('a raise option shows production and one turn when the fee equals upkeep', () => {
  const label = formatHireOptionLabel({ unitType: 'infantry', unitCost: 20, fee: 3, upkeep: 3 });
  assert.equal(label, `Infantry (${formatCompactRaiseCost(20, 3, 3)})`);
});

test('a raise order uses the active map production cost and one turn of upkeep', () => {
  const label = formatHireOrderLabel({
    kind: 'raise',
    unitType: 'infantry',
    count: 2,
    displayName: null,
    fee: 6,
  });
  assert.equal(label, `Raise 2 Infantry (${formatCompactRaiseCost(unitCostFor('infantry'), 3, 3)})`);
});

test('a rehire order shows the extra above one turn', () => {
  const label = formatHireOrderLabel({
    kind: 'rehire',
    unitType: 'infantry',
    count: 1,
    displayName: '4th Infantry',
    fee: 6,
  });
  assert.equal(label, `Rehire 4th Infantry (${formatCompactHireCost(6, 3)})`);
});
