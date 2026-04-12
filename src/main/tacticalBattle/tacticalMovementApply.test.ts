/**
 * Tests for tactical movement projection. Run with: node dist/main/tacticalBattle/tacticalMovementApply.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { projectTacticalSnapshotAfterOpponentMovementOrders } from './tacticalMovementApply';

test('projectTacticalSnapshot moves opponent sub-unit within res4 range', () => {
  const res1 = latLngToCell(10, 20, 1);
  const center = latLngToCell(10.02, 20, 4);
  const ring = gridDisk(center, 1);
  const dest = [...ring].find((h) => h !== center);
  assert.ok(dest, 'need neighbor res4');
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-move',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [...ring],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'opp-su-1',
        parentUnitId: 'p1',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: center,
        displayName: 'I Infantry (01)',
      },
    ],
  };
  const next = projectTacticalSnapshotAfterOpponentMovementOrders(snap, [{ unitId: 'opp-su-1', toH3Index: dest }]);
  assert.equal(next.subUnits[0]!.h3Index, dest);
});

test('projectTacticalSnapshot clears embark when opponent land disembarks to another res4 hex', () => {
  const res1 = latLngToCell(11, 12, 1);
  const navalCell = latLngToCell(11.02, 12, 4);
  const ring = gridDisk(navalCell, 1);
  const landDest = [...ring].find((h) => h !== navalCell);
  assert.ok(landDest);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-dis',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [...ring],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'nav2',
        parentUnitId: 'pn',
        player: 'opponent',
        unitType: 'naval',
        h3Index: navalCell,
        displayName: 'I Fleet (02)',
      },
      {
        id: 'land2',
        parentUnitId: 'pl',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: navalCell,
        displayName: 'I Infantry (02)',
        embarkedOnSubUnitId: 'nav2',
      },
    ],
  };
  const next = projectTacticalSnapshotAfterOpponentMovementOrders(snap, [{ unitId: 'land2', toH3Index: landDest! }]);
  const land = next.subUnits.find((u) => u.id === 'land2');
  assert.equal(land?.h3Index, landDest);
  assert.ok(!land?.embarkedOnSubUnitId);
});

test('projectTacticalSnapshot moves embarked opponent land with its naval carrier', () => {
  const res1 = latLngToCell(3, 4, 1);
  const center = latLngToCell(3.02, 4, 4);
  const ring = gridDisk(center, 1);
  const dest = [...ring].find((h) => h !== center);
  assert.ok(dest);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-emb',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [...ring],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'nav-su',
        parentUnitId: 'pn',
        player: 'opponent',
        unitType: 'naval',
        h3Index: center,
        displayName: 'I Fleet (01)',
      },
      {
        id: 'land-su',
        parentUnitId: 'pl',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: center,
        displayName: 'I Infantry (01)',
        embarkedOnSubUnitId: 'nav-su',
      },
    ],
  };
  const next = projectTacticalSnapshotAfterOpponentMovementOrders(snap, [{ unitId: 'nav-su', toH3Index: dest! }]);
  const land = next.subUnits.find((u) => u.id === 'land-su');
  assert.equal(land?.h3Index, dest);
});

test('projectTacticalSnapshot ignores human-controlled sub-units', () => {
  const res1 = latLngToCell(5, 6, 1);
  const center = latLngToCell(5.01, 6, 4);
  const ring = gridDisk(center, 1);
  const dest = [...ring].find((h) => h !== center);
  assert.ok(dest);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-h',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [...ring],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'hum-su-1',
        parentUnitId: 'p2',
        player: 'human',
        unitType: 'infantry',
        h3Index: center,
        displayName: '1st Infantry (01)',
      },
    ],
  };
  const next = projectTacticalSnapshotAfterOpponentMovementOrders(snap, [{ unitId: 'hum-su-1', toH3Index: dest! }]);
  assert.equal(next.subUnits[0]!.h3Index, center);
});
