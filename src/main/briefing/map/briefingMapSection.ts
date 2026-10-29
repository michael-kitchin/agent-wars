/**
 * Assembles the full "Operational Map" markdown section for Commander briefings.
 *
 * Purpose: Map + displaced footnote + Best Options This Turn when non-empty (no Unit Roster — Unit Status covers threats/nearest).
 * When to use: Replace the legacy `# Possible Unit Actions` block for strategic and tactical precomputed briefings.
 * Expected outcome: Self-contained markdown with legend, ASCII map, and compact tables using hex codes.
 * Exceptions: Returns a short fallback message if no friendly/enemy units exist (strategic map not rendered in that case).
 */

import { briefingOwnSeatId } from '../briefingPerspective';
import type { GameStateSnapshot } from '../../gameDb';
import { logDebug } from '../../logger';
import { collectAggregatedPossibleActionRows, type PossibleActionsIndexedState } from '../../openRouter/possibleUnitActions';
import type { TacticalBattleSnapshot } from '../../../shared/tacticalBattleTypes';
import { FORTIFIED_MAP_LEGEND_FRAGMENT } from '../../../shared/fortificationRules';
import type { CoordinateContext } from './coordinateContext';
import {
  ensureStrategicCoordinateRegistryInitialized,
  initTacticalCoordinateRegistry,
  listStrategicH3Indexes,
} from './hexCoordinates';
import { projectToGrid } from './hexGridProjection';
import { projectTacticalFootprintToAsciiGrid } from './tacticalAsciiGridProjection';
import type { HexMapCellState } from './hexMapRenderer';
import { renderHexAsciiMap } from './hexMapRenderer';
import {
  renderDisplacedFeaturesLine,
  renderThisTurnOptionsTableMarkdown,
} from './briefingTables';
import {
  SECTION_TITLE_BEST_OPTIONS_THIS_TURN,
  SECTION_TITLE_OPERATIONAL_MAP,
  topLevelHeading,
} from '../../openRouter/promptSpec/sectionHeadings';

/**
 * Builds the optional **Best Options This Turn** markdown subsection for operational map prompts.
 *
 * Purpose: Emits the `###` heading only when `renderThisTurnOptionsTableMarkdown` produced body rows so the LLM does not see an empty section.
 * When to use: After `optionsMd` is computed in strategic and tactical operational map builders.
 * Expected outcome: Fragment ending with a newline when non-empty, or an empty string when `optionsMd` is blank or whitespace-only.
 * Exceptions: None.
 */
function formatBestOptionsThisTurnSubsection(optionsMd: string): string {
  return optionsMd.trim().length > 0 ? `### ${SECTION_TITLE_BEST_OPTIONS_THIS_TURN}\n\n${optionsMd}\n` : '';
}

/**
 * Builds the strategic operational map section for the AI Commander briefing.
 *
 * Purpose: Primary entry used by `formatBriefing` when precomputation is enabled.
 * When to use: Strategic consultations where the LLM needs geography without huge action tables.
 * Expected outcome: Markdown fragment including H1/H2 headings per existing briefing style.
 * Exceptions: None beyond missing registry initialization (handled via `ensureStrategicCoordinateRegistryInitialized`).
 *
 * Map extent: Uses every registered strategic cell (full world) so the LLM sees pole-to-pole and dateline-safe
 * geography; fog and enemy markers still follow `buildStrategicHexGameStateMap` visibility rules.
 */
