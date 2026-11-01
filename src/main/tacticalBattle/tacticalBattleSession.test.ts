/**
 * Tests for tactical main-process session helpers. Run with: node dist/main/tacticalBattle/tacticalBattleSession.test.js
 */

import { AI_SEAT_IDS, HUMAN_SEAT_ID, isAiSeatId, type SeatId } from '../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbGetOne, dbRun } from '../gameDb';
import { deleteStrategicParentUnitAndApplyTransportOutcome } from '../gameActions/sealift';
import { recordDestroyedBattleParents, takeDestroyedBattleParents } from './destroyedBattleParents';
import { syncStrategicUnitsDbWhenTacticalParentsEliminated } from './tacticalStrategicOrderPhases';
import { tacticalSubUnitCountForStrategicUnitType } from './computeTacticalBattleSnapshot';
import { setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import {
  endTacticalBattleSession,
  endTacticalBattleSessionForHumanVoluntaryExitBailout,
  endTacticalBattleSessionForTwoPartyVoluntaryExit,
  getActiveTacticalBattleSnapshot,
  isTacticalBattleActive,
  startTacticalBattleForEnclosingHex,
  validateHumanTacticalMarchOrders,
} from './tacticalBattleSession';
import {
  tacticalDbFixtureRegisterDefaultAfterEach,
  tacticalDbFixtureWithTempDbContestedPlanning,
} from './testSupport/tacticalDbFixture';

tacticalDbFixtureRegisterDefaultAfterEach();

test('endTacticalBattleSession keeps tactical session inactive when none exists', () => {
  endTacticalBattleSession();
  assert.equal(isTacticalBattleActive(), false);
});

/**
 * Chooses one parent id with at least one tactical sub-unit from the requested player in the active snapshot.
 *
 * Purpose: Keeps tests resilient to fixture roster variation without hard-coding strategic parent ids.
 * When to use: After tactical start when a test needs to force custom survivor counts for one parent.
 * Expected outcome: Returns a parent id and tactical unit type from the active snapshot.
 * Exceptions: Throws when no matching parent exists.
 */
function pickParentForTest(player: SeatId, minTheoreticalBaseline = 2): { parentUnitId: string; unitType: string } {
  const snap = getActiveTacticalBattleSnapshot();
  if (!snap) throw new Error('pickParentForTest: expected active tactical snapshot');
  const byParent = new Map<string, { unitType: string; player: SeatId }>();
  for (const sub of snap.subUnits) {
    if (sub.player !== player) continue;
    if (!byParent.has(sub.parentUnitId)) byParent.set(sub.parentUnitId, { unitType: sub.unitType, player: sub.player });
  }
  for (const [parentUnitId, state] of byParent) {
    if (tacticalSubUnitCountForStrategicUnitType(state.unitType) >= minTheoreticalBaseline) {
      return { parentUnitId, unitType: state.unitType };
    }
  }
  throw new Error(`pickParentForTest: no ${player} parent found with theoretical baseline >= ${minTheoreticalBaseline}`);
}

/**
 * Chooses one parent id with an even theoretical baseline so exact-half threshold tests are deterministic.
 *
 * Purpose: Avoids relying on odd baseline unit types (`air`) for tests that require an exact half count.
 * When to use: Strict equal-half bailout survival contract tests.
 * Expected outcome: Returns a matching parent id and unit type.
 * Exceptions: Throws when no even-baseline parent exists for the requested player.
 */
function pickEvenBaselineParentForTest(player: SeatId): { parentUnitId: string; unitType: string } {
  const snap = getActiveTacticalBattleSnapshot();
  if (!snap) throw new Error('pickEvenBaselineParentForTest: expected active tactical snapshot');
  const seen = new Set<string>();
  for (const sub of snap.subUnits) {
    if (sub.player !== player) continue;
    if (seen.has(sub.parentUnitId)) continue;
    seen.add(sub.parentUnitId);
    const baseline = tacticalSubUnitCountForStrategicUnitType(sub.unitType);
    if (baseline > 0 && baseline % 2 === 0) {
      return { parentUnitId: sub.parentUnitId, unitType: sub.unitType };
    }
  }
  throw new Error(`pickEvenBaselineParentForTest: no even-baseline ${player} parent found`);
}

/**
 * Replaces the active tactical snapshot with a custom survivor count for one parent while keeping both players represented.
 *
 * Purpose: Creates deterministic bailout-threshold scenarios without simulating full tactical combat.
 * When to use: Tests for strict-less-than-half and trigger-scope behavior.
 * Expected outcome: Active snapshot remains valid and includes at least one sub-unit for each player.
 * Exceptions: Throws when impossible under current fixture composition.
 */
function setCustomSurvivorCountForParent(parentUnitId: string, keepCount: number): void {
  const snap = getActiveTacticalBattleSnapshot();
  if (!snap) throw new Error('setCustomSurvivorCountForParent: expected active tactical snapshot');
  const targetSubs = snap.subUnits.filter((s) => s.parentUnitId === parentUnitId);
  if (targetSubs.length <= 0) throw new Error('setCustomSurvivorCountForParent: target parent not in active snapshot');
  const cappedKeep = Math.max(0, Math.min(keepCount, targetSubs.length));
  const targetKeepIds = new Set(targetSubs.slice(0, cappedKeep).map((s) => s.id));
  const mutatedSubUnits = snap.subUnits.filter((s) => s.parentUnitId !== parentUnitId || targetKeepIds.has(s.id));
  const hasHuman = mutatedSubUnits.some((s) => s.player === 'human');
  const hasOpponent = mutatedSubUnits.some((s) => s.player === 'opponent');
  if (!hasHuman || !hasOpponent) {
    throw new Error('setCustomSurvivorCountForParent: mutation removed one side entirely');
  }
  setActiveTacticalBattleSnapshotRef({ ...snap, subUnits: mutatedSubUnits });
}

test('human voluntary bailout deletes strategic parent when survivors are strictly less than half baseline', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-bailout-below-half-', ({ targetStrategicH3 }) => {
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true, started.reason);
    const picked = pickParentForTest('human', 3);
    const baseline = tacticalSubUnitCountForStrategicUnitType(picked.unitType);
    const keepCount = Math.max(1, Math.floor((baseline - 1) / 2));
    setCustomSurvivorCountForParent(picked.parentUnitId, keepCount);
    endTacticalBattleSessionForHumanVoluntaryExitBailout();
    const gone = dbGetOne<{ id: string }>('SELECT id FROM units WHERE id = ?', [picked.parentUnitId]);
    assert.equal(gone, undefined);
  });
});

