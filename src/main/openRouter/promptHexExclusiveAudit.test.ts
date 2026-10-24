/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-function-type -- dynamic require + Module._load typing for Electron mock */
/**
 * Phase 5E-style audit: generated system prompt must not embed legacy WGS84 coordinate tuples for the LLM.
 *
 * Purpose: Guards against regression where bracketed lat/lng examples re-enter `buildSystemPromptForTools` output.
 * When to use: Run via `npm test` / `verify:modularization` after `build:main`.
 * Expected outcome: No `[\d+.…, …]` coordinate array pattern in the prompt for a representative enabled-tool surface.
 * Exceptions: None; failures list the first offending substring for quick triage.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Module = require('module');
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { buildLatLngCoordinateMap, getOrderedHexList } from '../mapData';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { buildSystemPromptForTools } from './openRouterBuildSystemPrompt';
import { getToolNamesForEnabledGroups } from './openRouterToolGroups';

/**
 * Documents the `LATLNG_TUPLE_IN_PROMPT` binding (LATLNG_TUPLE_IN_PROMPT).

 * Purpose: Matches common `[\d…, \d…]` coordinate examples the plan forbids on LLM-visible surfaces.
 * When to use: Single pass over the assembled system prompt string.
 * Expected outcome: No match when Phase 5E migration remains intact.
 * Exceptions: None.
 */
const LATLNG_TUPLE_IN_PROMPT = /\[\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*\]/;

/**
 * Defines the `installElectronMock` function shape (function installElectronMock(userDataDir: string): () => void).

 * Purpose: Satisfies `gameDb` / Electron path resolution when this test imports the real prompt builder.
 * When to use: Wrap the body of `run` so native DB modules load consistently in Node test jobs.
 * Expected outcome: Patched `Module._load` restores on teardown.
 * Exceptions: None.
 */
function installElectronMock(userDataDir: string): () => void {
  const originalLoad = (Module as unknown as { _load: Function })._load;
  (Module as unknown as { _load: Function })._load = function patchedLoad(
    request: string,
    parent: unknown,
    isMain: boolean
  ) {
    if (request === 'electron') {
      return {
        app: {
          getPath: (name: string) => (name === 'userData' ? userDataDir : userDataDir),
        },
        safeStorage: {
          isEncryptionAvailable: () => false,
          encryptString: (s: string) => Buffer.from(s, 'utf8'),
          decryptString: (b: Buffer) => b.toString('utf8'),
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  return () => {
    (Module as unknown as { _load: Function })._load = originalLoad;
  };
}

/**
 * Defines the `buildFixtureState` function shape (function buildFixtureState(hexes: string[]): GameStateSnapshot).

 * Purpose: Minimal `region_vs_region` snapshot sufficient for `buildSystemPromptForTools` roster and metrics lines.
 * When to use: Only this audit test harness.
 * Expected outcome: Structurally valid `GameStateSnapshot` for planning phase.
 * Exceptions: None.
 */
function buildFixtureState(hexes: string[]): GameStateSnapshot {
  return {
    hexes: hexes.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })),
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: hexes[0]! },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: hexes[1]! },
    ],
    exploredHexes: [hexes[0]!, hexes[1]!, hexes[2]!],
    strategicControl: [
      { h3Index: hexes[0]!, controllerPlayerId: 'opponent' },
      { h3Index: hexes[1]!, controllerPlayerId: 'opponent' },
      { h3Index: hexes[2]!, controllerPlayerId: 'human' },
    ],
    scenarioId: 'region_vs_region',
    playerPerspective: 'opponent',
    seats: [
      { seatId: 'human', seatOrder: 1, kind: 'human', homeRegion: 'Northern America', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null },
      { seatId: 'opponent', seatOrder: 2, kind: 'ai', homeRegion: 'Eastern Europe', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null },
    ],
    homeRegionHexesBySeat: {
      human: [hexes[1]!, hexes[2]!],
      opponent: [hexes[0]!, hexes[1]!],
    },
    intersectingHomeRegionHexes: [hexes[1]!],
    phase: 'planning',
    turnNumber: 7,
    pendingOrders: [],
  };
}

