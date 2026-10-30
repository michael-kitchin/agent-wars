import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syncEmbarkedLandToNavalHex } from './tacticalEmbarkedCargoSync';

test('syncEmbarkedLandToNavalHex moves cargo onto its naval carrier without mutating the input', () => {
  const cargo = { id: 'l1', unitType: 'infantry', h3Index: 'b', embarkedOnSubUnitId: 'n1' };
  const input = [
    { id: 'n1', unitType: 'naval', h3Index: 'a', embarkedOnSubUnitId: null },
    cargo,
  ];
  const out = syncEmbarkedLandToNavalHex(input);
  assert.equal(out[1]?.h3Index, 'a');
  assert.equal(cargo.h3Index, 'b');
});

test('syncEmbarkedLandToNavalHex keeps a row whose carrier is missing or is not naval', () => {
  const missing = { id: 'l1', unitType: 'infantry', h3Index: 'b', embarkedOnSubUnitId: 'gone' };
  const landCarrier = { id: 'l2', unitType: 'infantry', h3Index: 'c', embarkedOnSubUnitId: 'l3' };
  const otherLand = { id: 'l3', unitType: 'infantry', h3Index: 'd', embarkedOnSubUnitId: null };
  const input = [missing, landCarrier, otherLand];
  const out = syncEmbarkedLandToNavalHex(input);
  assert.equal(out[0], missing);
  assert.equal(out[1], landCarrier);
  assert.equal(out[2], otherLand);
});
