/**
 * Tests for tactical movement projection. Run with: node dist/main/tacticalBattle/tacticalMovementApply.test.js
 */

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import {
  projectTacticalSnapshotAfterHumanMovementOrders,
  projectTacticalSnapshotAfterOpponentMovementOrders,
} from './tacticalMovementApply';
import { tacticalComputeHumanMovementOrderOutcome, tacticalComputeMovementOrderOutcome } from './tacticalSnapshotGuards';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { resetTacticalMovementPlanningCacheForTests } from './tacticalMovementPlanningCache';
import {
  firstRingCellDistinctFrom,
  tacticalParentCell,
  tacticalUnderCorner,
} from './testSupport/tacticalHexFixtures';

beforeEach(() => {
  resetTacticalMovementPlanningCacheForTests();
});

/**
 * Supplies §12.4 terrain so ring-based fixtures are passable for infantry and naval without SQLite.
 *
 * Purpose: Marks every footprint cell `coastal` so land and naval sub-units share a littoral test neighborhood.
 * When to use: Tactical movement projection tests that synthesize `tacticalChildH3Indexes` from `gridDisk` alone.
 * Expected outcome: `strategicHexTerrain` / `tacticalTerrainKindByH3` populated for `planTacticalMarch` consumers.
 * Exceptions: None.
 */
function coastalFootprintTerrain(ringCells: readonly string[]): Pick<
  TacticalBattleSnapshot,
  'strategicHexTerrain' | 'strategicHexTerrainKind' | 'tacticalTerrainKindByH3'
> {
  const tacticalTerrainKindByH3: Record<string, string> = {};
  for (const h of ringCells) {
    tacticalTerrainKindByH3[h] = 'coastal';
  }
  return {
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'coastal',
    tacticalTerrainKindByH3,
  };
}

test('projectTacticalSnapshot moves opponent sub-unit within res4 range', () => {
  const strategic = tacticalParentCell(10, 20);
  const center = tacticalUnderCorner(10, 20);
  const ring = gridDisk(center, 1);
  const dest = firstRingCellDistinctFrom(center);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-move',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [...ring],
    ...coastalFootprintTerrain([...ring]),
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

test('projectTacticalSnapshot auto-debarks embarked opponent land on independent march', () => {
  const strategic = tacticalParentCell(11, 12);
  const navalCell = tacticalUnderCorner(11, 12);
  const ring = gridDisk(navalCell, 1);
  const landDest = firstRingCellDistinctFrom(navalCell);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-dis',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [...ring],
    ...coastalFootprintTerrain([...ring]),
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
  assert.equal(land?.embarkedOnSubUnitId, undefined);
});

test('projectTacticalSnapshot moves embarked opponent land with its naval carrier', () => {
  const strategic = tacticalParentCell(3, 4);
  const center = tacticalUnderCorner(3, 4);
  const ring = gridDisk(center, 1);
  const dest = firstRingCellDistinctFrom(center);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-emb',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [...ring],
    ...coastalFootprintTerrain([...ring]),
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
  const strategic = tacticalParentCell(5, 6);
  const center = tacticalUnderCorner(5, 6, { latEpsilon: 0.01 });
  const ring = gridDisk(center, 1);
  const dest = firstRingCellDistinctFrom(center);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-h',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [...ring],
    ...coastalFootprintTerrain([...ring]),
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
  const strategic = tacticalParentCell(20, 30);
  const center = tacticalUnderCorner(20, 30);
  const disk = [...gridDisk(center, 3)];
  const ring1 = new Set(gridDisk(center, 1));
  const far = disk.find((h) => h !== center && !ring1.has(h));
  assert.ok(far);
  const tacticalTerrainKindByH3: Record<string, string> = {};
  for (const h of disk) {
    tacticalTerrainKindByH3[h] = 'plains';
  }
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-hum-far',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: disk,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3,
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
  const strategic = tacticalParentCell(8, 9);
  const center = tacticalUnderCorner(8, 9);
  const ring = gridDisk(center, 1);
  const dest = firstRingCellDistinctFrom(center);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-hum-move',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [...ring],
    ...coastalFootprintTerrain([...ring]),
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

test('projectTacticalSnapshotAfterHumanMovementOrders does not independently move embarked cargo', () => {
  const strategic = tacticalParentCell(14, 15);
  const navalCell = tacticalUnderCorner(14, 15);
  const ring = gridDisk(navalCell, 1);
  const landDest = firstRingCellDistinctFrom(navalCell);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-hum-emb-cargo',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [...ring],
    ...coastalFootprintTerrain([...ring]),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'hum-nav',
        parentUnitId: 'pn',
        player: 'human',
        unitType: 'naval',
        h3Index: navalCell,
        displayName: '1st Fleet (emb)',
      },
      {
        id: 'hum-land',
        parentUnitId: 'pl',
        player: 'human',
        unitType: 'infantry',
        h3Index: navalCell,
        displayName: '1st Infantry (emb)',
        embarkedOnSubUnitId: 'hum-nav',
      },
    ],
  };
  const next = projectTacticalSnapshotAfterHumanMovementOrders(snap, [
    { unitId: 'hum-land', toH3Index: landDest },
  ]);
  const land = next.subUnits.find((u) => u.id === 'hum-land');
  assert.equal(land?.h3Index, navalCell);
  assert.equal(land?.embarkedOnSubUnitId, 'hum-nav');
});

test('projectTacticalSnapshotAfterHumanMovementOrders ignores opponent-controlled sub-units', () => {
  const strategic = tacticalParentCell(16, 17);
  const center = tacticalUnderCorner(16, 17);
  const ring = gridDisk(center, 1);
  const dest = firstRingCellDistinctFrom(center);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-hum-ign-opp',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [...ring],
    ...coastalFootprintTerrain([...ring]),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'opp-su-ign',
        parentUnitId: 'po',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: center,
        displayName: 'I Infantry (ign)',
      },
    ],
  };
  const next = projectTacticalSnapshotAfterHumanMovementOrders(snap, [
    { unitId: 'opp-su-ign', toH3Index: dest },
  ]);
  assert.equal(next.subUnits[0]!.h3Index, center);
});

