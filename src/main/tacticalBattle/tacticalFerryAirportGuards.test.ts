/**
 * Tactical air ferry must land on intact airport cells, matching strategic ferry dest rules.
 * Run: `npm run build:main` then `node dist/main/tacticalBattle/tacticalFerryAirportGuards.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import {
  collectTacticalLegalFerryDestinationHexes,
  tacticalFerryAirportRejectionReason,
  tacticalFerryApplyOutcome,
  tacticalCellHasIntactAirport,
  validateTacticalGroupFerryTarget,
} from './tacticalFerryAirportGuards';
import { applyTacticalFerryPhaseOnBattle } from './tacticalStrategicOrderPhases';
import {
  firstRingCellDistinctFrom,
  tacticalParentCell,
  tacticalUnderCorner,
} from './testSupport/tacticalHexFixtures';

/**
 * Builds a one-air-unit tactical snapshot with optional origin/dest airport flags.
 *
 * Purpose: Isolates ferry airport contracts without SQLite or a live session.
 * When to use: Apply-phase tests in this file.
 * Expected outcome: Footprint is the origin disk; dest is a distinct ring-1 neighbor.
 * Exceptions: Throws when the ring has no neighbor (should not happen at tactical).
 */
function airFerryBattle(args: {
  battleId: string;
  originAirport: boolean;
  destAirport: boolean;
  destRubble?: boolean;
  originRubble?: boolean;
  player: 'human' | 'opponent';
}): { battle: TacticalBattleSnapshot; origin: string; dest: string; unitId: string } {
  const strategic = tacticalParentCell(22, 24);
  const origin = tacticalUnderCorner(22, 24);
  const dest = firstRingCellDistinctFrom(origin);
  const ring = [...gridDisk(origin, 1)];
  const unitId = `${args.player}-air-ferry`;
  const air: TacticalSubUnitSnapshot = {
    id: unitId,
    parentUnitId: `p-${unitId}`,
    player: args.player,
    unitType: 'air',
    h3Index: origin,
    displayName: '1st Air (ferry)',
  };
  const tacticalIsAirportByH3: Record<string, boolean> = {};
  if (args.originAirport) tacticalIsAirportByH3[origin] = true;
  if (args.destAirport) tacticalIsAirportByH3[dest] = true;
  const tacticalIsRubbleByH3: Record<string, boolean> = {};
  if (args.destRubble) tacticalIsRubbleByH3[dest] = true;
  if (args.originRubble) tacticalIsRubbleByH3[origin] = true;
  const battle: TacticalBattleSnapshot = {
    battleId: args.battleId,
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [air],
    tacticalIsAirportByH3,
    tacticalIsRubbleByH3,
  };
  return { battle, origin, dest, unitId };
}

test('applyTacticalFerryPhaseOnBattle does not move air to a footprint cell without an airport', () => {
  const { battle, origin, dest, unitId } = airFerryBattle({
    battleId: 'tb-ferry-no-ap',
    originAirport: true,
    destAirport: false,
    player: 'human',
  });
  const next = applyTacticalFerryPhaseOnBattle(
    battle,
    [{ unitId, destinationH3Index: dest }],
    'human'
  );
  assert.equal(next.battle.subUnits[0]!.h3Index, origin);
  assert.equal(next.removedUnits.length, 0);
});

test('applyTacticalFerryPhaseOnBattle does not move air onto a rubble cell even if it was flagged as an airport', () => {
  const { battle, origin, dest, unitId } = airFerryBattle({
    battleId: 'tb-ferry-rubble-ap',
    originAirport: true,
    destAirport: true,
    destRubble: true,
    player: 'human',
  });
  const next = applyTacticalFerryPhaseOnBattle(
    battle,
    [{ unitId, destinationH3Index: dest }],
    'human'
  );
  assert.equal(next.battle.subUnits[0]!.h3Index, origin);
  assert.equal(next.removedUnits.length, 0);
});

test('applyTacticalFerryPhaseOnBattle still ferries when dest is intact even if origin is now rubble', () => {
  const { battle, dest, unitId } = airFerryBattle({
    battleId: 'tb-ferry-escape-rubble',
    originAirport: true,
    destAirport: true,
    originRubble: true,
    player: 'human',
  });
  const next = applyTacticalFerryPhaseOnBattle(
    battle,
    [{ unitId, destinationH3Index: dest }],
    'human'
  );
  assert.equal(next.battle.subUnits[0]!.h3Index, dest);
  assert.equal(next.removedUnits.length, 0);
});

