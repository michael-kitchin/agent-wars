/**
 * Head-on contact on a tactical beat.
 * Run with: node dist/main/tacticalBattle/tacticalHeadOnContact.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { HUMAN_SEAT_ID, type OwnerId } from '../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { getGameSeed } from '../gameDb';
import { createHeadOnInitiativePicker } from '../headOnInitiative';
import { setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import { applyAiOnlyTacticalBeat } from './aiOnlyTacticalBeat';
import { opposingPartyIdOf } from './opposingParty';
import {
  applyHumanTacticalDraftBeatInStrategicOrder,
  getActiveTacticalBattleSnapshot,
  startTacticalBattleForEnclosingHex,
} from './tacticalBattleSession';
import { tacticalComputeMovementOrderOutcomeForPlayer } from './tacticalSnapshotGuards';
import { tacticalDbFixtureRegisterDefaultAfterEach, tacticalDbFixtureWithTempDbContestedPlanning } from './testSupport/tacticalDbFixture';
import { emptyPlan, withTwoAiBattle } from './testSupport/twoAiBattleFixture';

tacticalDbFixtureRegisterDefaultAfterEach();

/**
 * Puts one sub-unit of each side on a pair of cells they can trade this beat.
 *
 * Purpose: Both beat tests need a legal swap, and the fixture's starting cells are not a swap. The first neighbor `legalStep` returns is not always a cell the other unit can enter.
 * When to use: After a battle snapshot exists and before the beat is applied.
 * Expected outcome: The active snapshot has the second sub-unit on a neighbor of the first, and each order applies onto the other unit's cell.
 * Exceptions: Throws when the fixture has no pair both outcome checks accept.
 */
function placeHeadOnPair(
  battle: TacticalBattleSnapshot,
  firstPlayer: OwnerId,
  secondPlayer: OwnerId,
): {
  placed: TacticalBattleSnapshot;
  firstOrder: { unitId: string; toH3Index: string };
  secondOrder: { unitId: string; toH3Index: string };
  cellA: string;
  cellB: string;
} {
  const tacticalSet = new Set(battle.tacticalChildH3Indexes);
  /**
   * Land sub-units of one seat that can march on their own.
   *
   * Purpose: Cargo riding a carrier is not a candidate for a trade.
   * When to use: Choosing each side of a candidate pair.
   * Expected outcome: Infantry and armor that are not embarked.
   * Exceptions: None.
   */
  const landUnits = (player: OwnerId): TacticalBattleSnapshot['subUnits'][number][] =>
    battle.subUnits.filter(
      (unit) =>
        unit.player === player
        && (unit.unitType === 'infantry' || unit.unitType === 'armor')
        && !unit.embarkedOnSubUnitId,
    );
  /**
   * The cell this order applies onto, or null when the outcome helper rejects it.
   *
   * Purpose: A one-way step is not a trade.
   * When to use: For each candidate pair, from the snapshot that already places the second sub-unit.
   * Expected outcome: The applied cell when the order is legal, otherwise null.
   * Exceptions: None. The outcome helper does not throw.
   */
  const appliedStop = (
    placed: TacticalBattleSnapshot,
    player: OwnerId,
    order: { unitId: string; toH3Index: string },
  ): string | null => {
    const sub = placed.subUnits.map((unit) => ({ ...unit }));
    const byId = new Map(sub.map((unit, index) => [unit.id, index] as const));
    const outcome = tacticalComputeMovementOrderOutcomeForPlayer(player, {
      byId,
      sub,
      order,
      tacticalSet,
      battle: placed,
    });
    return outcome.ok ? outcome.appliedToH3Index : null;
  };
  for (const firstUnit of landUnits(firstPlayer)) {
    for (const cellB of gridDisk(firstUnit.h3Index, 1)) {
      if (cellB === firstUnit.h3Index || !tacticalSet.has(cellB)) continue;
      const firstOrder = { unitId: firstUnit.id, toH3Index: cellB };
      for (const secondUnit of landUnits(secondPlayer)) {
        const placed: TacticalBattleSnapshot = {
          ...battle,
          subUnits: battle.subUnits.map((unit) =>
            unit.id === secondUnit.id ? { ...unit, h3Index: cellB } : unit,
          ),
        };
        const secondOrder = { unitId: secondUnit.id, toH3Index: firstUnit.h3Index };
        if (appliedStop(placed, secondPlayer, secondOrder) !== firstUnit.h3Index) continue;
        if (appliedStop(placed, firstPlayer, firstOrder) !== cellB) continue;
        setActiveTacticalBattleSnapshotRef(placed);
        return { placed, firstOrder, secondOrder, cellA: firstUnit.h3Index, cellB };
      }
    }
  }
  assert.fail('fixture has no pair of cells these two seats can trade');
}

test('two AI seats that trade cells meet in the rolled cell', () => {
  withTwoAiBattle('aw-head-on-ai-', (battle) => {
    assert.ok(battle.leadPartyId);
    assert.ok(battle.opposingPartyId);
    const { placed, firstOrder, secondOrder, cellA, cellB } = placeHeadOnPair(
      battle,
      battle.leadPartyId,
      battle.opposingPartyId,
    );
    const held = createHeadOnInitiativePicker(getGameSeed(), {
      kind: 'tactical',
      strategicTurnNumber: placed.strategicTurnNumber,
      battleId: placed.battleId,
      tacticalTurnNumber: placed.tacticalTurnNumber,
    })(cellA, cellB);
    const beat = applyAiOnlyTacticalBeat({
      leadDraft: { ...emptyPlan(), movementOrders: [firstOrder] },
      opposingDraft: { ...emptyPlan(), movementOrders: [secondOrder] },
    });
    assert.equal(beat.success, true);
    if (!beat.success) return;
    const at = (unitId: string): string | undefined =>
      beat.battleAfterMovementBeforeFerry.subUnits.find((unit) => unit.id === unitId)?.h3Index;
    assert.equal(at(firstOrder.unitId), held);
    assert.equal(at(secondOrder.unitId), held);
    assert.ok(beat.meleePack.meleeCombatHexes.includes(held));
  });
});

test('a human and the opposing party that trade cells meet in the rolled cell', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-head-on-human-', ({ targetStrategicH3 }) => {
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true);
    const battle = getActiveTacticalBattleSnapshot();
    assert.ok(battle);
    const { placed, firstOrder, secondOrder, cellA, cellB } = placeHeadOnPair(
      battle,
      HUMAN_SEAT_ID,
      opposingPartyIdOf(battle),
    );
    const held = createHeadOnInitiativePicker(getGameSeed(), {
      kind: 'tactical',
      strategicTurnNumber: placed.strategicTurnNumber,
      battleId: placed.battleId,
      tacticalTurnNumber: placed.tacticalTurnNumber,
    })(cellA, cellB);
    const beat = applyHumanTacticalDraftBeatInStrategicOrder({
      movementOrders: [firstOrder],
      opponentTacticalDraft: { ...emptyPlan(), movementOrders: [secondOrder] },
    });
    assert.equal(beat.success, true, beat.success ? '' : beat.reason);
    if (!beat.success) return;
    const at = (unitId: string): string | undefined =>
      beat.battleAfterMovementBeforeFerry.subUnits.find((unit) => unit.id === unitId)?.h3Index;
    assert.equal(at(firstOrder.unitId), held);
    assert.equal(at(secondOrder.unitId), held);
    assert.ok(beat.meleePack.meleeCombatHexes.includes(held));
  });
});
