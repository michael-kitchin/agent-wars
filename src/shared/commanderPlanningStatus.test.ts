import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  commanderFooterLabel,
  commanderPlanningSentence,
  modelNameFromOptionLabel,
  NO_MODEL_LABEL,
  commanderPlanningStatus,
} from './commanderPlanningStatus';

test('commanderPlanningStatus is off while Run is off, and planning only while Run is on', () => {
  assert.equal(commanderPlanningStatus(false, true), 'off');
  assert.equal(commanderPlanningStatus(true, false), 'on');
  assert.equal(commanderPlanningStatus(true, true), 'planning');
});

test('the footer and the Run sentence name the commanders', () => {
  assert.equal(commanderPlanningSentence(false, 3), 'Planning is off.');
  assert.equal(commanderPlanningSentence(true, 3), 'Planning is on for all 3 commanders.');
  assert.equal(commanderFooterLabel({ status: 'off', ready: 0, active: 3, observing: false }), 'Commanders off');
  assert.equal(commanderFooterLabel({ status: 'on', ready: 3, active: 3, observing: false }), 'Commanders ready');
  assert.equal(
    commanderFooterLabel({ status: 'planning', ready: 1, active: 3, observing: false }),
    'Commanders planning · 1 of 3 ready'
  );
  assert.equal(commanderFooterLabel({ status: 'planning', ready: 2, active: 4, observing: true }), 'Planning · 2 of 4 ready');
});

test('modelNameFromOptionLabel drops the price and reasoning suffix', () => {
  assert.equal(modelNameFromOptionLabel('Google: Gemini 3.5 Flash [$0.70/M, reasoning: Min*/High]'), 'Google: Gemini 3.5 Flash');
  assert.equal(modelNameFromOptionLabel('vendor/model-id'), 'vendor/model-id');
  assert.equal(modelNameFromOptionLabel(''), NO_MODEL_LABEL);
});
