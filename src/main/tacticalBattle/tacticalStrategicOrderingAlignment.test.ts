/**
 * Phase 1 / 2.5 / 3 ordering contracts: tactical air sort matches strategic-style keys; infra reconcile + urban strike rollup;
 * opponent embark helper. Run: `node dist/main/tacticalBattle/tacticalStrategicOrderingAlignment.test.js`
 */

import assert from 'node:assert/strict';
import { gridDisk } from 'h3-js';
import { test } from 'node:test';
import { firstRingCellDistinctFrom, tacticalRes1Cell, tacticalRes4UnderRes1Corner } from './testSupport/tacticalRes4HexFixtures';
import { tacticalSequencedRandom, tacticalUniformForCombatDieFace } from './testSupport/tacticalDiceFixtures';
import type { AirStrikeOrder } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import {
  dbGetOne,
  dbRun,
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

test('tactical air strike against units removes one sub-unit when sibling sub-units remain', () => {
  const res1 = tacticalRes1Cell(11, 12);
  const h0 = tacticalRes4UnderRes1Corner(11, 12);
  const h1 = firstRingCellDistinctFrom(h0);
  const ring = [...gridDisk(h0, 1)];
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-air-sibling-survives',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'hum-air',
        parentUnitId: 'human-air-1',
        player: 'human',
        unitType: 'air',
        h3Index: h0,
        displayName: '1st Squadron (01)',
      },
      {
        id: 'op-a',
        parentUnitId: 'opponent-armor-1',
        player: 'opponent',
        unitType: 'armor',
        h3Index: h1,
        displayName: 'I Armor (01)',
      },
      {
        id: 'op-b',
        parentUnitId: 'opponent-armor-1',
        player: 'opponent',
        unitType: 'armor',
        h3Index: h1,
        displayName: 'I Armor (02)',
      },
    ],
  };
  const out = applyTacticalAirStrikeThenRangedPhaseOnBattle(
    snap,
    [{ unitId: 'hum-air', targetH3Index: h1, targetType: 'units' }],
    undefined,
    'human',
    tacticalSequencedRandom([
      tacticalUniformForCombatDieFace(1), // air strike hits (roll 1 <= air attack 10)
      tacticalUniformForCombatDieFace(20), // surviving sibling armor AA misses (roll 20 > armor attack 10)
    ])
  );
  const survivingOpp = out.battle.subUnits.filter((u) => u.parentUnitId === 'opponent-armor-1');
  assert.strictEqual(survivingOpp.length, 1, 'one sibling sub-unit should survive');
  assert.strictEqual(out.battle.subUnits.length, 2, 'air plus one opponent sub-unit remain');
  assert.strictEqual(out.killsByAirStrike.length, 1);
});

test('tactical air strike deletes strategic parent when the last sub-unit is eliminated', () => {
  withTempGameDb('aw-tactical-air-last-sub-', () => {
    const res1 = tacticalRes1Cell(13, 14);
    const h0 = tacticalRes4UnderRes1Corner(13, 14);
    const h1 = firstRingCellDistinctFrom(h0);
    const ring = [...gridDisk(h0, 1)];
    const parentId = 'opponent-armor-test-last-sub';
    dbRun('INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES (?, ?, ?, ?, ?)', [
      parentId,
      'opponent',
      'armor',
      res1,
      0,
    ]);
    const snap: TacticalBattleSnapshot = {
      battleId: 'tb-air-last-sub',
      enclosingRes1H3Index: res1,
      res4ChildH3Indexes: ring,
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-air',
          parentUnitId: 'human-air-1',
          player: 'human',
          unitType: 'air',
          h3Index: h0,
          displayName: '1st Squadron (01)',
        },
        {
          id: 'op-only',
          parentUnitId: parentId,
          player: 'opponent',
          unitType: 'armor',
          h3Index: h1,
          displayName: 'I Armor (01)',
        },
      ],
    };
    const out = applyTacticalAirStrikeThenRangedPhaseOnBattle(
      snap,
      [{ unitId: 'hum-air', targetH3Index: h1, targetType: 'units' }],
      undefined,
      'human',
      tacticalSequencedRandom([
        tacticalUniformForCombatDieFace(1), // air strike hits; sole defender eliminated, no AA roll
      ])
    );
    assert.strictEqual(out.battle.subUnits.some((u) => u.parentUnitId === parentId), false);
    const row = dbGetOne<{ id: string }>('SELECT id FROM units WHERE id = ?', [parentId]);
    assert.equal(row, undefined);
  });
});

test('tactical infrastructure counterattack removes attacker without killsByAirStrike ledger rows', () => {
  withTempGameDb('aw-tactical-infra-counter-', () => {
    const urban = dbGetOne<{ h3Index: string; parentH3Index: string }>(
      `SELECT h3_index AS h3Index, parent_h3_index AS parentH3Index
       FROM res4_feature_overrides
       WHERE is_urban = 1 AND is_rubble = 0
       LIMIT 1`
    );
    assert.ok(urban);
    const ring = [...gridDisk(urban!.h3Index, 2)];
    const neighbor = firstRingCellDistinctFrom(urban!.h3Index);
    const snap: TacticalBattleSnapshot = {
      battleId: 'tb-infra-counter',
      enclosingRes1H3Index: urban!.parentH3Index,
      res4ChildH3Indexes: ring,
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-air-infra-counter',
          parentUnitId: 'human-air-parent-infra-counter',
          player: 'human',
          unitType: 'air',
          h3Index: neighbor,
          displayName: 'Air (infra counter)',
        },
      ],
    };
    const out = applyTacticalAirStrikeThenRangedPhaseOnBattle(
      snap,
      [{ unitId: 'hum-air-infra-counter', targetH3Index: urban!.h3Index, targetType: 'urban' }],
      undefined,
      'human',
      tacticalSequencedRandom([
        tacticalUniformForCombatDieFace(1), // infra strike hits (roll 1 <= air attack 10)
        tacticalUniformForCombatDieFace(1), // urban counterattack succeeds (roll 1 <= threshold 3)
      ]),
      'singlePlayer'
    );
    assert.strictEqual(out.killsByAirStrike.length, 0);
    assert.ok(
      out.removedUnits.some((u) => u.id === 'hum-air-infra-counter'),
      'counterattack should remove the attacking air sub-unit from the snapshot'
    );
  });
});

