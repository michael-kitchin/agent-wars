/**
 * The chat panel's pure choices.
 *
 * Purpose: A draft, a recipient, and a show/hide answer stay stable when the page changes.
 * When to use: `npm run build:main`, then `node dist/shared/chatPanelState.test.js`.
 * Expected outcome: The picked draft is found, drafts follow the recipient list, a valid pick is kept, blank text cannot be staged, and one clear case shows the panel.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canStageText,
  chatNamedSeatKey,
  chatPanelShouldShow,
  nextRecipientSeatId,
  stagedMessageFor,
  stagedMessagesInSeatOrder,
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

test('stagedMessagesInSeatOrder follows the recipient list', () => {
  const staged = [
    { ...draft('ai-2', 'Watch'), messageId: 2 },
    { ...draft('ai-1', 'Hold'), messageId: 1 },
    { ...draft('gone', 'Old'), messageId: 3 },
  ];
  assert.deepEqual(
    stagedMessagesInSeatOrder(staged, ['ai-1', 'ai-2']).map((row) => row.toSeatId),
    ['ai-1', 'ai-2', 'gone'],
  );
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
  const clear = { matchLoaded: true, playbackRunning: false, mapToastShowing: false, autoAdvance: false, replayActive: false };
  assert.equal(chatPanelShouldShow(clear), true);
  assert.equal(chatPanelShouldShow({ ...clear, matchLoaded: false }), false);
  assert.equal(chatPanelShouldShow({ ...clear, playbackRunning: true }), false);
  assert.equal(chatPanelShouldShow({ ...clear, mapToastShowing: true }), false);
  assert.equal(chatPanelShouldShow({ ...clear, autoAdvance: true }), false);
  assert.equal(chatPanelShouldShow({ ...clear, replayActive: true }), false);
});

test('chatNamedSeatKey changes when a name or the order changes', () => {
  const ids = ['side-a', 'side-b'];
  const named = (nameOf: (seatId: string) => string) => chatNamedSeatKey(ids, nameOf);
  const first = named((seatId) => seatId);
  assert.equal(named((seatId) => seatId), first);
  assert.notEqual(named((seatId) => `${seatId}-renamed`), first);
  assert.notEqual(chatNamedSeatKey(['side-b', 'side-a'], (seatId) => seatId), first);
});
