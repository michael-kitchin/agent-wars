/**
 * Contract test for a three-seat system prompt.
 * Run: `npm run build:main` then `node dist/main/openRouter/promptSeats.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../gameDb';
import { buildSystemPromptForTools } from './openRouterBuildSystemPrompt';

test('a three-seat prompt names both enemies and includes the free-for-all bullet', () => {
  const state = {
    turnNumber: 3,
    phase: 'planning',
    scenarioId: 'region_vs_region',
    playerPerspective: 'opponent2',
    units: [],
    hexes: [],
    seats: [
      { seatId: 'human', seatOrder: 1, kind: 'human', homeRegion: 'Northern America', outTurn: null, commander: null },
      { seatId: 'opponent', seatOrder: 2, kind: 'ai', homeRegion: 'Eastern Europe', outTurn: null, commander: null },
      { seatId: 'opponent2', seatOrder: 3, kind: 'ai', homeRegion: 'Western Asia', outTurn: null, commander: null },
    ],
  } as unknown as GameStateSnapshot;
  const prompt = buildSystemPromptForTools(state, {
    latLngByH3: new Map(),
    format: (h3: string) => h3,
    resolveToH3: () => undefined,
  }, ['plan_route']);
  assert.match(prompt, /You command Western Asia in a WEGO \(simultaneous movement\) hex wargame with 3 sides/);
  assert.ok(prompt.includes('Enemy home regions: Northern America, Eastern Europe'));
  assert.ok(prompt.includes('Every other side is your enemy, and they are enemies of each other'));
  assert.equal(prompt.includes('human player'), false);
});
