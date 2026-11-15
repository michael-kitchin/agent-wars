/**
 * The chat panel's pure choices.
 *
 * Purpose: A draft, a recipient, and a show/hide answer stay stable when the page changes.
 * When to use: `npm run build:main`, then `node dist/shared/chatPanelState.test.js`.
 * Expected outcome: The picked draft is found, a valid pick is kept, blank text cannot be staged, and one clear case shows the panel.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canStageText,
  chatPanelShouldShow,
  nextRecipientSeatId,
  stagedMessageFor,
} from './chatPanelState';
import type { SideMessageView } from './sideMessageView';

const draft = (toSeatId: string, text: string): SideMessageView => ({
  messageId: 1,
  fromSeatId: 'human',
  toSeatId,
  text,
  scope: 'strategic',
  turnNumber: 1,
  beatNumber: 0,
});

test('stagedMessageFor finds the draft for the picked side', () => {
  const staged = [draft('ai-1', 'Hold'), draft('ai-2', 'Watch')];
  assert.equal(stagedMessageFor(staged, 'ai-2')?.text, 'Watch');
  assert.equal(stagedMessageFor(staged, 'ai-3'), null);
  assert.equal(stagedMessageFor(staged, null), null);
});

test('nextRecipientSeatId keeps a pick that is still available', () => {
  assert.equal(nextRecipientSeatId('ai-2', ['ai-1', 'ai-2']), 'ai-2');
  assert.equal(nextRecipientSeatId('gone', ['ai-1', 'ai-2']), 'ai-1');
  assert.equal(nextRecipientSeatId('ai-1', []), null);
});

test('canStageText rejects blank text', () => {
  assert.equal(canStageText(''), false);
  assert.equal(canStageText('   '), false);
  assert.equal(canStageText(' a '), true);
});

test('chatPanelShouldShow is true only when the match is loaded and nothing else is covering the corner', () => {
  const clear = { matchLoaded: true, playbackRunning: false, mapToastShowing: false };
  assert.equal(chatPanelShouldShow(clear), true);
  assert.equal(chatPanelShouldShow({ ...clear, matchLoaded: false }), false);
  assert.equal(chatPanelShouldShow({ ...clear, playbackRunning: true }), false);
  assert.equal(chatPanelShouldShow({ ...clear, mapToastShowing: true }), false);
});
