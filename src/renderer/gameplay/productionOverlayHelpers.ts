/**
 * Shared production overlay math for strategic canvas labels and build-entry gating (capacity, queues, deployment caps).
 */

import { formatProductionCapacityAmount } from '../../shared/economySymbols';
import { isSeatId, type SeatId, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { isBuildUnitType, type BuildUnitType, type GameStateSnapshot } from '../../shared/ipcTypes';
import { FORTIFICATION_QUEUE_ITEM } from '../../shared/fortificationRules';
import { estimateTurnsToNextSpawn } from '../../shared/productionConfig';
import { getMaxUnitsPerType, parseGameSize } from '../../shared/gameSize';
import { getPlayerUnitCountsByType } from '../../shared/unitCountsByType';
import { getUrbanProductionCapacityForHex as getUrbanProductionCapacityForHexFromTooltipState } from '../map/terrainTooltipStrategicState';
import { rendererSharedState as S } from '../core/state';
import { isMapLayerShown } from '../../shared/mapViewMode';
import { isProductionDetailChosen, isTechViewChosen } from '../map/mapViewModeState';
import { isNewGameOverlayOpen } from './newGameBanner';

/**
 * Per-type unit totals for one side; used when FoW is off and inspection mode reveals all queues.
 */
export type UnitCountsByType = Record<BuildUnitType, number>;

/**
 * Unit counts for the seats a production draw has already totaled.
 *
 * Purpose: Inspection mode checks the deployment cap without scanning units once per hex.
 * When to use: `formatProductionQueueAwareLabel` when fog is off.
 * Expected outcome: Seats this pass computed are present. A missing seat is counted on demand.
 * Exceptions: None.
 */
export type UnitCountsByPlayer = Partial<Record<SeatId, UnitCountsByType>>;

/**
 * Context computed once per frame for strategic production overlay drawing and build-entry sync.
 */
export interface ProductionOverlayContext {
    /**
   * Specifies the contract for the `mapInspectionHeld` member (mapInspectionHeld: boolean;).

   * Contract: True while the player holds T.
   * When to use: Read by `drawStrategicProductionOverlays` each frame, to move labels to the lower band.
   * Expected outcome: Matches `isMapInspectionModeHeld`.
   * Exceptions: None.
   */
mapInspectionHeld: boolean;
    /**
   * Whether production labels show on every world hex, not only on the player's own.
   *
   * Contract: True while T is held, or while Production is on, on the world map outside a battle and outside the new-game or game-over overlay.
   * When to use: Read by `drawStrategicProductionOverlays` each frame, to choose which hexes get a label.
   * Expected outcome: Matches `isProductionDetailShown`.
   * Exceptions: None.
   */
productionDetailShown: boolean;
    /**
   * Specifies the contract for the `revealAllControllerQueues` member (revealAllControllerQueues: boolean;).

   * Contract: When true with FoW disabled, labels may show opponent queue timing using precomputed counts.
   * When to use: Production overlay branch that formats opponent-controlled hex labels.
   * Expected outcome: True only while production detail is shown and the snapshot has fog of war off.
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
 * Reports whether the player is holding T, the map's inspection gesture.
 *
 * Purpose: Holding T hides terrain fill, shows hex codes, and moves production labels to the lower band, everywhere.
 *   No map-mode tab turns these on, so this is the key alone. The tech icons and the production labels that T also
 *   shows follow `areTechIconsShown` and `isProductionDetailShown`.
 * When to use: Wherever drawing depends on T being held.
 * Expected outcome: True while T is held.
 * Exceptions: None.
 */
export function isMapInspectionModeHeld(): boolean {
  return S.hideTerrainFillWhileHeld;
}

/**
 * Reports whether a layer that holding T also shows is on screen, given whether its tab is on.
 *
 * Purpose: The tech icons and production detail share one rule. See `isMapLayerShown`.
 * When to use: From `areTechIconsShown` and `isProductionDetailShown`.
 * Expected outcome: True while T is held, or while the layer is chosen outside a battle and outside the new-game or
 *   game-over overlay.
 * Exceptions: None.
 */
function isChosenLayerShown(layerChosen: boolean): boolean {
  return isMapLayerShown({
    tKeyHeld: S.hideTerrainFillWhileHeld,
    layerChosen,
    inBattle: S.tacticalBattleSnapshot != null,
    // Drawing asks this for every hex, so the page is read only while the answer can depend on it.
    newGameOverlayOpen: layerChosen && isNewGameOverlayOpen(),
  });
}

/**
 * Reports whether the world map shows the tech tier icons.
 *
 * Purpose: The status-icon pass shows them while T is held or while Tech is on.
 * When to use: Once per status-icon pass.
 * Expected outcome: True while T is held, or while Tech is on outside a battle and outside the new-game or game-over
 *   overlay.
 * Exceptions: None.
 */
export function areTechIconsShown(): boolean {
  return isChosenLayerShown(isTechViewChosen());
}

/**
 * Reports whether production labels show on every world hex, not only on the player's own.
 *
 * Purpose: Holding T or turning Production on reveals the labels on opponent, neutral, and unexplored hexes.
 * When to use: Once per production-label pass and once per status-icon pass.
 * Expected outcome: True while T is held, or while Production is on outside a battle and outside the new-game or
 *   game-over overlay.
 * Exceptions: None.
 */
export function isProductionDetailShown(): boolean {
  return isChosenLayerShown(isProductionDetailChosen());
}

/**
 * Whether a hex index is one the human can build on.
 *
 * Purpose: Shift-select must not pull a Hire marker into a multi-hex build popup.
 * When to use: A build-entry click, with the hex that was clicked and each hex already selected.
 * Expected outcome: True when that hex is on the snapshot and passes the human urban production test.
 * Exceptions: None.
 */
export function isHumanBuildEntryHexIndex(state: GameStateSnapshot | null, h3Index: string): boolean {
  const hex = state?.hexes.find((row) => row.h3Index === h3Index);
  if (!state || !hex) return false;
  return isStrategicHexHumanUrbanProduction(state, hex);
}

/**
 * Whether the human can open a build queue on this hex.
 *
 * Purpose: Build markers and canvas labels share one eligibility test.
 * When to use: With a hex from the snapshot.
 * Expected outcome: True when the human controls the hex and it has urban production.
 * Exceptions: None.
 */
export function isStrategicHexHumanUrbanProduction(
  state: GameStateSnapshot,
  hx: GameStateSnapshot['hexes'][number]
): boolean {
  if (getControllerForHex(state, hx.h3Index) !== HUMAN_SEAT_ID) return false;
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
  playerId: SeatId
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
 * Formats production label text using queue head, stored points, and per-type caps.
 */
export function formatProductionQueueAwareLabel(
  state: GameStateSnapshot,
  h3Index: string,
  capacityPerTurn: number,
  controller: string | null,
  unitCountsByPlayer?: UnitCountsByPlayer
): string {
  const capacityText = formatProductionCapacityAmount(Math.max(0, capacityPerTurn).toLocaleString());
  const queue = getBuildQueueSummaryForHex(state, h3Index);
  const queuedUnits = queue?.queuedUnits ?? 0;
  if (queuedUnits <= 0) return capacityText;
  if (queue?.buildPaused === true) return `${capacityText} / ∞t`;
  const nextUnitType = queue?.nextUnitType;
  const storedPoints = Math.max(0, queue?.storedPoints ?? 0);
  if (nextUnitType === FORTIFICATION_QUEUE_ITEM) {
    const fortifiable =
      state.strategicInfrastructure?.find((row) => row.h3Index === h3Index)?.fortifiableCount ?? 0;
    if (fortifiable <= 0) return `${capacityText} / ∞t`;
  }
  if (!nextUnitType || capacityPerTurn <= 0) {
    return `${capacityText} / ?t`;
  }
  if (controller && isSeatId(controller) && isBuildUnitType(nextUnitType)) {
    const countsByType = unitCountsByPlayer?.[controller] ?? getUnitCountsByTypeForPlayer(state, controller);
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
  if (controller !== HUMAN_SEAT_ID) {
    return `${formatProductionCapacityAmount(Math.max(0, capacityPerTurn).toLocaleString())} / ?t`;
  }
  return formatProductionQueueAwareLabel(state, h3Index, capacityPerTurn, controller);
}

/**
 * Full queue-aware labels for every seat when inspection mode reveals all controller queues.
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
 * Counts each roster seat once for the deployment-cap label.
 *
 * Purpose: A later seat's queue can show the cap without scanning units on every hex.
 * When to use: Fog is off and production labels are showing.
 * Expected outcome: One entry per seat on the snapshot. A snapshot with no roster counts the human seat.
 * Exceptions: None.
 */
function unitCountsForReveal(state: GameStateSnapshot): UnitCountsByPlayer {
  const seatIds = (state.seats ?? []).map((seat) => seat.seatId);
  const ids = seatIds.length > 0 ? seatIds : [HUMAN_SEAT_ID];
  const counts: UnitCountsByPlayer = {};
  for (const seatId of ids) counts[seatId] = getUnitCountsByTypeForPlayer(state, seatId);
  return counts;
}

/**
 * Builds shared overlay flags and optional per-player unit counts for one draw pass.
 */
export function buildProductionOverlayContext(state: GameStateSnapshot): ProductionOverlayContext {
  const mapInspectionHeld = isMapInspectionModeHeld();
  const productionDetailShown = isProductionDetailShown();
  const revealAllControllerQueues = productionDetailShown && isFogOfWarDisabledForSnapshot(state);
  return {
    mapInspectionHeld,
    productionDetailShown,
    revealAllControllerQueues,
    unitHexes: new Set(state.units.map((u) => u.h3Index)),
    unitCountsByPlayer: revealAllControllerQueues ? unitCountsForReveal(state) : undefined,
  };
}
