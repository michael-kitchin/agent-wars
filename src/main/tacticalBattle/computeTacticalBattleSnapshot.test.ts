import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import {
  isInfantryOrArmorTacticalSpawnCell,
  tacticalLandUnitMayOccupyCellWithoutTransport,
  type TacticalTerrainKindResolver,
} from '../../shared/tacticalTerrainMovement';
import type { InitialPlacementSide } from '../../shared/initialPlacementSides';
import {
  tacticalSnapshotHasPlacedUnitsForBothSides,
  tacticalSubUnitCountForStrategicUnitType,
  takeNextOpeningCell,
} from './computeTacticalBattleSnapshot';

test('tacticalSubUnitCountForStrategicUnitType maps known strategic types to positive tactical counts', () => {
  assert.equal(tacticalSubUnitCountForStrategicUnitType('infantry'), 8);
  assert.equal(tacticalSubUnitCountForStrategicUnitType('armor'), 4);
  assert.equal(tacticalSubUnitCountForStrategicUnitType('air'), 3);
  assert.equal(tacticalSubUnitCountForStrategicUnitType('naval'), 4);
});

test('tacticalSubUnitCountForStrategicUnitType returns zero for unknown types', () => {
  assert.equal(tacticalSubUnitCountForStrategicUnitType('unknown'), 0);
});

test('takeNextOpeningCell gives the other side a different cell and lets the same side reuse one', () => {
  const passable = () => true;
  const occupiedByHex = new Map<string, InitialPlacementSide>();
  const humanFirst = takeNextOpeningCell({
    orderedCells: ['a', 'b'],
    cellCursor: 0,
    maxCursor: 6,
    passable,
    occupiedByHex,
    placingSide: 'human',
  });
  assert.deepEqual(humanFirst, { cell: 'a', nextCursor: 1 });
  const opponentNext = takeNextOpeningCell({
    orderedCells: ['a', 'b'],
    cellCursor: 0,
    maxCursor: 6,
    passable,
    occupiedByHex,
    placingSide: 'opponent',
  });
  assert.deepEqual(opponentNext, { cell: 'b', nextCursor: 2 });
  const humanAgain = takeNextOpeningCell({
    orderedCells: ['a'],
    cellCursor: 0,
    maxCursor: 3,
    passable,
    occupiedByHex,
    placingSide: 'human',
  });
  assert.deepEqual(humanAgain, { cell: 'a', nextCursor: 1 });
  assert.equal(occupiedByHex.get('a'), 'human');
});

test('takeNextOpeningCell returns null when the only passable cell is held by the other side', () => {
  const occupiedByHex = new Map<string, InitialPlacementSide>();
  assert.deepEqual(
    takeNextOpeningCell({
      orderedCells: ['a'],
      cellCursor: 0,
      maxCursor: 3,
      passable: () => true,
      occupiedByHex,
      placingSide: 'human',
    }),
    { cell: 'a', nextCursor: 1 }
  );
  assert.equal(
    takeNextOpeningCell({
      orderedCells: ['a'],
      cellCursor: 0,
      maxCursor: 3,
      passable: () => true,
      occupiedByHex,
      placingSide: 'opponent',
    }),
    null
  );
  assert.equal(occupiedByHex.get('a'), 'human');
});

test('takeNextOpeningCell skips an impassable cell and rejects an empty list', () => {
  const occupiedByHex = new Map<string, InitialPlacementSide>();
  assert.deepEqual(
    takeNextOpeningCell({
      orderedCells: ['a', 'b'],
      cellCursor: 0,
      maxCursor: 6,
      passable: (cell: string) => cell !== 'a',
      occupiedByHex,
      placingSide: 'human',
    }),
    { cell: 'b', nextCursor: 2 }
  );
  assert.equal(
    takeNextOpeningCell({
      orderedCells: [],
      cellCursor: 0,
      maxCursor: 3,
      passable: () => true,
      occupiedByHex,
      placingSide: 'human',
    }),
    null
  );
});

test('isInfantryOrArmorTacticalSpawnCell rejects water and arctic normalized tiles', () => {
  assert.equal(
    isInfantryOrArmorTacticalSpawnCell({
      resolvedKindForCell: 'water',
      parentTerrain: 'land',
      parentTerrainKind: 'plains',
    }),
    false
  );
  assert.equal(
    isInfantryOrArmorTacticalSpawnCell({
      resolvedKindForCell: 'arctic',
      parentTerrain: 'land',
      parentTerrainKind: 'plains',
    }),
    false
  );
  assert.equal(
    isInfantryOrArmorTacticalSpawnCell({
      resolvedKindForCell: 'forest',
      parentTerrain: 'land',
      parentTerrainKind: 'plains',
    }),
    true
  );
});

