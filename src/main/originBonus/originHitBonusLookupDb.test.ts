import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listUnitsForSnapshot, resetGameForNewMatch } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { buildStrategicOriginHitBonusLookupFromDb } from './originHitBonusLookupDb';

test('the strategic lookup from the database follows the origin bonus flag', () => {
  withTempGameDb('aw-originbonus-lookup-', () => {
    resetGameForNewMatch({ originBonusLevel: 'low' });
    const units = listUnitsForSnapshot();
    const onLookup = buildStrategicOriginHitBonusLookupFromDb();
    assert.ok(units.some((u) => onLookup(u.id, u.h3Index) === 2), 'expected a seeded unit standing in its birth country');

    resetGameForNewMatch();
    const offLookup = buildStrategicOriginHitBonusLookupFromDb();
    assert.ok(listUnitsForSnapshot().every((u) => offLookup(u.id, u.h3Index) === 0));
  });
});
