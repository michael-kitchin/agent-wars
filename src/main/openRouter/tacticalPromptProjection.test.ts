/**
 * Contract tests for tactical AI prompt projection. Run with: node dist/main/openRouter/tacticalPromptProjection.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import {
  buildTacticalAiOrdersContextBlock,
  tacticalAiContextBlockOmitsStrategicToolMarkers,
} from './tacticalPromptProjection';

test('tactical context block includes battle metadata and sub-units', () => {
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-contract',
    enclosingRes1H3Index: '811fbffffffffff',
    res4ChildH3Indexes: ['811fafffffffff'],
    strategicTurnNumber: 2,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'su-1',
        parentUnitId: 'p1',
        player: 'human',
        unitType: 'infantry',
        h3Index: '811fafffffffff',
        displayName: '1st Infantry (01)',
      },
    ],
  };
  const block = buildTacticalAiOrdersContextBlock(snap);
  assert.ok(block.includes('tb-contract'));
  assert.ok(block.includes('811fafffffffff'));
  assert.ok(block.includes('su-1'));
  assert.ok(block.includes('tactical_sub_units:'));
});

test('tactical context block omits strategic tool markers', () => {
  const snap: TacticalBattleSnapshot = {
    battleId: 'tb-clean',
    enclosingRes1H3Index: '811fbffffffffff',
    res4ChildH3Indexes: ['811fafffffffff'],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'su-a',
        parentUnitId: 'p-a',
        player: 'opponent',
        unitType: 'armor',
        h3Index: '811fafffffffff',
        displayName: 'II Armor (02)',
      },
    ],
  };
  const block = buildTacticalAiOrdersContextBlock(snap);
  assert.equal(tacticalAiContextBlockOmitsStrategicToolMarkers(block), true);
});
