/**
 * Tab order and replacement for the opponent message dialog.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCommanderMessage, initialCommanderMessageTabs } from './commanderMessageTabs';

const seats = [
  { seatId: 'opponent', label: 'Northern America' },
  { seatId: 'opponent2', label: 'Central Thailand' },
];

test('tabs start in alphabetical order and a message selects that tab', () => {
  const initial = initialCommanderMessageTabs(seats);
  assert.deepEqual(initial.tabs.map((tab) => tab.label), ['Central Thailand', 'Northern America']);
  assert.equal(initial.tabs.every((tab) => tab.enabled), false);
  const applied = applyCommanderMessage(initial, {
    seatId: 'opponent',
    message: 'Hold the coast.',
    strategy: 'Watch the strait.',
  });
  assert.equal(applied.selectedSeatId, 'opponent');
  assert.equal(applied.tabs[0]?.enabled, false);
  assert.equal(applied.tabs[1]?.enabled, true);
  assert.equal(applied.tabs[1]?.message, 'Hold the coast.');
  const replaced = applyCommanderMessage(applied, {
    seatId: 'opponent',
    message: 'The coast is ours.',
    strategy: null,
  });
  assert.equal(replaced.tabs[1]?.message, 'The coast is ours.');
  assert.equal(replaced.tabs[1]?.message?.includes('Hold the coast.'), false);
});

test('whitespace and an unknown seat do not enable or add a tab', () => {
  const initial = initialCommanderMessageTabs(seats);
  const blank = applyCommanderMessage(initial, { seatId: 'opponent2', message: '   ', strategy: null });
  assert.equal(blank, initial);
  const unknown = applyCommanderMessage(initial, { seatId: 'opponent9', message: 'Hello', strategy: null });
  assert.equal(unknown.tabs.length, 2);
  assert.equal(unknown.tabs.every((tab) => tab.enabled), false);
});
