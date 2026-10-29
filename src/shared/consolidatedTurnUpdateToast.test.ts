import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildConsolidatedTurnUpdateToastMessage, buildOtherTurnUpdatePrimaryLines, joinWithSerialComma } from './consolidatedTurnUpdateToast';
import { emptyTurnLossSummary } from './lossSummary';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from './seatIds';

test('buildOtherTurnUpdatePrimaryLines uses the singular for one unit and ignores a hex count', () => {
  assert.deepEqual(
    buildOtherTurnUpdatePrimaryLines({ success: true, deployedUnitsByType: { infantry: 1 }, humanHexesLostCount: 1 }),
    ['1 infantry unit deployed']
  );
});

test('buildOtherTurnUpdatePrimaryLines uses the plural for more than one', () => {
  assert.deepEqual(
    buildOtherTurnUpdatePrimaryLines({ success: true, deployedUnitsByType: { armor: 1, infantry: 1 }, humanHexesLostCount: 3 }),
    ['1 armor and 1 infantry units deployed']
  );
  assert.deepEqual(buildOtherTurnUpdatePrimaryLines({ success: true, deployedUnitsByType: { naval: 2 } }), ['2 naval units deployed']);
});

test('joinWithSerialComma joins one, two, and three parts', () => {
  assert.equal(joinWithSerialComma(['armor']), 'armor');
  assert.equal(joinWithSerialComma(['armor', 'infantry']), 'armor and infantry');
  assert.equal(joinWithSerialComma(['armor', 'infantry', 'naval']), 'armor, infantry, and naval');
});

test('a missile deployment uses the singular or joins the other type', () => {
  assert.deepEqual(
    buildOtherTurnUpdatePrimaryLines({ success: true, deployedUnitsByType: { missile: 1 } }),
    ['1 missile unit deployed']
  );
  assert.deepEqual(
    buildOtherTurnUpdatePrimaryLines({ success: true, deployedUnitsByType: { armor: 1, missile: 1 } }),
    ['1 armor and 1 missile units deployed']
  );
});

test('a missile line for a neutral or uncontrolled hex stays in Updates before the unknown-battle line', () => {
  const message = buildConsolidatedTurnUpdateToastMessage({
    readyResult: { success: true },
    turnLossSummary: emptyTurnLossSummary(),
    combatFallbackBullets: ['• Combat continued.'],
    missileStrikeLines: [
      { controllerId: null, line: 'Missile strike on Osaka: nothing there to destroy.' },
      { controllerId: NEUTRAL_OWNER_ID, line: 'Missile strike on Vienna: 1 city cell destroyed.' },
    ],
    unknownBattleLine: 'A battle was fought somewhere you could not see.',
  });
  assert.equal(
    message,
    [
      '## Updates',
      'Combat continued.',
      'Missile strike on Osaka: nothing there to destroy.',
      'Missile strike on Vienna: 1 city cell destroyed.',
      'A battle was fought somewhere you could not see.',
    ].join('\n')
  );
});

test('a seat-controlled strike with nothing to destroy still opens that side section', () => {
  const message = buildConsolidatedTurnUpdateToastMessage({
    readyResult: { success: true },
    turnLossSummary: emptyTurnLossSummary(),
    combatFallbackBullets: ['• Combat continued.'],
    turnReport: {
      viewerSeatId: HUMAN_SEAT_ID,
      seats: [{ seatId: HUMAN_SEAT_ID, seatOrder: 1, homeRegion: 'Levant' }],
      transitions: [],
    },
    missileStrikeLines: [{ controllerId: HUMAN_SEAT_ID, line: 'Missile strike on Osaka: nothing there to destroy.' }],
  });
  assert.equal(message, ['## Your Losses', 'Missile strike on Osaka: nothing there to destroy.'].join('\n'));
});

test('a seat-controlled missile line is only in that side section', () => {
  const seat = AI_SEAT_IDS[0];
  const message = buildConsolidatedTurnUpdateToastMessage({
    readyResult: { success: true },
    turnLossSummary: emptyTurnLossSummary(),
    combatFallbackBullets: ['• Combat continued.'],
    turnReport: {
      viewerSeatId: HUMAN_SEAT_ID,
      seats: [
        { seatId: HUMAN_SEAT_ID, seatOrder: 1, homeRegion: 'Levant' },
        { seatId: seat, seatOrder: 2, homeRegion: 'Western Turkey' },
      ],
      transitions: [],
    },
    missileStrikeLines: [{ controllerId: seat, line: 'Missile strike on Osaka: 1 city cell destroyed.' }],
    unknownBattleLine: 'A battle was fought somewhere you could not see.',
  });
  assert.equal(
    message,
    [
      '## Western Turkey Losses',
      'Missile strike on Osaka: 1 city cell destroyed.',
      '## Updates',
      'A battle was fought somewhere you could not see.',
    ].join('\n')
  );
});
