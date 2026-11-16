/**
 * Strategic attribution credits each loss to the sides whose units, actions, or hex control caused it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MissileLaunchRecord } from '../../shared/ipc/missileTypes';
import type { AirStrikeAnimationMove } from '../../shared/ipc/ordersTypes';
import type { InfrastructureDestroyedEvent, RemovedUnitSnapshot } from '../../shared/ipc/readyTypes';
import { emptyPlayerLossSummary, type LostUnit, type LostUnitType, type PlayerLossSummary, type TurnLossSummary } from '../../shared/lossSummary';
import type { CombatUnit } from '../combatUnitTypes';
import { attributeTurnLosses } from './lossAttributionCore';
import { buildStrategicLossAttributionContext, type StrategicLossAttributionInput } from './strategicLossAttribution';

const unit = (id: string, player: string, unitType: string, h3Index: string): CombatUnit => ({ id, player, unitType, h3Index });
const removed = (id: string, player: string, unitType: string, h3Index: string): RemovedUnitSnapshot => ({ id, player, unitType, h3Index });
const strike = (unitId: string, player: string, targetH3Index: string, returnsToBase: boolean): AirStrikeAnimationMove => ({
  unitId, player, unitType: 'air', fromH3Index: 'base', targetH3Index, returnsToBase,
});
const lost = (id: string, unitType: LostUnitType): LostUnit => ({ unitType, displayName: id, unitId: id });

/**
 * Builds a strategic input with every list empty, then applies overrides.
 *
 * Purpose: Each case sets only the records it uses.
 * When to use: Every test below.
 * Expected outcome: A complete input.
 * Exceptions: None.
 */
function input(overrides: Partial<StrategicLossAttributionInput>): StrategicLossAttributionInput {
  return {
    kills: [], killsByDirectFire: undefined, killsByReturnFire: undefined, removedUnits: [],
    combatUnitsBefore: [], combatUnitsAfter: [], airStrikeMoves: [], airStrikeVictimIds: [], airDropMoves: [],
    missileLaunches: [], airStrikeInfrastructureEvents: [], missileInfrastructureEvents: [], controlTransitions: [],
    baseLossUnitIds: [], controllerBeforeControlByHex: new Map(), carrierIdByCargoId: new Map(),
    ...overrides,
  };
}

/**
 * Attributes one bucket of one owner and returns the first unit's attribution.
 *
 * Purpose: Each case checks one victim.
 * When to use: Every test below.
 * Expected outcome: The attribution of the first unit in the named bucket.
 * Exceptions: None.
 */
function attribute(owner: string, cause: keyof PlayerLossSummary, victims: LostUnit[], strategic: StrategicLossAttributionInput) {
  const summary: TurnLossSummary = { byOwner: { [owner]: { ...emptyPlayerLossSummary(), [cause]: victims } } };
  return attributeTurnLosses(summary, buildStrategicLossAttributionContext(strategic)).byOwner[owner]![cause][0]!.attribution!;
}

test('a melee killer that is not in the final roster is credited by its turn-start owner', () => {
  const result = attribute('opponent', 'melee', [lost('a1-i1', 'infantry')], input({
    kills: [{ victimId: 'a1-i1', killerIds: ['h1-a1'] }],
    combatUnitsBefore: [unit('h1-a1', 'human', 'armor', 'hX')],
    removedUnits: [removed('a1-i1', 'opponent', 'infantry', 'hX')],
  }));
  assert.deepEqual(result.responsibleOwnerIds, ['human']);
  assert.deepEqual(result.killerUnits, [{ unitId: 'h1-a1', unitType: 'armor' }]);
  assert.equal(result.lossH3Index, 'hX');
});

test('a missile credits its owner for each air unit it destroyed', () => {
  const launch = { unitId: 'a2-m1', player: 'opponent2', targetH3Index: 'hT', destroyedAirUnitIds: ['a1-r1'] } as unknown as MissileLaunchRecord;
  const result = attribute('opponent', 'missileStrike', [lost('a1-r1', 'air')], input({
    missileLaunches: [launch],
    removedUnits: [removed('a1-r1', 'opponent', 'air', 'hT')],
  }));
  assert.deepEqual(result.responsibleOwnerIds, ['opponent2']);
  assert.deepEqual(result.killerUnits, [{ unitId: 'a2-m1', unitType: 'missile' }]);
});

