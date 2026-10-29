import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildConsolidatedTurnUpdateToastMessage, buildOtherTurnUpdatePrimaryLines, joinWithSerialComma } from './consolidatedTurnUpdateToast';
import { emptyTurnLossSummary } from './lossSummary';

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

test('missile strike lines appear in Updates before the unknown-battle line', () => {
  const message = buildConsolidatedTurnUpdateToastMessage({
    readyResult: { success: true },
    turnLossSummary: emptyTurnLossSummary(),
    combatFallbackBullets: [],
    missileStrikeLines: ['Missile strike on Osaka: nothing there to destroy.'],
    unknownBattleLine: 'A battle was fought somewhere you could not see.',
  });
  assert.equal(
    message,
    [
      '## Updates',
      'Missile strike on Osaka: nothing there to destroy.',
      'A battle was fought somewhere you could not see.',
    ].join('\n')
  );
});
