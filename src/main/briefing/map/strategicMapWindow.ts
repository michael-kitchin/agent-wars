/**
 * Which strategic cells the briefing map draws, and how those cells become fenced blocks.
 *
 * Purpose: The full strategic set is a world grid. The model uses the cells around its units, visible enemies,
 * its cities, and the targets already listed in Best Options.
 * When to use: `buildStrategicOperationalMapSectionMarkdown` and strategic `get_map`.
 * Expected outcome: One or more connected patches, each small enough to read.
 * Exceptions: A failed `gridDisk` keeps the seed and logs at debug. It does not throw.
 */

import { gridDisk } from 'h3-js';
import { briefingOwnSeatId } from '../briefingPerspective';
import type { GameStateSnapshot } from '../../gameDb';
import { logDebug, logTrace } from '../../logger';
import type { CoordinateContext } from './coordinateContext';
import { ensureStrategicCoordinateRegistryInitialized } from './hexCoordinates';
import { projectToGrid } from './hexGridProjection';
import { tryProjectLocalIjGrid } from './localIjGridProjection';
import type { HexMapCellState } from './hexMapRenderer';
import { emptyOverlayGlyph, renderHexAsciiMap } from './hexMapRenderer';
import { renderDisplacedFeaturesLine } from './briefingTables';

/**
 * Grid steps around an own unit or a visible enemy that the strategic briefing map draws.
 *
 * Purpose: Matches `TACTICAL_MAP_WINDOW_RADIUS` on purpose. The two windows should feel the same.
 * When to use: `selectStrategicMapWindowCells`.
 * Expected outcome: 2. A city or a listed target is added even when it is farther.
 * Exceptions: None.
 */
export const STRATEGIC_MAP_WINDOW_RADIUS = 2;

/**
 * Cells of the loaded strategic map that the briefing should draw.
 *
 * Purpose: Keeps the prompt off the empty world while still showing cities and listed targets.
 * When to use: After Best Options rows exist, so their targets can be added.
 * Expected outcome: Map cells within the radius of an own unit or a visible enemy, plus controlled cities and targets
 * that are on the map. An empty selection returns a copy of `mapCells`.
 * Exceptions: A `gridDisk` failure keeps that seed when it is on the map and logs at debug.
 */
export function selectStrategicMapWindowCells(args: {
  readonly mapCells: readonly string[];
  readonly ownUnitH3: readonly string[];
  readonly visibleEnemyH3: readonly string[];
  readonly controlledCityH3: readonly string[];
  readonly targetH3: readonly string[];
}): string[] {
  logDebug('strategicMapWindow selectStrategicMapWindowCells', {
    mapCells: args.mapCells.length,
    ownUnits: args.ownUnitH3.length,
    visibleEnemies: args.visibleEnemyH3.length,
    cities: args.controlledCityH3.length,
    targets: args.targetH3.length,
  });
  const map = new Set(args.mapCells);
  const selected = new Set<string>();
  for (const seed of [...args.ownUnitH3, ...args.visibleEnemyH3]) {
    try {
      for (const cell of gridDisk(seed, STRATEGIC_MAP_WINDOW_RADIUS)) {
        if (map.has(cell)) selected.add(cell);
      }
    } catch (err) {
      logDebug('strategicMapWindow gridDisk failed', { seed, err });
      if (map.has(seed)) selected.add(seed);
    }
  }
  for (const cell of [...args.controlledCityH3, ...args.targetH3]) {
    if (map.has(cell)) selected.add(cell);
  }
  if (selected.size === 0) return [...args.mapCells];
  return [...selected];
}

/**
 * Splits map cells into patches where every member touches another member.
 *
 * Purpose: Distant cities would stretch one ASCII grid across the world. Each patch is its own block.
 * When to use: After `selectStrategicMapWindowCells`.
 * Expected outcome: Patches sorted by their first cell. Each patch is sorted lexicographically.
 * Exceptions: A `gridDisk` failure makes that cell its own patch and logs at debug.
 */
