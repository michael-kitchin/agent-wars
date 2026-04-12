/**
 * DB-backed contracts for tactical snapshot synthesis: planning gate, res1 validation, placement determinism, session IPC edges.
 * Run with: node dist/main/tacticalBattle/computeTacticalBattleSnapshot.db.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latLngToCell } from 'h3-js';
import { dbRun } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { computeTacticalBattleSnapshot } from './computeTacticalBattleSnapshot';
import { applyValidatedOpponentTacticalOrders, startTacticalBattleForEnclosingRes1Hex } from './tacticalBattleSession';
import {
  tacticalDbFixtureRegisterDefaultAfterEach,
  tacticalDbFixtureSetStrategicPlanningPhase,
  tacticalDbFixtureWithTempDbContestedPlanning,
} from './testSupport/tacticalDbFixture';

tacticalDbFixtureRegisterDefaultAfterEach();

test('computeTacticalBattleSnapshot rejects non-res1 enclosing index', () => {
  withTempGameDb('aw-tactical-snap-r1-', () => {
    tacticalDbFixtureSetStrategicPlanningPhase();
    const res4 = latLngToCell(40.7, -74.0, 4);
    const r = computeTacticalBattleSnapshot(res4, 'battle-non-r1');
    assert.equal(r.snapshot, null);
    assert.ok(r.failureReason && /res1/i.test(r.failureReason));
  });
});

test('computeTacticalBattleSnapshot returns null when strategic phase is not planning', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-snap-phase-', ({ targetRes1H3 }) => {
    dbRun(`UPDATE turn_state SET phase = 'resolution' WHERE id = 1`);
    const r = computeTacticalBattleSnapshot(targetRes1H3, 'battle-wrong-phase');
    assert.equal(r.snapshot, null);
    assert.ok(r.failureReason && /planning/i.test(r.failureReason));
  });
});

test('computeTacticalBattleSnapshot is deterministic for identical battle id and DB state', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-snap-det-', ({ targetRes1H3 }) => {
    const battleId = 'deterministic-placement-seed';
    const a = computeTacticalBattleSnapshot(targetRes1H3, battleId);
    const b = computeTacticalBattleSnapshot(targetRes1H3, battleId);
    assert.ok(a.snapshot && b.snapshot);
    const pa = a.snapshot.subUnits.map((u) => ({ id: u.id, h3Index: u.h3Index }));
    const pb = b.snapshot.subUnits.map((u) => ({ id: u.id, h3Index: u.h3Index }));
    assert.deepEqual(pa, pb);
  });
});

test('startTacticalBattleForEnclosingRes1Hex rejects a second start while session is active', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-snap-dup-', ({ targetRes1H3 }) => {
    const first = startTacticalBattleForEnclosingRes1Hex(targetRes1H3);
    assert.equal(first.success, true);
    const second = startTacticalBattleForEnclosingRes1Hex(targetRes1H3);
    assert.equal(second.success, false);
    assert.ok(second.reason);
  });
});

test('applyValidatedOpponentTacticalOrders fails when no tactical session is active', () => {
  const r = applyValidatedOpponentTacticalOrders({
    movementOrders: [{ unitId: 'opponent-infantry-1', toH3Index: '811fafffffffff' }],
  });
  assert.equal(r.success, false);
  assert.ok(r.reason);
});