/**
 * Minimal terrain resolver for occupancy tests (kind map plus optional urban/rubble).
 *
 * Purpose: Exercises `tacticalLandUnitMayOccupyCellWithoutTransport` without a full battle snapshot.
 * When to use: Snapshot placement contract tests in this file.
 * Expected outcome: `effectiveKindForTacticalHex` returns mapped kinds; urban/rubble flags match the sets.
 * Exceptions: None.
 */
function occupancyResolver(args: {
  kinds: Record<string, string>;
  urban?: ReadonlySet<string>;
  rubble?: ReadonlySet<string>;
}): TacticalTerrainKindResolver {
  return {
    parentTerrain: 'land',
    parentTerrainKind: 'plains',
    effectiveKindForTacticalHex(h3: string): string {
      return args.kinds[h3] ?? 'plains';
    },
    isUrbanTactical(h3: string): boolean {
      return args.urban?.has(h3) === true;
    },
    isRubbleTactical(h3: string): boolean {
      return args.rubble?.has(h3) === true;
    },
  };
}

test('tacticalLandUnitMayOccupyCellWithoutTransport blocks armor on wetlands and mountains', () => {
  const terrain = occupancyResolver({
    kinds: { wet: 'wetlands', mtn: 'mountain', forest: 'forest', arctic: 'arctic', water: 'water', coast: 'coastal' },
  });
  assert.equal(tacticalLandUnitMayOccupyCellWithoutTransport('armor', 'wet', terrain), false);
  assert.equal(tacticalLandUnitMayOccupyCellWithoutTransport('armor', 'mtn', terrain), false);
  assert.equal(tacticalLandUnitMayOccupyCellWithoutTransport('armor', 'arctic', terrain), false);
  assert.equal(tacticalLandUnitMayOccupyCellWithoutTransport('armor', 'water', terrain), false);
  assert.equal(tacticalLandUnitMayOccupyCellWithoutTransport('armor', 'forest', terrain), true);
  assert.equal(tacticalLandUnitMayOccupyCellWithoutTransport('armor', 'coast', terrain), true);
  assert.equal(tacticalLandUnitMayOccupyCellWithoutTransport('infantry', 'wet', terrain), true);
  assert.equal(tacticalLandUnitMayOccupyCellWithoutTransport('infantry', 'mtn', terrain), true);
  assert.equal(tacticalLandUnitMayOccupyCellWithoutTransport('infantry', 'arctic', terrain), true);
  assert.equal(tacticalLandUnitMayOccupyCellWithoutTransport('infantry', 'water', terrain), false);
});

test('tacticalLandUnitMayOccupyCellWithoutTransport allows armor on urban wetlands', () => {
  const terrain = occupancyResolver({
    kinds: { wet: 'wetlands' },
    urban: new Set(['wet']),
  });
  assert.equal(tacticalLandUnitMayOccupyCellWithoutTransport('armor', 'wet', terrain), true);
});

test('tacticalLandUnitMayOccupyCellWithoutTransport allows armor on rubble wetlands', () => {
  const terrain = occupancyResolver({
    kinds: { wet: 'wetlands' },
    rubble: new Set(['wet']),
  });
  assert.equal(tacticalLandUnitMayOccupyCellWithoutTransport('armor', 'wet', terrain), true);
});

test('tacticalSnapshotHasPlacedUnitsForBothSides requires at least one human and one opponent sub-unit', () => {
  assert.equal(tacticalSnapshotHasPlacedUnitsForBothSides([]), false);
  assert.equal(tacticalSnapshotHasPlacedUnitsForBothSides([{ player: 'human' }]), false);
  assert.equal(tacticalSnapshotHasPlacedUnitsForBothSides([{ player: 'opponent' }]), false);
  assert.equal(
    tacticalSnapshotHasPlacedUnitsForBothSides([
      { player: 'human' },
      { player: 'opponent' },
    ]),
    true
  );
});

test('TacticalBattleSnapshot round-trips through JSON for IPC-sized payloads', () => {
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-test',
    enclosingStrategicH3Index: '811fbffffffffff',
    tacticalChildH3Indexes: ['811fafffffffff', '811fbffffffffff'],
    strategicTurnNumber: 3,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'human-infantry-1:01',
        parentUnitId: 'human-infantry-1',
        player: 'human',
        unitType: 'infantry',
        h3Index: '811fafffffffff',
        displayName: '1st Infantry (01)',
        embarkedOnSubUnitId: 'opponent-naval-1:01',
      },
    ],
  };
  const revived = JSON.parse(JSON.stringify(snap)) as TacticalBattleSnapshot;
  assert.deepEqual(revived, snap);
});
