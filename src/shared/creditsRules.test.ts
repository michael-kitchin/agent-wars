/**
 * A credits item costs the active map's infantry price.
 *
 * Purpose: Regional production prices change what a credits purchase spends, not how many credits it adds.
 * When to use: After changing `buildQueueItemCostFor` or `creditsItemCost`.
 * Expected outcome: The case below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOBAL_GAME_MAP, withGameMap } from './activeGameMap';
import { buildQueueItemCostFor } from './gameRules';

test('a credits item costs the active infantry price', () => {
  const profile = {
    ...GLOBAL_GAME_MAP,
    id: 'western_europe' as const,
    rules: { ...GLOBAL_GAME_MAP.rules, infantryCost: 60 },
  };
  withGameMap(profile, () => {
    assert.equal(buildQueueItemCostFor('credits'), 60);
  });
});
