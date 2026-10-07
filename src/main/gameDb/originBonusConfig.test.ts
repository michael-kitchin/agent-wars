import * as assert from 'assert';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { dbGetOne, dbRun, getGameStateForPlayer, isDbReady, resetGameForNewMatch } from '../gameDb';
import {
  COUNTRY_BONUS_CONFIG_KEY,
  COUNTRY_BONUS_LEVEL_CONFIG_KEY,
  readPersistedOriginBonusSettings,
  START_MONTH_CONFIG_KEY,
  TERRAIN_BONUS_CONFIG_KEY,
  TERRAIN_BONUS_LEVEL_CONFIG_KEY,
  WEATHER_BONUS_CONFIG_KEY,
  WEATHER_BONUS_LEVEL_CONFIG_KEY,
  TECH_BONUS_CONFIG_KEY,
  TECH_BONUS_LEVEL_CONFIG_KEY,
} from './originBonusConfig';

/**
 * The three level rows, in the order the assertions list them.
 *
 * Purpose: Lets each case check every level row in one loop.
 * When to use: Inside this file only.
 * Expected outcome: Country, terrain, then weather level keys.
 * Exceptions: None.
 */
const LEVEL_KEYS = [COUNTRY_BONUS_LEVEL_CONFIG_KEY, TERRAIN_BONUS_LEVEL_CONFIG_KEY, WEATHER_BONUS_LEVEL_CONFIG_KEY] as const;

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
 * Locks persist-on-reset and snapshot exposure of the bonus flags and levels.
 *
 * Purpose: A match must not inherit the previous match's choices, and both players' snapshots must report them.
 * When to use: After changing `resetGameForNewMatch` or snapshot assembly.
 * Expected outcome: Omitted levels read as off with `'low'` level rows and no snapshot level fields; a chosen level persists and shows on both snapshots.
 * Exceptions: None.
 */
function testFlagsPersistOnResetAndReachSnapshots(): void {
  withTempGameDb('aw-originbonus-', () => {
    for (const player of ['human', 'opponent'] as const) {
      const state = getGameStateForPlayer(player);
      assert.strictEqual(state.countryBonusEnabled, false);
      assert.strictEqual(state.terrainBonusEnabled, false);
    }

    resetGameForNewMatch({ countryBonusLevel: 'low', terrainBonusLevel: 'low' });
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
    for (const key of LEVEL_KEYS) assert.strictEqual(configValue(key), 'low');
    const allOff = getGameStateForPlayer('human');
    assert.ok(!('countryBonusLevel' in allOff) && !('terrainBonusLevel' in allOff) && !('weatherBonusLevel' in allOff));

    resetGameForNewMatch({ weatherBonusLevel: 'low', startMonth: 6 });
    assert.strictEqual(configValue(WEATHER_BONUS_CONFIG_KEY), '1');
    assert.strictEqual(configValue(START_MONTH_CONFIG_KEY), '6');
    const weatherOn = getGameStateForPlayer('human');
    assert.strictEqual(weatherOn.weatherBonusEnabled, true);
    assert.strictEqual(weatherOn.monthName, 'June');
    assert.ok(weatherOn.units.every((unit) => Array.isArray(unit.weatherTags)));
  });
}

/**
 * Locks that a High level round-trips through `game_config` to both snapshots.
 *
 * Purpose: A missed copy would silently play High as Low.
 * When to use: After changing level persistence or snapshot assembly.
 * Expected outcome: `'high'` rows, and both snapshots report the country and weather levels as high.
 * Exceptions: None.
 */
function testHighLevelsPersistAndReachSnapshots(): void {
  withTempGameDb('aw-originbonus-high-', () => {
    resetGameForNewMatch({ countryBonusLevel: 'high', weatherBonusLevel: 'high' });
    assert.strictEqual(configValue(COUNTRY_BONUS_LEVEL_CONFIG_KEY), 'high');
    assert.strictEqual(configValue(WEATHER_BONUS_LEVEL_CONFIG_KEY), 'high');
    for (const player of ['human', 'opponent'] as const) {
      const state = getGameStateForPlayer(player);
      assert.strictEqual(state.countryBonusLevel, 'high');
      assert.strictEqual(state.weatherBonusLevel, 'high');
      assert.ok(!('terrainBonusLevel' in state));
    }
  });
}

