/**
 * Shared production overlay math for strategic canvas labels and build-entry gating (capacity, queues, deployment caps).
 */

import type { BuildUnitType, GameStateSnapshot } from '../../shared/ipcTypes';
import { estimateTurnsToNextSpawn } from '../../shared/productionConfig';
import { getMaxUnitsPerType, parseGameSize } from '../../shared/gameSize';
import { getPlayerUnitCountsByType } from '../../shared/unitCountsByType';
import { getUrbanProductionCapacityForHex as getUrbanProductionCapacityForHexFromTooltipState } from '../map/terrainTooltipStrategicState';
import { rendererSharedState as S } from '../core/state';
import { isTerrainInspectionShown } from '../../shared/mapViewMode';
import { getMapViewMode } from '../map/mapViewModeState';
import { isNewGameOverlayOpen } from './newGameBanner';

/**
 * Per-type unit totals for one side; used when FoW is off and inspection mode reveals all queues.
 */
export type UnitCountsByType = Record<BuildUnitType, number>;

/**
 * Human and opponent unit-count snapshots for production label hints under inspection mode.
 */
export type UnitCountsByPlayer = Record<'human' | 'opponent', UnitCountsByType>;

/**
 * Context computed once per frame for strategic production overlay drawing and build-entry sync.
 */
export interface ProductionOverlayContext {
    /**
   * Specifies the contract for the `mapInspectionHeld` member (mapInspectionHeld: boolean;).

   * Contract: True while the inspection view is on: T is held, or Tech is chosen on the world map outside a battle and outside the new-game or game-over overlay.
   * When to use: Read by `drawStrategicProductionOverlays` and `syncBuildEntryButton` each frame.
   * Expected outcome: Matches `isMapInspectionModeHeld`.
   * Exceptions: None.
   */
mapInspectionHeld: boolean;
    /**
   * Specifies the contract for the `revealAllControllerQueues` member (revealAllControllerQueues: boolean;).

   * Contract: When true with FoW disabled, labels may show opponent queue timing using precomputed counts.
   * When to use: Production overlay branch that formats opponent-controlled hex labels.
   * Expected outcome: True only when inspection mode and FoW-off snapshot align.
   * Exceptions: None.
   */
revealAllControllerQueues: boolean;
    /**
   * Specifies the contract for the `unitHexes` member (unitHexes: Set<string>;).

   * Contract: Hexes that currently contain at least one unit for infrastructure glyph hints.
   * When to use: Pass-through from latest `GameStateSnapshot` during overlay build.
   * Expected outcome: One entry per occupied strategic hex.
   * Exceptions: None.
   */
unitHexes: Set<string>;
    /**
   * Specifies the contract for the `unitCountsByPlayer` member (unitCountsByPlayer?: UnitCountsByPlayer;).

   * Contract: Optional human/opponent per-type totals when revealing all controller queues.
   * When to use: Only when `revealAllControllerQueues` is true.
   * Expected outcome: Drives `formatProductionLabelForAnyController` cap-aware hints.
   * Exceptions: None.
   */
unitCountsByPlayer?: UnitCountsByPlayer;
}

/**
 * Reads strategic control owner for a strategic hex from the snapshot control table.
 */
export function getControllerForHex(state: GameStateSnapshot, h3Index: string): string | null {
  const row = state.strategicControl?.find((entry) => entry.h3Index === h3Index);
  return row?.controllerPlayerId ?? null;
}

/**
 * Urban production capacity for overlay labels; delegates to the shared terrain tooltip tactical urban count cache.
 */
export function getUrbanProductionCapacityForHex(h3Index: string): number {
  return getUrbanProductionCapacityForHexFromTooltipState(h3Index);
}

/**
 * Reports whether the map shows its inspection view: terrain fill hidden and, on the world map, hex codes and tech icons.
 *
 * Purpose: Every drawing path that used to ask whether T is held asks here. The name stays because many callers pass
 *   it along; the answer now also covers the Tech view chosen in the mode column.
 * When to use: Wherever drawing depends on the inspection view.
 * Expected outcome: True while T is held, or while the Tech view is chosen outside a battle and outside the new-game
 *   or game-over overlay. See `isTerrainInspectionShown`.
 * Exceptions: None.
 */
export function isMapInspectionModeHeld(): boolean {
  const mapViewMode = getMapViewMode();
  return isTerrainInspectionShown({
    tKeyHeld: S.hideTerrainFillWhileHeld,
    mapViewMode,
    inBattle: S.tacticalBattleSnapshot != null,
    // Drawing asks this for every hex, so the page is read only while the answer can depend on it.
    newGameOverlayOpen: mapViewMode === 'tech' && isNewGameOverlayOpen(),
  });
}

