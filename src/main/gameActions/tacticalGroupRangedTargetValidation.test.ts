/**
 * Tests for `validateTacticalGroupRangedTarget`. Run with:
 * `node dist/main/gameActions/tacticalGroupRangedTargetValidation.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, gridDistance } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { validateTacticalGroupRangedTarget } from './tacticalGroupRangedTargetValidation';
import { res4GridDiskNeighborsOrdered } from '../../shared/tacticalRes4TransportLink';
import { firstRingCellDistinctFrom, tacticalRes1Cell, tacticalRes4UnderRes1Corner } from '../tacticalBattle/testSupport/tacticalRes4HexFixtures';

test('validateTacticalGroupRangedTarget accepts opponent naval ranged to adjacent human on clear plains', () => {
  const res1 = tacticalRes1Cell(7, 8);
  const h0 = tacticalRes4UnderRes1Corner(7, 8);
  const h1 = firstRingCellDistinctFrom(h0);
  assert.ok(gridDistance(h0, h1) >= 1);
  const ring = [...gridDisk(h0, 2)];
  const terrain: Record<string, string> = {};
  for (const h of ring) {
    terrain[h] = 'plains';
  }
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-rg-accept',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: terrain,
    subUnits: [
      {
        id: 'opp-n0',
        parentUnitId: 'pn0',
        player: 'opponent',
        unitType: 'naval',
        h3Index: h0,
        displayName: 'Fleet 1 (01)',
      },
      {
        id: 'hum-1',
        parentUnitId: 'ph',
        player: 'human',
        unitType: 'infantry',
        h3Index: h1,
        displayName: '1st Infantry (01)',
      },
    ],
  };
  const out = validateTacticalGroupRangedTarget({
    snap,
    uniqueUnitIds: ['opp-n0'],
    targetH3Index: h1,
    tacticalAttackerPlayer: 'opponent',
  });
  assert.equal(out.success, true);
});

test('validateTacticalGroupRangedTarget rejects opponent naval when mountain LOS blocks', () => {
  const res1 = tacticalRes1Cell(8, 9);
  const h0 = tacticalRes4UnderRes1Corner(8, 9);
  const ring = [...gridDisk(h0, 2)];
  const inner = new Set(gridDisk(h0, 1));
  const hFar = ring.find((h) => !inner.has(h));
  if (!hFar) {
    throw new Error('expected annulus cell');
  }
  const terrain: Record<string, string> = {};
  for (const h of ring) {
    terrain[h] = 'mountain';
  }
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-rg-los',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: terrain,
    subUnits: [
      {
        id: 'opp-nm0',
        parentUnitId: 'pnm0',
        player: 'opponent',
        unitType: 'naval',
        h3Index: h0,
        displayName: 'Fleet 1 (01)',
      },
      {
        id: 'hum-m1',
        parentUnitId: 'phm',
        player: 'human',
        unitType: 'infantry',
        h3Index: hFar,
        displayName: '1st Infantry (01)',
      },
    ],
  };
  const out = validateTacticalGroupRangedTarget({
    snap,
    uniqueUnitIds: ['opp-nm0'],
    targetH3Index: hFar,
    tacticalAttackerPlayer: 'opponent',
  });
  assert.equal(out.success, false);
  assert.ok(out.reason?.includes('Line of sight blocked by mountains'), out.reason);
});

test('validateTacticalGroupRangedTarget accepts infantry shot at empty urban cell from snapshot flags', () => {
  const res1 = tacticalRes1Cell(9, 10);
  const h0 = tacticalRes4UnderRes1Corner(9, 10);
  const hUrban = firstRingCellDistinctFrom(h0);
  const ring = [...gridDisk(h0, 2)];
  assert.ok(ring.includes(hUrban));
  const terrain: Record<string, string> = {};
  for (const h of ring) terrain[h] = 'plains';
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-rg-infra-only',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: terrain,
    res4IsUrbanByH3: { [hUrban]: true },
    subUnits: [
      {
        id: 'hum-inf-urban',
        parentUnitId: 'p-u',
        player: 'human',
        unitType: 'infantry',
        h3Index: h0,
        displayName: '1st Infantry (urban shot)',
      },
    ],
  };
  const out = validateTacticalGroupRangedTarget({
    snap,
    uniqueUnitIds: ['hum-inf-urban'],
    targetH3Index: hUrban,
    tacticalAttackerPlayer: 'human',
  });
  assert.equal(out.success, true);
});

test('validateTacticalGroupRangedTarget accepts infantry shot at road-only strikeable cell', () => {
  const res1 = tacticalRes1Cell(10, 11);
  const h0 = tacticalRes4UnderRes1Corner(10, 11);
  const hRoad = firstRingCellDistinctFrom(h0);
  const ring = [...gridDisk(h0, 2)];
  assert.ok(ring.includes(hRoad));
  const terrain: Record<string, string> = {};
  for (const h of ring) terrain[h] = 'plains';
  const n = res4GridDiskNeighborsOrdered(hRoad).length;
  const roadSides = Array.from({ length: n }, () => true);
  const railSides = Array.from({ length: n }, () => false);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-rg-transport',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: terrain,
    res4RoadSidesByH3: { [hRoad]: roadSides },
    res4RailSidesByH3: { [hRoad]: railSides },
    subUnits: [
      {
        id: 'hum-inf-road',
        parentUnitId: 'p-r',
        player: 'human',
        unitType: 'infantry',
        h3Index: h0,
        displayName: '1st Infantry (road shot)',
      },
    ],
  };
  const out = validateTacticalGroupRangedTarget({
    snap,
    uniqueUnitIds: ['hum-inf-road'],
    targetH3Index: hRoad,
    tacticalAttackerPlayer: 'human',
  });
  assert.equal(out.success, true);
});
