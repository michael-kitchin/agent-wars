/**
 * Mid-match option changes.
 *
 * Purpose: The Game Options dialog stores its edits in the live match, so a bad request must store nothing and a good one must not disturb other rows.
 * When to use: `npm run build:main`, then `node dist/main/gameDb/matchOptionsWrite.test.js`.
 * Expected outcome: Valid updates are stored and read back by the snapshot. Refused updates leave every `game_config` row as it was.
 * Exceptions: None. Each temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MatchOptionsUpdate } from '../../shared/ipc/matchOptionsTypes';
import { SIGHT_CUE_SEEN_UNITS_CONFIG_KEY } from '../../shared/sightCueSettings';
import { dbGetAll, dbRun, getGameState, getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../gameDb';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { gameDbOps } from './dbConnection';
import { selectGameConfigValue, upsertGameConfigValue } from './gameConfigRows';
import { validateMatchOptionsUpdate, writeMatchOptions } from './matchOptionsWrite';

/**
 * The update every case starts from: the new-game defaults with every bonus off.
 *
 * Purpose: Each case changes only the fields it is about.
 * When to use: Spread it and override fields.
 * Expected outcome: A request the validator accepts at any turn.
 * Exceptions: None.
 */
const BASE_UPDATE: MatchOptionsUpdate = {
  victoryRule: 'last_side_standing',
  turnLimit: null,
  aiOnlyBattles: 'balanced',
  aiOnlyBeatLimit: 30,
  sightCues: true,
  originBonusLevel: 'off',
  techBonusLevel: 'off',
  terrainBonusLevel: 'off',
  weatherBonusLevel: 'off',
};

/**
 * Runs a case inside a fresh two-side global match.
 *
 * Purpose: The writer needs an open match with real `game_config` rows.
 * When to use: Every database case in this file.
 * Expected outcome: `runCase` sees a match at turn 1 with start month 7 and Deathmatch.
 * Exceptions: Propagates a reset or case error after cleanup.
 */
function withMatch(prefix: string, runCase: () => void): void {
  const regions = listScenarioHomeRegions()
    .map((name) => ({ name, hexes: getScenarioHomeRegionHexes(name).length }))
    .filter((region) => region.hexes > 0)
    .sort((a, b) => b.hexes - a.hexes || a.name.localeCompare(b.name))
    .slice(0, 2)
    .map((region) => region.name);
  withSeatedTempGameDb(prefix, {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
    ],
    startMonth: 7,
  }, runCase);
}

/**
 * Moves the match to a turn.
 *
 * Purpose: Turn-limit checks depend on the current turn.
 * When to use: Before validating a request that names a limit.
 * Expected outcome: `turn_state.turn_number` is `turn`.
 * Exceptions: Propagates SQLite errors.
 */
function setTurn(turn: number): void {
  dbRun('UPDATE turn_state SET turn_number = ? WHERE id = 1', [turn]);
}

/**
 * Validates against the stored turn and writes only an accepted request.
 *
 * Purpose: The handler's order of work, without Electron.
 * When to use: Every case that expects a write or a refusal.
 * Expected outcome: The validator's result. The match is written only when it is ok.
 * Exceptions: Propagates a write error.
 */
function applyUpdate(update: unknown): ReturnType<typeof validateMatchOptionsUpdate> {
  const result = validateMatchOptionsUpdate(update, getGameState().turnNumber);
  if (result.ok) writeMatchOptions(result.update);
  return result;
}

/**
 * Every `game_config` row, sorted by key.
 *
 * Purpose: A refused request must leave every row as it was.
 * When to use: Before and after a refused request.
 * Expected outcome: Key and value pairs in key order.
 * Exceptions: Propagates SQLite errors.
 */
function configRows(): { key: string; value: string }[] {
  return dbGetAll<{ key: string; value: string }>('SELECT key, value FROM game_config ORDER BY key');
}

/**
 * Asserts that a request is refused and that nothing was written.
 *
 * Purpose: Shared by the refusal cases.
 * When to use: With a request the validator must refuse.
 * Expected outcome: `ok` is false with a reason, and the rows are unchanged.
 * Exceptions: Throws an assertion error otherwise.
 */
function assertRefused(update: unknown): void {
  const before = configRows();
  const result = applyUpdate(update);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.reason.length > 0);
  assert.deepEqual(configRows(), before);
}

