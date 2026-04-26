/**
 * Contract tests for AI Operational Map markdown (strategic full-world extent, tactical footprint, fog).
 *
 * Purpose: Locks prompt map scope without coupling to OpenRouter; run via `npm test` after `build:main`.
 * When to use: After changes to `briefing-map-section`, grid projection, or registry selection.
 * Expected outcome: Strategic map includes every res1 code; tactical map includes every res4 code in the battle; fog hides enemy markers when hexes are not visible.
 * Exceptions: None; failures indicate regressions in briefing map assembly.
 */

import * as assert from 'assert';
import { cellToChildren, cellToLatLng, latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from '../../gameDb';
import { buildLatLngCoordinateMap } from '../../mapData';
import type { PrecomputationResult } from '../../precomputation';
import type { TacticalBattleSnapshot } from '../../../shared/tacticalBattleTypes';
import { buildTacticalAiPlanState } from '../../tacticalBattle/buildTacticalAiPlanState';
import { tacticalRes1Cell, tacticalRes4UnderRes1Corner } from '../../tacticalBattle/testSupport/tacticalRes4HexFixtures';
import { buildStrategicOperationalMapSectionMarkdown, buildTacticalOperationalMapSectionMarkdown } from './briefing-map-section';
import { ensureStrategicCoordinateRegistryInitialized, getHexCodeForContext, listStrategicRes1H3Indexes } from './hex-coordinates';

/**
 * Documents the module-scope binding `STRATEGIC_CTX` (STRATEGIC_CTX).
 *
 * Purpose: Single frozen `CoordinateContext` for strategic registry lookups in this suite.
 * When to use: Calls to `getHexCodeForContext` for res1 cells in assertions.
 * Expected outcome: Valid strategic coordinate context object.
 * Exceptions: None.
 */
const STRATEGIC_CTX = { mode: 'strategic' as const };

/**
 * Documents the module-scope binding `EMPTY_PRECOMPUTED` (EMPTY_PRECOMPUTED).
 *
 * Purpose: Minimal `PrecomputationResult` for map section builders that require the shape but no rows.
 * When to use: Map-only tests that do not exercise roster or hex assessment tables meaningfully.
 * Expected outcome: Empty arrays satisfy `buildStrategicOperationalMapSectionMarkdown` callers.
 * Exceptions: None.
 */
const EMPTY_PRECOMPUTED: PrecomputationResult = { unitAssessments: [], hexAssessments: [] };

/**
 * Extracts the first fenced code block body from markdown (``` ... ```).
 *
 * Purpose: Assertions target rendered map text without legend headings.
 * When to use: After calling a briefing map builder that wraps ASCII in a markdown fence.
 * Expected outcome: Inner string between first ``` pair, excluding fence lines.
 * Exceptions: Throws if no fenced block is found.
 */
function firstFenceBody(markdown: string): string {
  const m = markdown.match(/```\n([\s\S]*?)\n```/);
  assert.ok(m, 'expected a fenced code block');
  return m[1]!;
}

/**
 * Collects two-character hex code tokens from ASCII map top rows (even line indices in `mapString`).
 *
 * Purpose: Top rows carry registry codes separated by spaces; bottom rows carry terrain and overlays.
 * When to use: Verifying every strategic or tactical code in the active set appears exactly once in the map.
 * Expected outcome: Set of tokens matching `/^[A-Z0-9]{2}$/` split from code lines.
 * Exceptions: None.
 */
function collectCodeTokensFromMapAscii(mapString: string): Set<string> {
  const lines = mapString.split('\n');
  const out = new Set<string>();
  for (let i = 0; i < lines.length; i += 2) {
    const parts = lines[i]!.split(/\s+/).filter((p) => /^[A-Z0-9]{2}$/.test(p));
    for (const p of parts) out.add(p);
  }
  return out;
}

/**
 * Defines the `testStrategicOperationalMapIncludesAllRes1Codes` function shape.
 *
 * Purpose: Regression guard that strategic AI prompts use the full-world res1 set, not a unit viewport.
 * When to use: Whenever `buildStrategicOperationalMapSectionMarkdown` extent or registry wiring changes.
 * Expected outcome: Fence map body contains exactly one occurrence worth of every strategic res1 code token.
 * Exceptions: None.
 */
function testStrategicOperationalMapIncludesAllRes1Codes(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const res1Unit = latLngToCell(12, 34, 1);
  const [lat, lng] = cellToLatLng(res1Unit);
  const state: GameStateSnapshot = {
    hexes: [{ h3Index: res1Unit, terrain: 'land', terrainKind: 'plains' }],
    units: [{ id: 'opp-1', player: 'opponent', unitType: 'infantry', h3Index: res1Unit }],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const latLngByH3 = new Map<string, [number, number]>([[res1Unit, [lat, lng]]]);
  const md = buildStrategicOperationalMapSectionMarkdown({
    state,
    precomputed: EMPTY_PRECOMPUTED,
    latLngByH3,
  });
  const body = firstFenceBody(md);
  const tokens = collectCodeTokensFromMapAscii(body);
  const universe = listStrategicRes1H3Indexes();
  const expectedCodes = new Set(universe.map((h3) => getHexCodeForContext(h3, STRATEGIC_CTX)).filter(Boolean) as string[]);
  assert.strictEqual(tokens.size, expectedCodes.size, 'map should list each strategic code once');
  for (const code of expectedCodes) {
    assert.ok(tokens.has(code), `missing strategic code ${code} in operational map`);
  }
}

/**
 * Defines the `testStrategicOperationalMapNoUnitsFallback` function shape.
 *
 * Purpose: Confirms the agreed edge case: no ASCII map when there are zero AI and zero enemy units.
 * When to use: Regression guard for empty-force strategic turns.
 * Expected outcome: Fixed fallback string without a code fence.
 * Exceptions: None.
 */
function testStrategicOperationalMapNoUnitsFallback(): void {
  const state: GameStateSnapshot = {
    hexes: [],
    units: [],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const md = buildStrategicOperationalMapSectionMarkdown({
    state,
    precomputed: EMPTY_PRECOMPUTED,
    latLngByH3: new Map(),
  });
  assert.ok(md.includes('(No units — map not rendered.)'));
  assert.ok(!md.includes('```'));
}

/**
 * Defines the `testStrategicFogHidesEnemyMarkersOnMap` function shape.
 *
 * Purpose: Ensures changing map extent did not alter fog / enemy visibility inside `buildStrategicHexGameStateMap`.
 * When to use: After edits to strategic map assembly or game-state map builders.
 * Expected outcome: With FOW on and human hex not visible/explored, fenced map has no `!`; with that hex visible, map includes `!`.
 * Exceptions: None.
 */
function testStrategicFogHidesEnemyMarkersOnMap(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const res1Ai = latLngToCell(5, 10, 1);
  const res1Human = latLngToCell(-15, 120, 1);
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h3 of [res1Ai, res1Human]) {
    const ll = cellToLatLng(h3);
    latLngByH3.set(h3, ll);
  }
  const baseHexes = [
    { h3Index: res1Ai, terrain: 'land', terrainKind: 'plains' },
    { h3Index: res1Human, terrain: 'land', terrainKind: 'plains' },
  ];
  const hiddenState: GameStateSnapshot = {
    hexes: baseHexes,
    units: [
      { id: 'ai-1', player: 'opponent', unitType: 'infantry', h3Index: res1Ai },
      { id: 'hum-1', player: 'human', unitType: 'infantry', h3Index: res1Human },
    ],
    phase: 'planning',
    turnNumber: 2,
    pendingOrders: [],
    fogOfWarEnabled: true,
    visibleHexes: [res1Ai],
    exploredHexes: [],
  };
  const hiddenMd = buildStrategicOperationalMapSectionMarkdown({
    state: hiddenState,
    precomputed: EMPTY_PRECOMPUTED,
    latLngByH3,
  });
  assert.ok(!firstFenceBody(hiddenMd).includes('!'), 'hidden human should not render ! overlay in fenced map');

  const visibleState: GameStateSnapshot = {
    ...hiddenState,
    visibleHexes: [res1Ai, res1Human],
  };
  const visibleMd = buildStrategicOperationalMapSectionMarkdown({
    state: visibleState,
    precomputed: EMPTY_PRECOMPUTED,
    latLngByH3,
  });
  assert.ok(firstFenceBody(visibleMd).includes('!'), 'visible human cell should render ! in fenced map');
}

/**
 * Defines the `testTacticalOperationalMapIncludesAllRes4Codes` function shape.
 *
 * Purpose: Locks tactical prompt map to the full battle res4 footprint (all children in snapshot).
 * When to use: When tactical briefing or `buildTacticalAiPlanState` selection changes.
 * Expected outcome: Fence map tokens match tactical registry size for every res4 child listed on the battle.
 * Exceptions: None.
 */
function testTacticalOperationalMapIncludesAllRes4Codes(): void {
  const res1 = tacticalRes1Cell(12, 34);
  const res4Children = [...cellToChildren(res1, 4)];
  assert.ok(res4Children.length > 1, 'fixture should include multiple res4 cells');
  const res4a = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
  };
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-footprint-test',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: res4Children,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'su-opp-1',
        parentUnitId: 'parent-1',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: res4a,
        displayName: 'Opp Infantry',
      },
    ],
  };
  const plan = buildTacticalAiPlanState(strategic, tactical);
  const hexList = plan.hexes.map((h) => h.h3Index);
  const { latLngByH3 } = buildLatLngCoordinateMap(hexList);
  const md = buildTacticalOperationalMapSectionMarkdown({
    state: plan,
    latLngByH3,
    tacticalBattle: tactical,
  });
  const body = firstFenceBody(md);
  const tokens = collectCodeTokensFromMapAscii(body);
  const tacticalCtx = { mode: 'tactical' as const, battleId: tactical.battleId };
  const expectedCodes = new Set(
    res4Children.map((h3) => getHexCodeForContext(h3, tacticalCtx)).filter(Boolean) as string[]
  );
  assert.strictEqual(tokens.size, expectedCodes.size, 'tactical map should list each battle res4 code once');
  for (const code of expectedCodes) {
    assert.ok(tokens.has(code), `missing tactical code ${code} in operational map`);
  }
}

/**
 * Documents the module-scope binding `tests` (tests).
 *
 * Purpose: Ordered list of named tests executed by `run`.
 * When to use: Add one entry per new briefing-map contract test.
 * Expected outcome: Each `fn` runs without throwing.
 * Exceptions: None.
 */
const tests = [
  { name: 'strategic operational map includes all res1 codes', fn: testStrategicOperationalMapIncludesAllRes1Codes },
  { name: 'strategic operational map no-units fallback', fn: testStrategicOperationalMapNoUnitsFallback },
  { name: 'strategic fog hides enemy markers in fenced map', fn: testStrategicFogHidesEnemyMarkersOnMap },
  { name: 'tactical operational map includes all res4 codes', fn: testTacticalOperationalMapIncludesAllRes4Codes },
];

/**
 * Defines the `run` function shape.
 *
 * Purpose: Node test driver compatible with `npm test` (no dev dependency on `node:test` here).
 * When to use: Invoked at module load after `tests` is populated.
 * Expected outcome: Prints OK per test or exits 1 on failure.
 * Exceptions: None.
 */
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
