/**
 * Tests for composite tactical order projection. Run with: node dist/main/tacticalBattle/tacticalCompositeOrdersApply.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { projectTacticalSnapshotAfterValidatedOpponentOrders } from './tacticalCompositeOrdersApply';

test('composite apply removes one human sub-unit per opponent ranged order', () => {
  const res1 = latLngToCell(8, 9, 1);
  const h0 = latLngToCell(8.02, 9, 4);
  const ring = gridDisk(h0, 1);
  const h1 = [...ring].find((h) => h !== h0);
  assert.ok(h1);
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
        h3Index: h1!,
        displayName: '1st Infantry (01)',
      },
    ],
  };
  const next = projectTacticalSnapshotAfterValidatedOpponentOrders(snap, {
    movementOrders: [],
    rangedAttacks: [{ unitId: 'opp-nav', targetH3Index: h1! }],
  });
  assert.equal(next.subUnits.some((u) => u.id === 'hum-1'), false);
  assert.equal(next.subUnits.some((u) => u.id === 'opp-nav'), true);
});

test('composite embark assigns embarkedOnSubUnitId and syncs land hex to naval', () => {
  const res1 = latLngToCell(1, 2, 1);
  const hx = latLngToCell(1.03, 2, 4);
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
