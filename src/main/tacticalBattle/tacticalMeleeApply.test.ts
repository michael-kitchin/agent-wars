/**
 * Contract tests for tactical melee resolution after support orders. Run with:
 * `node dist/main/tacticalBattle/tacticalMeleeApply.test.js`
 *
 * **Melee semantics (plan §1.1 / D1):** Tactical has no intercept modal; `applyTacticalMeleeAfterSupportOrders` is the
 * **automatic** path equivalent to strategic **Ignore** on every melee intercept — one `runMeleePhase` pass per Ready beat.
 * Playback for toasts/animations uses `TacticalCommitResolutionPlayback` melee fields populated from this helper (`readyHandler.ts`).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import { dbRun, isDbReady } from '../gameDb';
import { persistOriginBonusSettings } from '../gameDb/originBonusConfig';
import { COMBAT_DIE_SIDES } from '../combatDice';
import { applyTacticalMeleeAfterSupportOrders } from './tacticalMeleeApply';
import { firstRingCellDistinctFrom, tacticalRes1Cell, tacticalRes4UnderRes1Corner } from './testSupport/tacticalRes4HexFixtures';
import { withTempGameDb } from '../testSupport/withTempGameDb';

test('tactical melee adjudicates co-located opposing sub-units on the same res4 hex', () => {
  withTempGameDb('aw-tactical-melee-', () => {
    const res1 = tacticalRes1Cell(3, 4);
    const h0 = tacticalRes4UnderRes1Corner(3, 4);
    const ring = [...gridDisk(h0, 1)];
    const snap: TacticalBattleSnapshot = {
      battleId: 'tb-melee-contract',
      enclosingRes1H3Index: res1,
      res4ChildH3Indexes: ring,
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-i',
          parentUnitId: 'human-infantry-1',
          player: 'human',
          unitType: 'infantry',
          h3Index: h0,
          displayName: '1st Infantry (01)',
        },
        {
          id: 'opp-i',
          parentUnitId: 'opponent-infantry-1',
          player: 'opponent',
          unitType: 'infantry',
          h3Index: h0,
          displayName: 'I Infantry (01)',
        },
      ],
    };
    const out = applyTacticalMeleeAfterSupportOrders(snap);
    assert.ok(out.meleeCombatHexes.includes(h0), 'expected melee combat recorded on shared res4 hex');
    assert.strictEqual(
      out.battle.subUnits.length + out.meleeRemovedUnits.length,
      snap.subUnits.length,
      'sub-unit count after melee plus removals must match pre-melee total'
    );
    if (out.meleeRemovedUnits.length > 0) {
      assert.ok(
        out.killsByMelee.length > 0,
        'playback contract: removals must carry kill edges for tacticalResolutionPlayback / strategic-style toasts'
      );
    }
  });
});

test('tactical melee adds the terrain bonus only while the terrain flag is on', () => {
  withTempGameDb('aw-tactical-melee-origin-', () => {
    const res1 = tacticalRes1Cell(4, 4);
    const h0 = tacticalRes4UnderRes1Corner(4, 4);
    const coastalBorn: UnitOrigin = {
      birthH3Index: res1,
      birthRes4H3Index: h0,
      birthTerrainKind: 'coastal',
      birthIsUrban: false,
      birthCountryName: null,
      birthCountryCode: null,
    };
    const snap: TacticalBattleSnapshot = {
      battleId: 'tb-melee-origin',
      enclosingRes1H3Index: res1,
      res4ChildH3Indexes: [...gridDisk(h0, 1)],
      strategicTurnNumber: 1,
      tacticalTurnNumber: 1,
      res4TerrainKindByH3: { [h0]: 'coastal' },
      subUnits: [
        {
          id: 'hum-n',
          parentUnitId: 'human-naval-1',
          player: 'human',
          unitType: 'naval',
          h3Index: h0,
          displayName: '1st Fleet (01)',
          origin: coastalBorn,
        },
        {
          id: 'opp-n',
          parentUnitId: 'opponent-naval-1',
          player: 'opponent',
          unitType: 'naval',
          h3Index: h0,
          displayName: 'I Fleet (01)',
        },
      ],
    };
    const rollEight = () => (8 - 0.5) / COMBAT_DIE_SIDES;
    persistOriginBonusSettings({ run: dbRun, hasDb: isDbReady }, { countryBonusEnabled: false, terrainBonusEnabled: true });
    assert.deepEqual(
      applyTacticalMeleeAfterSupportOrders(snap, rollEight).meleeRemovedUnits.map((u) => u.id),
      ['opp-n']
    );
    persistOriginBonusSettings({ run: dbRun, hasDb: isDbReady }, { countryBonusEnabled: false, terrainBonusEnabled: false });
    assert.deepEqual(applyTacticalMeleeAfterSupportOrders(snap, rollEight).meleeRemovedUnits, []);
  });
});

test('tactical melee skips hexes with a single side after support', () => {
  withTempGameDb('aw-tactical-melee-skip-', () => {
    const res1 = tacticalRes1Cell(5, 5);
    const h0 = tacticalRes4UnderRes1Corner(5, 5);
    const h1 = firstRingCellDistinctFrom(h0);
    const ring = [...gridDisk(h0, 1)];
    const snap: TacticalBattleSnapshot = {
      battleId: 'tb-melee-skip',
      enclosingRes1H3Index: res1,
      res4ChildH3Indexes: ring,
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-only',
          parentUnitId: 'human-infantry-1',
          player: 'human',
          unitType: 'infantry',
          h3Index: h0,
          displayName: '1st Infantry (01)',
        },
        {
          id: 'hum-2',
          parentUnitId: 'human-infantry-2',
          player: 'human',
          unitType: 'infantry',
          h3Index: h1,
          displayName: '2nd Infantry (01)',
        },
      ],
    };
    const out = applyTacticalMeleeAfterSupportOrders(snap);
    assert.strictEqual(out.meleeRemovedUnits.length, 0);
    assert.strictEqual(out.killsByMelee.length, 0);
    assert.strictEqual(out.battle.subUnits.length, snap.subUnits.length);
  });
});
