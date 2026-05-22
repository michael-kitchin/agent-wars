/**
 * Tests for tactical main-process session helpers. Run with: node dist/main/tacticalBattle/tacticalBattleSession.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbGetOne } from '../gameDb';
import { tacticalSubUnitCountForStrategicUnitType } from './computeTacticalBattleSnapshot';
import { setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import {
  endTacticalBattleSession,
  endTacticalBattleSessionForHumanVoluntaryExitBailout,
  getActiveTacticalBattleSnapshot,
  isTacticalBattleActive,
  startTacticalBattleForEnclosingRes1Hex,
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
function pickParentForTest(player: 'human' | 'opponent', minTheoreticalBaseline = 2): { parentUnitId: string; unitType: string } {
  const snap = getActiveTacticalBattleSnapshot();
  if (!snap) throw new Error('pickParentForTest: expected active tactical snapshot');
  const byParent = new Map<string, { unitType: string; player: 'human' | 'opponent' }>();
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
function pickEvenBaselineParentForTest(player: 'human' | 'opponent'): { parentUnitId: string; unitType: string } {
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
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-bailout-below-half-', ({ targetRes1H3 }) => {
    const started = startTacticalBattleForEnclosingRes1Hex(targetRes1H3);
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
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-bailout-exact-half-', ({ targetRes1H3 }) => {
    const started = startTacticalBattleForEnclosingRes1Hex(targetRes1H3);
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
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-bailout-annihilation-skip-', ({ targetRes1H3 }) => {
    const started = startTacticalBattleForEnclosingRes1Hex(targetRes1H3);
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
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-bailout-legacy-fallback-', ({ targetRes1H3 }) => {
    const started = startTacticalBattleForEnclosingRes1Hex(targetRes1H3);
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
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-bailout-multi-parent-', ({ targetRes1H3 }) => {
    const started = startTacticalBattleForEnclosingRes1Hex(targetRes1H3);
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
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-bailout-scope-', ({ targetRes1H3 }) => {
    const started = startTacticalBattleForEnclosingRes1Hex(targetRes1H3);
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
