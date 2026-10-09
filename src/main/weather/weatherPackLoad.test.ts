/**
 * Locks the generated weather pack: a known land hex is not mild all year, and an unknown hex is.
 */

import * as assert from 'assert';
import { GLOBAL_GAME_MAP, withGameMap } from '../../shared/activeGameMap';
import { displayWeatherForHex, resetWeatherPackCacheForTests, weatherYearForHex } from './weatherPackLoad';

/**
 * Reads one real hex and one missing hex from the pack.
 *
 * Purpose: A missing or all-mild pack would make every penalty a no-op.
 * When to use: After the weather pack is regenerated.
 * Expected outcome: Hex 8101bffffffffff is snow in January. An unknown index is mild in every month.
 * Exceptions: Fails when the pack is missing.
 */
function testKnownHexIsNotAllMild(): void {
  resetWeatherPackCacheForTests();
  assert.strictEqual(displayWeatherForHex('8101bffffffffff', 1, 1), 'snow');
  const missing = weatherYearForHex('not-a-hex');
  assert.strictEqual(missing.length, 12);
  assert.ok(missing.every((month) => month.display === 'mild' && month.countsAsHeat === false));
}

/**
 * Locks the week on which a regional January start leaves January.
 *
 * Purpose: A regional turn is seven days, so turns 1 through 5 stay in January and turn 6 is February.
 * When to use: After the weather lookup starts reading the map calendar.
 * Expected outcome: Weekly turn 5 matches January. Weekly turn 6 matches the global calendar's February. The global profile is restored.
 * Exceptions: Fails when the pack is missing.
 */
function testWeeklyJanuaryLastsFiveTurns(): void {
  const hex = '8101bffffffffff';
  const january = displayWeatherForHex(hex, 1, 1);
  const february = displayWeatherForHex(hex, 2, 1);
  withGameMap({ ...GLOBAL_GAME_MAP, id: 'northern_america' }, () => {
    assert.strictEqual(displayWeatherForHex(hex, 5, 1), january);
    assert.strictEqual(displayWeatherForHex(hex, 6, 1), february);
  });
  assert.strictEqual(displayWeatherForHex(hex, 2, 1), february);
}

testKnownHexIsNotAllMild();
testWeeklyJanuaryLastsFiveTurns();
