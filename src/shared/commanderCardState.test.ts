import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_CONSULTATION_WALL_CLOCK_MS } from './aiConsultationLimits';
import { commanderCardPresentation, formatCommanderClock } from './commanderCardState';

test('commanderCardPresentation names each status', () => {
  assert.equal(commanderCardPresentation({ status: 'planning', planningElapsedMs: 65_000, timedOutTurn: null, outTurn: null }).chip, 'Planning 1:05');
  assert.equal(commanderCardPresentation({ status: 'ready', planningElapsedMs: 0, timedOutTurn: null, outTurn: null }).chip, 'Ready');
  assert.equal(commanderCardPresentation({ status: 'no_model', planningElapsedMs: 0, timedOutTurn: null, outTurn: null }).chip, 'Standing orders');
  const timedOut = commanderCardPresentation({ status: 'timed_out', planningElapsedMs: 0, timedOutTurn: 4, outTurn: null });
  const cap = formatCommanderClock(AI_CONSULTATION_WALL_CLOCK_MS);
  assert.equal(timedOut.chip, 'Timed out');
  assert.equal(timedOut.detail, `No reply in ${cap} of ${cap} on turn 4. Its standing orders ran instead.`);
  const out = commanderCardPresentation({ status: 'out', planningElapsedMs: 0, timedOutTurn: null, outTurn: 6 });
  assert.equal(out.chip, 'Out, turn 6');
  assert.equal(out.dimmed, true);
  assert.equal(out.summaryDisabled, true);
});
