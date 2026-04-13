/**
 * DB-backed contracts for tactical snapshot synthesis: planning gate, res1 validation, placement determinism, session IPC edges.
 * Run with: node dist/main/tacticalBattle/computeTacticalBattleSnapshot.db.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CombatUnit } from '../combatUnitTypes';
import { filterMeleeCandidateHexesWithTacticalEntry, listMeleeCandidateHexes } from '../game-actions/meleeInterceptCandidates';
import { dbGetOne, dbRun, listUnitsForSnapshot } from '../gameDb';
import { getOrderedHexList } from '../mapData';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { computeTacticalBattleSnapshot } from './computeTacticalBattleSnapshot';
import {
  applyValidatedOpponentTacticalOrders,
  endTacticalBattleSession,
  startTacticalBattleForEnclosingRes1Hex,
} from './tacticalBattleSession';
import {
  tacticalDbFixtureRegisterDefaultAfterEach,
  tacticalDbFixtureSetStrategicPlanningPhase,
  tacticalDbFixtureWithTempDbContestedPlanning,
} from './testSupport/tacticalDbFixture';
import { tacticalRes4Cell } from './testSupport/tacticalRes4HexFixtures';

tacticalDbFixtureRegisterDefaultAfterEach();

test('computeTacticalBattleSnapshot rejects non-res1 enclosing index', () => {
  withTempGameDb('aw-tactical-snap-r1-', () => {
    tacticalDbFixtureSetStrategicPlanningPhase();
    const res4 = tacticalRes4Cell(40.7, -74.0);
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

test('computeTacticalBattleSnapshot succeeds in resolution when allowDuringStrategicResolution is true', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-snap-phase-allow-', ({ targetRes1H3 }) => {
    dbRun(`UPDATE turn_state SET phase = 'resolution' WHERE id = 1`);
    const r = computeTacticalBattleSnapshot(targetRes1H3, 'battle-resolution-probe', {
      allowDuringStrategicResolution: true,
    });
    assert.ok(r.snapshot, r.failureReason ?? 'expected snapshot');
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

test('active tactical session writes game_config and clears on endTacticalBattleSession', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-persist-key-', ({ targetRes1H3 }) => {
    const started = startTacticalBattleForEnclosingRes1Hex(targetRes1H3);
    assert.equal(started.success, true);
    const row = dbGetOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'tactical_battle_snapshot_json_v1'");
    assert.ok(row?.value);
    const parsed = JSON.parse(row.value) as { battleId?: string };
    assert.ok(parsed.battleId && parsed.battleId.length > 0);
    endTacticalBattleSession();
    const gone = dbGetOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'tactical_battle_snapshot_json_v1'");
    assert.equal(gone, undefined);
  });
});

test('Phase E: melee tactical-entry filter keeps contested res1 during resolution pause', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-melee-filter-phasee-', ({ targetRes1H3 }) => {
    dbRun(`UPDATE turn_state SET phase = 'resolution' WHERE id = 1`);
    const hexList = getOrderedHexList();
    const combatUnitsAfter: CombatUnit[] = listUnitsForSnapshot().map((u) => ({
      id: u.id,
      player: u.player,
      unitType: u.unitType,
      h3Index: u.h3Index,
      displayOrder: u.displayOrder ?? 0,
    }));
    const raw = listMeleeCandidateHexes(combatUnitsAfter, hexList);
    assert.ok(raw.includes(targetRes1H3), `expected raw melee candidate at ${targetRes1H3}`);
    const filtered = filterMeleeCandidateHexesWithTacticalEntry(raw, { allowDuringStrategicResolution: true });
    assert.ok(
      filtered.includes(targetRes1H3),
      `tactical probe should retain fixture hex; raw=${JSON.stringify(raw)} filtered=${JSON.stringify(filtered)}`
    );
  });
});
