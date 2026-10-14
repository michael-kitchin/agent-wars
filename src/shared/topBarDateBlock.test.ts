import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTopBarDateBlock, type TopBarDateBlockArgs } from './topBarDateBlock';

const strategicArgs: TopBarDateBlockArgs = {
  hasGameState: true,
  dateLabel: 'March, Year 1',
  turnNumber: 7,
  strategicPhaseLabel: 'Planning',
};

test('formatTopBarDateBlock shows em dashes when there is no game state', () => {
  assert.deepEqual(formatTopBarDateBlock({ ...strategicArgs, hasGameState: false }), { date: '—', turnPhase: '—' });
});

test('formatTopBarDateBlock shows the date and the strategic turn', () => {
  assert.deepEqual(formatTopBarDateBlock(strategicArgs), { date: 'March, Year 1', turnPhase: 'Turn 7 · Planning' });
});

test('formatTopBarDateBlock shows an em dash for a missing date', () => {
  assert.equal(formatTopBarDateBlock({ ...strategicArgs, dateLabel: '' }).date, '—');
});
