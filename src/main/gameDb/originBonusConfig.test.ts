import * as assert from 'assert';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { dbGetOne, getGameStateForPlayer, resetGameForNewMatch } from '../gameDb';
import { COUNTRY_BONUS_CONFIG_KEY, START_MONTH_CONFIG_KEY, TERRAIN_BONUS_CONFIG_KEY, WEATHER_BONUS_CONFIG_KEY } from './originBonusConfig';

/**
 * Reads one persisted `game_config` value.
 *
 * Purpose: Keeps the assertions below about stored values short.
 * When to use: Inside `withTempGameDb` cases.
 * Expected outcome: The stored string, or `undefined` when the row is missing.
 * Exceptions: None.
 */
function configValue(key: string): string | undefined {
  return dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [key])?.value;
}

/**
 * Locks persist-on-reset and snapshot exposure of both origin bonus flags.
 *
 * Purpose: A match must not inherit the previous match's flags, and both players' snapshots must report them.
 * When to use: After changing `resetGameForNewMatch` or snapshot assembly.
 * Expected outcome: Omitted options read as off; explicit `true` persists `'1'` and shows `true` on both snapshots.
 * Exceptions: None.
 */
function testFlagsPersistOnResetAndReachSnapshots(): void {
  withTempGameDb('aw-originbonus-', () => {
    for (const player of ['human', 'opponent'] as const) {
      const state = getGameStateForPlayer(player);
      assert.strictEqual(state.countryBonusEnabled, false);
      assert.strictEqual(state.terrainBonusEnabled, false);
    }

    resetGameForNewMatch({ countryBonusEnabled: true, terrainBonusEnabled: true });
    assert.strictEqual(configValue(COUNTRY_BONUS_CONFIG_KEY), '1');
    assert.strictEqual(configValue(TERRAIN_BONUS_CONFIG_KEY), '1');
    for (const player of ['human', 'opponent'] as const) {
      const state = getGameStateForPlayer(player);
      assert.strictEqual(state.countryBonusEnabled, true);
      assert.strictEqual(state.terrainBonusEnabled, true);
    }

    resetGameForNewMatch();
    assert.strictEqual(configValue(COUNTRY_BONUS_CONFIG_KEY), '0');
    assert.strictEqual(configValue(TERRAIN_BONUS_CONFIG_KEY), '0');
    assert.strictEqual(configValue(WEATHER_BONUS_CONFIG_KEY), '0');
    assert.strictEqual(configValue(START_MONTH_CONFIG_KEY), '1');

    resetGameForNewMatch({ weatherBonusEnabled: true, startMonth: 6 });
    assert.strictEqual(configValue(WEATHER_BONUS_CONFIG_KEY), '1');
    assert.strictEqual(configValue(START_MONTH_CONFIG_KEY), '6');
    const weatherOn = getGameStateForPlayer('human');
    assert.strictEqual(weatherOn.weatherBonusEnabled, true);
    assert.strictEqual(weatherOn.monthName, 'June');
    assert.ok(weatherOn.units.every((unit) => Array.isArray(unit.weatherTags)));
  });
}

/**
 * Locks that hex country names appear on the snapshot only with the country bonus on.
 *
 * Purpose: With both flags off the snapshot must stay unchanged; with the country bonus on, hexes need a country to judge units by.
 * When to use: After changing snapshot hex assembly or the res1 majority-country cache.
 * Expected outcome: On, at least one hex has a non-null `countryName`; off, no hex has the property.
 * Exceptions: None.
 */
function testHexCountryNamesFollowCountryBonus(): void {
  withTempGameDb('aw-originbonus-hex-', () => {
    resetGameForNewMatch({ countryBonusEnabled: true });
    const onHexes = getGameStateForPlayer('human').hexes;
    assert.ok(onHexes.some((hex) => typeof hex.countryName === 'string' && hex.countryName.length > 0));

    resetGameForNewMatch();
    const offHexes = getGameStateForPlayer('human').hexes;
    assert.ok(offHexes.length > 0);
    assert.ok(offHexes.every((hex) => !('countryName' in hex)));
  });
}

function run(): void {
  testFlagsPersistOnResetAndReachSnapshots();
  testHexCountryNamesFollowCountryBonus();
  console.log('originBonusConfig.test.ts passed');
}

run();
