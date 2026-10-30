/**
 * Mercenary upkeep stays on the global prices when a regional map changes production prices.
 *
 * Purpose: A credit is worth the same on every map, so fees and upkeep must not follow the active infantry price.
 * When to use: After changing `mercenaryUpkeepFor`, `mercenaryHireFee`, or `raiseCapacityForHex`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOBAL_GAME_MAP, withGameMap } from './activeGameMap';
import { mercenaryHireFee, mercenaryUpkeepFor, raiseCapacityForHex } from './mercenaryRules';
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
