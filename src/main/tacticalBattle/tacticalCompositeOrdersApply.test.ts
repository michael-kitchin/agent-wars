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
import {
  firstRingCellDistinctFrom,
  tacticalRes1Cell,
  tacticalRes4UnderRes1Corner,
} from './testSupport/tacticalRes4HexFixtures';

test('composite apply removes one human sub-unit per opponent ranged order', () => {
  const res1 = tacticalRes1Cell(8, 9);
  const h0 = tacticalRes4UnderRes1Corner(8, 9);
  const ring = gridDisk(h0, 1);
  const h1 = firstRingCellDistinctFrom(h0);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-r',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [...ring],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'opp-nav',
        parentUnitId: 'pn',
        player: 'opponent',
        unitType: 'naval',
        h3Index: h0,
        displayName: 'I Fleet (01)',
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
  const next = projectTacticalSnapshotAfterValidatedOpponentOrders(snap, {
    movementOrders: [],
    rangedAttacks: [{ unitId: 'opp-nav', targetH3Index: h1 }],
  });
  assert.equal(next.subUnits.some((u) => u.id === 'hum-1'), false);
  assert.equal(next.subUnits.some((u) => u.id === 'opp-nav'), true);
});

test('composite embark assigns embarkedOnSubUnitId and syncs land hex to naval', () => {
  const res1 = tacticalRes1Cell(1, 2);
  const hx = tacticalRes4UnderRes1Corner(1, 2, { latEpsilon: 0.03 });
  const ring = gridDisk(hx, 1);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-e',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [...ring],
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
  const res1 = tacticalRes1Cell(5, 6);
  const h0 = tacticalRes4UnderRes1Corner(5, 6);
  const ring = [...gridDisk(h0, 1)];
  const h1 = ring.find((h) => h !== h0);
  const h2 = ring.find((h) => h !== h0 && h !== h1);
  if (!h1 || !h2) {
    throw new Error('expected two distinct ring neighbors');
  }
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-hsplit',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: ring,
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
  const out = projectTacticalSnapshotAfterValidatedHumanSupportOrders(snap, {
    airStrikes: [{ unitId: 'hum-air', targetH3Index: h1, targetType: 'units' }],
    rangedAttacks: [{ unitId: 'hum-inf', targetH3Index: h2 }],
  });
  assert.equal(
    out.killsByAirStrike.some((k) => k.killerIds[0] === 'hum-air' && k.victimId === 'op1'),
    true
  );
  assert.equal(
    out.killsByDirectFire.some((k) => k.killerIds[0] === 'hum-inf' && k.victimId === 'op2'),
    true
  );
});
