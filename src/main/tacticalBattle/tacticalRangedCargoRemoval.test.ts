/**
 * Ranged fire that destroys an air sub-unit also records its embarked infantry.
 * Run: `npm run build:main` then `node dist/main/tacticalBattle/tacticalRangedCargoRemoval.test.js`
 */

import assert from 'node:assert/strict';
import { gridDisk } from 'h3-js';
import { test } from 'node:test';
import { firstRingCellDistinctFrom, tacticalParentCell, tacticalUnderCorner } from './testSupport/tacticalHexFixtures';
import { tacticalSequencedRandom, tacticalUniformForCombatDieFace } from './testSupport/tacticalDiceFixtures';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { applyTacticalAirStrikeThenRangedPhaseOnBattle } from './tacticalStrategicOrderPhases';

test('ranged fire that destroys an air sub-unit removes its embarked infantry from the battle and the casualty list', () => {
  const strategic = tacticalParentCell(21, 22);
  const carrierCell = tacticalUnderCorner(21, 22);
  const shooterCell = firstRingCellDistinctFrom(carrierCell);
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-ranged-air-cargo',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [...gridDisk(carrierCell, 1)],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'air-1',
        parentUnitId: 'air-parent',
        player: 'human',
        unitType: 'air',
        h3Index: carrierCell,
        displayName: 'Air',
      },
      {
        id: 'air-sibling',
        parentUnitId: 'air-parent',
        player: 'human',
        unitType: 'air',
        h3Index: shooterCell,
        displayName: 'Air sibling',
      },
      {
        id: 'inf-1',
        parentUnitId: 'inf-parent',
        player: 'human',
        unitType: 'infantry',
        h3Index: carrierCell,
        displayName: 'Infantry',
        embarkedOnSubUnitId: 'air-1',
      },
      {
        id: 'inf-sibling',
        parentUnitId: 'inf-parent',
        player: 'human',
        unitType: 'infantry',
        h3Index: shooterCell,
        displayName: 'Infantry sibling',
      },
      {
        id: 'armor-1',
        parentUnitId: 'armor-parent',
        player: 'opponent',
        unitType: 'armor',
        h3Index: shooterCell,
        displayName: 'Armor',
      },
      {
        id: 'armor-sibling',
        parentUnitId: 'armor-parent',
        player: 'opponent',
        unitType: 'armor',
        h3Index: shooterCell,
        displayName: 'Armor sibling',
      },
    ],
  };
  const out = applyTacticalAirStrikeThenRangedPhaseOnBattle(
    snap,
    [],
    [{ unitId: 'armor-1', targetH3Index: carrierCell }],
    'opponent',
    tacticalSequencedRandom([
      tacticalUniformForCombatDieFace(1),
      tacticalUniformForCombatDieFace(20),
      tacticalUniformForCombatDieFace(20),
      tacticalUniformForCombatDieFace(20),
    ]),
    'singlePlayer'
  );
  assert.equal(out.battle.subUnits.some((unit) => unit.id === 'air-1'), false);
  assert.equal(out.battle.subUnits.some((unit) => unit.id === 'inf-1'), false);
  assert.equal(out.removedUnits.some((unit) => unit.id === 'air-1'), true);
  assert.equal(out.removedUnits.some((unit) => unit.id === 'inf-1'), true);
  const edges = [...out.killsByDirectFire, ...out.killsByReturnFire];
  const carrierKill = edges.find((edge) => edge.victimId === 'air-1');
  const cargoKill = edges.find((edge) => edge.victimId === 'inf-1');
  assert.ok(carrierKill);
  assert.deepEqual(cargoKill?.killerIds, carrierKill.killerIds);
  assert.equal(out.battle.subUnits.some((unit) => unit.id === 'air-sibling'), true);
  assert.equal(out.battle.subUnits.some((unit) => unit.id === 'inf-sibling'), true);
});
