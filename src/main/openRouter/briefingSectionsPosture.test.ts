/**
 * The posture section: the default, a hold, and the blitz effect line.
 * Run with: node dist/main/openRouter/briefingSectionsPosture.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPostureSection } from './briefingSectionsPosture';

test('a seat with no posture is told it is on the default', () => {
  const text = buildPostureSection({ stored: null, turnNumber: 4 });
  assert.ok(text.startsWith('# Posture\n\n'));
  assert.ok(text.includes('- Posture: overland, the default. You may set another at any time.'));
  assert.ok(text.includes('- Effect: Land options are listed first, and the engine launches only against undefended objectives.'));
});

test('a stored posture names the next change turn until that turn arrives', () => {
  const held = buildPostureSection({ stored: { posture: 'maritime', sinceTurn: 10 }, turnNumber: 12 });
  assert.ok(held.includes('- Posture: maritime, set on turn 10. You may change it from turn 16.'));
  const open = buildPostureSection({ stored: { posture: 'maritime', sinceTurn: 10 }, turnNumber: 16 });
  assert.ok(open.includes('- Posture: maritime, set on turn 10. You may change it now.'));
});

test('the blitz effect line uses the present assault constants', () => {
  const text = buildPostureSection({ stored: { posture: 'blitz', sinceTurn: 1 }, turnNumber: 1 });
  assert.ok(text.includes('3 ground units massed instead of 6'));
});
