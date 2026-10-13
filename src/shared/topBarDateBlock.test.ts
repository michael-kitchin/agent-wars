import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTopBarDateBlock, type TopBarDateBlockArgs } from './topBarDateBlock';

const strategicArgs: TopBarDateBlockArgs = {
  hasGameState: true,
  dateLabel: 'March, Year 1',
  turnNumber: 7,
  strategicPhaseLabel: 'Planning',
  battleBeat: null,
  beatPlaybackActive: false,
};

test('formatTopBarDateBlock shows em dashes when there is no game state', () => {
  assert.deepEqual(formatTopBarDateBlock({ ...strategicArgs, hasGameState: false }), { date: '—', turnPhase: '—' });
});

test('formatTopBarDateBlock shows the date and the strategic turn outside a battle', () => {
  assert.deepEqual(formatTopBarDateBlock(strategicArgs), { date: 'March, Year 1', turnPhase: 'Turn 7 · Planning' });
});

test('formatTopBarDateBlock names the beat and tactical planning in a battle', () => {
  assert.deepEqual(formatTopBarDateBlock({ ...strategicArgs, battleBeat: 2 }), {
    date: 'March, Year 1',
    turnPhase: 'Beat 2 · Tactical planning',
  });
});

test('formatTopBarDateBlock names tactical resolution while a beat plays back', () => {
  assert.equal(formatTopBarDateBlock({ ...strategicArgs, battleBeat: 2, beatPlaybackActive: true }).turnPhase, 'Beat 2 · Tactical resolution');
});

test('formatTopBarDateBlock shows an em dash for a missing date', () => {
  assert.equal(formatTopBarDateBlock({ ...strategicArgs, dateLabel: '' }).date, '—');
});
