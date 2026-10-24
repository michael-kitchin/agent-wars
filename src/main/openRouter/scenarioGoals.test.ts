/**
 * Contract tests for the scenario goal reminder and the generic-objective path.
 * Run: `npm run build:main` then `node dist/main/openRouter/scenarioGoals.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../gameDb';
import {
  GENERIC_OBJECTIVE_SENTENCE,
  REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET,
  WIN_CONDITION_REMINDER_FIRST_SENTENCE,
  buildRegionVsRegionScenarioObjectiveBlock,
  buildWinConditionReminderClause,
} from './scenarioGoals';

test('region_vs_region reminder uses home-region wording', () => {
  const text = buildWinConditionReminderClause({ scenarioId: 'region_vs_region' });
  assert.ok(text.includes(WIN_CONDITION_REMINDER_FIRST_SENTENCE));
  assert.match(text, /air strikes/i);
});

test('a 75 percent share replaces the every-hex reminder', () => {
  const text = buildWinConditionReminderClause({ scenarioId: 'region_vs_region', controlWinMinUrbanShare: 0.75 });
  assert.match(text, /see the share below/);
  assert.ok(text.includes(WIN_CONDITION_REMINDER_FIRST_SENTENCE));
  assert.match(text, /no single side wins/);
});

test('the objective block can name both progress lines', () => {
  const state = {
    scenarioId: 'region_vs_region',
    playerPerspective: AI_SEAT_IDS[0],
    seats: [
      { seatId: HUMAN_SEAT_ID, seatOrder: 1, kind: 'human', homeRegion: 'South', outTurn: null, commander: null },
      { seatId: AI_SEAT_IDS[0], seatOrder: 2, kind: 'ai', homeRegion: 'North', outTurn: null, commander: null },
    ],
  } as unknown as GameStateSnapshot;
  const progress = {
    ai: { heldUrbanCells: 90, totalUrbanCells: 100, neededUrbanCells: 75, controlWinMet: true },
    human: { heldUrbanCells: 10, totalUrbanCells: 80, neededUrbanCells: 60, controlWinMet: false },
  };
  const withProgress = buildRegionVsRegionScenarioObjectiveBlock(state, { controlWinMinUrbanShare: 0.75, progress });
  assert.match(withProgress, /South home urban cells in hexes you control: 90 of 100 \(you need 75\)/);
  assert.match(withProgress, /Your home urban cells in hexes South controls: 10 of 80 \(they need 60\)/);
  const plain = buildRegionVsRegionScenarioObjectiveBlock(state);
  assert.equal(plain, buildRegionVsRegionScenarioObjectiveBlock(state, {}));
  assert.ok(plain.includes(REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET));
  assert.equal(plain.includes('you need'), false);
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
