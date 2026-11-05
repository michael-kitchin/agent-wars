/**
 * The system text stays put when only the live situation changes.
 *
 * Purpose: A cache prefix cannot include the clock or unit positions.
 * When to use: `node dist/main/openRouter/consultPromptParts.test.js` after `npm run build:main`.
 * Expected outcome: Two battles that differ only in clock and positions share system text. Adding armor changes it.
 * Exceptions: Assertion failures.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../gameDb';
import { buildConsultMessages, CONSULT_SITUATION_LEAD_IN } from './consultPromptMessages';
import { buildConsultPromptParts, joinConsultPromptParts } from './consultPromptParts';
import { AIR_PLAN_ROUTE_PROMPT_SUFFIX } from './openRouterToolCatalog';
import { TACTICAL_AI_PROMPT_STRATEGIC_SECTION_MARKERS } from './tacticalPromptProjection';

/**
 * A small tactical snapshot whose clock and unit cell are the only moving parts.
 *
 * Purpose: The identity case needs two states that share roster type and differ in position.
 * When to use: This file.
 * Expected outcome: A snapshot the parts builder can read without a database.
 * Exceptions: None.
 */
function battleState(turn: number, date: string, hex: string, unitType: string): GameStateSnapshot {
  return {
    hexes: [{ h3Index: hex, terrain: 'land', terrainKind: 'plains' }],
    units: [{ id: 'parent-1:0', player: 'opponent', unitType, h3Index: hex }],
    phase: 'planning',
    turnNumber: turn,
    currentDateLabel: date,
    pendingOrders: [],
    playerPerspective: 'opponent',
    seats: [
      {
        seatId: 'opponent',
        seatOrder: 1,
        kind: 'ai',
        homeRegion: 'Home',
        nickname: null,
        outTurn: null,
        outBy: null,
        outReasons: [],
        place: null,
        consultationCount: 0,
        costUsd: 0,
        thinkTimeMs: 0,
        commander: { doctrine: 'balanced' },
      },
    ],
  } as unknown as GameStateSnapshot;
}

test('static system text ignores the clock and unit positions', () => {
  const first = battleState(3, 'March, Year 1', 'cell-a', 'infantry');
  const second = battleState(9, 'June, Year 4', 'cell-b', 'infantry');
  const armor = battleState(3, 'March, Year 1', 'cell-a', 'armor');
  const coordFor = (hex: string) => ({
    latLngByH3: new Map<string, [number, number]>([[hex, [1, 2]]]),
    resolveToH3: () => hex,
    format: (h3: string) => h3,
  });
  const context = { mode: 'tactical' as const, battleId: 'same-battle', tacticalTurnNumber: 1 };
  const otherBeat = { ...context, tacticalTurnNumber: 4 };
  const left = buildConsultPromptParts({
    state: first,
    coordMap: coordFor('cell-a'),
    enabledToolNames: ['plan_route'],
    coordinateContext: context,
  });
  const right = buildConsultPromptParts({
    state: second,
    coordMap: coordFor('cell-b'),
    enabledToolNames: ['plan_route'],
    coordinateContext: otherBeat,
  });
  const withArmor = buildConsultPromptParts({
    state: armor,
    coordMap: coordFor('cell-a'),
    enabledToolNames: ['plan_route'],
    coordinateContext: context,
  });
  assert.equal(left.staticSystemText, right.staticSystemText);
  assert.notEqual(left.staticSystemText, withArmor.staticSystemText);
  assert.ok(!left.staticSystemText.includes('cell-a'));
  assert.ok(left.situationText.includes('tactical beat: 1'));
  assert.ok(right.situationText.includes('tactical beat: 4'));
  const joined = joinConsultPromptParts(left);
  console.log(`tactical consult chars joined=${joined.length} system=${left.staticSystemText.length}`);
  const joinedLower = joined.toLowerCase();
  for (const marker of TACTICAL_AI_PROMPT_STRATEGIC_SECTION_MARKERS) {
    assert.ok(!joinedLower.includes(marker), marker);
  }
});

test('a consultation starts with the fixed lead-in between two user messages', () => {
  const parts = buildConsultPromptParts({
    state: battleState(1, 'March, Year 1', 'cell-a', 'infantry'),
    coordMap: {
      latLngByH3: new Map([['cell-a', [1, 2]]]),
      resolveToH3: () => 'cell-a',
      format: (h3: string) => h3,
    },
    enabledToolNames: [],
    coordinateContext: { mode: 'tactical', battleId: 'lead', tacticalTurnNumber: 1 },
  });
  const messages = buildConsultMessages(parts);
  assert.deepEqual(messages.map((message) => message.role), ['system', 'user', 'user']);
  assert.equal(messages[1]?.content, CONSULT_SITUATION_LEAD_IN);
  assert.equal(messages[0]?.content, parts.staticSystemText);
  assert.equal(messages[2]?.content, parts.situationText);
});

test('structured outputs omit the schema skeleton and keep the example', () => {
  const input = {
    state: battleState(1, 'March, Year 1', 'cell-a', 'infantry'),
    coordMap: {
      latLngByH3: new Map<string, [number, number]>([['cell-a', [1, 2]]]),
      resolveToH3: () => 'cell-a',
      format: (h3: string) => h3,
    },
    enabledToolNames: ['plan_route'],
    coordinateContext: { mode: 'tactical' as const, battleId: 'schema', tacticalTurnNumber: 1 },
  };
  const attached = buildConsultPromptParts({ ...input, structuredOutputs: true });
  const prose = buildConsultPromptParts({ ...input, structuredOutputs: false });
  assert.ok(!attached.staticSystemText.includes('Strict schema'));
  assert.ok(!attached.staticSystemText.includes('movementOrders'));
  assert.ok(attached.staticSystemText.includes('## Example Response'));
  assert.ok(attached.staticSystemText.includes('explicit_move'));
  assert.ok(prose.staticSystemText.includes('Strict schema'));
});

test('the plan_route air sentence is only on a strategic prompt that has air', () => {
  const coord = {
    latLngByH3: new Map<string, [number, number]>([['cell-a', [1, 2]]]),
    resolveToH3: () => 'cell-a' as string | undefined,
    format: (h3: string) => h3,
  };
  const promptFor = (unitType: string, mode: 'strategic' | 'tactical') =>
    joinConsultPromptParts(
      buildConsultPromptParts({
        state: battleState(1, 'March, Year 1', 'cell-a', unitType),
        coordMap: coord,
        enabledToolNames: ['plan_route'],
        coordinateContext:
          mode === 'tactical'
            ? { mode, battleId: 'air-route', tacticalTurnNumber: 1 }
            : { mode },
        briefingOverride: 'briefing',
        productionAttention: null,
      })
    );
  const strategicAir = promptFor('air', 'strategic');
  const strategicInfantry = promptFor('infantry', 'strategic');
  const tacticalAir = promptFor('air', 'tactical');
  assert.ok(strategicAir.includes(AIR_PLAN_ROUTE_PROMPT_SUFFIX));
  assert.ok(!strategicInfantry.includes(AIR_PLAN_ROUTE_PROMPT_SUFFIX));
  assert.ok(!tacticalAir.includes(AIR_PLAN_ROUTE_PROMPT_SUFFIX));
  assert.ok(tacticalAir.includes('ferry into ferryOrders'));
});
