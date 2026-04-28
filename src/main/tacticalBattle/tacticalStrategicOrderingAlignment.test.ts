/**
 * Phase 1 / 2.5 / 3 ordering contracts: tactical air sort matches strategic-style keys; infra reconcile + urban strike rollup;
 * opponent embark helper. Run: `node dist/main/tacticalBattle/tacticalStrategicOrderingAlignment.test.js`
 */

import assert from 'node:assert/strict';
import { gridDisk } from 'h3-js';
import { test } from 'node:test';
import { firstRingCellDistinctFrom } from './testSupport/tacticalRes4HexFixtures';
import type { AirStrikeOrder } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import {
  dbGetOne,
  getRes1InfrastructureForHex,
  reconcileRes1InfrastructureCountsFromRes4Overrides,
} from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import {
  applyTacticalAirStrikeThenRangedPhaseOnBattle,
  applyTacticalEmbarkPhaseOnBattle,
  sortTacticalAirStrikesForStrategicPhaseOrder,
} from './tacticalStrategicOrderPhases';

/**
 * Builds the same lexical ordering key strategic air resolution uses for merged strikes (attacker cell then unit id).
 *
 * Purpose: Lets tests assert tactical air sort matches strategic `resolveAirStrikePhase` ordering without importing production DB rows.
 * When to use: Only from this file's air-sort regression; pair with `sortTacticalAirStrikesForStrategicPhaseOrder` outputs.
 * Expected outcome: Returns attacker hex, an ASCII NUL separator, then unit id so `localeCompare` mirrors strategic merged-air ordering.
 * Exceptions: None.
 */
function strategicStyleAirOrderKey(unitId: string, attackerHex: string): string {
  return `${attackerHex}\0${unitId}`;
}

test('sortTacticalAirStrikesForStrategicPhaseOrder matches strategic-style attacker hex then unit id', () => {
  const hA = '8f283080dcb519f';
  const hB = '8f283081dcb519f';
  const sub: TacticalSubUnitSnapshot[] = [
    {
      id: 'air-z',
      parentUnitId: 'p-z',
      player: 'opponent',
      unitType: 'air',
      h3Index: hB,
      displayName: 'Z',
    },
    {
      id: 'air-a',
      parentUnitId: 'p-a',
      player: 'human',
      unitType: 'air',
      h3Index: hA,
      displayName: 'A',
    },
  ];
  const strikes: AirStrikeOrder[] = [
    { unitId: 'air-z', targetH3Index: hB, targetType: 'units' },
    { unitId: 'air-a', targetH3Index: hA, targetType: 'units' },
  ];
  const sorted = sortTacticalAirStrikesForStrategicPhaseOrder(strikes, sub);
  const keys = sorted.map((s) => strategicStyleAirOrderKey(s.unitId, sub.find((u) => u.id === s.unitId)!.h3Index));
  const expected = [...strikes]
    .map((s) => strategicStyleAirOrderKey(s.unitId, sub.find((u) => u.id === s.unitId)!.h3Index))
    .sort((a, b) => a.localeCompare(b));
  assert.deepStrictEqual(keys, expected);
  assert.strictEqual(sorted[0]!.unitId, 'air-a');
  assert.strictEqual(sorted[1]!.unitId, 'air-z');
});

test('applyTacticalEmbarkPhaseOnBattle applies opponent embark before callers run merged combat', () => {
  const res1 = '8f283082dcb519f';
  const h0 = '8f283083dcb519f';
  const ring = [h0];
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-embark-order',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'opp-land',
        parentUnitId: 'opponent-infantry-1',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: h0,
        displayName: 'I Infantry (01)',
      },
      {
        id: 'opp-nav',
        parentUnitId: 'opponent-naval-1',
        player: 'opponent',
        unitType: 'naval',
        h3Index: h0,
        displayName: 'I Transport (01)',
      },
    ],
  };
  const out = applyTacticalEmbarkPhaseOnBattle(snap, [{ unitId: 'opp-land', navalUnitId: 'opp-nav' }], 'opponent');
  const land = out.subUnits.find((u) => u.id === 'opp-land');
  assert.strictEqual(land?.embarkedOnSubUnitId, 'opp-nav');
});

