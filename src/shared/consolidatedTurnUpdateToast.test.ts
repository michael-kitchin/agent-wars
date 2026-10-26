import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOtherTurnUpdatePrimaryLines } from './consolidatedTurnUpdateToast';

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
