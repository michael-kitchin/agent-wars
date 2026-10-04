/**
 * Locks the generated weather pack: a known land hex is not mild all year, and an unknown hex is.
 */

import * as assert from 'assert';
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

testKnownHexIsNotAllMild();
