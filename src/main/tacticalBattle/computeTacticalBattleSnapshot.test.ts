import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import {
  isInfantryOrArmorTacticalSpawnCell,
  tacticalLandUnitMayOccupyCellWithoutTransport,
  type TacticalTerrainKindResolver,
} from '../../shared/tacticalTerrainMovement';
import {
  tacticalSnapshotHasPlacedUnitsForBothSides,
  tacticalSubUnitCountForStrategicUnitType,
} from './computeTacticalBattleSnapshot';

test('tacticalSubUnitCountForStrategicUnitType maps known strategic types to positive tactical counts', () => {
  assert.equal(tacticalSubUnitCountForStrategicUnitType('infantry'), 12);
  assert.equal(tacticalSubUnitCountForStrategicUnitType('armor'), 6);
  assert.equal(tacticalSubUnitCountForStrategicUnitType('air'), 3);
  assert.equal(tacticalSubUnitCountForStrategicUnitType('naval'), 2);
});

test('tacticalSubUnitCountForStrategicUnitType returns zero for unknown types', () => {
  assert.equal(tacticalSubUnitCountForStrategicUnitType('unknown'), 0);
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
 * Expected outcome: `effectiveKindForRes4Hex` returns mapped kinds; urban/rubble flags match the sets.
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
    effectiveKindForRes4Hex(h3: string): string {
      return args.kinds[h3] ?? 'plains';
    },
    isUrbanRes4(h3: string): boolean {
      return args.urban?.has(h3) === true;
    },
    isRubbleRes4(h3: string): boolean {
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
    enclosingRes1H3Index: '811fbffffffffff',
    res4ChildH3Indexes: ['811fafffffffff', '811fbffffffffff'],
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
