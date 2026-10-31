/**
 * Contracts for one beat between two AI seats.
 * Run with: node dist/main/tacticalBattle/aiOnlyTacticalBeat.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, type OwnerId } from '../../shared/seatIds';
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/consultationPushTypes';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { dbGetOne, dbRun } from '../gameDb';
import { setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import { applyAiOnlyTacticalBeat } from './aiOnlyTacticalBeat';
import {
  getActiveTacticalBattleSnapshot,
  isTacticalBattleActive,
  startTacticalBattleForEnclosingHex,
} from './tacticalBattleSession';
import { tacticalComputeMovementOrderOutcomeForPlayer } from './tacticalSnapshotGuards';
import { tacticalDbFixtureRegisterDefaultAfterEach, tacticalDbFixtureWithTempDbContestedPlanning } from './testSupport/tacticalDbFixture';

tacticalDbFixtureRegisterDefaultAfterEach();

/**
 * An empty plan, with the exit flag only when requested.
 *
 * Purpose: Idle and exit cases must not apply an order.
 * When to use: The beat tests that do not move a unit.
 * Expected outcome: Every order list is empty.
 * Exceptions: None.
 */
function emptyPlan(exitBattle = false): TacticalOpponentPlanPayload {
  return {
    movementOrders: [],
    rangedAttacks: [],
    airStrikes: [],
    ferryOrders: [],
    embarkOrders: [],
    ...(exitBattle ? { exitBattle: true } : {}),
  };
}

/**
 * Starts a two-AI battle on the fixture hex.
 *
 * Purpose: The beat reads the active session, so the snapshot has to be committed first.
 * When to use: Every case in this file.
 * Expected outcome: `fn` runs while the session is active and both owners are AI seats.
 * Exceptions: Assertion failure when the hex cannot start.
 */
function withTwoAiBattle(label: string, fn: (battle: TacticalBattleSnapshot) => void): void {
  tacticalDbFixtureWithTempDbContestedPlanning(label, ({ targetStrategicH3, humanId, opponentId }) => {
    const secondSeat = AI_SEAT_IDS[1];
    const spare = dbGetOne<{ id: string }>(
      `SELECT id FROM units WHERE id != ? AND id != ? AND unit_type IN ('infantry', 'armor') LIMIT 1`,
      [humanId, opponentId],
    );
    assert.ok(spare, 'seed needs a spare parent');
    dbRun(
      `INSERT INTO seats (
         seat_id, seat_order, kind, home_region, out_reasons, consultation_count, cost_usd
       ) SELECT ?, 3, 'ai', home_region, '[]', 0, 0 FROM seats WHERE seat_id = ?`,
      [secondSeat, AI_SEAT_IDS[0]],
    );
    const elsewhere = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM hexes WHERE h3_index != ? LIMIT 1', [targetStrategicH3]);
    assert.ok(elsewhere, 'seed needs a second hex');
    dbRun('UPDATE units SET h3_index = ? WHERE player = ? AND h3_index = ?', [elsewhere.h3_index, HUMAN_SEAT_ID, targetStrategicH3]);
    dbRun('UPDATE units SET player = ?, h3_index = ? WHERE id = ?', [secondSeat, targetStrategicH3, spare.id]);
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true, started.reason);
    const battle = getActiveTacticalBattleSnapshot();
    assert.ok(battle?.leadPartyId);
    fn(battle);
  });
}

/**
 * A destination one step away that the named seat can legally enter.
 *
 * Purpose: The move cases need one applied order without inventing a path.
 * When to use: After the battle has placed sub-units.
 * Expected outcome: The unit id and a cell the outcome helper accepts, or null when none of the neighbors is legal.
 * Exceptions: None.
 */
function legalStep(battle: TacticalBattleSnapshot, player: OwnerId): { unitId: string; toH3Index: string } | null {
  const tacticalSet = new Set(battle.tacticalChildH3Indexes);
  const sub = battle.subUnits.map((unit) => ({ ...unit }));
  const byId = new Map(sub.map((unit, index) => [unit.id, index] as const));
  for (const unit of battle.subUnits) {
    if (unit.player !== player || (unit.unitType !== 'infantry' && unit.unitType !== 'armor')) continue;
    for (const cell of gridDisk(unit.h3Index, 1)) {
      if (cell === unit.h3Index) continue;
      const order = { unitId: unit.id, toH3Index: cell };
      const outcome = tacticalComputeMovementOrderOutcomeForPlayer(player, { byId, sub, order, tacticalSet, battle });
      if (outcome.ok) return order;
    }
  }
  return null;
}