export function buildStrategicOperationalMapSectionMarkdown(args: {
  state: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  indexedState?: PossibleActionsIndexedState;
}): string {
  logDebug('briefing-map-section buildStrategicOperationalMapSectionMarkdown', {
    turn: args.state.turnNumber,
  });
  ensureStrategicCoordinateRegistryInitialized();
  const context: CoordinateContext = { mode: 'strategic' };

  const ownSeat = briefingOwnSeatId(args.state);
  const aiUnits = args.state.units.filter((u) => u.player === ownSeat).map((u) => {
    const ll = args.latLngByH3.get(u.h3Index);
    return { lat: ll?.[0] ?? 0, lng: ll?.[1] ?? 0 };
  });
  const enemyUnits = args.state.units.filter((u) => u.player !== ownSeat).map((u) => {
    const ll = args.latLngByH3.get(u.h3Index);
    return { lat: ll?.[0] ?? 0, lng: ll?.[1] ?? 0 };
  });
  if (aiUnits.length === 0 && enemyUnits.length === 0) {
    return `${topLevelHeading(SECTION_TITLE_OPERATIONAL_MAP)}\n\n(No units — map not rendered.)\n`;
  }

  const mapHexes = listStrategicH3Indexes();
  logDebug('briefing-map-section buildStrategicOperationalMapSectionMarkdown: full-world strategic set', {
    strategicCellCount: mapHexes.length,
  });
  const grid = projectToGrid(mapHexes, context);
  const gameByH3 = buildStrategicHexGameStateMap(args.state, mapHexes);
  const { mapString, displacedFeatures } = renderHexAsciiMap(grid, gameByH3);

  const aggRows = collectAggregatedPossibleActionRows({
    state: args.state,
    latLngByH3: args.latLngByH3,
    formatLatLng: () => '',
    forThisTurnOptionsTable: true,
    indexedState: args.indexedState,
  });
  const optionsMd = renderThisTurnOptionsTableMarkdown(aggRows, args.latLngByH3, context);
  const displacedLine = renderDisplacedFeaturesLine(displacedFeatures);

  const legend =
    'Each cell: top = hex code, bottom = terrain + overlay.\n' +
    'Terrain: x = land, . = water.\n' +
    'Overlay: * = your units, ! = enemy units, including neutral garrisons, # = contested, ? = undiscovered intel.\n' +
    'Features: A/a airport, S/s seaport, B/b both, U/u urban only; uppercase = your control.\n' +
    'Odd rows are indented one space. Use only hex codes from this map or tables.\n\n';

  return (
    `${topLevelHeading(SECTION_TITLE_OPERATIONAL_MAP)}\n\n${legend}\`\`\`\n${mapString}\n\`\`\`\n\n` +
    `${displacedLine}\n` +
    `${formatBestOptionsThisTurnSubsection(optionsMd)}`
  );
}

function buildStrategicHexGameStateMap(state: GameStateSnapshot, mapHexes: string[]): Map<string, HexMapCellState> {
  const terrainByH3 = new Map(state.hexes.map((h) => [h.h3Index, h.terrain]));
  const controlByH3 = new Map((state.strategicControl ?? []).map((r) => [r.h3Index, r.controllerPlayerId]));
  const infraByH3 = new Map(
    (state.strategicInfrastructure ?? []).map((r) => [
      r.h3Index,
      {
        urban: Number(r.urbanHexCount ?? 0),
        airports: Number(r.airportCount ?? 0),
        seaports: Number(r.seaportCount ?? 0),
      },
    ])
  );
  const discovered = new Set<string>([...(state.visibleHexes ?? []), ...(state.exploredHexes ?? [])]);
  const fog = state.fogOfWarEnabled === true;

  const humanUnitsByH3 = new Map<string, number>();
  const aiUnitsByH3 = new Map<string, number>();
  const ownSeat = briefingOwnSeatId(state);
  for (const u of state.units) {
    if (u.player === ownSeat) aiUnitsByH3.set(u.h3Index, (aiUnitsByH3.get(u.h3Index) ?? 0) + 1);
    else humanUnitsByH3.set(u.h3Index, (humanUnitsByH3.get(u.h3Index) ?? 0) + 1);
  }

  const out = new Map<string, HexMapCellState>();
  for (const h3 of mapHexes) {
    const rawTerrain = terrainByH3.get(h3) ?? 'land';
    const terrain: 'land' | 'water' =
      rawTerrain === 'ocean' || rawTerrain === 'water' || rawTerrain === 'arctic_ocean' ? 'water' : 'land';
    const isDiscovered = !fog || discovered.has(h3);
    const infra = infraByH3.get(h3) ?? { urban: 0, airports: 0, seaports: 0 };
    const controller = controlByH3.get(h3) ?? null;
    const controlledByAI = controller === briefingOwnSeatId(state);
    const aiUnitCount = aiUnitsByH3.get(h3) ?? 0;
    const visible = !fog || discovered.has(h3);
    const enemyUnitCount = visible ? humanUnitsByH3.get(h3) ?? 0 : 0;
    out.set(h3, {
      terrain,
      isDiscovered,
      features: {
        hasAirport: infra.airports > 0,
        hasSeaport: infra.seaports > 0,
        urbanCount: infra.urban,
      },
      controlledByAI,
      aiUnitCount,
      enemyUnitCount,
    });
  }
  return out;
}

