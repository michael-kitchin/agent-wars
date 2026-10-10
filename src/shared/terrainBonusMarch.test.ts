/**
 * Contract tests for the terrain-bonus stop category.
 * Run: `npm run build:main` then `node dist/shared/terrainBonusMarch.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { terrainBonusMarchCategoryFor, terrainBonusMarchCategoryForMover } from './terrainBonusMarch';
import type { UnitOrigin } from './unitOriginTypes';

const categoryFor = (unitType: string, birthTerrainKind: string | null, enabled = true) =>
  terrainBonusMarchCategoryFor({ enabled, unitType, birthTerrainKind });

test('armor gets the birth terrain it otherwise cannot enter, except water', () => {
  assert.equal(categoryFor('armor', 'mountain'), 'mountains');
  assert.equal(categoryFor('armor', 'mountains'), 'mountains');
  assert.equal(categoryFor('armor', 'wetlands'), 'wetlands');
  assert.equal(categoryFor('armor', 'arctic'), 'arctic');
  assert.equal(categoryFor('armor', 'plains'), null);
  assert.equal(categoryFor('armor', 'water'), null);
});

test('naval gets only wetlands, and infantry gets nothing', () => {
  assert.equal(categoryFor('naval', 'wetlands'), 'wetlands');
  assert.equal(categoryFor('naval', 'plains'), null);
  assert.equal(categoryFor('naval', 'coastal'), null);
  for (const kind of ['mountain', 'wetlands', 'arctic', 'forest']) assert.equal(categoryFor('infantry', kind), null);
});

test('an off bonus, a missing birth, or an unknown birth gives no category', () => {
  assert.equal(categoryFor('armor', 'mountain', false), null);
  assert.equal(categoryFor('armor', null), null);
  assert.equal(categoryFor('armor', 'lava'), null);
});

test('the mover helper needs the battle flag and the unit moving as itself', () => {
  const origin = { birthTerrainKind: 'mountain' } as UnitOrigin;
  const armor = { unitType: 'armor', origin };
  assert.equal(terrainBonusMarchCategoryForMover({ terrainBonusEnabled: true }, armor, 'armor'), 'mountains');
  assert.equal(terrainBonusMarchCategoryForMover({}, armor, 'armor'), null);
  assert.equal(terrainBonusMarchCategoryForMover({ terrainBonusEnabled: true }, armor, 'naval'), null);
});
