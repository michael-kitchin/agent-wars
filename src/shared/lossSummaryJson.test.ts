/**
 * Stored loss JSON round trips, including attribution, and still reads rows written before attribution existed.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyPlayerLossSummary, formatPlayerLossLinesMultiline, type LostUnit, type PlayerLossSummary } from './lossSummary';
import { parsePlayerLossSummaryJson, serializePlayerLossSummary } from './lossSummaryJson';

const attributedUnit: LostUnit = {
  unitType: 'armor',
  displayName: 'IV Armored',
  unitId: 'a1-a2',
  attribution: {
    ownerId: 'opponent',
    lossH3Index: 'h3-x',
    responsibleOwnerIds: ['human'],
    killerUnits: [{ unitId: 'h1-a4', unitType: 'armor' }],
  },
};

test('a summary with attribution survives a round trip', () => {
  const summary: PlayerLossSummary = { ...emptyPlayerLossSummary(), ranged: [attributedUnit] };
  assert.deepEqual(parsePlayerLossSummaryJson(serializePlayerLossSummary(summary)), summary);
});

test('a row written before attribution still reads, with no attribution key', () => {
  const raw =
    '{"ranged":[{"unitType":"armor","displayName":"A","unitId":"a1-a2"}],"melee":[],"returnFire":[],"airStrike":[],"other":[]}';
  const summary = parsePlayerLossSummaryJson(raw);
  assert.equal(summary.ranged.length, 1);
  assert.equal('attribution' in summary.ranged[0]!, false);
  assert.deepEqual(summary.missileStrike, []);
});

test('an empty, null, or unreadable blob is an empty summary', () => {
  assert.deepEqual(parsePlayerLossSummaryJson(null), emptyPlayerLossSummary());
  assert.deepEqual(parsePlayerLossSummaryJson('not json'), emptyPlayerLossSummary());
  assert.deepEqual(parsePlayerLossSummaryJson('null'), emptyPlayerLossSummary());
});

test('responsible owners keep their three meanings', () => {
  const unit = (responsible: unknown): string =>
    JSON.stringify({
      ranged: [{ unitType: 'infantry', displayName: 'A', unitId: 'a1-i1', attribution: { ownerId: 'opponent', lossH3Index: null, responsibleOwnerIds: responsible, killerUnits: [] } }],
    });
  assert.deepEqual(parsePlayerLossSummaryJson(unit([])).ranged[0]!.attribution!.responsibleOwnerIds, []);
  assert.equal(parsePlayerLossSummaryJson(unit(null)).ranged[0]!.attribution!.responsibleOwnerIds, null);
  const missing = JSON.stringify({ ranged: [{ unitType: 'infantry', displayName: 'A', attribution: { ownerId: 'opponent' } }] });
  assert.equal(parsePlayerLossSummaryJson(missing).ranged[0]!.attribution!.responsibleOwnerIds, null);
});

test('a damaged attribution is dropped and the unit stays', () => {
  const raw = JSON.stringify({
    ranged: [{ unitType: 'infantry', displayName: 'A', unitId: 'a1-i1', attribution: { ownerId: 7 } }],
  });
  const unit = parsePlayerLossSummaryJson(raw).ranged[0]!;
  assert.equal(unit.unitId, 'a1-i1');
  assert.equal(unit.attribution, undefined);
});

test('a killer with a bad type or id is dropped', () => {
  const raw = JSON.stringify({
    ranged: [{
      unitType: 'infantry', displayName: 'A',
      attribution: { ownerId: 'opponent', lossH3Index: '', responsibleOwnerIds: ['human'], killerUnits: [{ unitId: 'h1-a1', unitType: 'tank' }, { unitId: '', unitType: 'armor' }, { unitId: 'h1-a2', unitType: 'armor' }] },
    }],
  });
  const attribution = parsePlayerLossSummaryJson(raw).ranged[0]!.attribution!;
  assert.deepEqual(attribution.killerUnits, [{ unitId: 'h1-a2', unitType: 'armor' }]);
  assert.equal(attribution.lossH3Index, null);
});

test('popup lines ignore attribution', () => {
  const infantry = (n: number): LostUnit[] =>
    Array.from({ length: n }, (_, i) => ({ unitType: 'infantry' as const, displayName: `Inf ${i}`, unitId: `a1-i${i}` }));
  const plain: PlayerLossSummary = { ...emptyPlayerLossSummary(), ranged: [...infantry(4), { ...attributedUnit, attribution: undefined }] };
  const attributed: PlayerLossSummary = { ...emptyPlayerLossSummary(), ranged: [...infantry(4).map((u) => ({ ...u, attribution: attributedUnit.attribution })), attributedUnit] };
  assert.deepEqual(formatPlayerLossLinesMultiline(attributed), formatPlayerLossLinesMultiline(plain));
});