/**
 * Builds the tactical operational map markdown fragment (no leading H1; caller supplies section title).
 *
 * Purpose: Tactical AI consultations reuse the same ASCII format with a tactical registry scoped to one battle.
 * When to use: `requestOrdersFlow` appends this under a tactical heading after the strategic briefing block.
 * Expected outcome: Compact tactical map plus Best Options This Turn when non-empty, all using tactical hex codes.
 * Exceptions: None beyond missing tactical registry initialization (handled via `initTacticalCoordinateRegistry`).
 */
export function buildTacticalOperationalMapSectionMarkdown(args: {
  state: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  tacticalBattle: TacticalBattleSnapshot;
}): string {
  logDebug('briefing-map-section buildTacticalOperationalMapSectionMarkdown', {
    battleId: args.tacticalBattle.battleId,
  });
  initTacticalCoordinateRegistry(args.tacticalBattle.battleId, args.tacticalBattle.enclosingStrategicH3Index);
  const context: CoordinateContext = {
    mode: 'tactical',
    battleId: args.tacticalBattle.battleId,
    tacticalTurnNumber: args.tacticalBattle.tacticalTurnNumber,
  };

  const mapHexes = [...args.tacticalBattle.tacticalChildH3Indexes];
  if (mapHexes.length === 0) {
    return '_No tactical cells — map not rendered._\n';
  }
  const stateHexSet = new Set(args.state.hexes.map((h) => h.h3Index));
  if (mapHexes.some((h) => !stateHexSet.has(h))) {
    logDebug('briefing-map-section buildTacticalOperationalMapSectionMarkdown: footprint vs planState.hexes mismatch', {
      battleId: args.tacticalBattle.battleId,
      footprintCells: mapHexes.length,
      stateHexRows: args.state.hexes.length,
    });
  }
  const grid = projectTacticalFootprintToAsciiGrid(mapHexes, context);
  const gameByH3 = buildTacticalHexGameStateMap(args.state, args.tacticalBattle, mapHexes);
  const { mapString, displacedFeatures } = renderHexAsciiMap(grid, gameByH3);

  const aggRows = collectAggregatedPossibleActionRows({
    state: args.state,
    latLngByH3: args.latLngByH3,
    formatLatLng: () => '',
    tacticalBattle: args.tacticalBattle,
    forThisTurnOptionsTable: true,
  });
  const optionsMd = renderThisTurnOptionsTableMarkdown(aggRows, args.latLngByH3, context);
  const displacedLine = renderDisplacedFeaturesLine(displacedFeatures);
  const fortifiedLegend = [...gameByH3.values()].some((cell) => cell.features.fortifiedByAi !== undefined)
    ? FORTIFIED_MAP_LEGEND_FRAGMENT
    : '';

  const legend =
    'Each cell: top = tactical hex code, bottom = terrain + overlay.\n' +
    'Terrain: x = land, . = water.\n' +
    'Overlay: * = your units, ! = enemy units, including neutral garrisons, # = contested.\n' +
    `Features: A/a airport, S/s seaport, B/b both, U/u urban only${fortifiedLegend}; uppercase = your control.\n` +
    'Odd rows are indented one space. Use only hex codes from this map or tables.\n\n';

  return (
    `${legend}\`\`\`\n${mapString}\n\`\`\`\n\n` +
    `${displacedLine}\n` +
    `${formatBestOptionsThisTurnSubsection(optionsMd)}`
  );
}