test('human voluntary bailout keeps strategic parent when survivors are exactly half baseline', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-bailout-exact-half-', ({ targetStrategicH3 }) => {
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true, started.reason);
    const picked = pickEvenBaselineParentForTest('human');
    const baseline = tacticalSubUnitCountForStrategicUnitType(picked.unitType);
    const keepCount = baseline / 2;
    setCustomSurvivorCountForParent(picked.parentUnitId, keepCount);
    endTacticalBattleSessionForHumanVoluntaryExitBailout();
    const stillThere = dbGetOne<{ id: string }>('SELECT id FROM units WHERE id = ?', [picked.parentUnitId]);
    assert.ok(stillThere?.id, 'expected parent to survive at exact half');
  });
});

test('human voluntary bailout skips threshold elimination when one side is annihilated in snapshot', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-bailout-annihilation-skip-', ({ targetStrategicH3 }) => {
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true, started.reason);
    const snap = getActiveTacticalBattleSnapshot();
    assert.ok(snap);
    const humanParent = pickParentForTest('human', 2).parentUnitId;
    const humanOnlySubUnits = snap!.subUnits.filter((s) => s.player === 'human');
    setActiveTacticalBattleSnapshotRef({ ...snap!, subUnits: humanOnlySubUnits });
    endTacticalBattleSessionForHumanVoluntaryExitBailout();
    const stillThere = dbGetOne<{ id: string }>('SELECT id FROM units WHERE id = ?', [humanParent]);
    assert.ok(stillThere?.id, 'expected no bailout parent elimination when one side already has no tactical units');
  });
});

test('legacy snapshot fallback uses theoretical baseline during human voluntary bailout', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-bailout-legacy-fallback-', ({ targetStrategicH3 }) => {
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true, started.reason);
    const picked = pickParentForTest('human', 3);
    const theoreticalBaseline = tacticalSubUnitCountForStrategicUnitType(picked.unitType);
    const keepCount = Math.max(1, Math.floor((theoreticalBaseline - 1) / 2));
    setCustomSurvivorCountForParent(picked.parentUnitId, keepCount);
    const snap = getActiveTacticalBattleSnapshot();
    assert.ok(snap);
    setActiveTacticalBattleSnapshotRef({
      ...snap!,
      initialPlacedSubUnitCountByParentId: undefined,
    });
    endTacticalBattleSessionForHumanVoluntaryExitBailout();
    const gone = dbGetOne<{ id: string }>('SELECT id FROM units WHERE id = ?', [picked.parentUnitId]);
    assert.equal(gone, undefined);
  });
});