/**
 * Locks that a match saved before level rows existed plays at Low.
 *
 * Purpose: Saved matches have only the flag rows and must keep the rules they started under.
 * When to use: After changing `readPersistedOriginBonusSettings`.
 * Expected outcome: Every enabled bonus reads as low once the level rows are deleted.
 * Exceptions: None.
 */
function testMissingLevelRowsReadAsLow(): void {
  withTempGameDb('aw-originbonus-legacy-', () => {
    resetGameForNewMatch({ countryBonusLevel: 'low', terrainBonusLevel: 'low', weatherBonusLevel: 'low' });
    for (const key of LEVEL_KEYS) dbRun('DELETE FROM game_config WHERE key = ?', [key]);
    const settings = readPersistedOriginBonusSettings({ getOne: dbGetOne, hasDb: isDbReady });
    assert.strictEqual(settings.countryBonusLevel, 'low');
    assert.strictEqual(settings.terrainBonusLevel, 'low');
    assert.strictEqual(settings.weatherBonusLevel, 'low');
  });
}

/**
 * Locks that hex country names appear on the snapshot only with the country bonus on.
 *
 * Purpose: With both flags off the snapshot must stay unchanged; with the country bonus on, hexes need a country to judge units by.
 * When to use: After changing snapshot hex assembly or the strategic majority-country cache.
 * Expected outcome: On, at least one hex has a non-null `countryName`; off, no hex has the property.
 * Exceptions: None.
 */
function testHexCountryNamesFollowCountryBonus(): void {
  withTempGameDb('aw-originbonus-hex-', () => {
    resetGameForNewMatch({ countryBonusLevel: 'low' });
    const onHexes = getGameStateForPlayer('human').hexes;
    assert.ok(onHexes.some((hex) => typeof hex.countryName === 'string' && hex.countryName.length > 0));

    resetGameForNewMatch();
    const offHexes = getGameStateForPlayer('human').hexes;
    assert.ok(offHexes.length > 0);
    assert.ok(offHexes.every((hex) => !('countryName' in hex)));
  });
}

/**
 * Locks tech persistence: a missing row is off, High round-trips, and a missing level is Low.
 *
 * Purpose: Matches saved before tech existed must keep playing with tech off.
 * When to use: After changing tech rows in `originBonusConfig`.
 * Expected outcome: Off omits the snapshot flag. High is stored and reported. Deleting only the level row reads as low.
 * Exceptions: None.
 */
function testTechBonusPersistsAndAMissingRowReadsOff(): void {
  withTempGameDb('aw-techbonus-', () => {
    resetGameForNewMatch();
    assert.strictEqual(configValue(TECH_BONUS_CONFIG_KEY), '0');
    const off = readPersistedOriginBonusSettings({ getOne: dbGetOne, hasDb: isDbReady });
    assert.strictEqual(off.techBonusEnabled, undefined);
    assert.ok(!('techBonusLevel' in off));
    assert.ok(!('techBonusEnabled' in getGameStateForPlayer('human')));

    resetGameForNewMatch({ techBonusLevel: 'high' });
    assert.strictEqual(configValue(TECH_BONUS_CONFIG_KEY), '1');
    assert.strictEqual(configValue(TECH_BONUS_LEVEL_CONFIG_KEY), 'high');
    const on = getGameStateForPlayer('human');
    assert.strictEqual(on.techBonusEnabled, true);
    assert.strictEqual(on.techBonusLevel, 'high');

    dbRun('DELETE FROM game_config WHERE key = ?', [TECH_BONUS_LEVEL_CONFIG_KEY]);
    const missingLevel = readPersistedOriginBonusSettings({ getOne: dbGetOne, hasDb: isDbReady });
    assert.strictEqual(missingLevel.techBonusEnabled, true);
    assert.strictEqual(missingLevel.techBonusLevel, 'low');
  });
}

function run(): void {
  testFlagsPersistOnResetAndReachSnapshots();
  testHighLevelsPersistAndReachSnapshots();
  testMissingLevelRowsReadAsLow();
  testHexCountryNamesFollowCountryBonus();
  testTechBonusPersistsAndAMissingRowReadsOff();
  console.log('originBonusConfig.test.ts passed');
}

run();