test('reconcileRes1InfrastructureCountsFromRes4Overrides is callable after tactical DB session (Phase 2.5 smoke)', () => {
  withTempGameDb('aw-tactical-infra-reconcile-', () => {
    const { changedHexCount } = reconcileRes1InfrastructureCountsFromRes4Overrides();
    assert.ok(typeof changedHexCount === 'number');
    assert.ok(changedHexCount >= 0);
  });
});

test('tactical urban air strike updates res1 urban_hex_count after reconcile (Phase 2.5)', () => {
  withTempGameDb('aw-tactical-infra-urban-', () => {
    const urban = dbGetOne<{ h3Index: string; parentH3Index: string }>(
      `SELECT h3_index AS h3Index, parent_h3_index AS parentH3Index
       FROM res4_feature_overrides
       WHERE is_urban = 1 AND is_rubble = 0
       LIMIT 1`
    );
    assert.ok(urban);
    const parent = urban!.parentH3Index;
    const beforeUrban = getRes1InfrastructureForHex(parent).urbanHexCount;
    assert.ok(beforeUrban > 0, 'fixture needs positive res1 urban rollup before strike');
    const ring = [...gridDisk(urban!.h3Index, 2)];
    assert.ok(ring.includes(urban!.h3Index));
    const snap: TacticalBattleSnapshot = {
      battleId: 'tb-infra-urban',
      enclosingRes1H3Index: parent,
      res4ChildH3Indexes: ring,
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-air-infra',
          parentUnitId: 'human-air-parent-infra',
          player: 'human',
          unitType: 'air',
          h3Index: urban!.h3Index,
          displayName: 'Air (infra test)',
        },
      ],
    };
    const rolls = [0.15, 0.95];
    let i = 0;
    const next = () => rolls[i++] ?? 0.99;
    const out = applyTacticalAirStrikeThenRangedPhaseOnBattle(
      snap,
      [{ unitId: 'hum-air-infra', targetH3Index: urban!.h3Index, targetType: 'urban' }],
      undefined,
      'human',
      next,
      'singlePlayer'
    );
    assert.ok(
      out.infrastructureDestroyedEvents.length > 0,
      'urban res4 strike should emit infrastructureDestroyedEvents'
    );
    reconcileRes1InfrastructureCountsFromRes4Overrides();
    const afterUrban = getRes1InfrastructureForHex(parent).urbanHexCount;
    assert.strictEqual(afterUrban, beforeUrban - 1);
    assert.strictEqual(
      out.airStrikePlaybackMoves.length,
      out.airStrikeAttemptCount,
      'tactical air playback: one animation row per strike attempt'
    );
    assert.ok(out.airStrikePlaybackStrikeHexes.includes(urban!.h3Index), 'strike hex list includes urban target res4');
  });
});

test('applyTacticalAirStrikeThenRangedPhaseOnBattle leaves air playback arrays empty when no air orders', () => {
  withTempGameDb('aw-tactical-no-air-playback-', () => {
    const urban = dbGetOne<{ h3Index: string; parentH3Index: string }>(
      `SELECT h3_index AS h3Index, parent_h3_index AS parentH3Index
       FROM res4_feature_overrides
       WHERE is_urban = 1 AND is_rubble = 0
       LIMIT 1`
    );
    assert.ok(urban);
    const ring = [...gridDisk(urban!.h3Index, 2)];
    const neighbor = firstRingCellDistinctFrom(urban!.h3Index);
    assert.ok(ring.includes(neighbor));
    const terrain: Record<string, string> = {};
    for (const h of ring) terrain[h] = 'plains';
    const snap: TacticalBattleSnapshot = {
      battleId: 'tb-ranged-no-air-playback',
      enclosingRes1H3Index: urban!.parentH3Index,
      res4ChildH3Indexes: ring,
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      res4TerrainKindByH3: terrain,
      subUnits: [
        {
          id: 'hi-no-air',
          parentUnitId: 'ph-na',
          player: 'human',
          unitType: 'infantry',
          h3Index: neighbor,
          displayName: '1st Infantry (no air playback)',
        },
      ],
    };
    let i = 0;
    const next = () => [0.99][i++] ?? 0.99;
    const out = applyTacticalAirStrikeThenRangedPhaseOnBattle(
      snap,
      undefined,
      [{ unitId: 'hi-no-air', targetH3Index: urban!.h3Index }],
      'human',
      next,
      'singlePlayer'
    );
    assert.strictEqual(out.airStrikeAttemptCount, 0);
    assert.deepStrictEqual(out.airStrikePlaybackMoves, []);
    assert.deepStrictEqual(out.airStrikePlaybackStrikeHexes, []);
  });
});