test('an air-strike victim is credited to every other side that struck its hex', () => {
  const base = {
    airStrikeVictimIds: ['a1-t1'],
    removedUnits: [removed('a1-t1', 'opponent', 'armor', 'hT')],
  };
  const both = attribute('opponent', 'airStrike', [lost('a1-t1', 'armor')], input({
    ...base,
    airStrikeMoves: [strike('h1-r1', 'human', 'hT', true), strike('a2-r1', 'opponent2', 'hT', true), strike('a1-r9', 'opponent', 'hT', true)],
  }));
  assert.deepEqual(both.responsibleOwnerIds, ['human', 'opponent2']);
  assert.deepEqual(both.killerUnits.map((killer) => killer.unitId), ['h1-r1', 'a2-r1']);
  const none = attribute('opponent', 'airStrike', [lost('a1-t1', 'armor')], input({ ...base, airStrikeMoves: [strike('h1-r1', 'human', 'hOther', true)] }));
  assert.equal(none.responsibleOwnerIds, null);
});

test('a striker lost to anti-air fire is credited to the defenders of the target hex, or its controller', () => {
  const lostStriker = strike('a1-r1', 'opponent', 'hY', false);
  const withUnits = attribute('opponent', 'returnFire', [lost('a1-r1', 'air')], input({
    airStrikeMoves: [lostStriker],
    airStrikeVictimIds: ['a1-r1'],
    removedUnits: [removed('a1-r1', 'opponent', 'air', 'hY')],
    combatUnitsBefore: [unit('h1-t1', 'human', 'armor', 'hY'), unit('a1-t9', 'opponent', 'armor', 'hY')],
  }));
  assert.deepEqual(withUnits.responsibleOwnerIds, ['human']);
  const byController = attribute('opponent', 'returnFire', [lost('a1-r1', 'air')], input({
    airStrikeMoves: [lostStriker],
    airStrikeVictimIds: ['a1-r1'],
    removedUnits: [removed('a1-r1', 'opponent', 'air', 'hY')],
    controllerBeforeControlByHex: new Map([['hY', 'human']]),
  }));
  assert.deepEqual(byController.responsibleOwnerIds, ['human']);
  const ownController = attribute('opponent', 'returnFire', [lost('a1-r1', 'air')], input({
    airStrikeMoves: [lostStriker],
    airStrikeVictimIds: ['a1-r1'],
    removedUnits: [removed('a1-r1', 'opponent', 'air', 'hY')],
    controllerBeforeControlByHex: new Map([['hY', 'opponent']]),
  }));
  assert.equal(ownController.responsibleOwnerIds, null);
});

test('infantry lost with a shot-down drop carrier is credited like the carrier and placed at the drop target', () => {
  const drop = { unitId: 'a1-r1', player: 'opponent', targetH3Index: 'hD', returnsToBase: false };
  const summary: TurnLossSummary = {
    byOwner: { opponent: { ...emptyPlayerLossSummary(), returnFire: [lost('a1-r1', 'air')], other: [lost('a1-i1', 'infantry')] } },
  };
  const result = attributeTurnLosses(summary, buildStrategicLossAttributionContext(input({
    airDropMoves: [drop] as unknown as StrategicLossAttributionInput['airDropMoves'],
    removedUnits: [removed('a1-r1', 'opponent', 'air', 'hD'), removed('a1-i1', 'opponent', 'infantry', 'hBase')],
    combatUnitsBefore: [unit('h1-t1', 'human', 'armor', 'hD')],
    carrierIdByCargoId: new Map([['a1-i1', 'a1-r1']]),
  })));
  const cargo = result.byOwner.opponent!.other[0]!.attribution!;
  assert.deepEqual(cargo.responsibleOwnerIds, ['human']);
  assert.equal(cargo.lossH3Index, 'hD');
});

test('an air unit lost to an invalid base is credited to the side that took the hex or struck the airport, else to none', () => {
  const baseLoss = { baseLossUnitIds: ['a1-r1'], removedUnits: [removed('a1-r1', 'opponent', 'air', 'hB')] };
  const taken = attribute('opponent', 'other', [lost('a1-r1', 'air')], input({
    ...baseLoss,
    controlTransitions: [{ h3Index: 'hB', fromControllerPlayerId: 'opponent', toControllerPlayerId: 'human' }],
  }));
  assert.deepEqual(taken.responsibleOwnerIds, ['human']);
  const event = { h3Index: 'hB', targetType: 'airport' } as InfrastructureDestroyedEvent;
  const struck = attribute('opponent', 'other', [lost('a1-r1', 'air')], input({
    ...baseLoss,
    airStrikeMoves: [strike('a2-r1', 'opponent2', 'hB', true)],
    airStrikeInfrastructureEvents: [event],
  }));
  assert.deepEqual(struck.responsibleOwnerIds, ['opponent2']);
  assert.deepEqual(struck.killerUnits, [{ unitId: 'a2-r1', unitType: 'air' }]);
  const nobody = attribute('opponent', 'other', [lost('a1-r1', 'air')], input(baseLoss));
  assert.deepEqual(nobody.responsibleOwnerIds, []);
});
