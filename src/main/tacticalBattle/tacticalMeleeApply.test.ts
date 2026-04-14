/**
 * Contract tests for tactical melee resolution after support orders. Run with:
 * `node dist/main/tacticalBattle/tacticalMeleeApply.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
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