test('tactical infra-only ranged strike leaves urban DB row when strike roll misses', () => {
  withTempGameDb('aw-tactical-ranged-infra-miss-', () => {
    const urban = dbGetOne<{ h3Index: string; parentH3Index: string }>(
      `SELECT h3_index AS h3Index, parent_h3_index AS parentH3Index
       FROM res4_feature_overrides
       WHERE is_urban = 1 AND is_rubble = 0
       LIMIT 1`
    );
    assert.ok(urban);
    const ring = [...gridDisk(urban!.h3Index, 2)];
    const neighbor = firstRingCellDistinctFrom(urban!.h3Index);
    assert.ok(ring.includes(neighbor));
    const terrain: Record<string, string> = {};
    for (const h of ring) terrain[h] = 'plains';
    const snap: TacticalBattleSnapshot = {
      battleId: 'tb-ranged-infra-miss',
      enclosingRes1H3Index: urban!.parentH3Index,
      res4ChildH3Indexes: ring,
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      res4TerrainKindByH3: terrain,
      subUnits: [
        {
          id: 'hi-infra-miss',
          parentUnitId: 'ph-im',
          player: 'human',
          unitType: 'infantry',
          h3Index: neighbor,
          displayName: '1st Infantry (infra miss)',
        },
      ],
    };
    let i = 0;
    const rolls = [0.5];
    const next = () => rolls[i++] ?? 0.99;
    applyTacticalAirStrikeThenRangedPhaseOnBattle(
      snap,
      undefined,
      [{ unitId: 'hi-infra-miss', targetH3Index: urban!.h3Index }],
      'human',
      next,
      'singlePlayer'
    );
    const row = dbGetOne<{ isRubble: number }>(
      'SELECT is_rubble AS isRubble FROM res4_feature_overrides WHERE h3_index = ?',
      [urban!.h3Index]
    );
    assert.strictEqual(row?.isRubble, 0);
  });
});

test('tactical infra-only ranged strike converts urban DB row to rubble on hit', () => {
  withTempGameDb('aw-tactical-ranged-infra-hit-', () => {
    const urban = dbGetOne<{ h3Index: string; parentH3Index: string }>(
      `SELECT h3_index AS h3Index, parent_h3_index AS parentH3Index
       FROM res4_feature_overrides
       WHERE is_urban = 1 AND is_rubble = 0
       LIMIT 1`
    );
    assert.ok(urban);
    const ring = [...gridDisk(urban!.h3Index, 2)];
    const neighbor = firstRingCellDistinctFrom(urban!.h3Index);
    assert.ok(ring.includes(neighbor));
    const terrain: Record<string, string> = {};
    for (const h of ring) terrain[h] = 'plains';
    const snap: TacticalBattleSnapshot = {
      battleId: 'tb-ranged-infra-hit',
      enclosingRes1H3Index: urban!.parentH3Index,
      res4ChildH3Indexes: ring,
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      strategicHexTerrain: 'land',
      strategicHexTerrainKind: 'plains',
      res4TerrainKindByH3: terrain,
      subUnits: [
        {
          id: 'hi-infra-hit',
          parentUnitId: 'ph-ih',
          player: 'human',
          unitType: 'infantry',
          h3Index: neighbor,
          displayName: '1st Infantry (infra hit)',
        },
      ],
    };
    let j = 0;
    const rollsHit = [0.01];
    const nextHit = () => rollsHit[j++] ?? 0.99;
    const out = applyTacticalAirStrikeThenRangedPhaseOnBattle(
      snap,
      undefined,
      [{ unitId: 'hi-infra-hit', targetH3Index: urban!.h3Index }],
      'human',
      nextHit,
      'singlePlayer'
    );
    assert.ok(out.infrastructureDestroyedEvents.length > 0);
    const row = dbGetOne<{ isRubble: number; isUrban: number }>(
      'SELECT is_rubble AS isRubble, is_urban AS isUrban FROM res4_feature_overrides WHERE h3_index = ?',
      [urban!.h3Index]
    );
    assert.strictEqual(row?.isRubble, 1);
    assert.strictEqual(row?.isUrban, 0);
  });
});
