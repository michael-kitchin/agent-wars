/**
 * Contract tests for the scenario goal reminder and the generic-objective path.
 * Run: `npm run build:main` then `node dist/main/openrouter/scenarioGoals.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GENERIC_OBJECTIVE_SENTENCE,
  WIN_CONDITION_REMINDER_FIRST_SENTENCE,
  buildWinConditionReminderClause,
} from './scenarioGoals';

test('region_vs_region reminder uses home-region wording', () => {
  const text = buildWinConditionReminderClause({ scenarioId: 'region_vs_region' });
  assert.ok(text.includes(WIN_CONDITION_REMINDER_FIRST_SENTENCE));
  assert.match(text, /air strikes/i);
});

test('absent or unrecognised scenario id uses only the generic objective', () => {
  const absent = buildWinConditionReminderClause({});
  const unrecognised = buildWinConditionReminderClause({ scenarioId: 'skirmish' });
  assert.equal(absent, GENERIC_OBJECTIVE_SENTENCE);
  assert.equal(unrecognised, GENERIC_OBJECTIVE_SENTENCE);
  assert.doesNotMatch(absent, /home region/);
  assert.doesNotMatch(absent, /production capacity can be destroyed/);
  assert.doesNotMatch(unrecognised, /home region/);
});