/**
 * Builds per-cell land/water, infrastructure, and occupancy state for the tactical ASCII map.
 *
 * Purpose: Each tactical child must paint its own kind and urban/seaport/airport letters; copying the enclosing strategic
 * ocean or hardcoding features off made urban armor look like it was at sea.
 * When to use: Only from `buildTacticalOperationalMapSectionMarkdown` after the grid is projected.
 * Expected outcome: Terrain matches `state.hexes` for that child; U/S/A/B follow battle flags unless the cell is rubble;
 * uppercase when the enclosing strategic is AI-controlled.
 * Exceptions: Missing hex rows default to land; fog hides enemy counts the same way as the strategic map.
 */
function buildTacticalHexGameStateMap(
  state: GameStateSnapshot,
  battle: TacticalBattleSnapshot,
  mapHexes: string[]
): Map<string, HexMapCellState> {
  const terrainByH3 = new Map(state.hexes.map((h) => [h.h3Index, h.terrain]));
  const discovered = new Set<string>([...(state.visibleHexes ?? []), ...(state.exploredHexes ?? [])]);
  const fog = state.fogOfWarEnabled === true;
  const humanUnitsByH3 = new Map<string, number>();
  const aiUnitsByH3 = new Map<string, number>();
  const ownSeat = briefingOwnSeatId(state);
  for (const u of state.units) {
    if (u.player === ownSeat) aiUnitsByH3.set(u.h3Index, (aiUnitsByH3.get(u.h3Index) ?? 0) + 1);
    else humanUnitsByH3.set(u.h3Index, (humanUnitsByH3.get(u.h3Index) ?? 0) + 1);
  }
  const enclosingController =
    (state.strategicControl ?? []).find((r) => r.h3Index === battle.enclosingStrategicH3Index)?.controllerPlayerId ?? null;
  const controlledByAI = enclosingController === briefingOwnSeatId(state);
  const out = new Map<string, HexMapCellState>();
  for (const h3 of mapHexes) {
    const rawTerrain = terrainByH3.get(h3) ?? 'land';
    const terrain: 'land' | 'water' =
      rawTerrain === 'ocean' || rawTerrain === 'water' || rawTerrain === 'arctic_ocean' ? 'water' : 'land';
    const isDiscovered = !fog || discovered.has(h3);
    const visible = !fog || discovered.has(h3);
    const rubble = !!battle.tacticalIsRubbleByH3?.[h3];
    const urban = !rubble && !!battle.tacticalIsUrbanByH3?.[h3];
    const seaport = !rubble && !!battle.tacticalIsSeaportByH3?.[h3];
    const airport = !rubble && !!battle.tacticalIsAirportByH3?.[h3];
    const fortOwner = battle.tacticalFortificationOwnerByH3?.[h3];
    out.set(h3, {
      terrain,
      isDiscovered,
      features: {
        hasAirport: airport,
        hasSeaport: seaport,
        urbanCount: urban ? 1 : 0,
        ...(fortOwner !== undefined ? { fortifiedByAi: fortOwner === ownSeat } : {}),
      },
      controlledByAI,
      aiUnitCount: aiUnitsByH3.get(h3) ?? 0,
      enemyUnitCount: visible ? humanUnitsByH3.get(h3) ?? 0 : 0,
    });
  }
  return out;
}

