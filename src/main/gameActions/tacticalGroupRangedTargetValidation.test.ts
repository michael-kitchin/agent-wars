/**
 * Tests for `validateTacticalGroupRangedTarget`. Run with:
 * `node dist/main/gameActions/tacticalGroupRangedTargetValidation.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, gridDistance } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { validateTacticalGroupRangedTarget } from './tacticalGroupRangedTargetValidation';
import { tacticalGridDiskNeighborsOrdered } from '../../shared/tacticalTransportLink';
import { firstRingCellDistinctFrom, tacticalParentCell, tacticalUnderCorner } from '../tacticalBattle/testSupport/tacticalHexFixtures';

test('validateTacticalGroupRangedTarget accepts opponent naval ranged to adjacent human on clear plains', () => {
  const strategic = tacticalParentCell(7, 8);
  const h0 = tacticalUnderCorner(7, 8);
  const h1 = firstRingCellDistinctFrom(h0);
  assert.ok(gridDistance(h0, h1) >= 1);
  const ring = [...gridDisk(h0, 2)];
  const terrain: Record<string, string> = {};
  for (const h of ring) {
    terrain[h] = 'plains';
  }
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-rg-accept',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: terrain,
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
  const strategic = tacticalParentCell(8, 9);
  const h0 = tacticalUnderCorner(8, 9);
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
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: terrain,
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
  const strategic = tacticalParentCell(9, 10);
  const h0 = tacticalUnderCorner(9, 10);
  const hUrban = firstRingCellDistinctFrom(h0);
  const ring = [...gridDisk(h0, 2)];
  assert.ok(ring.includes(hUrban));
  const terrain: Record<string, string> = {};
  for (const h of ring) terrain[h] = 'plains';
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-rg-infra-only',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: terrain,
    tacticalIsUrbanByH3: { [hUrban]: true },
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
  const strategic = tacticalParentCell(10, 11);
  const h0 = tacticalUnderCorner(10, 11);
  const hRoad = firstRingCellDistinctFrom(h0);
  const ring = [...gridDisk(h0, 2)];
  assert.ok(ring.includes(hRoad));
  const terrain: Record<string, string> = {};
  for (const h of ring) terrain[h] = 'plains';
  const n = tacticalGridDiskNeighborsOrdered(hRoad).length;
  const roadSides = Array.from({ length: n }, () => true);
  const railSides = Array.from({ length: n }, () => false);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-rg-transport',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: terrain,
    tacticalRoadSidesByH3: { [hRoad]: roadSides },
    tacticalRailSidesByH3: { [hRoad]: railSides },
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
