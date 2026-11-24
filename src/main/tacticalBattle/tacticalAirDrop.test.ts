/**
 * Tactical air-drop landing and return fire.
 * Run: `npm run build:main` then `node dist/main/tacticalBattle/tacticalAirDrop.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { noOriginHitBonus } from '../originBonus/originHitBonusLookup';
import { noTechHitBonus } from '../techBonus/techHitBonusLookup';
import { FORTIFIED_CELL_BLOCKED_HOVER } from '../../shared/fortificationRules';
import { resolveTacticalAirDrops, tacticalAirDropRefusal, tacticalAirDropTargetRefusal } from './tacticalAirDrop';

/**
 * A two-cell battle with one air unit, its infantry, and one enemy.
 *
 * Purpose: The drop cases need a footprint and a carrier.
 * When to use: The landing and return-fire tests.
 * Expected outcome: A snapshot the resolver can read.
 * Exceptions: None.
 */
function battle(enemyType: 'infantry' | 'armor'): TacticalBattleSnapshot {
  const air: TacticalSubUnitSnapshot = {
    id: 'air-1',
    parentUnitId: 'air-1',
    player: 'human',
    unitType: 'air',
    h3Index: 'origin',
    displayName: 'Air',
  };
  const infantry: TacticalSubUnitSnapshot = {
    id: 'inf-1',
    parentUnitId: 'inf-1',
    player: 'human',
    unitType: 'infantry',
    h3Index: 'origin',
    displayName: 'Infantry',
    embarkedOnSubUnitId: 'air-1',
  };
  const enemy: TacticalSubUnitSnapshot = {
    id: 'enemy-1',
    parentUnitId: 'enemy-1',
    player: 'opponent',
    unitType: enemyType,
    h3Index: 'target',
    displayName: 'Enemy',
  };
  return {
    battleId: 'drop-test',
    tacticalChildH3Indexes: ['origin', 'target'],
    subUnits: [air, infantry, enemy],
    tacticalTerrainKindByH3: { origin: 'plains', target: 'plains' },
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
  } as unknown as TacticalBattleSnapshot;
}

test('a miss lands the infantry and leaves the air unit on its cell', () => {
  const result = resolveTacticalAirDrops({
    battle: battle('infantry'),
    orders: [{ unitId: 'air-1', targetH3Index: 'target' }],
    strikeUnitIds: new Set(),
    rollDie: () => 100,
    onRoll: () => undefined,
    originHitBonusAt: noOriginHitBonus,
    techHitBonusAt: noTechHitBonus,
  });
  const infantry = result.subUnits.find((unit) => unit.id === 'inf-1');
  const air = result.subUnits.find((unit) => unit.id === 'air-1');
  assert.equal(infantry?.h3Index, 'target');
  assert.equal(infantry?.embarkedOnSubUnitId, null);
  assert.equal(air?.h3Index, 'origin');
  assert.equal(result.moves[0]?.returnsToBase, true);
  assert.deepEqual(result.moves[0]?.infantryUnitIds, ['inf-1']);
  assert.equal(result.removedUnits.length, 0);
});

test('a fortified cell is refused, and missing cargo is still the cargo sentence', () => {
  const fortified = battle('infantry');
  fortified.tacticalFortificationOwnerByH3 = { target: 'opponent' };
  assert.equal(tacticalAirDropRefusal(fortified, 'air-1', 'target'), FORTIFIED_CELL_BLOCKED_HOVER);
  const empty = {
    ...fortified,
    subUnits: fortified.subUnits.filter((unit) => unit.id !== 'inf-1'),
  };
  assert.equal(tacticalAirDropRefusal(empty, 'air-1', 'target'), 'Air drop needs infantry aboard.');
  assert.equal(
    tacticalAirDropTargetRefusal(empty, { player: 'human', h3Index: 'origin' }, 'target'),
    FORTIFIED_CELL_BLOCKED_HOVER
  );
});

test('return fire removes the air unit and the infantry', () => {
  const result = resolveTacticalAirDrops({
    battle: battle('infantry'),
    orders: [{ unitId: 'air-1', targetH3Index: 'target' }],
    strikeUnitIds: new Set(),
    rollDie: () => 1,
    onRoll: () => undefined,
    originHitBonusAt: noOriginHitBonus,
    techHitBonusAt: noTechHitBonus,
  });
  assert.equal(result.subUnits.some((unit) => unit.id === 'air-1' || unit.id === 'inf-1'), false);
  assert.equal(result.moves[0]?.returnsToBase, false);
  assert.equal(result.moves[0]?.infantryUnitIds, undefined);
});

/**
 * The drop battle with a second infantry sub-unit aboard the air unit.
 *
 * Purpose: The two-infantry cases need cargo beyond the one-unit default.
 * When to use: The landing and return-fire cases for two infantry.
 * Expected outcome: `inf-2` is embarked on `air-1`. Capacity is not checked here.
 * Exceptions: None.
 */
function battleWithTwoInfantry(enemyType: 'infantry' | 'armor'): TacticalBattleSnapshot {
  const base = battle(enemyType);
  const second: TacticalSubUnitSnapshot = {
    id: 'inf-2',
    parentUnitId: 'inf-2',
    player: 'human',
    unitType: 'infantry',
    h3Index: 'origin',
    displayName: 'Infantry',
    embarkedOnSubUnitId: 'air-1',
  };
  return { ...base, subUnits: [...base.subUnits, second] };
}

test('a battle drop lands every infantry sub-unit aboard', () => {
  const result = resolveTacticalAirDrops({
    battle: battleWithTwoInfantry('infantry'),
    orders: [{ unitId: 'air-1', targetH3Index: 'target' }],
    strikeUnitIds: new Set(),
    rollDie: () => 100,
    onRoll: () => undefined,
    originHitBonusAt: noOriginHitBonus,
    techHitBonusAt: noTechHitBonus,
  });
  for (const id of ['inf-1', 'inf-2']) {
    const unit = result.subUnits.find((row) => row.id === id);
    assert.equal(unit?.h3Index, 'target');
    assert.equal(unit?.embarkedOnSubUnitId, null);
  }
  assert.deepEqual(result.moves[0]?.infantryUnitIds, ['inf-1', 'inf-2']);
});

test('a shot-down battle drop loses every infantry sub-unit aboard', () => {
  const result = resolveTacticalAirDrops({
    battle: battleWithTwoInfantry('infantry'),
    orders: [{ unitId: 'air-1', targetH3Index: 'target' }],
    strikeUnitIds: new Set(),
    rollDie: () => 1,
    onRoll: () => undefined,
    originHitBonusAt: noOriginHitBonus,
    techHitBonusAt: noTechHitBonus,
  });
  assert.equal(result.subUnits.some((unit) => ['air-1', 'inf-1', 'inf-2'].includes(unit.id)), false);
});

test('a battle drop with no infantry aboard needs infantry aboard', () => {
  const empty = battle('infantry');
  const bare = { ...empty, subUnits: empty.subUnits.filter((unit) => unit.id !== 'inf-1') };
  assert.equal(tacticalAirDropRefusal(bare, 'air-1', 'target'), 'Air drop needs infantry aboard.');
});