test('human voluntary bailout can eliminate multiple strategic parents in one exit', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-bailout-multi-parent-', ({ targetStrategicH3 }) => {
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true, started.reason);
    const humanPicked = pickParentForTest('human', 3);
    const opponentPicked = pickParentForTest('opponent', 3);
    const humanBaseline = tacticalSubUnitCountForStrategicUnitType(humanPicked.unitType);
    const opponentBaseline = tacticalSubUnitCountForStrategicUnitType(opponentPicked.unitType);
    setCustomSurvivorCountForParent(humanPicked.parentUnitId, Math.max(1, Math.floor((humanBaseline - 1) / 2)));
    setCustomSurvivorCountForParent(opponentPicked.parentUnitId, Math.max(1, Math.floor((opponentBaseline - 1) / 2)));
    endTacticalBattleSessionForHumanVoluntaryExitBailout();
    const humanGone = dbGetOne<{ id: string }>('SELECT id FROM units WHERE id = ?', [humanPicked.parentUnitId]);
    const opponentGone = dbGetOne<{ id: string }>('SELECT id FROM units WHERE id = ?', [opponentPicked.parentUnitId]);
    assert.equal(humanGone, undefined);
    assert.equal(opponentGone, undefined);
  });
});

test('non-voluntary teardown path does not apply bailout elimination', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-bailout-scope-', ({ targetStrategicH3 }) => {
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true, started.reason);
    const picked = pickParentForTest('human', 3);
    const baseline = tacticalSubUnitCountForStrategicUnitType(picked.unitType);
    const keepCount = Math.max(1, Math.floor((baseline - 1) / 2));
    setCustomSurvivorCountForParent(picked.parentUnitId, keepCount);
    endTacticalBattleSession();
    const stillThere = dbGetOne<{ id: string }>('SELECT id FROM units WHERE id = ?', [picked.parentUnitId]);
    assert.ok(stillThere?.id, 'expected non-voluntary teardown to leave strategic parents untouched');
  });
});

test('validateHumanTacticalMarchOrders reports the first illegal order', () => {
  const snapshot = {
    battleId: 'march-validation',
    tacticalTurnNumber: 1,
    tacticalChildH3Indexes: ['inside'],
    subUnits: [
      { id: 'own', player: HUMAN_SEAT_ID },
      { id: 'other', player: 'opponent' },
    ],
  } as unknown as TacticalBattleSnapshot;
  setActiveTacticalBattleSnapshotRef(snapshot);
  try {
    assert.deepEqual(validateHumanTacticalMarchOrders([{ unitId: 'missing', toH3Index: 'inside' }]), {
      success: false,
      reason: 'One or more selected units are not part of this tactical battle.',
    });
    assert.deepEqual(validateHumanTacticalMarchOrders([{ unitId: 'other', toH3Index: 'inside' }]), {
      success: false,
      reason: 'Only your tactical sub-units can receive march orders here.',
    });
    assert.deepEqual(validateHumanTacticalMarchOrders([{ unitId: 'own', toH3Index: 'outside' }]), {
      success: false,
      reason: 'That destination lies outside the tactical battle footprint.',
    });
    assert.deepEqual(validateHumanTacticalMarchOrders([]), { success: true });
  } finally {
    setActiveTacticalBattleSnapshotRef(null);
  }
});

/**
 * Starts a battle whose two owners are AI seats.
 *
 * Purpose: The two-party exit pass is only reachable when `leadPartyId` is set.
 * When to use: The voluntary-exit cases below.
 * Expected outcome: `fn` runs with an active two-AI snapshot.
 * Exceptions: Assertion failure when the hex cannot start.
 */
function withTwoAiSession(label: string, fn: () => void): void {
  tacticalDbFixtureWithTempDbContestedPlanning(label, ({ targetStrategicH3, humanId, opponentId }) => {
    const secondSeat = AI_SEAT_IDS[1];
    const spare = dbGetOne<{ id: string }>(
      `SELECT id FROM units WHERE id != ? AND id != ? AND unit_type IN ('infantry', 'armor') LIMIT 1`,
      [humanId, opponentId],
    );
    assert.ok(spare);
    dbRun(
      `INSERT INTO seats (
         seat_id, seat_order, kind, home_region, out_reasons, consultation_count, cost_usd
       ) SELECT ?, 3, 'ai', home_region, '[]', 0, 0 FROM seats WHERE seat_id = ?`,
      [secondSeat, AI_SEAT_IDS[0]],
    );
    const elsewhere = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM hexes WHERE h3_index != ? LIMIT 1', [targetStrategicH3]);
    assert.ok(elsewhere);
    dbRun('UPDATE units SET h3_index = ? WHERE player = ? AND h3_index = ?', [elsewhere.h3_index, HUMAN_SEAT_ID, targetStrategicH3]);
    dbRun('UPDATE units SET player = ?, h3_index = ? WHERE id = ?', [secondSeat, targetStrategicH3, spare.id]);
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true, started.reason);
    fn();
  });
}

