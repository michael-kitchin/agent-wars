/**
 * Contracts for the AI-only beat limit.
 * Run with: node dist/shared/aiOnlyBeatLimit.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aiOnlyBattleEndPresentation,
  aiOnlyBeatLimitForRequest,
  aiOnlyBeatLimitFromStored,
  aiOnlyBeatLimitReached,
  aiOnlyBeatLimitToStored,
  aiOnlyLeaveStartsNextTurn,
  aiOnlyTimedNoticeStillCloses,
  formatAiOnlyBeatLimitSentence,
} from './aiOnlyBeatLimit';

test('aiOnlyBeatLimitForRequest keeps null and a listed number, and stores 30 otherwise', () => {
  assert.equal(aiOnlyBeatLimitForRequest(null), null);
  assert.equal(aiOnlyBeatLimitForRequest(40), 40);
  assert.equal(aiOnlyBeatLimitForRequest(undefined), 30);
  assert.equal(aiOnlyBeatLimitForRequest(7), 30);
});

test('aiOnlyBeatLimitFromStored reads a listed string and treats anything else as unlimited', () => {
  assert.equal(aiOnlyBeatLimitFromStored('20'), 20);
  assert.equal(aiOnlyBeatLimitFromStored('unlimited'), null);
  assert.equal(aiOnlyBeatLimitFromStored(undefined), null);
  assert.equal(aiOnlyBeatLimitFromStored('7'), null);
});

test('aiOnlyBeatLimitToStored writes unlimited or the digits', () => {
  assert.equal(aiOnlyBeatLimitToStored(null), 'unlimited');
  assert.equal(aiOnlyBeatLimitToStored(50), '50');
});

test('aiOnlyBeatLimitReached is true only on a numbered limit that the beat has met', () => {
  assert.equal(aiOnlyBeatLimitReached(19, 20), false);
  assert.equal(aiOnlyBeatLimitReached(20, 20), true);
  assert.equal(aiOnlyBeatLimitReached(9999, null), false);
});

test('formatAiOnlyBeatLimitSentence names the beat count', () => {
  assert.equal(formatAiOnlyBeatLimitSentence(30), 'The battle reached its maximum of 30 beats.');
});

test('aiOnlyBattleEndPresentation times only a beat limit while auto-advancing', () => {
  assert.equal(aiOnlyBattleEndPresentation('beat_limit', false), 'dialog_until_ok');
  assert.equal(aiOnlyBattleEndPresentation('beat_limit', true), 'timed_dialog');
  assert.equal(aiOnlyBattleEndPresentation('idle', false), 'dialog_until_ok');
  assert.equal(aiOnlyBattleEndPresentation('idle', true), 'leave_now');
  assert.equal(aiOnlyBattleEndPresentation('elimination', true), 'leave_now');
});

test('aiOnlyLeaveStartsNextTurn starts a turn from a closed dialog or a beat-limit notice', () => {
  const leave = aiOnlyLeaveStartsNextTurn;
  assert.equal(leave({ resultDialogOpen: false, endReason: undefined, autoAdvance: true }), true);
  assert.equal(leave({ resultDialogOpen: true, endReason: 'beat_limit', autoAdvance: true }), true);
  assert.equal(leave({ resultDialogOpen: true, endReason: 'beat_limit', autoAdvance: false }), false);
  assert.equal(leave({ resultDialogOpen: true, endReason: 'idle', autoAdvance: true }), false);
  assert.equal(leave({ resultDialogOpen: true, endReason: undefined, autoAdvance: true }), false);
});

test('aiOnlyTimedNoticeStillCloses stops when the sentence is gone or auto-advance is off', () => {
  assert.equal(aiOnlyTimedNoticeStillCloses('The battle reached its maximum of 30 beats.', true), true);
  assert.equal(aiOnlyTimedNoticeStillCloses('The battle reached its maximum of 30 beats.', false), false);
  assert.equal(aiOnlyTimedNoticeStillCloses(null, true), false);
});
