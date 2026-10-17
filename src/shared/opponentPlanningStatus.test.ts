import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  modelNameFromOptionLabel,
  NO_MODEL_LABEL,
  OPPONENT_STATUS_LINE_LABELS,
  opponentPlanningStatus,
  opponentStatusSentence,
} from './opponentPlanningStatus';

test('opponentPlanningStatus is off while Run is off, and planning only while Run is on', () => {
  assert.equal(opponentPlanningStatus(false, true), 'off');
  assert.equal(opponentPlanningStatus(true, false), 'on');
  assert.equal(opponentPlanningStatus(true, true), 'planning');
});

test('the status label and sentence name each state', () => {
  assert.equal(OPPONENT_STATUS_LINE_LABELS.planning, 'Opponent planning…');
  assert.equal(opponentStatusSentence('off'), 'Opponent planning is off.');
  assert.equal(opponentStatusSentence('planning'), 'Opponent planning is on.');
});

test('modelNameFromOptionLabel drops the price and reasoning suffix', () => {
  assert.equal(modelNameFromOptionLabel('Google: Gemini 3.5 Flash [$0.70/M, reasoning: Min*/High]'), 'Google: Gemini 3.5 Flash');
  assert.equal(modelNameFromOptionLabel('vendor/model-id'), 'vendor/model-id');
  assert.equal(modelNameFromOptionLabel(''), NO_MODEL_LABEL);
});
