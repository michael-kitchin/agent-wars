/**
 * DB-backed contracts for tactical snapshot synthesis: planning gate, strategic validation, placement determinism, session IPC edges.
 * Run with: node dist/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CombatUnit } from '../combatUnitTypes';
import { filterMeleeCandidateHexesWithTacticalEntry, listMeleeCandidateHexes } from '../gameActions/meleeInterceptCandidates';
import { dbGetOne, dbRun, isDbReady, listUnitsForSnapshot } from '../gameDb';
import { getOrderedHexList } from '../mapData';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { tacticalChildrenOf } from '../../shared/h3Resolutions';
import { tacticalBattleFootprint } from '../../shared/tacticalBattleFootprint';
import { parseTacticalSubUnitId } from '../../shared/unitIds';
import { updateTacticalSealiftSlot } from '../gameActions';
import { computeTacticalBattleSnapshot } from './computeTacticalBattleSnapshot';
import { persistOriginBonusSettings } from '../gameDb/originBonusConfig';
import {
  applyValidatedOpponentTacticalOrders,
  endTacticalBattleSession,
  getActiveTacticalBattleSnapshot,
  startTacticalBattleForEnclosingHex,
} from './tacticalBattleSession';
import { getTacticalSealiftStackStateForHex } from './tacticalSealiftStackState';
import {
  tacticalDbFixtureRegisterDefaultAfterEach,
  tacticalDbFixtureSetStrategicPlanningPhase,
  tacticalDbFixtureWithTempDbContestedPlanning,
} from './testSupport/tacticalDbFixture';
import { tacticalCell } from './testSupport/tacticalHexFixtures';

tacticalDbFixtureRegisterDefaultAfterEach();

test('computeTacticalBattleSnapshot copies the terrain bonus only while it is on', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-snap-terrain-bonus-', ({ targetStrategicH3 }) => {
    const settings = { originBonusEnabled: false, terrainBonusEnabled: true } as const;
    persistOriginBonusSettings({ run: dbRun, hasDb: isDbReady }, settings);
    const on = computeTacticalBattleSnapshot(targetStrategicH3, 'battle-terrain-bonus-on');
    assert.equal(on.snapshot?.terrainBonusEnabled, true);
    persistOriginBonusSettings({ run: dbRun, hasDb: isDbReady }, { ...settings, terrainBonusEnabled: false });
    const off = computeTacticalBattleSnapshot(targetStrategicH3, 'battle-terrain-bonus-off');
    assert.equal(off.snapshot?.terrainBonusEnabled, undefined);
  });
});

test('computeTacticalBattleSnapshot rejects non-res1 enclosing index', () => {
  withTempGameDb('aw-tactical-snap-r1-', () => {
    tacticalDbFixtureSetStrategicPlanningPhase();
    const tacticalIndex = tacticalCell(40.7, -74.0);
    const r = computeTacticalBattleSnapshot(tacticalIndex, 'battle-non-r1');
    assert.equal(r.snapshot, null);
    assert.ok(r.failureReason && /res1/i.test(r.failureReason));
  });
});

test('computeTacticalBattleSnapshot returns null when strategic phase is not planning', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-snap-phase-', ({ targetStrategicH3 }) => {
    dbRun(`UPDATE turn_state SET phase = 'resolution' WHERE id = 1`);
    const r = computeTacticalBattleSnapshot(targetStrategicH3, 'battle-wrong-phase');
    assert.equal(r.snapshot, null);
    assert.ok(r.failureReason && /planning/i.test(r.failureReason));
  });
});

test('computeTacticalBattleSnapshot succeeds in resolution when allowDuringStrategicResolution is true', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-snap-phase-allow-', ({ targetStrategicH3 }) => {
    dbRun(`UPDATE turn_state SET phase = 'resolution' WHERE id = 1`);
    const r = computeTacticalBattleSnapshot(targetStrategicH3, 'battle-resolution-probe', {
      allowDuringStrategicResolution: true,
    });
    assert.ok(r.snapshot, r.failureReason ?? 'expected snapshot');
  });
});

test('computeTacticalBattleSnapshot is deterministic for identical battle id and DB state', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-snap-det-', ({ targetStrategicH3 }) => {
    const battleId = 'deterministic-placement-seed';
    const a = computeTacticalBattleSnapshot(targetStrategicH3, battleId);
    const b = computeTacticalBattleSnapshot(targetStrategicH3, battleId);
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
    const core = new Set(tacticalBattleFootprint(targetStrategicH3).coreChildH3Indexes);
    assert.ok(a.snapshot.tacticalChildH3Indexes.length > tacticalChildrenOf(targetStrategicH3).length);
    for (const sub of a.snapshot.subUnits) {
      assert.equal(core.has(sub.h3Index), true);
    }
    for (const sub of a.snapshot.subUnits) {
      const parsed = parseTacticalSubUnitId(sub.id);
      assert.ok(parsed, `expected compact sub-unit id, got ${sub.id}`);
      assert.equal(parsed.parentUnitId, sub.parentUnitId);
    }
  });
});

test('computeTacticalBattleSnapshot records placed baseline counts by parent id', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-snap-baseline-', ({ targetStrategicH3 }) => {
    const battleId = 'baseline-map-probe';
    const result = computeTacticalBattleSnapshot(targetStrategicH3, battleId);
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

test('a missile born on an urban cell is one sub-unit on that cell', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-missile-place-', ({ targetStrategicH3, humanId }) => {
    const urban = dbGetOne<{ h3Index: string }>(
      'SELECT h3_index AS h3Index FROM res_t_feature_overrides WHERE parent_h3_index = ? AND is_urban = 1 LIMIT 1',
      [targetStrategicH3]
    );
    assert.ok(urban, 'contested hex has no urban tactical cell; do not invent one');
    dbRun(
      `UPDATE units SET unit_type = 'missile', birth_h3_index = ?, birth_res_t_h3_index = ? WHERE id = ?`,
      [targetStrategicH3, urban.h3Index, humanId]
    );
    const result = computeTacticalBattleSnapshot(targetStrategicH3, 'missile-birth-place');
    assert.ok(result.snapshot, result.failureReason ?? 'expected snapshot');
    const placed = result.snapshot.subUnits.filter((sub) => sub.parentUnitId === humanId);
    assert.equal(placed.length, 1);
    assert.equal(placed[0]?.unitType, 'missile');
    assert.equal(placed[0]?.h3Index, urban.h3Index);
  });
});

test('computeTacticalBattleSnapshot copies each parent origin onto its sub-units', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-snap-origin-', ({ targetStrategicH3 }) => {
    const result = computeTacticalBattleSnapshot(targetStrategicH3, 'origin-copy-probe');
    assert.ok(result.snapshot, result.failureReason ?? 'expected snapshot');
    const originByParentId = new Map(listUnitsForSnapshot().map((u) => [u.id, u.origin]));
    assert.ok(result.snapshot.subUnits.some((sub) => sub.origin), 'expected at least one sub-unit with an origin');
    for (const sub of result.snapshot.subUnits) {
      assert.deepEqual(sub.origin, originByParentId.get(sub.parentUnitId), sub.id);
    }
  });
});

test('startTacticalBattleForEnclosingRes1Hex rejects a second start while session is active', () => {
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-snap-dup-', ({ targetStrategicH3 }) => {
    const first = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(first.success, true);
    const second = startTacticalBattleForEnclosingHex(targetStrategicH3);
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
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-persist-key-', ({ targetStrategicH3 }) => {
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
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
  tacticalDbFixtureWithTempDbContestedPlanning('aw-tactical-sealift-slot-ipc-', ({ targetStrategicH3 }) => {
    const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
    assert.equal(started.success, true);
    const snap = started.battle!;
    let stackHex: string | null = null;
    for (const h of snap.tacticalChildH3Indexes) {
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
  tacticalDbFixtureWithTempDbContestedPlanning('aw-melee-filter-phasee-', ({ targetStrategicH3 }) => {
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
    assert.ok(raw.includes(targetStrategicH3), `expected raw melee candidate at ${targetStrategicH3}`);
    const filtered = filterMeleeCandidateHexesWithTacticalEntry(raw, { allowDuringStrategicResolution: true });
    assert.ok(
      filtered.includes(targetStrategicH3),
      `tactical probe should retain fixture hex; raw=${JSON.stringify(raw)} filtered=${JSON.stringify(filtered)}`
    );
  });
});