/**
 * True when the human controls the hex and it has positive urban production capacity.
 */
export function isStrategicHexHumanUrbanProduction(
  state: GameStateSnapshot,
  hx: GameStateSnapshot['hexes'][number]
): boolean {
  if (getControllerForHex(state, hx.h3Index) !== 'human') return false;
  return getUrbanProductionCapacityForHex(hx.h3Index) > 0;
}

/**
 * Looks up aggregated queue row for a hex from `strategicBuildQueueTotals`, if present.
 */
export function getBuildQueueSummaryForHex(
  state: GameStateSnapshot,
  h3Index: string
): NonNullable<GameStateSnapshot['strategicBuildQueueTotals']>[number] | null {
  return state.strategicBuildQueueTotals?.find((entry) => entry.h3Index === h3Index) ?? null;
}

/**
 * Per-type counts for one player from the live unit list (deployment cap checks for ∞t labels).
 */
export function getUnitCountsByTypeForPlayer(
  state: GameStateSnapshot,
  playerId: 'human' | 'opponent'
): UnitCountsByType {
  return getPlayerUnitCountsByType(state.units, playerId);
}

/**
 * True when the entire-game FoW toggle is off (debug / reveal-all modes).
 */
export function isFogOfWarDisabledForSnapshot(state: GameStateSnapshot): boolean {
  return state.fogOfWarEnabled === false;
}

/**
 * Formats `$N / …t` production label text using queue head, stored points, and per-type caps.
 */
export function formatProductionQueueAwareLabel(
  state: GameStateSnapshot,
  h3Index: string,
  capacityPerTurn: number,
  controller: string | null,
  unitCountsByPlayer?: UnitCountsByPlayer
): string {
  const capacityText = `$${Math.max(0, capacityPerTurn).toLocaleString()}`;
  const queue = getBuildQueueSummaryForHex(state, h3Index);
  const queuedUnits = queue?.queuedUnits ?? 0;
  if (queuedUnits <= 0) return capacityText;
  const nextUnitType = queue?.nextUnitType;
  const storedPoints = Math.max(0, queue?.storedPoints ?? 0);
  if (!nextUnitType || capacityPerTurn <= 0) {
    return `${capacityText} / ?t`;
  }
  if (controller === 'human' || controller === 'opponent') {
    const countsByType =
      controller === 'human'
        ? (unitCountsByPlayer?.human ?? getUnitCountsByTypeForPlayer(state, 'human'))
        : (unitCountsByPlayer?.opponent ?? getUnitCountsByTypeForPlayer(state, 'opponent'));
    if (countsByType[nextUnitType] >= getMaxUnitsPerType(parseGameSize(state.gameSize))[nextUnitType]) {
      return `${capacityText} / ∞t`;
    }
  }
  const turns = estimateTurnsToNextSpawn(nextUnitType, storedPoints, capacityPerTurn);
  if (turns === null) return `${capacityText} / ?t`;
  return `${capacityText} / ${turns.toLocaleString()}t`;
}

/**
 * Like `formatProductionQueueAwareLabel` but only resolves opponent queue hints when the controller is human.
 */
export function formatProductionLabelForHumanControllerOnly(
  state: GameStateSnapshot,
  h3Index: string,
  capacityPerTurn: number,
  controller: string | null
): string {
  if (controller !== 'human') return `$${Math.max(0, capacityPerTurn).toLocaleString()} / ?t`;
  return formatProductionQueueAwareLabel(state, h3Index, capacityPerTurn, controller);
}

/**
 * Full queue-aware labels for both sides when inspection mode reveals all controller queues.
 */
export function formatProductionLabelForAnyController(
  state: GameStateSnapshot,
  h3Index: string,
  capacityPerTurn: number,
  controller: string | null,
  unitCountsByPlayer?: UnitCountsByPlayer
): string {
  return formatProductionQueueAwareLabel(state, h3Index, capacityPerTurn, controller, unitCountsByPlayer);
}

/**
 * Builds shared overlay flags and optional per-player unit counts for one draw pass.
 */
export function buildProductionOverlayContext(state: GameStateSnapshot): ProductionOverlayContext {
  const mapInspectionHeld = isMapInspectionModeHeld();
  const revealAllControllerQueues = mapInspectionHeld && isFogOfWarDisabledForSnapshot(state);
  return {
    mapInspectionHeld,
    revealAllControllerQueues,
    unitHexes: new Set(state.units.map((u) => u.h3Index)),
    unitCountsByPlayer: revealAllControllerQueues
      ? {
          human: getUnitCountsByTypeForPlayer(state, 'human'),
          opponent: getUnitCountsByTypeForPlayer(state, 'opponent'),
        }
      : undefined,
  };
}
