/**
 * Tab order and replacement for the opponent message dialog.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCommanderMessage, commanderDispatchHasProse, initialCommanderMessageTabs } from './commanderMessageTabs';

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