test('two-party exit removes a parent that is under half while both parties remain', () => {
  withTwoAiSession('aw-two-party-exit-below-', () => {
    const snap = getActiveTacticalBattleSnapshot();
    assert.ok(snap?.leadPartyId && isAiSeatId(snap.leadPartyId));
    const picked = pickParentForTest(snap.leadPartyId, 3);
    const baseline = tacticalSubUnitCountForStrategicUnitType(picked.unitType);
    const keepCount = Math.max(1, Math.floor((baseline - 1) / 2));
    const target = snap.subUnits.filter((unit) => unit.parentUnitId === picked.parentUnitId);
    const keep = new Set(target.slice(0, keepCount).map((unit) => unit.id));
    setActiveTacticalBattleSnapshotRef({
      ...snap,
      subUnits: snap.subUnits.filter((unit) => unit.parentUnitId !== picked.parentUnitId || keep.has(unit.id)),
    });
    endTacticalBattleSessionForTwoPartyVoluntaryExit();
    assert.equal(dbGetOne<{ id: string }>('SELECT id FROM units WHERE id = ?', [picked.parentUnitId]), undefined);
    assert.equal(isTacticalBattleActive(), false);
  });
});

test('two-party exit removes nothing more when one party is already gone', () => {
  withTwoAiSession('aw-two-party-exit-gone-', () => {
    const snap = getActiveTacticalBattleSnapshot();
    assert.ok(snap?.leadPartyId && isAiSeatId(snap.leadPartyId));
    const picked = pickParentForTest(snap.leadPartyId, 3);
    const baseline = tacticalSubUnitCountForStrategicUnitType(picked.unitType);
    const keepCount = Math.max(1, Math.floor((baseline - 1) / 2));
    const target = snap.subUnits.filter((unit) => unit.parentUnitId === picked.parentUnitId);
    const keep = new Set(target.slice(0, keepCount).map((unit) => unit.id));
    setActiveTacticalBattleSnapshotRef({
      ...snap,
      subUnits: snap.subUnits.filter((unit) => unit.player === snap.leadPartyId && (unit.parentUnitId !== picked.parentUnitId || keep.has(unit.id))),
    });
    endTacticalBattleSessionForTwoPartyVoluntaryExit();
    assert.ok(dbGetOne<{ id: string }>('SELECT id FROM units WHERE id = ?', [picked.parentUnitId]));
    assert.equal(isTacticalBattleActive(), false);
  });
});

test('a parent removed by the exit threshold is listed with its side, type, and name', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-destroyed-bailout-', ({ targetStrategicH3 }) => {
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true, started.reason);
    const picked = pickParentForTest(HUMAN_SEAT_ID, 3);
    const baseline = tacticalSubUnitCountForStrategicUnitType(picked.unitType);
    const keepCount = Math.max(1, Math.floor((baseline - 1) / 2));
    setCustomSurvivorCountForParent(picked.parentUnitId, keepCount);
    const listed = endTacticalBattleSessionForHumanVoluntaryExitBailout();
    const row = listed.find((unit) => unit.id === picked.parentUnitId);
    assert.ok(row);
    assert.equal(row.ownerId, HUMAN_SEAT_ID);
    assert.equal(row.unitType, picked.unitType);
    assert.ok(row.displayName.length > 0);
  });
});

test('eliminating every sub-unit records that parent and leaves a surviving parent off the list', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-destroyed-sync-', ({ targetStrategicH3 }) => {
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true, started.reason);
    const snap = getActiveTacticalBattleSnapshot();
    assert.ok(snap);
    const eliminated = pickParentForTest(HUMAN_SEAT_ID, 1);
    const surviving = snap.subUnits.find((unit) => unit.parentUnitId !== eliminated.parentUnitId);
    assert.ok(surviving);
    const subsAfter = snap.subUnits.filter((unit) => unit.parentUnitId !== eliminated.parentUnitId);
    syncStrategicUnitsDbWhenTacticalParentsEliminated(snap.subUnits, subsAfter);
    const listed = takeDestroyedBattleParents();
    assert.ok(listed.some((unit) => unit.id === eliminated.parentUnitId));
    assert.equal(listed.some((unit) => unit.id === surviving.parentUnitId), false);
  });
});

test('deleting a parent that is already gone does not record it again', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-destroyed-missing-', ({ targetStrategicH3 }) => {
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true, started.reason);
    const picked = pickParentForTest(HUMAN_SEAT_ID, 1);
    recordDestroyedBattleParents(deleteStrategicParentUnitAndApplyTransportOutcome(picked.parentUnitId));
    recordDestroyedBattleParents(deleteStrategicParentUnitAndApplyTransportOutcome(picked.parentUnitId));
    const listed = takeDestroyedBattleParents();
    assert.equal(listed.filter((unit) => unit.id === picked.parentUnitId).length, 1);
  });
});
