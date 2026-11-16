/**
 * Tactical attribution credits each loss in a battle beat and files strikers consistently for every owner.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AirStrikeAnimationMove } from '../../shared/ipc/ordersTypes';
import type { RemovedUnitSnapshot } from '../../shared/ipc/readyTypes';
import { buildTurnLossSummary } from '../../shared/lossSummaryFromResolution';
import { attributeTurnLosses } from './lossAttributionCore';
import {
  buildTacticalLossAttributionContext,
  lossNoteAirStrikeRemovedUnits,
  type TacticalLossAttributionInput,
  type TacticalSubUnitFact,
} from './tacticalLossAttribution';

const removed = (id: string, player: string, unitType: string, h3Index: string): RemovedUnitSnapshot => ({ id, player, unitType, h3Index });
const fact = (id: string, player: string, unitType: string, embarkedOnSubUnitId?: string): TacticalSubUnitFact => ({ id, player, unitType, embarkedOnSubUnitId });
const strike = (unitId: string, player: string, targetH3Index: string, returnsToBase: boolean): AirStrikeAnimationMove => ({
  unitId, player, unitType: 'air', fromH3Index: 'base', targetH3Index, returnsToBase,
});

/**
 * Builds a tactical input with every list empty, then applies overrides.
 *
 * Purpose: Each case sets only the records it uses.
 * When to use: Every test below.
 * Expected outcome: A complete input.
 * Exceptions: None.
 */
function input(overrides: Partial<TacticalLossAttributionInput>): TacticalLossAttributionInput {
  return {
    killsByDirectFire: [], killsByReturnFire: [], killsByMelee: [], killsByAirStrike: [], removedUnits: [],
    subUnitsBeforeFerry: [], subUnitsAfter: [], airStrikeMoves: [], airDropMoves: [], ...overrides,
  };
}

/**
 * Builds the summary a note would hold and attributes it.
 *
 * Purpose: The cases check the final attribution, including how causes are filed.
 * When to use: Every test below.
 * Expected outcome: The attributed summary.
 * Exceptions: None.
 */
function run(tactical: TacticalLossAttributionInput) {
  const airStrikeRemovedUnits = lossNoteAirStrikeRemovedUnits({
    removedUnits: tactical.removedUnits,
    killsByAirStrike: tactical.killsByAirStrike,
    killsByDirectFire: tactical.killsByDirectFire,
    airStrikeMoves: tactical.airStrikeMoves,
  });
  const meta = new Map(tactical.removedUnits.map((unit) => [unit.id, { player: unit.player, unitType: unit.unitType }]));
  const built = buildTurnLossSummary({
    killsByDirectFire: tactical.killsByDirectFire,
    killsByReturnFire: tactical.killsByReturnFire,
    killsByMelee: tactical.killsByMelee,
    killsByAirStrike: tactical.killsByAirStrike,
    removedUnits: tactical.removedUnits,
    airStrikeRemovedUnits,
    airStrikeAttackerLossUnitIds: tactical.airStrikeMoves.filter((move) => !move.returnsToBase).map((move) => move.unitId),
    resolveDisplayName: (id) => id,
    resolveUnitMeta: (id) => meta.get(id),
  });
  return attributeTurnLosses(built, buildTacticalLossAttributionContext(tactical));
}

test('a striker lost to anti-air fire is credited to the defender and placed at its target', () => {
  const result = run(input({
    killsByReturnFire: [{ victimId: 'a1-s1', killerIds: ['h1-t1-s1'] }],
    removedUnits: [removed('a1-s1', 'opponent', 'air', 'baseCell')],
    subUnitsAfter: [fact('h1-t1-s1', 'human', 'armor')],
    airStrikeMoves: [strike('a1-s1', 'opponent', 'targetCell', false)],
  }));
  const attribution = result.byOwner.opponent!.returnFire[0]!.attribution!;
  assert.deepEqual(attribution.responsibleOwnerIds, ['human']);
  assert.equal(attribution.lossH3Index, 'targetCell');
});

test('a striker lost to infrastructure counter-fire is filed as return fire and credited to the other side', () => {
  const result = run(input({
    removedUnits: [removed('a1-s1', 'opponent', 'air', 'baseCell')],
    subUnitsAfter: [fact('h1-t1-s1', 'human', 'armor')],
    airStrikeMoves: [strike('a1-s1', 'opponent', 'targetCell', false)],
  }));
  assert.equal(result.byOwner.opponent!.returnFire.length, 1);
  assert.deepEqual(result.byOwner.opponent!.returnFire[0]!.attribution!.responsibleOwnerIds, ['human']);
});

test('a human air unit lost on a failed ferry is not an air-strike loss and has no side responsible', () => {
  const tactical = input({ removedUnits: [removed('h1-s1', 'human', 'air', 'cellF')], subUnitsAfter: [fact('a1-t1-s1', 'opponent', 'armor')] });
  assert.deepEqual(lossNoteAirStrikeRemovedUnits({ ...tactical }), []);
  const result = run(tactical);
  assert.equal(result.byOwner.human!.airStrike.length, 0);
  assert.deepEqual(result.byOwner.human!.other[0]!.attribution!.responsibleOwnerIds, []);
});

test('cargo lost with a carrier shot by ranged fire is credited to the carrier killers', () => {
  const result = run(input({
    killsByDirectFire: [{ victimId: 'a1-n1', killerIds: ['h1-t1-s1'] }],
    removedUnits: [removed('a1-n1', 'opponent', 'naval', 'cellS'), removed('a1-i1', 'opponent', 'infantry', 'cellS')],
    subUnitsBeforeFerry: [fact('a1-n1', 'opponent', 'naval'), fact('a1-i1', 'opponent', 'infantry', 'a1-n1')],
    subUnitsAfter: [fact('h1-t1-s1', 'human', 'armor')],
  }));
  const cargo = result.byOwner.opponent!.other[0]!.attribution!;
  assert.deepEqual(cargo.responsibleOwnerIds, ['human']);
  assert.deepEqual(cargo.killerUnits, [{ unitId: 'h1-t1-s1', unitType: 'armor' }]);
});

test('a shot-down drop carrier is placed at the drop target', () => {
  const result = run(input({
    killsByReturnFire: [{ victimId: 'a1-s1', killerIds: ['h1-t1-s1'] }],
    removedUnits: [removed('a1-s1', 'opponent', 'air', 'baseCell')],
    subUnitsAfter: [fact('h1-t1-s1', 'human', 'armor')],
    airDropMoves: [{
      unitId: 'a1-s1', player: 'opponent', fromH3Index: 'baseCell', targetH3Index: 'dropCell', returnsToBase: false,
    }],
  }));
  assert.equal(result.byOwner.opponent!.returnFire[0]!.attribution!.lossH3Index, 'dropCell');
});

test('an air-strike victim is credited to its single striker', () => {
  const result = run(input({
    killsByAirStrike: [{ victimId: 'a1-t1-s1', killerIds: ['h1-s1'] }],
    removedUnits: [removed('a1-t1-s1', 'opponent', 'armor', 'cellT')],
    subUnitsAfter: [fact('h1-s1', 'human', 'air')],
  }));
  assert.deepEqual(result.byOwner.opponent!.airStrike[0]!.attribution!.responsibleOwnerIds, ['human']);
});