test('a valid update stores every value, the snapshot reads it back, and the start month stays', () => {
  withMatch('aw-match-options-valid-', () => {
    const result = applyUpdate({
      victoryRule: 'most_city_hexes_at_turn_limit',
      turnLimit: 20,
      aiOnlyBattles: 'random',
      aiOnlyBeatLimit: null,
      sightCues: false,
      originBonusLevel: 'high',
      techBonusLevel: 'low',
      terrainBonusLevel: 'high',
      weatherBonusLevel: 'low',
    });
    assert.equal(result.ok, true);
    const state = getGameState();
    assert.deepEqual(state.victory, { rule: 'most_city_hexes_at_turn_limit', turnLimit: 20 });
    assert.equal(state.aiOnlyBattles, 'random');
    assert.equal(state.aiOnlyBeatLimit, null);
    assert.equal(state.sightCues, false);
    assert.equal(state.originBonusLevel, 'high');
    assert.equal(state.techBonusLevel, 'low');
    assert.equal(state.terrainBonusLevel, 'high');
    assert.equal(state.weatherBonusLevel, 'low');
    assert.equal(state.startMonth, 7);
    assert.equal(selectGameConfigValue(gameDbOps, 'start_month'), '7');
  });
});

test('city hexes at turn 3 stores the limit, and Deathmatch deletes it again', () => {
  withMatch('aw-match-options-limit-', () => {
    setTurn(3);
    assert.equal(applyUpdate({ ...BASE_UPDATE, victoryRule: 'most_city_hexes_at_turn_limit', turnLimit: 40 }).ok, true);
    assert.equal(selectGameConfigValue(gameDbOps, 'turn_limit'), '40');
    assert.equal(applyUpdate({ ...BASE_UPDATE, turnLimit: 40 }).ok, true);
    assert.equal(selectGameConfigValue(gameDbOps, 'turn_limit'), undefined);
    assert.equal(selectGameConfigValue(gameDbOps, 'victory_rule'), 'last_side_standing');
  });
});

test('a limit that is not later than the current turn, or not offered, is refused', () => {
  withMatch('aw-match-options-refused-limit-', () => {
    setTurn(20);
    assertRefused({ ...BASE_UPDATE, victoryRule: 'most_city_hexes_at_turn_limit', turnLimit: 20 });
    assertRefused({ ...BASE_UPDATE, victoryRule: 'most_city_hexes_at_turn_limit', turnLimit: 35 });
    assertRefused({ ...BASE_UPDATE, victoryRule: 'most_city_hexes_at_turn_limit', turnLimit: null });
    setTurn(50);
    assertRefused({ ...BASE_UPDATE, victoryRule: 'most_city_hexes_at_turn_limit', turnLimit: 50 });
  });
});

test('a bad value of any field is refused', () => {
  withMatch('aw-match-options-refused-enum-', () => {
    assertRefused({ ...BASE_UPDATE, victoryRule: 'king_of_the_hill' });
    assertRefused({ ...BASE_UPDATE, aiOnlyBattles: 'sometimes' });
    assertRefused({ ...BASE_UPDATE, aiOnlyBeatLimit: 25 });
    assertRefused({ ...BASE_UPDATE, sightCues: 'yes' });
    assertRefused({ ...BASE_UPDATE, weatherBonusLevel: 'extreme' });
    assertRefused(null);
  });
});

test('turning sight cues back on forgets what each side saw, and leaving them on keeps it', () => {
  withMatch('aw-match-options-sight-cues-', () => {
    const seen = () => selectGameConfigValue(gameDbOps, SIGHT_CUE_SEEN_UNITS_CONFIG_KEY);
    upsertGameConfigValue(gameDbOps, SIGHT_CUE_SEEN_UNITS_CONFIG_KEY, '{"ai1":["u1"]}');
    assert.equal(applyUpdate({ ...BASE_UPDATE, sightCues: true }).ok, true);
    assert.equal(seen(), '{"ai1":["u1"]}');
    assert.equal(applyUpdate({ ...BASE_UPDATE, sightCues: false }).ok, true);
    assert.equal(seen(), '{"ai1":["u1"]}');
    assert.equal(applyUpdate({ ...BASE_UPDATE, sightCues: true }).ok, true);
    assert.equal(seen(), undefined);
  });
});
