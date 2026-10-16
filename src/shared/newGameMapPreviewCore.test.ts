import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewHexIsDrawn, previewHomeBorder, previewTechIcon, previewWeatherIcon } from './newGameMapPreviewCore';
import type { WeatherState } from './weatherBonusTypes';

/**
 * Twelve months with snow only in June, so start month 6 is obvious.
 *
 * Purpose: The weather test can see which index was chosen.
 * When to use: `previewWeatherIcon` cases in this file.
 * Expected outcome: Index 5 is `snow`.
 * Exceptions: None.
 */
const YEAR: readonly WeatherState[] = [
  'mild',
  'mild',
  'rain',
  'rain',
  'mild',
  'snow',
  'heat',
  'heat',
  'mild',
  'rain',
  'mild',
  'snow',
];

test('preview home borders mark exclusive, shared, and identical homes', () => {
  const human = new Set(['human-only', 'shared']);
  const ai = new Set(['ai-only', 'shared']);
  assert.deepEqual(previewHomeBorder('human-only', human, ai), {
    controllerPlayerId: 'human',
    homeOwnerIdentity: 'human',
  });
  assert.deepEqual(previewHomeBorder('ai-only', human, ai), {
    controllerPlayerId: 'opponent',
    homeOwnerIdentity: 'opponent',
  });
  assert.deepEqual(previewHomeBorder('shared', human, ai), {
    controllerPlayerId: null,
    homeOwnerIdentity: 'both',
  });
  const same = new Set(['home']);
  assert.deepEqual(previewHomeBorder('home', same, same), {
    controllerPlayerId: null,
    homeOwnerIdentity: 'both',
  });
});

test('global preview paints homes always and the rest of the grid only while T is held, and a regional preview paints every hex', () => {
  assert.equal(previewHexIsDrawn('global', null, false), false);
  assert.equal(previewHexIsDrawn('global', 'human', false), true);
  assert.equal(previewHexIsDrawn('global', 'opponent', false), true);
  assert.equal(previewHexIsDrawn('global', 'both', false), true);
  assert.equal(previewHexIsDrawn('global', null, true), true);
  assert.equal(previewHexIsDrawn('global', 'human', true), true);
  assert.equal(previewHexIsDrawn('northern_america', null, false), true);
  assert.equal(previewHexIsDrawn('northern_america', null, true), true);
});

test('preview weather icon follows the start month unless the bonus or zoom hides it', () => {
  const shown = {
    weatherBonusLevel: 'low' as const,
    startMonth: 6,
    weatherByMonth: YEAR,
    tacticalZoom: false,
  };
  assert.equal(previewWeatherIcon(shown), 'snow');
  assert.equal(previewWeatherIcon({ ...shown, weatherBonusLevel: 'high' }), 'snow');
  assert.equal(previewWeatherIcon({ ...shown, weatherBonusLevel: 'off' }), null);
  assert.equal(previewWeatherIcon({ ...shown, tacticalZoom: true }), null);
  assert.equal(previewWeatherIcon({ ...shown, weatherByMonth: YEAR.slice(0, 11) }), null);
});

test('preview tech icon follows the preview map threshold while T is held', () => {
  const held = {
    techBonusLevel: 'low' as const,
    baselineUrbanHexCount: 21,
    advancedMinUrbanCells: 21,
    mapInspectionHeld: true,
    tacticalZoom: false,
  };
  assert.equal(previewTechIcon(held), 'advanced');
  assert.equal(previewTechIcon({ ...held, techBonusLevel: 'high', baselineUrbanHexCount: 20 }), 'basic');
  assert.equal(previewTechIcon({ ...held, advancedMinUrbanCells: 8, baselineUrbanHexCount: 8 }), 'advanced');
  assert.equal(previewTechIcon({ ...held, techBonusLevel: 'off' }), null);
  assert.equal(previewTechIcon({ ...held, mapInspectionHeld: false }), null);
  assert.equal(previewTechIcon({ ...held, tacticalZoom: true }), null);
  assert.equal(previewTechIcon({ ...held, baselineUrbanHexCount: 0 }), null);
});
