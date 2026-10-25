/**
 * Tab order and replacement for the opponent message dialog.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyRosterAbsenceReason } from './commanderStatus';
import {
  applyCommanderAbsence,
  applyCommanderMessage,
  commanderDispatchHasProse,
  formatCommanderAbsenceMessage,
  initialCommanderMessageTabs,
  noteCommanderConsultWithoutProse,
  resetCommanderConsultMarks,
  resolveCommanderTabAbsence,
  seatOutsideTacticalConsult,
} from './commanderMessageTabs';

const seats = [
  { seatId: 'opponent', label: 'Northern America' },
  { seatId: 'opponent2', label: 'Central Thailand' },
];

test('tabs start in opponent-number order and a message selects that tab', () => {
  const initial = initialCommanderMessageTabs(seats);
  assert.deepEqual(initial.tabs.map((tab) => tab.seatId), ['opponent', 'opponent2']);
  assert.deepEqual(initial.tabs.map((tab) => tab.label), ['N. America', 'C. Thailand']);
  assert.equal(initial.tabs.every((tab) => tab.enabled), false);
  const applied = applyCommanderMessage(initial, {
    seatId: 'opponent',
    message: 'Hold the coast.',
    strategy: 'Watch the strait.',
  });
  assert.equal(applied.selectedSeatId, 'opponent');
  assert.equal(applied.tabs[0]?.enabled, true);
  assert.equal(applied.tabs[1]?.enabled, false);
  assert.equal(applied.tabs[0]?.message, 'Hold the coast.');
  assert.equal(applied.tabs[0]?.strategy, 'Watch the strait.');
  const replaced = applyCommanderMessage(applied, {
    seatId: 'opponent',
    message: 'The coast is ours.',
    strategy: null,
  });
  assert.equal(replaced.tabs[0]?.message, 'The coast is ours.');
  assert.equal(replaced.tabs[0]?.strategy, null);
  assert.equal(replaced.tabs[0]?.message?.includes('Hold the coast.'), false);
  const strategyOnly = applyCommanderMessage(initial, {
    seatId: 'opponent2',
    message: null,
    strategy: 'Hold the river.',
  });
  assert.equal(strategyOnly.selectedSeatId, 'opponent2');
  assert.equal(strategyOnly.tabs[0]?.enabled, false);
  assert.equal(strategyOnly.tabs[1]?.enabled, true);
  assert.equal(strategyOnly.tabs[0]?.message, null);
  assert.equal(strategyOnly.tabs[1]?.message, null);
  assert.equal(strategyOnly.tabs[1]?.strategy, 'Hold the river.');
});

test('a home name that sorts first still follows its opponent number', () => {
  const state = initialCommanderMessageTabs([
    { seatId: 'opponent3', label: 'Eastern Europe' },
    { seatId: 'human', label: 'Western Europe' },
    { seatId: 'opponent', label: 'Northern America' },
  ]);
  assert.deepEqual(
    state.tabs.map((tab) => tab.seatId),
    ['opponent', 'opponent3', 'human']
  );
  assert.deepEqual(state.tabs.map((tab) => tab.label), ['N. America', 'E. Europe', 'W. Europe']);
});

test('commanderDispatchHasProse keeps a message, a strategy, or both', () => {
  assert.equal(commanderDispatchHasProse('Hold the coast.', null), true);
  assert.equal(commanderDispatchHasProse(null, 'Watch the strait.'), true);
  assert.equal(commanderDispatchHasProse(null, null), false);
  assert.equal(commanderDispatchHasProse('   ', '\n'), false);
  assert.equal(commanderDispatchHasProse(undefined, undefined), false);
  assert.equal(commanderDispatchHasProse(undefined, 'Watch the strait.'), true);
});

test('whitespace and an unknown seat do not enable or add a tab', () => {
  const initial = initialCommanderMessageTabs(seats);
  const blank = applyCommanderMessage(initial, { seatId: 'opponent2', message: '   ', strategy: null });
  assert.equal(blank, initial);
  const unknown = applyCommanderMessage(initial, { seatId: 'opponent9', message: 'Hello', strategy: null });
  assert.equal(unknown.tabs.length, 2);
  assert.equal(unknown.tabs.every((tab) => tab.enabled), false);
});

test('an absence line enables a tab without changing the selected consult', () => {
  const initial = initialCommanderMessageTabs(seats);
  const selected = applyCommanderMessage(initial, {
    seatId: 'opponent',
    message: 'Hold the coast.',
    strategy: null,
  });
  const explained = applyCommanderAbsence(selected, 'opponent2', 'Knocked out on turn 6.');
  assert.equal(explained.selectedSeatId, 'opponent');
  assert.equal(explained.tabs[0]?.message, 'Hold the coast.');
  assert.equal(explained.tabs[1]?.enabled, true);
  assert.equal(explained.tabs[1]?.message, 'Knocked out on turn 6.');
  assert.equal(explained.tabs[1]?.strategy, null);
  const silent = noteCommanderConsultWithoutProse(initial, 'opponent2');
  assert.equal(silent.tabs[1]?.enabled, false);
  assert.equal(silent.tabs[1]?.consultedWithoutProse, true);
  assert.equal(applyCommanderAbsence(selected, 'opponent', 'The consult failed.').tabs[0]?.message, 'Hold the coast.');
  const replaced = applyCommanderAbsence(explained, 'opponent2', 'No commander model is set.');
  assert.equal(replaced.selectedSeatId, 'opponent');
  assert.equal(replaced.tabs[1]?.message, 'No commander model is set.');
  assert.equal(replaced.tabs[1]?.fromAbsence, true);
  const silenced = noteCommanderConsultWithoutProse(replaced, 'opponent2');
  assert.equal(silenced.tabs[1]?.enabled, false);
  assert.equal(silenced.tabs[1]?.message, null);
  assert.equal(silenced.tabs[1]?.consultedWithoutProse, true);
  assert.equal(silenced.tabs[0]?.message, 'Hold the coast.');
  const cleared = resetCommanderConsultMarks(silenced);
  assert.equal(cleared.tabs[1]?.consultedWithoutProse, false);
  assert.equal(cleared.selectedSeatId, 'opponent');
});

test('absence reasons follow roster, timeout, a silent consult, and a seat outside the battle', () => {
  const open = {
    outTurn: null,
    status: 'ready' as const,
    storedReason: 'no_new_consult' as const,
    tacticalOtherSeat: false,
    consultedWithoutProse: false,
  };
  assert.equal(resolveCommanderTabAbsence({ ...open, outTurn: 6, status: 'out' }), 'knocked_out');
  assert.equal(resolveCommanderTabAbsence({ ...open, status: 'no_model' }), 'no_model');
  assert.equal(resolveCommanderTabAbsence({ ...open, status: 'timed_out' }), 'timed_out');
  assert.equal(resolveCommanderTabAbsence({ ...open, status: 'planning' }), null);
  assert.equal(resolveCommanderTabAbsence({ ...open, consultedWithoutProse: true, storedReason: 'consult_failed' }), null);
  assert.equal(resolveCommanderTabAbsence({ ...open, tacticalOtherSeat: true }), 'not_in_battle');
  assert.equal(resolveCommanderTabAbsence(open), 'no_new_consult');
  assert.equal(formatCommanderAbsenceMessage('knocked_out', 6), 'Knocked out on turn 6.');
  assert.equal(formatCommanderAbsenceMessage('knocked_out', null), 'Knocked out.');
  assert.equal(formatCommanderAbsenceMessage('no_model', null), 'No commander model is set.');
  assert.equal(
    formatCommanderAbsenceMessage('timed_out', 4),
    'No reply in time on turn 4, so its standing orders ran instead.'
  );
  assert.equal(
    formatCommanderAbsenceMessage('no_new_consult', null),
    'No new consult was required, so its standing orders still apply.'
  );
  assert.equal(formatCommanderAbsenceMessage('not_in_battle', null), 'Not in this battle.');
  assert.equal(formatCommanderAbsenceMessage('no_units_in_battle', null), 'No units left in this battle.');
  assert.equal(formatCommanderAbsenceMessage('consult_failed', null), 'The consult failed.');
});

test('an empty tactical roster is an absence and an empty strategic roster is not', () => {
  assert.equal(emptyRosterAbsenceReason(false, 0), null);
  assert.equal(emptyRosterAbsenceReason(true, 0), 'no_units_in_battle');
  assert.equal(emptyRosterAbsenceReason(true, 2), null);
  assert.equal(seatOutsideTacticalConsult('opponent', 'opponent2', 'tactical'), true);
  assert.equal(seatOutsideTacticalConsult('opponent2', 'opponent2', 'tactical'), false);
  assert.equal(seatOutsideTacticalConsult('opponent', 'opponent2', 'strategic'), false);
  assert.equal(seatOutsideTacticalConsult('opponent', null, 'tactical'), false);
});
