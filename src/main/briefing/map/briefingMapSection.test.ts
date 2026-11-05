/**
 * Contract tests for AI Operational Map markdown (strategic window, tactical footprint, fog).
 *
 * Purpose: Locks prompt map scope without coupling to OpenRouter; run via `npm test` after `build:main`.
 * When to use: After changes to `briefingMapSection`, grid projection, or registry selection.
 * Expected outcome: The strategic map is the window around units, visible enemies, cities, and listed targets; the tactical map is the window around units and listed targets; fog hides enemy markers when hexes are not visible.
 * Exceptions: None; failures indicate regressions in briefing map assembly.
 */

import * as assert from 'assert';
import { cellToChildren, cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from '../../gameDb';
import { buildLatLngCoordinateMap } from '../../mapData';
import type { TacticalBattleSnapshot } from '../../../shared/tacticalBattleTypes';
import { buildTacticalAiPlanState } from '../../tacticalBattle/buildTacticalAiPlanState';
import { tacticalParentCell, tacticalUnderCorner } from '../../tacticalBattle/testSupport/tacticalHexFixtures';
import { buildStrategicOperationalMapSectionMarkdown, buildTacticalOperationalMapSectionMarkdown } from './briefingMapSection';
import { ensureStrategicCoordinateRegistryInitialized, getHexCodeForContext, initTacticalCoordinateRegistry, listStrategicH3Indexes } from './hexCoordinates';
import {
  projectTacticalFootprintToAsciiGrid,
  projectTacticalMapWindow,
  selectTacticalMapWindowCells,
  tacticalMapWindowIndentsFirstRow,
} from './tacticalAsciiGridProjection';
import { emptyOverlayGlyph, renderHexAsciiMap, type HexMapCellState } from './hexMapRenderer';
import { STRATEGIC_MAP_WINDOW_RADIUS } from './strategicMapWindow';
import { renderDisplacedFeaturesLine } from './briefingTables';
import type { HexGrid } from './hexGridProjection';

/**
 * Documents the module-scope binding `STRATEGIC_CTX` (STRATEGIC_CTX).
 *
 * Purpose: Single frozen `CoordinateContext` for strategic registry lookups in this suite.
 * When to use: Calls to `getHexCodeForContext` for strategic cells in assertions.
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
 * Collects every fenced code-block body.
 *
 * Purpose: A strategic window can be more than one patch.
 * When to use: Assertions that must see every block, not only the first.
 * Expected outcome: Inner strings between ``` pairs.
 * Exceptions: None.
 */
function allFenceBodies(markdown: string): string[] {
  return [...markdown.matchAll(/```\n([\s\S]*?)\n```/g)].map((match) => match[1]!);
}

/**
 * A unit and a distant controlled city are two blocks, and the Shown line names the crop.
 *
 * Purpose: The strategic prompt no longer sends the whole world as one grid.
 * When to use: Whenever window selection or the legend changes.
 * Expected outcome: Two fences, a Shown line, and the get_map sentence only when asked.
 * Exceptions: None.
 */
function testStrategicOperationalMapWindowsAroundUnitsAndCities(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const unit = latLngToCell(12, 34, 1);
  const touchingUnit = new Set(gridDisk(unit, STRATEGIC_MAP_WINDOW_RADIUS + 1));
  const city = gridDisk(unit, STRATEGIC_MAP_WINDOW_RADIUS + 3).find((cell) => !touchingUnit.has(cell));
  assert.ok(city);
  const [unitLat, unitLng] = cellToLatLng(unit);
  const state: GameStateSnapshot = {
    hexes: [
      { h3Index: unit, terrain: 'land', terrainKind: 'plains' },
      { h3Index: city, terrain: 'land', terrainKind: 'plains' },
    ],
    units: [{ id: 'opp-1', player: 'opponent', unitType: 'infantry', h3Index: unit }],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    strategicControl: [{ h3Index: city, controllerPlayerId: 'opponent' }],
    strategicInfrastructure: [{ h3Index: city, urbanHexCount: 4, airportCount: 0, seaportCount: 0 }],
  };
  const latLngByH3 = new Map<string, [number, number]>([[unit, [unitLat, unitLng]]]);
  const md = buildStrategicOperationalMapSectionMarkdown({ state, latLngByH3, mentionGetMap: false });
  assert.equal(allFenceBodies(md).length, 2);
  assert.match(md, /Shown: \d+ of \d+ cells in 2 areas around your units/);
  assert.ok(!md.includes('Call get_map'));
  assert.ok(md.includes('Each fenced block is one connected area.'));
  const withTool = buildStrategicOperationalMapSectionMarkdown({ state, latLngByH3, mentionGetMap: true });
  assert.ok(withTool.includes('Call get_map(center, radius) for cells outside this window.'));
  const full = listStrategicH3Indexes();
  const shown = /Shown: (\d+) of (\d+) cells/.exec(md);
  assert.ok(shown);
  assert.ok(Number(shown[1]) < full.length);
  assert.equal(Number(shown[2]), full.length);
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
  const strategicHuman = latLngToCell(-15, 120, 1);
  const [lat, lng] = cellToLatLng(strategicHuman);
  const state: GameStateSnapshot = {
    hexes: [{ h3Index: strategicHuman, terrain: 'land', terrainKind: 'plains' }],
    units: [{ id: 'hum-1', player: 'human', unitType: 'infantry', h3Index: strategicHuman }],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const md = buildStrategicOperationalMapSectionMarkdown({
    state,
    latLngByH3: new Map([[strategicHuman, [lat, lng]]]),
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
  const strategicAi = latLngToCell(5, 10, 1);
  const strategicHuman = latLngToCell(-15, 120, 1);
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h3 of [strategicAi, strategicHuman]) {
    const ll = cellToLatLng(h3);
    latLngByH3.set(h3, ll);
  }
  const baseHexes = [
    { h3Index: strategicAi, terrain: 'land', terrainKind: 'plains' },
    { h3Index: strategicHuman, terrain: 'land', terrainKind: 'plains' },
  ];
  const hiddenState: GameStateSnapshot = {
    hexes: baseHexes,
    units: [
      { id: 'ai-1', player: 'opponent', unitType: 'infantry', h3Index: strategicAi },
      { id: 'hum-1', player: 'human', unitType: 'infantry', h3Index: strategicHuman },
    ],
    phase: 'planning',
    turnNumber: 2,
    pendingOrders: [],
    fogOfWarEnabled: true,
    visibleHexes: [strategicAi],
    exploredHexes: [],
  };
  const hiddenMd = buildStrategicOperationalMapSectionMarkdown({
    state: hiddenState,
    latLngByH3,
  });
  assert.ok(
    allFenceBodies(hiddenMd).every((body) => !body.includes('!')),
    'hidden human should not render ! overlay in any fenced map'
  );
  assert.ok(!gridDisk(strategicAi, STRATEGIC_MAP_WINDOW_RADIUS).includes(strategicHuman));
  const hiddenCode = getHexCodeForContext(strategicHuman, STRATEGIC_CTX);
  assert.ok(hiddenCode);
  assert.ok(
    allFenceBodies(hiddenMd).every((body) => !body.includes(hiddenCode)),
    'an undiscovered enemy is not a reason to draw that hex'
  );

  const visibleState: GameStateSnapshot = {
    ...hiddenState,
    visibleHexes: [strategicAi, strategicHuman],
  };
  const visibleMd = buildStrategicOperationalMapSectionMarkdown({
    state: visibleState,
    latLngByH3,
  });
  assert.ok(
    allFenceBodies(visibleMd).some((body) => body.includes('!')),
    'visible human cell should render ! in a fenced map'
  );
}

/**
 * Defines the `testTacticalOperationalMapWindow` function shape.
 *
 * Purpose: Locks the tactical prompt map to the cells around units and listed targets.
 * When to use: When tactical briefing or `buildTacticalAiPlanState` selection changes.
 * Expected outcome: The fence lists fewer codes than the footprint, includes the unit's code, and states how many cells are shown.
 * Exceptions: None.
 */
function testTacticalOperationalMapWindow(): void {
  const parentCell = tacticalParentCell(12, 34);
  const tacticalChildren = [...cellToChildren(parentCell, 4)];
  assert.ok(tacticalChildren.length > 1, 'fixture should include multiple res4 cells');
  const tacticala = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
  };
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-footprint-test',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: tacticalChildren,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'su-opp-1',
        parentUnitId: 'parent-1',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: tacticala,
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
  const unitCode = getHexCodeForContext(tacticala, tacticalCtx);
  assert.ok(unitCode, 'unit cell should have a tactical code');
  assert.ok(tokens.has(unitCode), 'window should include the unit cell');
  assert.ok(tokens.size < tacticalChildren.length, 'window should omit cells far from the unit');
  const shown = md.match(/Shown: (\d+) of (\d+) cells around your units and the listed targets\./);
  assert.ok(shown, 'a cropped map should say how many cells are shown');
  assert.strictEqual(Number(shown[1]), tokens.size);
  assert.strictEqual(Number(shown[2]), tacticalChildren.length);
}

/**
 * Locks that a listed target outside the unit radius stays on the map.
 *
 * Purpose: A shot the table recommends must be visible even when it is more than two steps away.
 * When to use: After `selectTacticalMapWindowCells` changes.
 * Expected outcome: The far cell is absent until it is passed as a target, then present.
 * Exceptions: None.
 */
function testTacticalMapWindowKeepsListedTarget(): void {
  const center = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
  const footprint = gridDisk(center, 3);
  const near = new Set(gridDisk(center, 2));
  const far = footprint.find((cell) => !near.has(cell));
  assert.ok(far, 'a radius-3 disk should contain a cell beyond radius 2');
  const withoutTarget = selectTacticalMapWindowCells({
    footprint,
    occupiedH3: [center],
    targetH3: [],
  });
  assert.ok(withoutTarget.includes(center));
  assert.ok(!withoutTarget.includes(far!));
  assert.ok(withoutTarget.length < footprint.length);
  const withTarget = selectTacticalMapWindowCells({
    footprint,
    occupiedH3: [center],
    targetH3: [far!],
  });
  assert.ok(withTarget.includes(far!));
}

/**
 * Locks row indent when the crop starts on a row the full map indented.
 *
 * Purpose: Shifting the window back to row zero must not flip which rows are indented.
 * When to use: After `projectTacticalMapWindow` changes.
 * Expected outcome: An odd row delta sets `indentFirstRow`, and the rendered first row starts with a space.
 * Exceptions: None.
 */
function testTacticalMapWindowKeepsRowIndent(): void {
  assert.strictEqual(tacticalMapWindowIndentsFirstRow(1, 0), true);
  assert.strictEqual(tacticalMapWindowIndentsFirstRow(2, 0), false);
  const parentCell = tacticalParentCell(12, 34);
  const footprint = [...cellToChildren(parentCell, 4)];
  const context = { mode: 'tactical' as const, battleId: 'indent-window' };
  initTacticalCoordinateRegistry(context.battleId, parentCell);
  let indented: HexGrid | undefined;
  for (const cell of footprint) {
    const grid = projectTacticalMapWindow({ footprint, window: [cell], context });
    if (grid.indentFirstRow === true) {
      indented = grid;
      break;
    }
  }
  assert.ok(indented, 'some one-cell window of a res4 footprint should start on an indented row');
  const game = new Map(indented!.cells.map((cell) => [cell.h3Index, blankCell('land')]));
  const rendered = renderHexAsciiMap(indented!, game);
  const firstRow = rendered.mapString.split('\n')[0] ?? '';
  assert.ok(firstRow.startsWith(' '), 'an indented window should print a leading space on row 0');
}

/**
 * Locks that a water parent does not paint every tactical child as ocean, and that urban/port tiles show feature letters.
 *
 * Purpose: Beat-1 reviews showed the whole footprint as "." because plan-state terrain copied the enclosing strategic ocean.
 * When to use: After `buildTacticalAiPlanState` or tactical HexMapCellState assembly changes.
 * Expected outcome: Wetlands child renders land (`x`); water child renders `.`; unoccupied urban shows `U`; unoccupied
 * airport+seaport shows `B`/`b`.
 * Exceptions: None.
 */
function testTacticalMapShowsChildTerrainAndUrban(): void {
  const parentCell = tacticalParentCell(12, 34);
  const landChild = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
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
    hexes: [{ h3Index: parentCell, terrain: 'water', terrainKind: 'ocean' }],
    units: [],
    pendingOrders: [],
  };
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-terrain-glyphs',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: [landChild, waterChild, urbanChild, portChild],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'ocean',
    tacticalTerrainKindByH3: {
      [landChild]: 'wetlands',
      [waterChild]: 'water',
      [urbanChild]: 'plains',
      [portChild]: 'plains',
    },
    tacticalIsUrbanByH3: { [urbanChild]: true },
    tacticalIsAirportByH3: { [portChild]: true },
    tacticalIsSeaportByH3: { [portChild]: true },
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
  assert.equal(glyphUnder(waterCode), `.-`);
  assert.equal(emptyOverlayGlyph, '-');
  assert.match(glyphUnder(urbanCode) ?? '', /^x[Uu]$/);
  assert.match(glyphUnder(portCode) ?? '', /^x[Bb]$/);
}

/**
 * Defines the `testTacticalAsciiGridUsesManyRowsNotLatitudeRibbon` function shape.
 *
 * Purpose: Ensures tactical maps use H3-local projection so ~343 tactical cells spread across many ASCII rows instead of 1–3 latitude bands.
 * When to use: Regression guard for `projectTacticalFootprintToAsciiGrid` wiring.
 * Expected outcome: Row count comfortably above 3, one cell per footprint index, unique grid slots.
 * Exceptions: None.
 */
/**
 * Builds a discovered cell with no features and no units.
 *
 * Purpose: The overlay tests start from a blank cell and set only the field under test.
 * When to use: Direct `renderHexAsciiMap` fixtures in this file.
 * Expected outcome: A discovered cell of the given land or water band.
 * Exceptions: None.
 */
function blankCell(terrain: 'land' | 'water'): HexMapCellState {
  return {
    terrain,
    isDiscovered: true,
    features: { hasAirport: false, hasSeaport: false, urbanCount: 0 },
    controlledByAI: true,
    aiUnitCount: 0,
    enemyUnitCount: 0,
  };
}

/**
 * Locks the empty overlay glyph, the displaced-feature footnote, and first-row indent.
 *
 * Purpose: `.` is water, so an empty overlay must be `-`, and a cropped grid must be able to indent row 0.
 * When to use: After changes to `renderHexAsciiMap`.
 * Expected outcome: Bare land is `x-`, bare water is `.-`, a unit on a feature is footnoted, and `indentFirstRow` indents row 0 only.
 * Exceptions: None.
 */
function testEmptyOverlayGlyphAndFirstRowIndent(): void {
  const grid: HexGrid = {
    cells: [
      { h3Index: 'land', code: 'AA', row: 0, col: 0, lat: 0, lng: 0 },
      { h3Index: 'water', code: 'AB', row: 0, col: 1, lat: 0, lng: 1 },
      { h3Index: 'own', code: 'AC', row: 0, col: 2, lat: 0, lng: 2 },
      { h3Index: 'port', code: 'AD', row: 0, col: 3, lat: 0, lng: 3 },
      { h3Index: 'row1', code: 'AE', row: 1, col: 0, lat: 1, lng: 0 },
    ],
    numRows: 2,
    numCols: 4,
    indentFirstRow: true,
  };
  const own = blankCell('land');
  own.aiUnitCount = 1;
  const port = blankCell('land');
  port.aiUnitCount = 1;
  port.features = { hasAirport: true, hasSeaport: false, urbanCount: 0 };
  const game = new Map<string, HexMapCellState>([
    ['land', blankCell('land')],
    ['water', blankCell('water')],
    ['own', own],
    ['port', port],
    ['row1', blankCell('land')],
  ]);
  const rendered = renderHexAsciiMap(grid, game);
  const lines = rendered.mapString.split('\n');
  const row0Bottom = lines[1]?.slice(1) ?? '';
  assert.equal(row0Bottom.slice(0, 2), 'x-');
  assert.equal(row0Bottom.slice(3, 5), '.-');
  assert.equal(row0Bottom.slice(6, 8), 'x*');
  const footnote = renderDisplacedFeaturesLine(rendered.displacedFeatures);
  assert.equal(footnote.includes('AC('), false);
  assert.ok(footnote.includes('AD(A)'), footnote);
  assert.equal(lines[0]?.startsWith(' '), true);
  assert.equal(lines[2]?.startsWith(' '), false);
}

function testTacticalAsciiGridUsesManyRowsNotLatitudeRibbon(): void {
  const strategic = tacticalParentCell(12, 34);
  const tacticalChildren = [...cellToChildren(strategic, 4)];
  assert.strictEqual(tacticalChildren.length, 343, 'fixture expects full res1→res4 child count');
  const battleId = 't-ascii-rows-test';
  initTacticalCoordinateRegistry(battleId, strategic);
  const tacticalCtx = { mode: 'tactical' as const, battleId };
  const grid = projectTacticalFootprintToAsciiGrid(tacticalChildren, tacticalCtx);
  assert.ok(grid.numRows >= 15, `expected many ASCII rows, got numRows=${grid.numRows}`);
  assert.strictEqual(grid.cells.length, tacticalChildren.length, 'every res4 cell should appear in the grid');
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
  { name: 'strategic operational map windows around units and cities', fn: testStrategicOperationalMapWindowsAroundUnitsAndCities },
  { name: 'strategic operational map no-units fallback', fn: testStrategicOperationalMapNoUnitsFallback },
  {
    name: 'strategic operational map omits Best Options heading when table empty',
    fn: testStrategicOperationalMapOmitsBestOptionsHeadingWhenEmpty,
  },
  { name: 'strategic fog hides enemy markers in fenced map', fn: testStrategicFogHidesEnemyMarkersOnMap },
  { name: 'tactical operational map windows around units', fn: testTacticalOperationalMapWindow },
  { name: 'tactical map window keeps a listed target', fn: testTacticalMapWindowKeepsListedTarget },
  { name: 'tactical map window keeps row indent', fn: testTacticalMapWindowKeepsRowIndent },
  { name: 'tactical map uses child land/water and urban overlay', fn: testTacticalMapShowsChildTerrainAndUrban },
  { name: 'empty overlay is a dash and the first row can be indented', fn: testEmptyOverlayGlyphAndFirstRowIndent },
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
