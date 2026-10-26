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
import { getScenarioHomeRegionHexes, installSideGroupHomes } from './regionScenario';

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
          assertStoredSideGroupsExist(
            () => ({ scenarioId: 'region_vs_region' }),
            () => ['Not A Group', 'Highveld']
          ),
        /This saved Southern Africa game uses side groups that no longer exist\. Start a new game\./
      );
      assert.doesNotThrow(() =>
        assertStoredSideGroupsExist(
          () => ({ scenarioId: 'region_vs_region' }),
          () => ['Cape & neighbours', 'highveld']
        )
      );
    });
    installSideGroupHomes(null);
    assert.doesNotThrow(() =>
      assertStoredSideGroupsExist(
        () => ({ scenarioId: 'region_vs_region' }),
        () => ['Not A Group', 'Highveld']
      )
    );
  } finally {
    installSideGroupHomes(null);
  }
});

test('a stored home matches a side group with or without its abbreviation parenthesis', () => {
  installSideGroupHomes([
    { id: 'south_east_china_taiwan', displayName: 'South & east China, Taiwan (SECT)', hexes: ['hex-sect'] },
    { id: 'tasman', displayName: 'Tasman (Victoria, Tasmania, NZ) (TVTNZ)', hexes: ['hex-tasman'] },
  ]);
  const profile = {
    ...GLOBAL_GAME_MAP,
    id: 'eastern_asia' as const,
    displayName: 'Eastern Asia',
    controlWinMinUrbanShare: 0.75,
  };
  try {
    withGameMap(profile, () => {
      assert.doesNotThrow(() =>
        assertStoredSideGroupsExist(
          () => ({ scenarioId: 'region_vs_region' }),
          () => [
            'South & east China, Taiwan',
            'South & east China, Taiwan (SECT)',
            'Tasman (Victoria, Tasmania, NZ)',
            'Tasman (Victoria, Tasmania, NZ) (TVTNZ)',
            '  south_east_china_taiwan  ',
          ]
        )
      );
      assert.deepEqual(getScenarioHomeRegionHexes('South & east China, Taiwan'), ['hex-sect']);
      assert.deepEqual(getScenarioHomeRegionHexes('South & east China, Taiwan (SECT)'), ['hex-sect']);
      assert.deepEqual(getScenarioHomeRegionHexes('  south_east_china_taiwan  '), ['hex-sect']);
      assert.deepEqual(getScenarioHomeRegionHexes('Tasman (Victoria, Tasmania, NZ)'), ['hex-tasman']);
      assert.deepEqual(getScenarioHomeRegionHexes('Tasman (Victoria, Tasmania, NZ) (TVTNZ)'), ['hex-tasman']);
      assert.deepEqual(getScenarioHomeRegionHexes('Tasman'), []);
      assert.throws(
        () =>
          assertStoredSideGroupsExist(
            () => ({ scenarioId: 'region_vs_region' }),
            () => ['Tasman']
          ),
        /side groups that no longer exist/
      );
    });
  } finally {
    installSideGroupHomes(null);
  }
});
