/**
 * DB-backed contracts for tactical snapshot synthesis: planning gate, res1 validation, placement determinism, session IPC edges.
 * Run with: node dist/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CombatUnit } from '../combatUnitTypes';
import { filterMeleeCandidateHexesWithTacticalEntry, listMeleeCandidateHexes } from '../gameActions/meleeInterceptCandidates';
import { dbGetOne, dbRun, listUnitsForSnapshot } from '../gameDb';
import { getOrderedHexList } from '../mapData';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { parseTacticalSubUnitId } from '../../shared/unitIds';
import { updateTacticalSealiftSlot } from '../gameActions';
import { computeTacticalBattleSnapshot } from './computeTacticalBattleSnapshot';
import {
  applyValidatedOpponentTacticalOrders,
  endTacticalBattleSession,
  getActiveTacticalBattleSnapshot,
  startTacticalBattleForEnclosingRes1Hex,
} from './tacticalBattleSession';
import { getTacticalSealiftStackStateForHex } from './tacticalSealiftStackState';
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
    const players = new Set(a.snapshot.subUnits.map((sub) => sub.player));
    assert.ok(players.has('human') && players.has('opponent'));
    const sidesByHex = new Map<string, Set<string>>();
    for (const sub of a.snapshot.subUnits) {
      const sides = sidesByHex.get(sub.h3Index) ?? new Set<string>();
      sides.add(sub.player);
      sidesByHex.set(sub.h3Index, sides);
      assert.equal(sides.size, 1, sub.h3Index);
    }
    const pa = a.snapshot.subUnits.map((u) => ({ id: u.id, h3Index: u.h3Index }));
    const pb = b.snapshot.subUnits.map((u) => ({ id: u.id, h3Index: u.h3Index }));
    assert.deepEqual(pa, pb);
    for (const sub of a.snapshot.subUnits) {
      const parsed = parseTacticalSubUnitId(sub.id);
      assert.ok(parsed, `expected compact sub-unit id, got ${sub.id}`);
      assert.equal(parsed.parentUnitId, sub.parentUnitId);
    }
  });
});

test('computeTacticalBattleSnapshot records placed baseline counts by parent id', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-snap-baseline-', ({ targetRes1H3 }) => {
    const battleId = 'baseline-map-probe';
    const result = computeTacticalBattleSnapshot(targetRes1H3, battleId);
    assert.ok(result.snapshot, result.failureReason ?? 'expected snapshot');
    const byParent = result.snapshot!.initialPlacedSubUnitCountByParentId;
    assert.ok(byParent, 'expected baseline counts map');
    const computed = result.snapshot!.subUnits.reduce<Record<string, number>>((acc, sub) => {
      const prior = acc[sub.parentUnitId] ?? 0;
      acc[sub.parentUnitId] = prior + 1;
      return acc;
    }, {});
    assert.deepEqual(byParent, computed);
  });
});

test('computeTacticalBattleSnapshot copies each parent origin onto its sub-units', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-snap-origin-', ({ targetRes1H3 }) => {
    const result = computeTacticalBattleSnapshot(targetRes1H3, 'origin-copy-probe');
    assert.ok(result.snapshot, result.failureReason ?? 'expected snapshot');
    const originByParentId = new Map(listUnitsForSnapshot().map((u) => [u.id, u.origin]));
    assert.ok(result.snapshot.subUnits.some((sub) => sub.origin), 'expected at least one sub-unit with an origin');
    for (const sub of result.snapshot.subUnits) {
      assert.deepEqual(sub.origin, originByParentId.get(sub.parentUnitId), sub.id);
    }
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
    const baseline = dbGetOne<{ value: string }>(
      "SELECT value FROM game_config WHERE key = 'tactical_transport_baseline_json_v1'"
    );
    assert.ok(baseline?.value && baseline.value.length > 0, 'expected transport baseline after tactical start');
    endTacticalBattleSession();
    const gone = dbGetOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'tactical_battle_snapshot_json_v1'");
    assert.equal(gone, undefined);
    const baselineGone = dbGetOne<{ value: string }>(
      "SELECT value FROM game_config WHERE key = 'tactical_transport_baseline_json_v1'"
    );
    assert.equal(baselineGone, undefined, 'expected transport baseline cleared after tactical end');
  });
});

test('updateTacticalSealiftSlot embarks then debarks and syncs strategic transport rows', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-sealift-slot-ipc-', ({ targetRes1H3 }) => {
    const started = startTacticalBattleForEnclosingRes1Hex(targetRes1H3);
    assert.equal(started.success, true);
    const snap = started.battle!;
    let stackHex: string | null = null;
    for (const h of snap.res4ChildH3Indexes) {
      const st = getTacticalSealiftStackStateForHex(h);
      if (st.showSealiftSection && st.navalRows.length > 0 && st.landOptions.length > 0 && !st.controlsDisabled) {
        stackHex = h;
        break;
      }
    }
    if (!stackHex) return;
    const st0 = getTacticalSealiftStackStateForHex(stackHex);
    const row0 = st0.navalRows[0]!;
    const navalUnitId = row0.navalUnitId;
    const landSubId = st0.landOptions[0]!.unitId;
    if (row0.slot1UnitId === landSubId) {
      assert.equal(updateTacticalSealiftSlot(stackHex, navalUnitId, 1, null).success, true);
    } else if (row0.slot2UnitId === landSubId) {
      assert.equal(updateTacticalSealiftSlot(stackHex, navalUnitId, 2, null).success, true);
    }
    const st1 = getTacticalSealiftStackStateForHex(stackHex);
    const row1 = st1.navalRows[0]!;
    if (row1.slot1UnitId && row1.slot2UnitId) return;
    const putSlot: 1 | 2 = row1.slot1UnitId ? 2 : 1;
    const emb = updateTacticalSealiftSlot(stackHex, navalUnitId, putSlot, landSubId);
    assert.equal(emb.success, true, emb.reason);
    const landAfter = getActiveTacticalBattleSnapshot()!.subUnits.find((u) => u.id === landSubId);
    assert.equal(landAfter?.embarkedOnSubUnitId, navalUnitId);
    const parent = landAfter?.parentUnitId;
    if (parent) {
      const row = dbGetOne<{ navalUnitId: string }>(
        'SELECT naval_unit_id AS navalUnitId FROM unit_transport_assignments WHERE land_unit_id = ?',
        [parent]
      );
      assert.ok(row?.navalUnitId);
    }
    const deb = updateTacticalSealiftSlot(stackHex, navalUnitId, putSlot, null);
    assert.equal(deb.success, true, deb.reason);
    const landDeb = getActiveTacticalBattleSnapshot()!.subUnits.find((u) => u.id === landSubId);
    assert.ok(!landDeb?.embarkedOnSubUnitId);
    if (parent) {
      const rowGone = dbGetOne<{ navalUnitId: string }>(
        'SELECT naval_unit_id AS navalUnitId FROM unit_transport_assignments WHERE land_unit_id = ?',
        [parent]
      );
      assert.equal(rowGone, undefined);
    }
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
