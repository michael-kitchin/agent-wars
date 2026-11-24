/**
 * The replay results-screen rules.
 *
 * Purpose: Proves who owns the map and when the results screen is set aside.
 * When to use: `npm run build:main`, then `node dist/shared/replayResultsScreenRules.test.js`.
 * Expected outcome: The preview owns the map only outside replay, and the screen is set aside only before the last step of a finished match.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newGamePreviewOwnsMap, replayResultsScreenAside } from './replayResultsScreenRules';

test('the preview owns the map only while the overlay is open and replay is off', () => {
  assert.equal(newGamePreviewOwnsMap({ overlayOpen: true, replayOn: false }), true);
  assert.equal(newGamePreviewOwnsMap({ overlayOpen: true, replayOn: true }), false);
  assert.equal(newGamePreviewOwnsMap({ overlayOpen: false, replayOn: false }), false);
  assert.equal(newGamePreviewOwnsMap({ overlayOpen: false, replayOn: true }), false);
});

test('a finished match sets the results screen aside on every step before the last', () => {
  assert.equal(replayResultsScreenAside({ matchOver: true, stepCount: 3, index: 0 }), true);
  assert.equal(replayResultsScreenAside({ matchOver: true, stepCount: 3, index: 1 }), true);
  assert.equal(replayResultsScreenAside({ matchOver: true, stepCount: 3, index: 2 }), false);
});

test('the results screen is never set aside for a live match or an empty timeline', () => {
  assert.equal(replayResultsScreenAside({ matchOver: false, stepCount: 3, index: 0 }), false);
  assert.equal(replayResultsScreenAside({ matchOver: true, stepCount: 0, index: 0 }), false);
});

test('a one-step timeline shows the results screen', () => {
  assert.equal(replayResultsScreenAside({ matchOver: true, stepCount: 1, index: 0 }), false);
});
