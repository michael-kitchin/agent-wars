/**
 * Tests for composite tactical order projection. Run with: node dist/main/tacticalBattle/tacticalCompositeOrdersApply.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import {
  projectTacticalSnapshotAfterValidatedHumanSupportOrders,
  projectTacticalSnapshotAfterValidatedOpponentOrders,
} from './tacticalCompositeOrdersApply';
import { tacticalParentCell, tacticalUnderCorner } from './testSupport/tacticalHexFixtures';
import { dbRun } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';

test('composite apply strips naval ranged orders when implicit LOS crosses mountain res4', () => {
  const strategic = tacticalParentCell(8, 9);
  const h0 = tacticalUnderCorner(8, 9);
  const ring = [...gridDisk(h0, 2)];
  const inner = new Set(gridDisk(h0, 1));
  const hFar = ring.find((h) => !inner.has(h));
  if (!hFar) {
    throw new Error('expected annulus cell in disk(h0,2) outside disk(h0,1)');
  }
  const terrain: Record<string, string> = {};
  for (const h of ring) {
    terrain[h] = 'mountain';
  }
  const navalCount = 3;
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-r-mtn',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: terrain,
    subUnits: [
      ...Array.from({ length: navalCount }, (_, i) => ({
        id: `opp-nm${i}`,
        parentUnitId: `pnm${i}`,
        player: 'opponent' as const,
        unitType: 'naval' as const,
        h3Index: h0,
        displayName: `Fleet ${i + 1} (01)`,
      })),
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
  const next = projectTacticalSnapshotAfterValidatedOpponentOrders(snap, {
    movementOrders: [],
    rangedAttacks: Array.from({ length: navalCount }, (_, i) => ({
      unitId: `opp-nm${i}`,
      targetH3Index: hFar,
    })),
  });
  assert.equal(next.subUnits.some((u) => u.id === 'hum-m1'), true);
});

test('composite apply removes one human sub-unit per opponent ranged order', () => {
  const strategic = tacticalParentCell(8, 9);
  const h0 = tacticalUnderCorner(8, 9);
  const ring = [...gridDisk(h0, 2)];
  const inner = new Set(gridDisk(h0, 1));
  const hFar = ring.find((h) => !inner.has(h));
  if (!hFar) {
    throw new Error('expected annulus cell in disk(h0,2) outside disk(h0,1)');
  }
  const navalCount = 15;
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-r',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      ...Array.from({ length: navalCount }, (_, i) => ({
        id: `opp-n${i}`,
        parentUnitId: `pn${i}`,
        player: 'opponent' as const,
        unitType: 'naval' as const,
        h3Index: h0,
        displayName: `Fleet ${i + 1} (01)`,
      })),
      {
        id: 'hum-1',
        parentUnitId: 'ph',
        player: 'human',
        unitType: 'infantry',
        h3Index: hFar,
        displayName: '1st Infantry (01)',
      },
    ],
  };
  const next = projectTacticalSnapshotAfterValidatedOpponentOrders(snap, {
    movementOrders: [],
    rangedAttacks: Array.from({ length: navalCount }, (_, i) => ({
      unitId: `opp-n${i}`,
      targetH3Index: hFar,
    })),
  });
  assert.equal(next.subUnits.some((u) => u.id === 'hum-1'), false);
  assert.equal(next.subUnits.some((u) => u.id === 'opp-n0'), true);
});

test('composite embark assigns embarkedOnSubUnitId and syncs land hex to naval', () => {
  const strategic = tacticalParentCell(1, 2);
  const hx = tacticalUnderCorner(1, 2, { latEpsilon: 0.03 });
  const ring = gridDisk(hx, 1);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-e',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [...ring],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'nav',
        parentUnitId: 'n1',
        player: 'opponent',
        unitType: 'naval',
        h3Index: hx,
        displayName: 'II Fleet (01)',
      },
      {
        id: 'land',
        parentUnitId: 'l1',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: hx,
        displayName: 'II Infantry (01)',
      },
    ],
  };
  const next = projectTacticalSnapshotAfterValidatedOpponentOrders(snap, {
    movementOrders: [],
    embarkOrders: [{ unitId: 'land', navalUnitId: 'nav' }],
  });
  const land = next.subUnits.find((u) => u.id === 'land');
  assert.equal(land?.embarkedOnSubUnitId, 'nav');
  assert.equal(land?.h3Index, hx);
});

test('human support separates ranged kill edges from air strike kill edges', () => {
  withTempGameDb('aw-tac-composite-human-', () => {
  const strategic = tacticalParentCell(5, 6);
  const h0 = tacticalUnderCorner(5, 6);
  const ring = [...gridDisk(h0, 1)];
  const h1 = ring.find((h) => h !== h0);
  const h2 = ring.find((h) => h !== h0 && h !== h1);
  if (!h1 || !h2) {
    throw new Error('expected two distinct ring neighbors');
  }
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-hsplit',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'hum-air',
        parentUnitId: 'human-air-1',
        player: 'human',
        unitType: 'air',
        h3Index: h0,
        displayName: '1st Squadron (01)',
      },
      {
        id: 'hum-inf',
        parentUnitId: 'human-infantry-1',
        player: 'human',
        unitType: 'infantry',
        h3Index: h2,
        displayName: '1st Infantry (01)',
      },
      {
        id: 'hum-inf-b',
        parentUnitId: 'human-infantry-2',
        player: 'human',
        unitType: 'infantry',
        h3Index: h1,
        displayName: '2nd Infantry (01)',
      },
      {
        id: 'op1',
        parentUnitId: 'opponent-infantry-1',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: h1,
        displayName: 'I Infantry (01)',
      },
      {
        id: 'op2',
        parentUnitId: 'opponent-infantry-2',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: h2,
        displayName: 'II Infantry (01)',
      },
    ],
  };
  const rangedAttacks = [
    { unitId: 'hum-inf', targetH3Index: h2 },
    { unitId: 'hum-inf-b', targetH3Index: h2 },
  ];
  const airStrikes = [{ unitId: 'hum-air', targetH3Index: h1, targetType: 'units' as const }];
  let out = projectTacticalSnapshotAfterValidatedHumanSupportOrders(snap, { airStrikes, rangedAttacks });
  let ok =
    out.killsByAirStrike.some((k) => k.killerIds[0] === 'hum-air' && k.victimId === 'op1') &&
    out.killsByDirectFire.some((k) => k.killerIds[0] === 'hum-inf' && k.victimId === 'op2');
  for (let seed = 0; !ok && seed < 400; seed++) {
    dbRun(`UPDATE game_config SET value = ? WHERE key = 'game_seed'`, [String(seed)]);
    out = projectTacticalSnapshotAfterValidatedHumanSupportOrders(snap, { airStrikes, rangedAttacks });
    ok =
      out.killsByAirStrike.some((k) => k.killerIds[0] === 'hum-air' && k.victimId === 'op1') &&
      out.killsByDirectFire.some((k) => k.killerIds[0] === 'hum-inf' && k.victimId === 'op2');
  }
  assert.equal(ok, true, 'expected some game_seed to yield air hit on op1 and ranged kills on op2');
  });
});
