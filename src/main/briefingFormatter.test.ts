/**
 * Tests for the briefing formatter (Milestone 0.6 Phase 3). Asserts the three-section structure,
 * two tables, attention flags, and memory/standing-order blocks.
 */

import * as assert from 'assert';
import type { GameStateSnapshot } from './gameDb';
import type { PrecomputationResult, UnitAssessmentResult, CombatEstimateEntry } from './precomputation';
import { formatBriefing } from './briefingFormatter';

const fixtureState: GameStateSnapshot = {
  hexes: [{ h3Index: '891f1d48b9fffff', terrain: 'land' }],
  units: [
    { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: '891f1d48b9fffff' },
    { id: 'opponent-infantry-1', player: 'opponent', unitType: 'infantry', h3Index: '891f1d48b9fffff' },
    { id: 'human-inf-1', player: 'human', unitType: 'infantry', h3Index: '891f1d48b9fffff' },
  ],
  phase: 'planning',
  turnNumber: 2,
  pendingOrders: [],
};

const fixtureUnitAssessments: UnitAssessmentResult[] = [
  {
    unitId: 'opponent-armor-1',
    result: {
      status: 'ok',
      unit: {
        unitId: 'opponent-armor-1',
        type: 'armor',
        position: [2.1, 0.5],
        currentStandingOrder: null,
      },
      nearbyEnemies: [
        { unitId: 'human-inf-1', hexDistance: 0, inRangedRange: true, inMeleeRange: true } as UnitAssessmentResult['result']['nearbyEnemies'][0],
      ],
      threats: [{ description: 'in range', severity: 'critical', sourceUnit: 'human-inf-1' }],
      canAttackThisTurn: [],
    } as unknown as UnitAssessmentResult['result'],
  },
  {
    unitId: 'opponent-infantry-1',
    result: {
      status: 'ok',
      unit: {
        unitId: 'opponent-infantry-1',
        type: 'infantry',
        position: [8.2, 4.3],
        currentStandingOrder: { type: 'march', destination: [1, 1], status: 'en_route' },
      },
      nearbyEnemies: [],
      threats: [],
      canAttackThisTurn: [],
    } as unknown as UnitAssessmentResult['result'],
  },
];

const fixtureCombatEstimates: CombatEstimateEntry[] = [
  {
    aiUnitId: 'opponent-armor-1',
    enemyUnitId: 'human-inf-1',
    targetHex: [2.1, 0.5],
    assessment: 'favorable',
    probabilityDefenderEliminated: 0.5,
    probabilityAttackerLosesUnit: 0.33,
    note: 'Return fire unlikely',
  },
  {
    aiUnitId: 'opponent-infantry-1',
    enemyUnitId: 'human-inf-1',
    targetHex: [8.2, 4.3],
    assessment: 'even',
    probabilityDefenderEliminated: 0.17,
    probabilityAttackerLosesUnit: 0.33,
    note: 'Melee if they advance',
  },
];

const precomputed: PrecomputationResult = {
  unitAssessments: fixtureUnitAssessments,
  combatEstimates: fixtureCombatEstimates,
  hexAssessments: [],
};

function testFormatBriefingContainsSections(): void {
  const standingOrderText = '=== STANDING ORDER STATUS ===\n- opponent-infantry-1: MARCH to [1.000, 1.000] — en_route';
  const memoryText = 'Remember: push south.';
  const out = formatBriefing(fixtureState, precomputed, standingOrderText, memoryText);
  assert.ok(out.includes("=== COMMANDER'S BRIEFING (Turn 2) ==="), 'title');
  assert.ok(out.includes('Turn 2:'), 'Section 1 narrative');
  assert.ok(out.match(/\.\s+[A-Z]/), 'Section 1 has multiple sentences');
  assert.ok(out.includes('| Unit ID |'), 'unit table header');
  assert.ok(out.includes('| Matchup |'), 'combat table header');
  assert.ok(out.includes('opponent-armor-1'), 'unit table has unit');
  assert.ok(out.includes('P(eliminate)'), 'combat table has P(eliminate) column');
  assert.ok(out.includes('**Attention flags**'), 'Section 3 header');
  assert.ok(out.includes('YOUR STRATEGIC MEMORY'), 'memory block');
  assert.ok(out.includes('Remember: push south.'), 'memory text');
  assert.ok(out.includes('STANDING ORDER STATUS'), 'standing order block');
  assert.ok(out.includes('Callbacks not yet active'), 'callbacks placeholder');
  assert.ok(!out.includes('undefined'), 'no raw undefined');
}

function testFormatBriefingUnitTableRows(): void {
  const out = formatBriefing(fixtureState, precomputed, '', '');
  const unitTableStart = out.indexOf('| Unit ID |');
  const unitTableEnd = out.indexOf('| Matchup |');
  const unitTable = out.slice(unitTableStart, unitTableEnd);
  assert.ok(unitTable.includes('opponent-armor-1') && unitTable.includes('opponent-infantry-1'));
  assert.ok(unitTable.includes('yes') || unitTable.includes('no'), 'action needed column');
}

function testFormatBriefingCombatTable(): void {
  const out = formatBriefing(fixtureState, precomputed, '', '');
  assert.ok(out.includes('opponent-armor-1 vs human-inf-1'));
  assert.ok(out.includes('0.50') && out.includes('0.33'));
  assert.ok(out.includes('FAVORABLE') || out.includes('favorable'));
  assert.ok(out.includes('Return fire unlikely') || out.includes('Melee'));
}

const tests = [
  { name: 'formatBriefing contains all sections', fn: testFormatBriefingContainsSections },
  { name: 'formatBriefing unit table rows', fn: testFormatBriefingUnitTableRows },
  { name: 'formatBriefing combat table', fn: testFormatBriefingCombatTable },
];

function run(): void {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exit(1);
    }
  }
}

run();
