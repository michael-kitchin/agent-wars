import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStrategicTerrainCoverLookup, createTacticalTerrainCoverLookup, withTargetCover } from './terrainCoverLookup';

test('the strategic lookup reads each hex terrain kind and gives 0 for an unlisted hex', () => {
  const lookup = createStrategicTerrainCoverLookup([
    { h3Index: 'hex-forest', terrainKind: 'forest' },
    { h3Index: 'hex-plains', terrainKind: 'plains' },
  ]);
  assert.equal(lookup('hex-forest', 'surface'), 2);
  assert.equal(lookup('hex-forest', 'air'), 1);
  assert.equal(lookup('hex-plains', 'surface'), 0);
  assert.equal(lookup('hex-missing', 'surface'), 0);
});

test('the battle lookup reads cell terrain and the urban flag, and a cell without a kind takes the hex kind', () => {
  const lookup = createTacticalTerrainCoverLookup({
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { 'cell-forest': 'forest' },
    res4IsUrbanByH3: { 'cell-urban': true },
  });
  assert.equal(lookup('cell-forest', 'surface'), 2);
  assert.equal(lookup('cell-urban', 'air'), 1);
  assert.equal(lookup('cell-open', 'surface'), 0);
  const forestHex = createTacticalTerrainCoverLookup({ strategicHexTerrainKind: 'forest', res4TerrainKindByH3: {} });
  assert.equal(forestHex('cell-open', 'surface'), 2);
});

test('withTargetCover sets the field only when there is cover', () => {
  const unit = { id: 'u1', unitType: 'armor' };
  assert.deepEqual(withTargetCover(unit, 2), { id: 'u1', unitType: 'armor', targetCover: 2 });
  assert.equal('targetCover' in withTargetCover(unit, 0), false);
  assert.equal('targetCover' in unit, false);
});