test('tactical infantry in the target hex can AA a striking air sub-unit', () => {
  const res1 = tacticalRes1Cell(12, 34);
  const res4Inf = tacticalRes4UnderRes1Corner(12, 34);
  const res4Air = firstRingCellDistinctFrom(res4Inf);
  const ring = [...new Set([res4Inf, res4Air, ...gridDisk(res4Inf, 2)])];
  const terrain: Record<string, string> = {};
  for (const h of ring) terrain[h] = 'plains';
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-inf-aa',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: terrain,
    subUnits: [
      {
        id: 'hum-air-aa',
        parentUnitId: 'p-air',
        player: 'human',
        unitType: 'air',
        h3Index: res4Air,
        displayName: 'Air',
      },
      {
        id: 'hum-air-aa-sibling',
        parentUnitId: 'p-air',
        player: 'human',
        unitType: 'air',
        h3Index: res4Air,
        displayName: 'Air sibling',
      },
      {
        id: 'opp-inf-aa',
        parentUnitId: 'p-inf',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: res4Inf,
        displayName: 'Infantry',
      },
    ],
  };
  const out = applyTacticalAirStrikeThenRangedPhaseOnBattle(
    snap,
    [{ unitId: 'hum-air-aa', targetH3Index: res4Inf, targetType: 'units' }],
    undefined,
    'human',
    tacticalSequencedRandom([
      tacticalUniformForCombatDieFace(20), // air strike misses (roll 20 > air attack 10)
      tacticalUniformForCombatDieFace(1), // infantry AA hits (roll 1 <= infantry attack 3)
    ]),
    'singlePlayer'
  );
  assert.equal(out.killsByAirStrike.length, 0, 'strike miss must not kill the infantry defender');
  assert.equal(out.killsByReturnFire.length, 1, 'tactical infantry must still get an AA roll');
  assert.equal(out.killsByReturnFire[0]?.victimId, 'hum-air-aa');
  assert.deepEqual(out.killsByReturnFire[0]?.killerIds, ['opp-inf-aa']);
  assert.ok(
    out.removedUnits.some((u) => u.id === 'hum-air-aa'),
    'infantry AA hit should remove the striking air sub-unit'
  );
  assert.deepEqual(
    out.airStrikeDiceRolls.map((r) => [r.kind, r.face, r.anchorH3Index]),
    [
      ['airStrike', 20, res4Inf],
      ['antiAir', 1, res4Inf],
    ],
    'strike and AA rolls are recorded in order on the target cell'
  );
  assert.ok(
    out.battle.subUnits.some((u) => u.id === 'opp-inf-aa'),
    'infantry defender should survive a missed strike'
  );
});

/**
 * Runs one air strike on a lone infantry sub-unit whose cell has the given terrain kind.
 *
 * Purpose: Isolates the target cell's air cover for the cover regression below.
 * When to use: Only from the cover test in this file.
 * Expected outcome: The phase output for a single strike seeded with `faces`; throws if more draws are made than seeded.
 * Exceptions: Throws when resolution draws more rolls than `faces` provides.
 */
function strikeLoneInfantryOn(targetTerrainKind: string, faces: readonly number[]) {
  const res1 = tacticalRes1Cell(12, 34);
  const res4Inf = tacticalRes4UnderRes1Corner(12, 34);
  const res4Air = firstRingCellDistinctFrom(res4Inf);
  const ring = [...new Set([res4Inf, res4Air, ...gridDisk(res4Inf, 2)])];
  const terrain: Record<string, string> = Object.fromEntries(ring.map((h) => [h, 'plains']));
  terrain[res4Inf] = targetTerrainKind;
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-air-cover',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: terrain,
    subUnits: [
      { id: 'hum-air-cover', parentUnitId: 'p-air', player: 'human', unitType: 'air', h3Index: res4Air, displayName: 'Air' },
      { id: 'opp-inf-cover', parentUnitId: 'p-inf', player: 'opponent', unitType: 'infantry', h3Index: res4Inf, displayName: 'Infantry' },
    ],
  };
  const strike: AirStrikeOrder = { unitId: 'hum-air-cover', targetH3Index: res4Inf, targetType: 'units' };
  const next = tacticalSequencedRandom(faces.map(tacticalUniformForCombatDieFace));
  return applyTacticalAirStrikeThenRangedPhaseOnBattle(snap, [strike], undefined, 'human', next, 'singlePlayer');
}

test('forest air cover turns a strike roll of 10 into a miss that hits on plains', () => {
  // Forest: air attack 10 - 1 cover = 9, so a 10 misses; infantry AA (attack 3) misses a 20.
  const forest = strikeLoneInfantryOn('forest', [10, 20]);
  assert.equal(forest.killsByAirStrike.length, 0);
  assert.equal(forest.killsByReturnFire.length, 0);
  // Plains: no cover, so a 10 hits; the lone defender is removed and draws no AA roll.
  const plains = strikeLoneInfantryOn('plains', [10]);
  assert.deepEqual(plains.killsByAirStrike.map((k) => k.victimId), ['opp-inf-cover']);
  assert.equal(plains.killsByReturnFire.length, 0);
});