/**
 * Builds a land infantry row for stacking projection tests.
 *
 * Purpose: Keeps stacking fixtures readable without repeating snapshot field lists.
 * When to use: Stacking tests in this file only.
 * Expected outcome: Unembarked infantry at `h3Index`.
 * Exceptions: None.
 */
function landInfantry(id: string, player: TacticalSubUnitSnapshot['player'], h3Index: string): TacticalSubUnitSnapshot {
  return {
    id,
    parentUnitId: `p-${id}`,
    player,
    unitType: 'infantry',
    h3Index,
    displayName: id,
  };
}

test('projectTacticalSnapshotAfterHumanMovementOrders lets two units stack on the same empty dest', () => {
  const strategic = tacticalParentCell(18, 19);
  const center = tacticalUnderCorner(18, 19);
  const ring = [...gridDisk(center, 1)];
  const dest = firstRingCellDistinctFrom(center);
  const originB = ring.find((h) => h !== center && h !== dest);
  assert.ok(originB);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-hum-stack-empty',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: ring,
    ...coastalFootprintTerrain(ring),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [landInfantry('hum-a', 'human', center), landInfantry('hum-b', 'human', originB)],
  };
  const next = projectTacticalSnapshotAfterHumanMovementOrders(snap, [
    { unitId: 'hum-a', toH3Index: dest },
    { unitId: 'hum-b', toH3Index: dest },
  ]);
  assert.equal(next.subUnits.find((u) => u.id === 'hum-a')?.h3Index, dest);
  assert.equal(next.subUnits.find((u) => u.id === 'hum-b')?.h3Index, dest);
});

