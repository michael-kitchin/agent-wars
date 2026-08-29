/**
 * Contract tests for AI Operational Map markdown (strategic full-world extent, tactical footprint, fog).
 *
 * Purpose: Locks prompt map scope without coupling to OpenRouter; run via `npm test` after `build:main`.
 * When to use: After changes to `briefing-map-section`, grid projection, or registry selection.
 * Expected outcome: Strategic map includes every res1 code; tactical map includes every res4 code in the battle; fog hides enemy markers when hexes are not visible.
 * Exceptions: None; failures indicate regressions in briefing map assembly.
 */

import * as assert from 'assert';
import { cellToChildren, cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from '../../gameDb';
import { buildLatLngCoordinateMap } from '../../mapData';
import type { TacticalBattleSnapshot } from '../../../shared/tacticalBattleTypes';
import { buildTacticalAiPlanState } from '../../tacticalBattle/buildTacticalAiPlanState';
import { tacticalRes1Cell, tacticalRes4UnderRes1Corner } from '../../tacticalBattle/testSupport/tacticalRes4HexFixtures';
import { buildStrategicOperationalMapSectionMarkdown, buildTacticalOperationalMapSectionMarkdown } from './briefingMapSection';
import { ensureStrategicCoordinateRegistryInitialized, getHexCodeForContext, initTacticalCoordinateRegistry, listStrategicRes1H3Indexes } from './hexCoordinates';
import { projectTacticalRes4FootprintToAsciiGrid } from './tacticalAsciiGridProjection';

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
    latLngByH3: new Map(),
  });
  assert.ok(md.includes('(No units — map not rendered.)'));
  assert.ok(!md.includes('```'));
}

/**
 * Defines the `testStrategicOperationalMapOmitsBestOptionsHeadingWhenEmpty` function shape.
 *
 * Purpose: Ensures the LLM prompt omits the **Best Options This Turn** subsection title when there are no opponent rows to tabulate.
 * When to use: Regression guard for empty-table prompt noise (human-only forces still render the ASCII map).
 * Expected outcome: Markdown renders the ASCII map without Unit Roster and without `### Best Options This Turn`.
 * Exceptions: None.
 */
