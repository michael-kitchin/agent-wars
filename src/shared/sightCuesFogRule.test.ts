/**
 * Contract tests for the Sight cues and Fog of war rule.
 * Run: `npm run build:main` then `node dist/shared/sightCuesFogRule.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sightCuesAfterFogChange, type SightCuesControlState } from './sightCuesFogRule';

const CHECKED: SightCuesControlState = { checked: true, disabled: false, rememberedChecked: null };

test('fog off remembers a checked box and locks it off', () => {
  assert.deepEqual(sightCuesAfterFogChange({ fogOn: false, current: CHECKED }), { checked: false, disabled: true, rememberedChecked: true });
});

test('fog off again leaves the state unchanged', () => {
  const locked = sightCuesAfterFogChange({ fogOn: false, current: CHECKED });
  assert.equal(sightCuesAfterFogChange({ fogOn: false, current: locked }), locked);
});

test('fog on restores the remembered choice, checked or not', () => {
  const locked = sightCuesAfterFogChange({ fogOn: false, current: CHECKED });
  assert.deepEqual(sightCuesAfterFogChange({ fogOn: true, current: locked }), CHECKED);
  const off = sightCuesAfterFogChange({ fogOn: false, current: { checked: false, disabled: false, rememberedChecked: null } });
  assert.deepEqual(sightCuesAfterFogChange({ fogOn: true, current: off }), { checked: false, disabled: false, rememberedChecked: null });
});

test('fog on with nothing remembered is unchanged, and the input is not mutated', () => {
  assert.equal(sightCuesAfterFogChange({ fogOn: true, current: CHECKED }), CHECKED);
  const frozen = Object.freeze({ ...CHECKED });
  sightCuesAfterFogChange({ fogOn: false, current: frozen });
  assert.deepEqual(frozen, CHECKED);
});