test('projectTacticalSnapshotAfterHumanMovementOrders lets a unit stack onto a hex another friendly already occupies', () => {
  const strategic = tacticalParentCell(21, 22);
  const occupied = tacticalUnderCorner(21, 22);
  const ring = [...gridDisk(occupied, 1)];
  const origin = firstRingCellDistinctFrom(occupied);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-hum-stack-occupied',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: ring,
    ...coastalFootprintTerrain(ring),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [landInfantry('hum-stay', 'human', occupied), landInfantry('hum-join', 'human', origin)],
  };
  const next = projectTacticalSnapshotAfterHumanMovementOrders(snap, [
    { unitId: 'hum-join', toH3Index: occupied },
  ]);
  assert.equal(next.subUnits.find((u) => u.id === 'hum-stay')?.h3Index, occupied);
  assert.equal(next.subUnits.find((u) => u.id === 'hum-join')?.h3Index, occupied);
});

test('projectTacticalSnapshotAfterOpponentMovementOrders lets two units stack on the same empty dest', () => {
  const strategic = tacticalParentCell(23, 24);
  const center = tacticalUnderCorner(23, 24);
  const ring = [...gridDisk(center, 1)];
  const dest = firstRingCellDistinctFrom(center);
  const originB = ring.find((h) => h !== center && h !== dest);
  assert.ok(originB);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-opp-stack-empty',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: ring,
    ...coastalFootprintTerrain(ring),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [landInfantry('opp-a', 'opponent', center), landInfantry('opp-b', 'opponent', originB)],
  };
  const next = projectTacticalSnapshotAfterOpponentMovementOrders(snap, [
    { unitId: 'opp-a', toH3Index: dest },
    { unitId: 'opp-b', toH3Index: dest },
  ]);
  assert.equal(next.subUnits.find((u) => u.id === 'opp-a')?.h3Index, dest);
  assert.equal(next.subUnits.find((u) => u.id === 'opp-b')?.h3Index, dest);
});

test('an attacker march onto a defender fortified cell is blocked', () => {
  const strategic = tacticalParentCell(15, 23);
  const center = tacticalUnderCorner(15, 23);
  const ring = gridDisk(center, 1);
  const dest = firstRingCellDistinctFrom(center);
  const attacker: TacticalSubUnitSnapshot = {
    id: 'opp-fort-su',
    parentUnitId: 'p-fort',
    player: 'opponent',
    unitType: 'infantry',
    h3Index: center,
    displayName: 'I Infantry (01)',
  };
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-fort-block',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [...ring],
    ...coastalFootprintTerrain([...ring]),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [attacker],
    tacticalFortificationOwnerByH3: { [dest]: HUMAN_SEAT_ID },
  };
  const outcome = tacticalComputeMovementOrderOutcome({
    byId: new Map([[attacker.id, 0]]),
    sub: snap.subUnits,
    order: { unitId: attacker.id, toH3Index: dest },
    tacticalSet: new Set(snap.tacticalChildH3Indexes),
    battle: snap,
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, 'fortified_cell');
});

test('a missile sub-unit cannot march', () => {
  const strategic = tacticalParentCell(14, 22);
  const center = tacticalUnderCorner(14, 22);
  const ring = gridDisk(center, 1);
  const dest = firstRingCellDistinctFrom(center);
  const missile = {
    id: 'missile-su',
    parentUnitId: 'parent-missile',
    player: HUMAN_SEAT_ID,
    unitType: 'missile' as const,
    h3Index: center,
    displayName: 'M Missile (01)',
  };
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-missile-march',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [...ring],
    ...coastalFootprintTerrain([...ring]),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [missile],
  };
  const outcome = tacticalComputeHumanMovementOrderOutcome({
    byId: new Map([[missile.id, 0]]),
    sub: snap.subUnits,
    order: { unitId: missile.id, toH3Index: dest },
    tacticalSet: new Set(snap.tacticalChildH3Indexes),
    battle: snap,
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, 'missile_no_march');
  const next = projectTacticalSnapshotAfterHumanMovementOrders(snap, [{ unitId: missile.id, toH3Index: dest }]);
  assert.equal(next.subUnits[0]!.h3Index, center);
});