export function groupConnectedMapPatches(cells: readonly string[]): string[][] {
  logDebug('strategicMapWindow groupConnectedMapPatches', { cellCount: cells.length });
  const remaining = new Set(cells);
  const patches: string[][] = [];
  for (const start of [...cells].sort()) {
    if (!remaining.has(start)) continue;
    const patch: string[] = [];
    const queue = [start];
    remaining.delete(start);
    while (queue.length > 0) {
      const cell = queue.shift()!;
      patch.push(cell);
      let neighbors: string[] = [cell];
      try {
        neighbors = gridDisk(cell, 1);
      } catch (err) {
        logDebug('strategicMapWindow patch gridDisk failed', { cell, err });
      }
      for (const neighbor of neighbors) {
        if (!remaining.has(neighbor)) continue;
        remaining.delete(neighbor);
        queue.push(neighbor);
      }
    }
    patch.sort();
    patches.push(patch);
  }
  patches.sort((left, right) => (left[0] ?? '').localeCompare(right[0] ?? ''));
  return patches;
}

/**
 * Enemy unit cells the strategic map may treat as visible.
 *
 * Purpose: Fog uses the same discovery set as the ASCII overlay, so a hidden enemy does not pull its hex into the window.
 * When to use: `selectStrategicMapWindowCells`.
 * Expected outcome: Distinct cells. Fog off returns every enemy cell. Fog on returns cells in `visibleHexes` or `exploredHexes`.
 * Exceptions: None.
 */
export function visibleEnemyH3ForStrategicMap(state: GameStateSnapshot): string[] {
  const ownSeat = briefingOwnSeatId(state);
  const fog = state.fogOfWarEnabled === true;
  const discovered = new Set<string>([...(state.visibleHexes ?? []), ...(state.exploredHexes ?? [])]);
  const cells = new Set<string>();
  for (const unit of state.units) {
    if (unit.player === ownSeat) continue;
    if (!fog || discovered.has(unit.h3Index)) cells.add(unit.h3Index);
  }
  logDebug('strategicMapWindow visibleEnemyH3ForStrategicMap', { fog, count: cells.size });
  return [...cells];
}

/**
 * Controlled hexes that count as cities for the strategic window.
 *
 * Purpose: A city with no unit still belongs on the map. Fortification alone does not.
 * When to use: `selectStrategicMapWindowCells`.
 * Expected outcome: Hexes the briefing seat controls whose urban, airport, or seaport count is above zero.
 * Exceptions: None.
 */
export function controlledCityH3ForStrategicMap(state: GameStateSnapshot): string[] {
  const ownSeat = briefingOwnSeatId(state);
  const controlled = new Set(
    (state.strategicControl ?? [])
      .filter((row) => row.controllerPlayerId === ownSeat)
      .map((row) => row.h3Index)
  );
  const cities = (state.strategicInfrastructure ?? [])
    .filter((row) => controlled.has(row.h3Index))
    .filter((row) => Number(row.urbanHexCount ?? 0) > 0 || Number(row.airportCount ?? 0) > 0 || Number(row.seaportCount ?? 0) > 0)
    .map((row) => row.h3Index);
  logDebug('strategicMapWindow controlledCityH3ForStrategicMap', { count: cities.length });
  return cities;
}

/**
 * Legend shared by the strategic briefing map and strategic `get_map`.
 *
 * Purpose: Both surfaces name the same glyphs. Only the briefing adds a Shown line.
 * When to use: Before the fenced blocks.
 * Expected outcome: Legend text ending with a blank line. `shownLine` is appended when non-empty.
 * Exceptions: None.
 */