test('applyTacticalFerryPhaseOnBattle destroys air when dest is illegal and origin airport is gone', () => {
  const { battle, dest, unitId } = airFerryBattle({
    battleId: 'tb-ferry-abort-destroy',
    originAirport: true,
    destAirport: false,
    originRubble: true,
    player: 'human',
  });
  const next = applyTacticalFerryPhaseOnBattle(
    battle,
    [{ unitId, destinationH3Index: dest }],
    'human'
  );
  assert.equal(next.battle.subUnits.length, 0);
  assert.equal(next.removedUnits.length, 1);
  assert.equal(next.removedUnits[0]!.id, unitId);
});

test('applyTacticalFerryPhaseOnBattle ferries air to an intact airport cell in the footprint', () => {
  const { battle, dest, unitId } = airFerryBattle({
    battleId: 'tb-ferry-ok-ap',
    originAirport: true,
    destAirport: true,
    player: 'human',
  });
  const next = applyTacticalFerryPhaseOnBattle(
    battle,
    [{ unitId, destinationH3Index: dest }],
    'human'
  );
  assert.equal(next.battle.subUnits[0]!.h3Index, dest);
});

test('tacticalRes4CellHasIntactAirport is false for omitted, rubble, or missing airport flags', () => {
  const { battle, origin, dest } = airFerryBattle({
    battleId: 'tb-ferry-helper',
    originAirport: true,
    destAirport: true,
    destRubble: true,
    player: 'human',
  });
  assert.equal(tacticalCellHasIntactAirport(battle, origin), true);
  assert.equal(tacticalCellHasIntactAirport(battle, dest), false);
  assert.equal(tacticalFerryAirportRejectionReason(battle, origin, dest), 'Destination airport is not intact');
});

test('validateTacticalGroupFerryTarget rejects a dest without an intact airport', () => {
  const { battle, dest, unitId } = airFerryBattle({
    battleId: 'tb-ferry-val-no-ap',
    originAirport: true,
    destAirport: false,
    player: 'human',
  });
  const result = validateTacticalGroupFerryTarget(battle, [unitId], dest, 'human');
  assert.equal(result.success, false);
  assert.ok(result.reason?.includes('Destination airport is not intact'));
});

test('validateTacticalGroupFerryTarget accepts an intact airport dest in the footprint', () => {
  const { battle, dest, unitId } = airFerryBattle({
    battleId: 'tb-ferry-val-ok',
    originAirport: true,
    destAirport: true,
    player: 'human',
  });
  const result = validateTacticalGroupFerryTarget(battle, [unitId], dest, 'human');
  assert.equal(result.success, true);
});

test('validateTacticalGroupFerryTarget rejects when the origin cell has no intact airport', () => {
  const { battle, dest, unitId } = airFerryBattle({
    battleId: 'tb-ferry-val-no-origin',
    originAirport: false,
    destAirport: true,
    player: 'human',
  });
  const result = validateTacticalGroupFerryTarget(battle, [unitId], dest, 'human');
  assert.equal(result.success, false);
  assert.ok(result.reason?.includes('Origin airport is not intact'));
});

test('collectTacticalLegalFerryDestinationHexes lists other intact airport cells in the footprint', () => {
  const { battle, origin, dest } = airFerryBattle({
    battleId: 'tb-ferry-collect',
    originAirport: true,
    destAirport: true,
    player: 'human',
  });
  const dests = collectTacticalLegalFerryDestinationHexes(battle, origin);
  assert.deepEqual(dests, [dest]);
});

test('collectTacticalLegalFerryDestinationHexes is empty when origin has no intact airport', () => {
  const { battle, origin } = airFerryBattle({
    battleId: 'tb-ferry-collect-no-origin',
    originAirport: false,
    destAirport: true,
    player: 'human',
  });
  assert.deepEqual(collectTacticalLegalFerryDestinationHexes(battle, origin), []);
});

test('tacticalFerryApplyOutcome is destroy when dest is illegal and origin is rubble', () => {
  const { battle, origin, dest } = airFerryBattle({
    battleId: 'tb-ferry-outcome-destroy',
    originAirport: true,
    destAirport: false,
    originRubble: true,
    player: 'human',
  });
  assert.equal(tacticalFerryApplyOutcome(battle, origin, dest), 'destroy');
});
