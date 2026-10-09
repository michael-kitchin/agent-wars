/**
 * Contract tests for rejecting a saved match whose side groups are gone.
 * Run: `npm run build:main` then `node dist/main/storedSideGroups.test.js`
 *
 * The scenario reader is stubbed. The test does not open a database.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOBAL_GAME_MAP, withGameMap } from '../shared/activeGameMap';
import { assertStoredSideGroupsExist } from './gameDb';
import { installSideGroupHomes } from './regionScenario';

test('a stored home that is not an installed group fails, and a display name that matches does not', () => {
  installSideGroupHomes([
    { id: 'cape_neighbours', displayName: 'Cape & neighbours', hexes: ['abc'] },
    { id: 'highveld', displayName: 'Highveld', hexes: ['def'] },
  ]);
  const profile = {
    ...GLOBAL_GAME_MAP,
    id: 'southern_africa' as const,
    displayName: 'Southern Africa',
    controlWinMinUrbanShare: 0.75,
  };
  try {
    withGameMap(profile, () => {
      assert.throws(
        () =>
          assertStoredSideGroupsExist(() => ({
            scenarioId: 'region_vs_region',
            humanHomeRegion: 'Not A Group',
            aiHomeRegion: 'Highveld',
          })),
        /This saved Southern Africa game uses side groups that no longer exist\. Start a new game\./
      );
      assert.doesNotThrow(() =>
        assertStoredSideGroupsExist(() => ({
          scenarioId: 'region_vs_region',
          humanHomeRegion: 'Cape & neighbours',
          aiHomeRegion: 'highveld',
        }))
      );
    });
    installSideGroupHomes(null);
    assert.doesNotThrow(() =>
      assertStoredSideGroupsExist(() => ({
        scenarioId: 'region_vs_region',
        humanHomeRegion: 'Not A Group',
        aiHomeRegion: 'Highveld',
      }))
    );
  } finally {
    installSideGroupHomes(null);
  }
});
