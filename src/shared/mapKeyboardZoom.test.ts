/**
 * Zoom-key decisions.
 *
 * Purpose: Shift plus `+` zooms. Browser modifiers do not.
 * When to use: `npm run build:main`, then `node dist/shared/mapKeyboardZoom.test.js`.
 * Expected outcome: The listed keys return a direction, and the listed non-keys return null.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapZoomKeyStep } from './mapKeyboardZoom';

/**
 * A key event with no modifiers.
 *
 * Purpose: Each case overrides only the field it cares about.
 * When to use: Every assertion in this file.
 * Expected outcome: A complete argument.
 * Exceptions: None.
 */
function key(row: Partial<{ key: string; code: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean }>): {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
} {
  return { key: '', code: '', ctrlKey: false, altKey: false, metaKey: false, ...row };
}

test('plus and equals zoom in, and minus zooms out', () => {
  assert.equal(mapZoomKeyStep(key({ key: '+' })), 1);
  assert.equal(mapZoomKeyStep(key({ key: '=' })), 1);
  assert.equal(mapZoomKeyStep(key({ key: '-' })), -1);
});

test('the numpad zoom keys follow their code', () => {
  assert.equal(mapZoomKeyStep(key({ code: 'NumpadAdd' })), 1);
  assert.equal(mapZoomKeyStep(key({ code: 'NumpadSubtract' })), -1);
});

test('a browser modifier turns the zoom keys off', () => {
  for (const held of ['ctrlKey', 'altKey', 'metaKey'] as const) {
    assert.equal(mapZoomKeyStep(key({ key: '+', [held]: true })), null);
    assert.equal(mapZoomKeyStep(key({ key: '-', [held]: true })), null);
    assert.equal(mapZoomKeyStep(key({ code: 'NumpadAdd', [held]: true })), null);
  }
});

test('pan keys and underscore do not zoom', () => {
  assert.equal(mapZoomKeyStep(key({ key: 'w' })), null);
  assert.equal(mapZoomKeyStep(key({ key: 't' })), null);
  assert.equal(mapZoomKeyStep(key({ key: 'Enter' })), null);
  assert.equal(mapZoomKeyStep(key({ key: '_' })), null);
});