export function strategicOperationalMapLegend(shownLine: string): string {
  const shown = shownLine.length > 0 ? `${shownLine}\n` : '';
  return (
    'Each cell: top = hex code, bottom = terrain + overlay.\n' +
    'Terrain: x = land, . = water.\n' +
    `Overlay: ${emptyOverlayGlyph} = nothing here, * = your units, ! = enemy units, including neutral garrisons, # = contested, ? = undiscovered intel.\n` +
    'Features: A/a airport, S/s seaport, B/b both, U/u urban only; uppercase = your control.\n' +
    'Each fenced block is one connected area. Odd rows in that block are indented one space. Use only hex codes from these blocks or the tables.\n' +
    shown +
    '\n'
  );
}

/**
 * Fenced ASCII for each connected patch, plus one displaced-features line.
 *
 * Purpose: The briefing file stays about the section. Projection and fences live with the window.
 * When to use: After the window is split into patches and the game-state map is built.
 * Expected outcome: One fence per patch. A patch that cannot share a local origin uses latitude clustering for that patch only.
 * Exceptions: `projectToGrid` throws when a fallback patch has no briefing code.
 */
export function renderStrategicWindowPatchesMarkdown(args: {
  readonly patches: readonly (readonly string[])[];
  readonly context: CoordinateContext;
  readonly gameByH3: Map<string, HexMapCellState>;
}): { readonly blocks: string; readonly displacedLine: string } {
  logDebug('strategicMapWindow renderStrategicWindowPatchesMarkdown', { patches: args.patches.length });
  const displaced: Array<{ code: string; feature: string }> = [];
  const blocks: string[] = [];
  for (const patch of args.patches) {
    const grid = tryProjectLocalIjGrid(patch, args.context) ?? projectToGrid([...patch], args.context);
    const rendered = renderHexAsciiMap(grid, args.gameByH3);
    blocks.push(`\`\`\`\n${rendered.mapString}\n\`\`\``);
    displaced.push(...rendered.displacedFeatures);
  }
  return { blocks: blocks.join('\n\n'), displacedLine: renderDisplacedFeaturesLine(displaced) };
}

/**
 * Legend and fenced grid for a caller-chosen set of strategic cells.
 *
 * Purpose: `get_map` draws the same patches as the briefing, around the cell the model asked for.
 * When to use: After the center and radius have been checked against the loaded strategic cells.
 * Expected outcome: Legend, then one fence per connected patch. No Shown line and no Best Options table.
 * Exceptions: Throws when a fallback patch has no briefing code.
 */
export function renderStrategicWindowGridMarkdown(args: {
  readonly windowCells: readonly string[];
  readonly gameByH3: Map<string, HexMapCellState>;
}): string {
  logDebug('strategicMapWindow renderStrategicWindowGridMarkdown', { window: args.windowCells.length });
  ensureStrategicCoordinateRegistryInitialized();
  const rendered = renderStrategicWindowPatchesMarkdown({
    patches: groupConnectedMapPatches(args.windowCells),
    context: { mode: 'strategic' },
    gameByH3: args.gameByH3,
  });
  return `${strategicOperationalMapLegend('')}${rendered.blocks}`;
}

/**
 * Shown line for a cropped strategic window.
 *
 * Purpose: The model needs the count and, when the tool is on, the way to ask for the rest.
 * When to use: When `windowCells` is smaller than the loaded strategic set.
 * Expected outcome: One sentence. `area` when there is one patch. The `get_map` sentence only when `mentionGetMap` is true.
 * Exceptions: None.
 */
export function strategicWindowShownLine(args: {
  readonly windowCount: number;
  readonly mapCount: number;
  readonly patchCount: number;
  readonly mentionGetMap: boolean;
}): string {
  const areas = args.patchCount === 1 ? 'area' : 'areas';
  const call = args.mentionGetMap ? ' Call get_map(center, radius) for cells outside this window.' : '';
  const line = `Shown: ${args.windowCount} of ${args.mapCount} cells in ${args.patchCount} ${areas} around your units, visible enemies, your cities, and the listed targets.${call}`;
  logTrace('strategicMapWindow strategicWindowShownLine', { windowCount: args.windowCount, patchCount: args.patchCount });
  return line;
}
