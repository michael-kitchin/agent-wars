/**
 * Contract tests for doctrine blocks in the context section.
 * Run: `npm run build:main` then `node dist/main/openRouter/promptSpec/doctrineText.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../../gameDb';
import { buildSystemPromptForTools } from '../openRouterBuildSystemPrompt';
import { buildContextCoaching, type CoachingGates } from './coachingText';

/**
 * Gates with every strategic item off except the ones the context block always prints.
 *
 * Purpose: The doctrine comparison must not depend on win-path or tool gates.
 * When to use: The cases in this file.
 * Expected outcome: A strategic or tactical gate object.
 * Exceptions: None.
 */
function gates(doctrine: CoachingGates['doctrine'], mode: CoachingGates['coordinateMode']): CoachingGates {
  return {
    coordinateMode: mode,
    planningEnabled: false,
    ordersEnabled: false,
    memoryEnabled: false,
    productionEnabled: false,
    hasAirUnits: false,
    hasNavalUnits: false,
    hasBestOptionsTable: false,
    homeRegionsOverlap: false,
    hasObservedEnemy: false,
    includeScenarioWinPaths: false,
    doctrine,
  };
}

/**
 * A two-seat snapshot whose AI commander has the given stored doctrine.
 *
 * Purpose: The prompt builder reads the snapshot when no roster database is open.
 * When to use: The full-prompt cases.
 * Expected outcome: Perspective is the first AI seat.
 * Exceptions: None.
 */
function promptState(doctrine: 'aggressive' | 'balanced' | 'cautious'): GameStateSnapshot {
  return {
    turnNumber: 1,
    phase: 'planning',
    scenarioId: 'region_vs_region',
    playerPerspective: 'opponent',
    units: [],
    hexes: [],
    seats: [
      { seatId: 'human', seatOrder: 1, kind: 'human', homeRegion: 'Northern America', outTurn: null, commander: null },
      {
        seatId: 'opponent',
        seatOrder: 2,
        kind: 'ai',
        homeRegion: 'Eastern Europe',
        outTurn: null,
        commander: { modelId: null, reasoningEffort: null, doctrineChoice: doctrine, doctrine },
      },
    ],
  } as unknown as GameStateSnapshot;
}

function promptFor(doctrine: 'aggressive' | 'balanced' | 'cautious', mode: 'strategic' | 'tactical'): string {
  return buildSystemPromptForTools(
    promptState(doctrine),
    { latLngByH3: new Map(), format: (h3: string) => h3, resolveToH3: () => undefined },
    [],
    undefined,
    { mode }
  );
}

test('balanced coaching matches coaching with no doctrine field', () => {
  const balanced = buildContextCoaching(gates('balanced', 'strategic'));
  const omitted = buildContextCoaching(gates(undefined, 'strategic'));
  assert.equal(balanced, omitted);
  assert.equal(balanced.includes('Your doctrine is'), false);
  const tactical = buildContextCoaching(gates('balanced', 'tactical'));
  assert.equal(tactical, buildContextCoaching(gates(undefined, 'tactical')));
});

test('aggressive and cautious blocks follow the strategy list in both prompts', () => {
  for (const mode of ['strategic', 'tactical'] as const) {
    for (const doctrine of ['aggressive', 'cautious'] as const) {
      const text = promptFor(doctrine, mode);
      const strategyAt = text.indexOf('- Your strategy is:');
      const doctrineAt = text.indexOf(`- Your doctrine is ${doctrine}:`);
      const messageAt = text.indexOf('- Your message is:');
      assert.ok(strategyAt >= 0 && doctrineAt > strategyAt && messageAt > doctrineAt, `${mode} ${doctrine}`);
    }
  }
  const balanced = promptFor('balanced', 'strategic');
  assert.equal(balanced.includes('Your doctrine is'), false);
});
