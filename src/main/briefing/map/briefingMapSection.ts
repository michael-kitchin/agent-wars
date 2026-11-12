/**
 * Assembles the full "Operational Map" markdown section for Commander briefings.
 *
 * Purpose: Map + displaced footnote + Best Options This Turn when non-empty (no Unit Roster — Unit Status covers threats/nearest).
 * When to use: Replace the legacy `# Possible Unit Actions` block for strategic and tactical precomputed briefings.
 * Expected outcome: Markdown with the Shown line, ASCII map, and compact tables using hex codes. The glyph legend is in the system prompt.
 * Exceptions: Returns a short fallback message if no friendly/enemy units exist (strategic map not rendered in that case).
 */

import { briefingOwnSeatId } from '../briefingPerspective';
import type { GameStateSnapshot } from '../../gameDb';
import { logDebug } from '../../logger';
import { collectAggregatedPossibleActionRows, type PossibleActionsIndexedState } from '../../openRouter/possibleUnitActions';
import type { CampaignPlan } from '../../openRouter/campaignRules';
import type { TacticalBattleSnapshot } from '../../../shared/tacticalBattleTypes';
import type { CoordinateContext } from './coordinateContext';
import {
  ensureStrategicCoordinateRegistryInitialized,
  initTacticalCoordinateRegistry,
  listStrategicH3Indexes,
} from './hexCoordinates';
import {
  projectTacticalFootprintToAsciiGrid,
  projectTacticalMapWindow,
  selectTacticalMapWindowCells,
} from './tacticalAsciiGridProjection';
import type { HexMapCellState } from './hexMapRenderer';
import { bindBestOptionsOdds } from './bestOptionsOdds';
import { renderHexAsciiMap } from './hexMapRenderer';
import {
  controlledCityH3ForStrategicMap,
  groupConnectedMapPatches,
  renderStrategicWindowPatchesMarkdown,
  selectStrategicMapWindowCells,
  strategicOperationalMapShownBlock,
  strategicWindowShownLine,
  visibleEnemyH3ForStrategicMap,
} from './strategicMapWindow';
import {
  renderDisplacedFeaturesLine,
  renderThisTurnOptionsTableMarkdown,
} from './briefingTables';
import {
  SECTION_TITLE_BEST_OPTIONS_THIS_TURN,
  SECTION_TITLE_OPERATIONAL_MAP,
  subHeading,
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
 * Expected outcome: Markdown fragment with the map at H2 and Best Options at H3.
 * Exceptions: None beyond missing registry initialization (handled via `ensureStrategicCoordinateRegistryInitialized`).
 *
 * Map extent: Cells within two steps of own units and visible enemies, plus Best Options targets and controlled
 * hexes that have urban cells, an airport, or a seaport. Each connected patch is its own fenced block.
 */
export function buildStrategicOperationalMapSectionMarkdown(args: {
  state: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  indexedState?: PossibleActionsIndexedState;
  /**
   * Whether a cropped map tells the model to call `get_map`.
   *
   * Contract: The sentence is added only when this is true and the window is smaller than the loaded strategic set.
   * When to use: Strategic briefings whose enabled tools include `get_map`.
   * Expected outcome: The Shown line gains `Call get_map(center, radius) for cells outside this window.`
   * Exceptions: None.
   */
  mentionGetMap?: boolean;
  /**
   * The consult's campaign plan.
   *
   * Contract: Omitted or null keeps today's Best Options rows.
   * When to use: Strategic `formatBriefing` after the consult resolved a campaign.
   * Expected outcome: Passed through to the this-turn row collector. The tactical map never receives it.
   * Exceptions: None.
   */
  campaignPlan?: CampaignPlan | null;
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
    return `${subHeading(SECTION_TITLE_OPERATIONAL_MAP)}\n\n(No units — map not rendered.)\n`;
  }

  const aggRows = collectAggregatedPossibleActionRows({
    state: args.state,
    latLngByH3: args.latLngByH3,
    formatLatLng: () => '',
    forThisTurnOptionsTable: true,
    indexedState: args.indexedState,
    campaignPlan: args.campaignPlan ?? null,
  });
  const mapHexes = listStrategicH3Indexes();
  const windowCells = selectStrategicMapWindowCells({
    mapCells: mapHexes,
    ownUnitH3: args.state.units.filter((unit) => unit.player === ownSeat).map((unit) => unit.h3Index),
    visibleEnemyH3: visibleEnemyH3ForStrategicMap(args.state),
    controlledCityH3: controlledCityH3ForStrategicMap(args.state),
    targetH3: aggRows.map((row) => row.targetH3),
  });
  const patches = groupConnectedMapPatches(windowCells);
  logDebug('briefing-map-section buildStrategicOperationalMapSectionMarkdown: window', {
    strategicCellCount: mapHexes.length,
    windowCells: windowCells.length,
    patches: patches.length,
  });
  const gameByH3 = buildStrategicHexGameStateMap(args.state, windowCells);
  const rendered = renderStrategicWindowPatchesMarkdown({ patches, context, gameByH3 });
  const optionsMd = renderThisTurnOptionsTableMarkdown(
    aggRows,
    args.latLngByH3,
    context,
    bindBestOptionsOdds({ state: args.state, latLngByH3: args.latLngByH3 })
  );
  const cropped = windowCells.length < mapHexes.length;
  const shown = cropped
    ? strategicWindowShownLine({
        windowCount: windowCells.length,
        mapCount: mapHexes.length,
        patchCount: patches.length,
        mentionGetMap: args.mentionGetMap === true,
      })
    : '';

  const displacedGap = rendered.displacedLine.length > 0 ? `\n\n${rendered.displacedLine}` : '';
  return (
    `${subHeading(SECTION_TITLE_OPERATIONAL_MAP)}\n\n${strategicOperationalMapShownBlock(shown)}` +
    `${rendered.blocks}${displacedGap}\n\n` +
    `${formatBestOptionsThisTurnSubsection(optionsMd)}`
  );
}

/**
 * Reads fog, discovery, and the two occupancy counts for one briefing map.
 *
 * Purpose: The strategic and tactical ASCII maps count the same seats the same way.
 * When to use: At the start of each hex-state builder, before that map's own loop.
 * Expected outcome: `ownUnitsByH3` counts the briefing seat. `otherUnitsByH3` counts every other seat, including neutral.
 * Exceptions: None.
 */
function readBriefingMapOccupancy(state: GameStateSnapshot): {
  readonly ownSeat: ReturnType<typeof briefingOwnSeatId>;
  readonly fog: boolean;
  readonly discovered: Set<string>;
  readonly ownUnitsByH3: Map<string, number>;
  readonly otherUnitsByH3: Map<string, number>;
} {
  const discovered = new Set<string>([...(state.visibleHexes ?? []), ...(state.exploredHexes ?? [])]);
  const fog = state.fogOfWarEnabled === true;
  const ownSeat = briefingOwnSeatId(state);
  const ownUnitsByH3 = new Map<string, number>();
  const otherUnitsByH3 = new Map<string, number>();
  for (const u of state.units) {
    if (u.player === ownSeat) ownUnitsByH3.set(u.h3Index, (ownUnitsByH3.get(u.h3Index) ?? 0) + 1);
    else otherUnitsByH3.set(u.h3Index, (otherUnitsByH3.get(u.h3Index) ?? 0) + 1);
  }
  return { ownSeat, fog, discovered, ownUnitsByH3, otherUnitsByH3 };
}

/**
 * Classifies a briefing terrain string as land or water.
 *
 * Purpose: Both ASCII maps use the same three water kinds.
 * When to use: Once per hex while building cell state.
 * Expected outcome: Ocean, water, and arctic ocean are water. Every other string, including a missing-row default, is land.
 * Exceptions: None.
 */
function briefingMapTerrainBand(rawTerrain: string): 'land' | 'water' {
  return rawTerrain === 'ocean' || rawTerrain === 'water' || rawTerrain === 'arctic_ocean' ? 'water' : 'land';
}

/**
 * Per-cell terrain, features, and occupancy for the strategic ASCII map.
 *
 * Purpose: Fog and `?` stay the same whether the cell is in the briefing window or a `get_map` disk.
 * When to use: After the cells to draw are known.
 * Expected outcome: One entry per `mapHexes` member. Enemy counts are zero on an undiscovered hex when fog is on.
 * Exceptions: None. A missing terrain row is land.
 */
export function buildStrategicHexGameStateMap(state: GameStateSnapshot, mapHexes: readonly string[]): Map<string, HexMapCellState> {
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
  const occupancy = readBriefingMapOccupancy(state);
  const { fog, discovered } = occupancy;
  const aiUnitsByH3 = occupancy.ownUnitsByH3;
  const humanUnitsByH3 = occupancy.otherUnitsByH3;

  const out = new Map<string, HexMapCellState>();
  for (const h3 of mapHexes) {
    const rawTerrain = terrainByH3.get(h3) ?? 'land';
    const terrain = briefingMapTerrainBand(rawTerrain);
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
 * Builds the tactical operational map markdown fragment (no leading heading; the caller supplies the H2).
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
  /**
   * Whether a cropped map tells the model to call `get_map`.
   *
   * Contract: The sentence is added only when this is true and the window is smaller than the footprint.
   * When to use: Tactical briefings whose enabled tools include `get_map`.
   * Expected outcome: The Shown line gains `Call get_map(center, radius) for cells outside this window.`
   * Exceptions: None.
   */
  mentionGetMap?: boolean;
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
  const aggRows = collectAggregatedPossibleActionRows({
    state: args.state,
    latLngByH3: args.latLngByH3,
    formatLatLng: () => '',
    tacticalBattle: args.tacticalBattle,
    forThisTurnOptionsTable: true,
  });
  const windowCells = selectTacticalMapWindowCells({
    footprint: mapHexes,
    occupiedH3: args.tacticalBattle.subUnits.map((unit) => unit.h3Index),
    targetH3: aggRows.map((row) => row.targetH3),
  });
  const cropped = windowCells.length < mapHexes.length;
  const grid = cropped
    ? projectTacticalMapWindow({ footprint: mapHexes, window: windowCells, context })
    : projectTacticalFootprintToAsciiGrid(mapHexes, context);
  const gameByH3 = buildTacticalHexGameStateMap(args.state, args.tacticalBattle, cropped ? [...windowCells] : mapHexes);
  const { mapString, displacedFeatures } = renderHexAsciiMap(grid, gameByH3);
  const optionsMd = renderThisTurnOptionsTableMarkdown(
    aggRows,
    args.latLngByH3,
    context,
    bindBestOptionsOdds({
      state: args.state,
      latLngByH3: args.latLngByH3,
      tacticalBattle: args.tacticalBattle,
    })
  );
  const displacedLine = renderDisplacedFeaturesLine(displacedFeatures);
  const shownBlock = cropped
    ? `Shown: ${windowCells.length} of ${mapHexes.length} cells around your units and the listed targets.${
        args.mentionGetMap ? ' Call get_map(center, radius) for cells outside this window.' : ''
      }\n\n`
    : '';

  const displacedGap = displacedLine.length > 0 ? `\n\n${displacedLine}` : '';
  return (
    `${shownBlock}\`\`\`\n${mapString}\n\`\`\`${displacedGap}\n\n` +
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
  const occupancy = readBriefingMapOccupancy(state);
  const { fog, discovered, ownSeat } = occupancy;
  const aiUnitsByH3 = occupancy.ownUnitsByH3;
  const humanUnitsByH3 = occupancy.otherUnitsByH3;
  const enclosingController =
    (state.strategicControl ?? []).find((r) => r.h3Index === battle.enclosingStrategicH3Index)?.controllerPlayerId ?? null;
  const controlledByAI = enclosingController === briefingOwnSeatId(state);
  const out = new Map<string, HexMapCellState>();
  for (const h3 of mapHexes) {
    const rawTerrain = terrainByH3.get(h3) ?? 'land';
    const terrain = briefingMapTerrainBand(rawTerrain);
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

/**
 * Fenced grid for a caller-chosen set of footprint cells.
 *
 * Purpose: `get_map` draws the same map as the briefing, around the cell the model asked for.
 * When to use: After the center and radius have been checked against the footprint.
 * Expected outcome: A fenced grid. No legend, no Shown line, and no Best Options table.
 * Exceptions: Throws when a window cell has no tactical briefing code.
 */
export function renderTacticalWindowGridMarkdown(args: {
  readonly state: GameStateSnapshot;
  readonly tacticalBattle: TacticalBattleSnapshot;
  readonly windowCells: readonly string[];
}): string {
  logDebug('briefing-map-section renderTacticalWindowGridMarkdown', {
    battleId: args.tacticalBattle.battleId,
    window: args.windowCells.length,
  });
  initTacticalCoordinateRegistry(args.tacticalBattle.battleId, args.tacticalBattle.enclosingStrategicH3Index);
  const context: CoordinateContext = {
    mode: 'tactical',
    battleId: args.tacticalBattle.battleId,
    tacticalTurnNumber: args.tacticalBattle.tacticalTurnNumber,
  };
  const footprint = args.tacticalBattle.tacticalChildH3Indexes;
  const grid = projectTacticalMapWindow({ footprint, window: args.windowCells, context });
  const gameByH3 = buildTacticalHexGameStateMap(args.state, args.tacticalBattle, [...args.windowCells]);
  const { mapString } = renderHexAsciiMap(grid, gameByH3);
  return `\`\`\`\n${mapString}\n\`\`\``;
}