/**
 * The stored sub-unit with this id.
 *
 * Purpose: Movement assertions read the snapshot the beat committed.
 * When to use: After `applyAiOnlyTacticalBeat`.
 * Expected outcome: The row, or undefined when combat removed it.
 * Exceptions: None.
 */
function storedUnit(unitId: string): TacticalSubUnitSnapshot | undefined {
  return getActiveTacticalBattleSnapshot()?.subUnits.find((unit) => unit.id === unitId);
}

test('both drafts move their own sub-units in one beat', () => {
  withTwoAiBattle('aw-ai-only-both-move-', (battle) => {
    const lead = battle.leadPartyId!;
    const opposing = battle.opposingPartyId!;
    const leadStep = legalStep(battle, lead);
    const opposingStep = legalStep(battle, opposing);
    assert.ok(leadStep, 'lead needs a legal step');
    assert.ok(opposingStep, 'opposing needs a legal step');
    const beat = applyAiOnlyTacticalBeat({
      leadDraft: { ...emptyPlan(), movementOrders: [leadStep] },
      opposingDraft: { ...emptyPlan(), movementOrders: [opposingStep] },
    });
    assert.equal(beat.success, true);
    assert.equal(storedUnit(leadStep.unitId)?.h3Index, leadStep.toH3Index);
    assert.equal(storedUnit(opposingStep.unitId)?.h3Index, opposingStep.toH3Index);
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : undefined, undefined);
  });
});

test('an illegal row is dropped and the other seat still moves', () => {
  withTwoAiBattle('aw-ai-only-drop-', (battle) => {
    const opposing = battle.opposingPartyId!;
    const opposingStep = legalStep(battle, opposing);
    assert.ok(opposingStep);
    const before = battle.subUnits.find((unit) => unit.player === battle.leadPartyId)?.h3Index;
    const beat = applyAiOnlyTacticalBeat({
      leadDraft: { ...emptyPlan(), movementOrders: [{ unitId: 'missing-unit', toH3Index: battle.enclosingStrategicH3Index }] },
      opposingDraft: { ...emptyPlan(), movementOrders: [opposingStep] },
    });
    assert.equal(beat.success, true);
    assert.equal(storedUnit(opposingStep.unitId)?.h3Index, opposingStep.toH3Index);
    const leadStill = getActiveTacticalBattleSnapshot()?.subUnits.find((unit) => unit.player === battle.leadPartyId);
    assert.equal(leadStill?.h3Index, before);
  });
});

test('three idle beats set idle and leave the session active', () => {
  withTwoAiBattle('aw-ai-only-idle-', () => {
    applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    const third = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(third.success, true);
    assert.equal(third.success ? third.battle.aiOnlyEndReason : undefined, 'idle');
    assert.equal(third.success ? third.battle.idleBeatStreak : undefined, 3);
    assert.equal(isTacticalBattleActive(), true);
  });
});

test('both exit flags on completed beat 4 do not end the battle', () => {
  withTwoAiBattle('aw-ai-only-exit-early-', (battle) => {
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 4, idleBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(true), opposingDraft: emptyPlan(true) });
    assert.equal(beat.success ? beat.battle.tacticalTurnNumber : 0, 5);
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : 'exit', undefined);
  });
});

test('one exit flag on beat 5 does not end the battle', () => {
  withTwoAiBattle('aw-ai-only-one-flag-', (battle) => {
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 5, idleBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(true), opposingDraft: emptyPlan(false) });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : 'exit', undefined);
  });
});

test('both exit flags on completed beat 5 end the battle', () => {
  withTwoAiBattle('aw-ai-only-exit-', (battle) => {
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 5, idleBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(true), opposingDraft: emptyPlan(true) });
    assert.equal(beat.success ? beat.battle.tacticalTurnNumber : 0, 6);
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : undefined, 'exit');
    assert.equal(isTacticalBattleActive(), true);
  });
});

test('a wiped side sets elimination even when both flags are true', () => {
  withTwoAiBattle('aw-ai-only-wiped-', (battle) => {
    const lead = battle.leadPartyId!;
    setActiveTacticalBattleSnapshotRef({
      ...battle,
      tacticalTurnNumber: 5,
      subUnits: battle.subUnits.filter((unit) => unit.player === lead),
    });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(true), opposingDraft: emptyPlan(true) });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : undefined, 'elimination');
    assert.equal(isTacticalBattleActive(), true);
  });
});
