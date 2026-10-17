import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBattleHeaderStatus, formatBattleHeaderTitle } from './battleHeaderText';

test('formatBattleHeaderTitle names the world hex', () => {
  assert.equal(formatBattleHeaderTitle('E8'), 'Battle at (E8)');
});

test('formatBattleHeaderTitle falls back to "Battle" without a code', () => {
  assert.equal(formatBattleHeaderTitle(null), 'Battle');
});

test('formatBattleHeaderStatus shows the beat, tactical planning, and the date', () => {
  assert.equal(
    formatBattleHeaderStatus({ beat: 2, beatPlaybackActive: false, dateLabel: 'April, Year 1' }),
    'Beat 2 · Tactical planning · April, Year 1'
  );
});

test('formatBattleHeaderStatus names tactical resolution while the beat plays back', () => {
  assert.equal(
    formatBattleHeaderStatus({ beat: 2, beatPlaybackActive: true, dateLabel: 'April, Year 1' }),
    'Beat 2 · Tactical resolution · April, Year 1'
  );
});

test('formatBattleHeaderStatus leaves out a missing date', () => {
  assert.equal(formatBattleHeaderStatus({ beat: 1, beatPlaybackActive: false, dateLabel: '' }), 'Beat 1 · Tactical planning');
});