function testStrategicOperationalMapOmitsBestOptionsHeadingWhenEmpty(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const res1Human = latLngToCell(-15, 120, 1);
  const [lat, lng] = cellToLatLng(res1Human);
  const state: GameStateSnapshot = {
    hexes: [{ h3Index: res1Human, terrain: 'land', terrainKind: 'plains' }],
    units: [{ id: 'hum-1', player: 'human', unitType: 'infantry', h3Index: res1Human }],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const md = buildStrategicOperationalMapSectionMarkdown({
    state,
    latLngByH3: new Map([[res1Human, [lat, lng]]]),
  });
  assert.ok(md.includes('```'), 'expected ASCII map fence when units exist');
  assert.ok(!md.includes('### Unit Roster'), 'strategic omits Unit Roster; Unit Status covers threats');
  assert.ok(!md.includes('### Best Options This Turn'), 'expected no empty Best Options heading');
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
    latLngByH3,
  });
  assert.ok(!firstFenceBody(hiddenMd).includes('!'), 'hidden human should not render ! overlay in fenced map');

  const visibleState: GameStateSnapshot = {
    ...hiddenState,
    visibleHexes: [res1Ai, res1Human],
  };
  const visibleMd = buildStrategicOperationalMapSectionMarkdown({
    state: visibleState,
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
 * Locks that a water parent does not paint every res4 child as ocean, and that urban/port tiles show feature letters.
 *
 * Purpose: Beat-1 reviews showed the whole footprint as "." because plan-state terrain copied the enclosing res1 ocean.
 * When to use: After `buildTacticalAiPlanState` or tactical HexMapCellState assembly changes.
 * Expected outcome: Wetlands child renders land (`x`); water child renders `.`; unoccupied urban shows `U`; unoccupied
 * airport+seaport shows `B`/`b`.
 * Exceptions: None.
 */
function testTacticalMapShowsChildTerrainAndUrban(): void {
  const res1 = tacticalRes1Cell(12, 34);
  const landChild = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
  const ring = [...gridDisk(landChild, 1)].filter((h) => h !== landChild);
  const waterChild = ring[0]!;
  const urbanChild = ring[1]!;
  const portChild = ring[2]!;
  assert.ok(waterChild && urbanChild && portChild);
  assert.notEqual(landChild, waterChild);
  assert.notEqual(landChild, urbanChild);
  assert.notEqual(waterChild, urbanChild);
  assert.notEqual(portChild, urbanChild);
  assert.notEqual(portChild, waterChild);
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: res1, terrain: 'water', terrainKind: 'ocean' }],
    units: [],
    pendingOrders: [],
  };
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-terrain-glyphs',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [landChild, waterChild, urbanChild, portChild],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'ocean',
    res4TerrainKindByH3: {
      [landChild]: 'wetlands',
      [waterChild]: 'water',
      [urbanChild]: 'plains',
      [portChild]: 'plains',
    },
    res4IsUrbanByH3: { [urbanChild]: true },
    res4IsAirportByH3: { [portChild]: true },
    res4IsSeaportByH3: { [portChild]: true },
    subUnits: [
      {
        id: 'su-opp-1',
        parentUnitId: 'parent-1',
        player: 'opponent',
        unitType: 'armor',
        h3Index: landChild,
        displayName: 'Opp Armor',
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
  assert.ok(/Features:.*U\/u urban/i.test(md), 'tactical legend must name urban');
  const body = firstFenceBody(md);
  const tacticalCtx = { mode: 'tactical' as const, battleId: tactical.battleId };
  const landCode = getHexCodeForContext(landChild, tacticalCtx);
  const waterCode = getHexCodeForContext(waterChild, tacticalCtx);
  const urbanCode = getHexCodeForContext(urbanChild, tacticalCtx);
  const portCode = getHexCodeForContext(portChild, tacticalCtx);
  assert.ok(landCode && waterCode && urbanCode && portCode);
  const lines = body.split('\n');
  const glyphUnder = (code: string): string | undefined => {
    for (let i = 0; i < lines.length; i += 2) {
      const idx = lines[i]!.indexOf(code);
      if (idx >= 0) return lines[i + 1]?.slice(idx, idx + 2);
    }
    return undefined;
  };
  assert.equal(glyphUnder(landCode)?.[0], 'x');
  assert.equal(glyphUnder(waterCode)?.[0], '.');
  assert.match(glyphUnder(urbanCode) ?? '', /^x[Uu]$/);
  assert.match(glyphUnder(portCode) ?? '', /^x[Bb]$/);
}

/**
 * Defines the `testTacticalAsciiGridUsesManyRowsNotLatitudeRibbon` function shape.
 *
 * Purpose: Ensures tactical maps use H3-local projection so ~343 res4 cells spread across many ASCII rows instead of 1–3 latitude bands.
 * When to use: Regression guard for `projectTacticalRes4FootprintToAsciiGrid` wiring.
 * Expected outcome: Row count comfortably above 3, one cell per footprint index, unique grid slots.
 * Exceptions: None.
 */
function testTacticalAsciiGridUsesManyRowsNotLatitudeRibbon(): void {
  const res1 = tacticalRes1Cell(12, 34);
  const res4Children = [...cellToChildren(res1, 4)];
  assert.strictEqual(res4Children.length, 343, 'fixture expects full res1→res4 child count');
  const battleId = 't-ascii-rows-test';
  initTacticalCoordinateRegistry(battleId, res1);
  const tacticalCtx = { mode: 'tactical' as const, battleId };
  const grid = projectTacticalRes4FootprintToAsciiGrid(res4Children, tacticalCtx);
  assert.ok(grid.numRows >= 15, `expected many ASCII rows, got numRows=${grid.numRows}`);
  assert.strictEqual(grid.cells.length, res4Children.length, 'every res4 cell should appear in the grid');
  const slotKeys = new Set(grid.cells.map((c) => `${c.row},${c.col}`));
  assert.strictEqual(slotKeys.size, grid.cells.length, 'no two cells may share the same row,col slot');
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
  {
    name: 'strategic operational map omits Best Options heading when table empty',
    fn: testStrategicOperationalMapOmitsBestOptionsHeadingWhenEmpty,
  },
  { name: 'strategic fog hides enemy markers in fenced map', fn: testStrategicFogHidesEnemyMarkersOnMap },
  { name: 'tactical operational map includes all res4 codes', fn: testTacticalOperationalMapIncludesAllRes4Codes },
  { name: 'tactical map uses child land/water and urban overlay', fn: testTacticalMapShowsChildTerrainAndUrban },
  {
    name: 'tactical ascii grid uses many rows (IJ projection not latitude ribbon)',
    fn: testTacticalAsciiGridUsesManyRowsNotLatitudeRibbon,
  },
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
