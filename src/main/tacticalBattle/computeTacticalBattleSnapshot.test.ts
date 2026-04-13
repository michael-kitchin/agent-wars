import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { isInfantryOrArmorTacticalSpawnCell } from '../../shared/tacticalTerrainMovement';
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
        id: 'tb-test:human-infantry-1:01',
        parentUnitId: 'human-infantry-1',
        player: 'human',
        unitType: 'infantry',
        h3Index: '811fafffffffff',
        displayName: '1st Infantry (01)',
        embarkedOnSubUnitId: 'tb-test:opponent-naval-1:01',
      },
    ],
  };
  const revived = JSON.parse(JSON.stringify(snap)) as TacticalBattleSnapshot;
  assert.deepEqual(revived, snap);
});
