/**
 * Tests for tactical movement projection. Run with: node dist/main/tacticalBattle/tacticalMovementApply.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import {
  projectTacticalSnapshotAfterHumanMovementOrders,
  projectTacticalSnapshotAfterOpponentMovementOrders,
} from './tacticalMovementApply';
import {
  firstRingCellDistinctFrom,
  tacticalRes1Cell,
  tacticalRes4UnderRes1Corner,
} from './testSupport/tacticalRes4HexFixtures';

test('projectTacticalSnapshot moves opponent sub-unit within res4 range', () => {
  const res1 = tacticalRes1Cell(10, 20);
  const center = tacticalRes4UnderRes1Corner(10, 20);
  const ring = gridDisk(center, 1);
  const dest = firstRingCellDistinctFrom(center);
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
  const res1 = tacticalRes1Cell(11, 12);
  const navalCell = tacticalRes4UnderRes1Corner(11, 12);
  const ring = gridDisk(navalCell, 1);
  const landDest = firstRingCellDistinctFrom(navalCell);
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
  const next = projectTacticalSnapshotAfterOpponentMovementOrders(snap, [{ unitId: 'land2', toH3Index: landDest }]);
  const land = next.subUnits.find((u) => u.id === 'land2');
  assert.equal(land?.h3Index, landDest);
  assert.ok(!land?.embarkedOnSubUnitId);
});

test('projectTacticalSnapshot moves embarked opponent land with its naval carrier', () => {
  const res1 = tacticalRes1Cell(3, 4);
  const center = tacticalRes4UnderRes1Corner(3, 4);
  const ring = gridDisk(center, 1);
  const dest = firstRingCellDistinctFrom(center);
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
  const next = projectTacticalSnapshotAfterOpponentMovementOrders(snap, [{ unitId: 'nav-su', toH3Index: dest }]);
  const land = next.subUnits.find((u) => u.id === 'land-su');
  assert.equal(land?.h3Index, dest);
});

test('projectTacticalSnapshot ignores human-controlled sub-units', () => {
  const res1 = tacticalRes1Cell(5, 6);
  const center = tacticalRes4UnderRes1Corner(5, 6, { latEpsilon: 0.01 });
  const ring = gridDisk(center, 1);
  const dest = firstRingCellDistinctFrom(center);
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
  const next = projectTacticalSnapshotAfterOpponentMovementOrders(snap, [{ unitId: 'hum-su-1', toH3Index: dest }]);
  assert.equal(next.subUnits[0]!.h3Index, center);
});

test('projectTacticalSnapshotAfterHumanMovementOrders moves human sub-unit along multi-step res4 path beyond one-turn range', () => {
  const res1 = tacticalRes1Cell(20, 30);
  const center = tacticalRes4UnderRes1Corner(20, 30);
  const disk = [...gridDisk(center, 3)];
  const ring1 = new Set(gridDisk(center, 1));
  const far = disk.find((h) => h !== center && !ring1.has(h));
  assert.ok(far);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-hum-far',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: disk,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'hum-su-far',
        parentUnitId: 'ph',
        player: 'human',
        unitType: 'infantry',
        h3Index: center,
        displayName: '1st Infantry (far)',
      },
    ],
  };
  const next = projectTacticalSnapshotAfterHumanMovementOrders(snap, [{ unitId: 'hum-su-far', toH3Index: far! }]);
  assert.equal(next.subUnits[0]!.h3Index, far);
});

test('projectTacticalSnapshotAfterHumanMovementOrders moves human sub-unit within res4 range', () => {
  const res1 = tacticalRes1Cell(8, 9);
  const center = tacticalRes4UnderRes1Corner(8, 9);
  const ring = gridDisk(center, 1);
  const dest = firstRingCellDistinctFrom(center);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-hum-move',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [...ring],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'hum-su-move',
        parentUnitId: 'ph',
        player: 'human',
        unitType: 'infantry',
        h3Index: center,
        displayName: '1st Infantry (mv)',
      },
    ],
  };
  const next = projectTacticalSnapshotAfterHumanMovementOrders(snap, [{ unitId: 'hum-su-move', toH3Index: dest }]);
  assert.equal(next.subUnits[0]!.h3Index, dest);
});