/**
 * Defines the `testSystemPromptHasNoBracketedLatLngTuples` function shape (function testSystemPromptHasNoBracketedLatLngTuples(): void).

 * Purpose: Implements the plan’s “zero lat/lng tuple in prompt” check for a fully enabled API tool set.
 * When to use: After edits to `openRouterBuildSystemPrompt`, `promptText`, or briefing blocks.
 * Expected outcome: `LATLNG_TUPLE_IN_PROMPT` finds no match.
 * Exceptions: None.
 */
function testSystemPromptHasNoBracketedLatLngTuples(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const strategicCtx = { mode: 'strategic' as const };
  const hexes = getOrderedHexList().slice(0, 8);
  const state = buildFixtureState(hexes);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexes);
  const coordMap = {
    latLngByH3,
    resolveToH3,
    format: (h3: string) => h3ToCode(h3, strategicCtx),
  };
  const enabledToolNames = getToolNamesForEnabledGroups([
    'precomputation',
    'planning',
    'assessment',
    'estimation',
    'memory',
    'orders',
    'production',
  ]);
  const prompt = buildSystemPromptForTools(state, coordMap, enabledToolNames, undefined, strategicCtx);
  const hit = prompt.match(LATLNG_TUPLE_IN_PROMPT);
  assert.strictEqual(hit, null, `prompt should not contain lat/lng tuple pattern; first hit: ${hit?.[0] ?? ''}`);
  assert.ok(
    prompt.includes('infantry: 3 attack / 7 defense, melee only'),
    'strategic combat summary must list infantry as melee only'
  );
  assert.ok(
    prompt.includes('Infantry has no strategic ranged_attack (melee only)'),
    'strategic coaching must not invite infantry ranged_attack'
  );
  assert.ok(
    !prompt.includes('Infantry may use ranged_attack only at strategic range 1'),
    'stale strategic infantry range-1 coaching must stay gone'
  );
}

/**
 * Ensures tactical system-prompt combat coaching still grants infantry ranged_attack.
 *
 * Purpose: Theater split for infantry range must appear in LLM-visible Combat text, not only in validation.
 * When to use: After edits to `formatCombatStatRangeClause` or `infantryRangedScope`.
 * Expected outcome: Tactical prompt lists infantry range from the tactical baseline and does not say melee only for infantry.
 * Exceptions: None.
 */
function testTacticalSystemPromptAllowsInfantryRanged(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const hexes = getOrderedHexList().slice(0, 8);
  const state = buildFixtureState(hexes);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexes);
  const tacticalCtx = { mode: 'tactical' as const, battleId: 'tb-inf-range', tacticalTurnNumber: 1 };
  const coordMap = {
    latLngByH3,
    resolveToH3,
    format: (h3: string) => h3ToCode(h3, { mode: 'strategic' }),
  };
  const prompt = buildSystemPromptForTools(state, coordMap, ['plan_route'], undefined, tacticalCtx);
  assert.ok(
    prompt.includes('infantry: 3 attack / 7 defense, range 2'),
    'tactical combat summary must list infantry ranged baseline'
  );
  assert.ok(
    prompt.includes('Infantry and armor fire at their tactical baselines'),
    'tactical coaching must allow infantry ranged_attack and state terrain caps'
  );
  assert.ok(
    !prompt.includes('infantry: 3 attack / 7 defense, melee only'),
    'tactical prompt must not describe infantry as melee only'
  );
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Node entrypoint for this audit file.
 * When to use: `node dist/main/openRouter/promptHexExclusiveAudit.test.js`.
 * Expected outcome: Test passes and prints confirmation.
 * Exceptions: None.
 */
function run(): void {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-prompt-audit-'));
  const restoreElectron = installElectronMock(userDataDir);
  try {
    testSystemPromptHasNoBracketedLatLngTuples();
    testTacticalSystemPromptAllowsInfantryRanged();
    console.log('promptHexExclusiveAudit.test.ts passed');
  } finally {
    restoreElectron();
  }
}

run();
