/**
 * Step keys, visibility text, and event format versions.
 *
 * Purpose: The shared recording values have to round-trip before any row is written.
 * When to use: `npm run build:main`, then `node dist/shared/matchRecording.test.js`.
 * Expected outcome: Step text, visibility, and the version map agree.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MATCH_EVENT_FORMAT_VERSIONS,
  MATCH_EVENT_TYPES,
  parseVisibilityText,
  stepKeyText,
  strategicStep,
  tacticalStep,
  visibilityText,
} from './matchRecording';

test('step keys and visibility text round-trip', () => {
  assert.equal(stepKeyText(strategicStep(3)), 's3');
  assert.equal(stepKeyText(tacticalStep(3, 'battle-1', 2)), 's3-bbattle-1-t2');
  assert.equal(visibilityText('everyone'), 'everyone');
  assert.equal(visibilityText('engine'), 'engine');
  assert.equal(parseVisibilityText('everyone'), 'everyone');
  assert.equal(parseVisibilityText('engine'), 'engine');
  assert.deepEqual(parseVisibilityText(visibilityText({ seats: ['human', 'opponent'] })), { seats: ['human', 'opponent'] });
  assert.equal(parseVisibilityText('seats:'), 'engine');
  assert.equal(parseVisibilityText('later'), 'engine');
  for (const type of MATCH_EVENT_TYPES) assert.equal(MATCH_EVENT_FORMAT_VERSIONS[type], 1);
});
