import type { AirStrikeTargetType, GameStateSnapshot } from '../../shared/ipcTypes';
import type { NamingLookupTarget, TerrainTooltipState } from './terrainTooltipTypes';
import { TERRAIN_TOOLTIP_DELAY_MS } from '../core/constants';
import { hitTestHexAtContainerPixel, hitTestTacticalRes4HexAtContainerPixel } from './mapUtils';
import { rendererSharedState as S } from '../core/state';
import { getMainLeafletMap } from './worldLeafletMap';
import { tacticalRendererHitInsideBattleFootprint } from '../tactical/tacticalUiGuards';
import {
  applyHumanUnitIconClickSelectionPolicy,
  clearDeferredHumanUnitSingleSelectTimer,
} from './mapClickSelectionPolicy';
import { emitParityDiagnosticsBreadcrumb } from '../core/parityDiagnostics';

/**
 * Minimal unit row shape used for grouped march / ferry preflight on the map (strategic units or tactical sub-units).
 *
 * Contract: Matches the fields read by dblclick march handling (`id`, `h3Index`, `player`, `unitType`).
 * When to use: `getSelectedHumanUnitsAtMouseDown` so tactical selections do not require synthetic `GameStateSnapshot.units` rows.
 * Expected outcome: Human-owned ids suitable for `assignHumanMarchOrders` IPC in both strategic and tactical modes.
 * Exceptions: None.
 */
type GroupedMarchSelectedUnit = Pick<GameStateSnapshot['units'][number], 'id' | 'h3Index' | 'player' | 'unitType'>;

/**
 * Documents the `MainMapInteractionDeps` interface as a named contract surface (interface MainMapInteractionDeps).

 * Purpose: Supports maintainability by documenting why `MainMapInteractionDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface MainMapInteractionDeps {
    /**
   * Specifies the contract for the `clearTerrainTooltipTimer` member (clearTerrainTooltipTimer: () => void;).

   * Contract: Describes stable behavior for callers of `clearTerrainTooltipTimer` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearTerrainTooltipTimer: () => void;
    /**
   * Specifies the contract for the `hideTerrainTooltipVisual` member (hideTerrainTooltipVisual: () => void;).

   * Contract: Describes stable behavior for callers of `hideTerrainTooltipVisual` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideTerrainTooltipVisual: () => void;
    /**
   * Specifies the contract for the `shouldSuppressTerrainTooltip` member (shouldSuppressTerrainTooltip: () => boolean;).

   * Contract: Describes stable behavior for callers of `shouldSuppressTerrainTooltip` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
shouldSuppressTerrainTooltip: () => boolean;
    /**
   * Specifies the contract for the `requestRedraw` member (requestRedraw: () => void;).

   * Contract: Describes stable behavior for callers of `requestRedraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestRedraw: () => void;
    /**
   * Specifies the contract for the `refreshHoverRoutePreview` member (refreshHoverRoutePreview: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `refreshHoverRoutePreview` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshHoverRoutePreview: () => Promise<void>;
    /**
   * Specifies the contract for the `detailHitAtClientPixel` member (detailHitAtClientPixel: (clientX: number, clientY: number, mapHexSet: Set<string>) => string | null;).

   * Contract: Describes stable behavior for callers of `detailHitAtClientPixel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
detailHitAtClientPixel: (clientX: number, clientY: number, mapHexSet: Set<string>) => string | null;
    /**
   * Specifies the contract for the `terrainStateForPointer` member (terrainStateForPointer: (clientX: number, clientY: number, fallbackRes1H3: string | null) => TerrainTooltipState;).

   * Contract: Describes stable behavior for callers of `terrainStateForPointer` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainStateForPointer: (clientX: number, clientY: number, fallbackRes1H3: string | null) => TerrainTooltipState;
    /**
   * Specifies the contract for the `namingLookupTargetForPointer` member (namingLookupTargetForPointer: (clientX: number, clientY: number, fallbackRes1H3: string | null) => NamingLookupTarget | null;).

   * Contract: Describes stable behavior for callers of `namingLookupTargetForPointer` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
namingLookupTargetForPointer: (clientX: number, clientY: number, fallbackRes1H3: string | null) => NamingLookupTarget | null;
    /**
   * Specifies the contract for the `showTerrainTooltip` member (showTerrainTooltip: (clientX: number, clientY: number, state: TerrainTooltipState, namingTarget: NamingLookupTarget | null) => Promise<void>;).

   * Contract: Describes stable behavior for callers of `showTerrainTooltip` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showTerrainTooltip: (
    clientX: number,
    clientY: number,
    state: TerrainTooltipState,
    namingTarget: NamingLookupTarget | null
  ) => Promise<void>;
    /**
   * Specifies the contract for the `clearSidebarError` member (clearSidebarError: () => void;).

   * Contract: Describes stable behavior for callers of `clearSidebarError` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearSidebarError: () => void;
    /**
   * Specifies the contract for the `formatTargetingValidationReason` member (formatTargetingValidationReason: (reason: string | undefined, fallbackMessage: string) => string;).

   * Contract: Describes stable behavior for callers of `formatTargetingValidationReason` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
formatTargetingValidationReason: (reason: string | undefined, fallbackMessage: string) => string;
    /**
   * Specifies the contract for the `showMapToast` member (showMapToast: (message: string, options?: { isError?: boolean }) => void;).

   * Contract: Describes stable behavior for callers of `showMapToast` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showMapToast: (message: string, options?: { isError?: boolean }) => void;
    /**
   * Specifies the contract for the `replacePendingAirStrikesForSelected` member (replacePendingAirStrikesForSelected: (selectedIds: string[], targetH3Index: string, targetType: AirStrikeTargetType) => void;).

   * Contract: Describes stable behavior for callers of `replacePendingAirStrikesForSelected` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
replacePendingAirStrikesForSelected: (
    selectedIds: string[],
    targetH3Index: string,
    targetType: AirStrikeTargetType
  ) => void;
    /**
   * Specifies the contract for the `replacePendingRangedAttacksForSelected` member (replacePendingRangedAttacksForSelected: (selectedIds: string[], targetH3Index: string) => void;).

   * Contract: Describes stable behavior for callers of `replacePendingRangedAttacksForSelected` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
replacePendingRangedAttacksForSelected: (selectedIds: string[], targetH3Index: string) => void;
    /**
   * Specifies the contract for the `clearSelection` member (clearSelection: () => void;).

   * Contract: Describes stable behavior for callers of `clearSelection` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearSelection: () => void;
    /**
   * Specifies the contract for the `hideStackCallout` member (hideStackCallout: () => void;).

   * Contract: Describes stable behavior for callers of `hideStackCallout` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideStackCallout: () => void;
    /**
   * Specifies the contract for the `updateSidebar` member (updateSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updateSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateSidebar: () => void;
    /**
   * Specifies the contract for the `updateRangedSidebar` member (updateRangedSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updateRangedSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateRangedSidebar: () => void;
    /**
   * Specifies the contract for the `redraw` member (redraw: () => void;).

   * Contract: Describes stable behavior for callers of `redraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
redraw: () => void;
    /**
   * Specifies the contract for the `getUnitsForDrawWithMovingIds` member (getUnitsForDrawWithMovingIds: (state: GameStateSnapshot) => { unitsToDraw: GameStateSnapshot['units']; movingIds: Set<string> | undefined; };).

   * Contract: Describes stable behavior for callers of `getUnitsForDrawWithMovingIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getUnitsForDrawWithMovingIds: (state: GameStateSnapshot) => {
    unitsToDraw: GameStateSnapshot['units'];
    movingIds: Set<string> | undefined;
  };
    /**
   * Specifies the contract for the `tryHandleBuildEntryAtClientXY` member (tryHandleBuildEntryAtClientXY: (clientX: number, clientY: number) => boolean;).

   * Contract: Describes stable behavior for callers of `tryHandleBuildEntryAtClientXY` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tryHandleBuildEntryAtClientXY: (clientX: number, clientY: number) => boolean;
    /**
   * Specifies the contract for the `tryHandleTacticalEntryAtClientXY` member (tryHandleTacticalEntryAtClientXY: (clientX: number, clientY: number) => Promise<boolean>;).

   * Contract: Runs before build-entry hit-testing so magnifier controls win when overlapping production entry buttons.
   * When to use: Main-map click routing during strategic planning when contested-hex tactical entry may be visible.
   * Expected outcome: Returns true when a tactical entry click was consumed (including failed async starts that still ate the click).
   * Exceptions: None.
   */
tryHandleTacticalEntryAtClientXY: (clientX: number, clientY: number) => Promise<boolean>;
    /**
   * Specifies the contract for the `containerPixelHitsDrawnUnitIcon` member (containerPixelHitsDrawnUnitIcon: (px: number, py: number, h3Index: string, unitCount: number) => boolean;).

   * Contract: Describes stable behavior for callers of `containerPixelHitsDrawnUnitIcon` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
containerPixelHitsDrawnUnitIcon: (px: number, py: number, h3Index: string, unitCount: number) => boolean;
    /**
   * Specifies the contract for the `showStackCallout` member (showStackCallout: (units: GameStateSnapshot['units'], clientX: number, clientY: number) => void;).

   * Contract: Describes stable behavior for callers of `showStackCallout` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showStackCallout: (units: GameStateSnapshot['units'], clientX: number, clientY: number) => void;
    /**
   * Specifies the contract for the `getUnitAtHex` member (getUnitAtHex: (h3Index: string) => GameStateSnapshot['units'][0] | null;).

   * Contract: Describes stable behavior for callers of `getUnitAtHex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getUnitAtHex: (h3Index: string) => GameStateSnapshot['units'][0] | null;
    /**
   * Specifies the contract for the `toggleUnitSelection` member (toggleUnitSelection: (unitId: string) => void;).

   * Contract: Describes stable behavior for callers of `toggleUnitSelection` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toggleUnitSelection: (unitId: string) => void;
    /**
   * Specifies the contract for the `replaceSelection` member (replaceSelection: (unitIds: string[]) => void;).

   * Contract: Describes stable behavior for callers of `replaceSelection` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
replaceSelection: (unitIds: string[]) => void;
    /**
   * Specifies the contract for the `getPrimarySelectedUnitId` member (getPrimarySelectedUnitId: () => string | null;).

   * Contract: Describes stable behavior for callers of `getPrimarySelectedUnitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getPrimarySelectedUnitId: () => string | null;
    /**
   * Specifies the contract for the `updatePendingOrdersSidebar` member (updatePendingOrdersSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updatePendingOrdersSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updatePendingOrdersSidebar: () => void;
    /**
   * Specifies the contract for the `replacePendingFerryOrdersForSelected` member (replacePendingFerryOrdersForSelected: (selectedIds: string[], destinationH3Index: string) => void;).

   * Contract: Describes stable behavior for callers of `replacePendingFerryOrdersForSelected` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
replacePendingFerryOrdersForSelected: (selectedIds: string[], destinationH3Index: string) => void;
    /**
   * Specifies the contract for the `clearCommittedOrderDraftState` member (clearCommittedOrderDraftState: () => void;).

   * Contract: Describes stable behavior for callers of `clearCommittedOrderDraftState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearCommittedOrderDraftState: () => void;
    /**
   * Specifies the contract for the `refreshHumanStandingOrders` member (refreshHumanStandingOrders: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `refreshHumanStandingOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshHumanStandingOrders: () => Promise<void>;
}

/**
 * Defines the `wireMainMapInteractions` function shape (export function wireMainMapInteractions(deps: MainMapInteractionDeps): void).

 * Purpose: Supports maintainability by documenting why `wireMainMapInteractions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function wireMainMapInteractions(deps: MainMapInteractionDeps): void {
  const mainMapEl = document.getElementById('main-map');
  if (!mainMapEl) return;

  function clientXYToHit(clientX: number, clientY: number): string | null {
    if (!S.gameState) return null;
    const map = getMainLeafletMap() as { getContainer: () => HTMLElement } | null;
    if (!map) return null;
    const rect = map.getContainer().getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const tb = S.tacticalBattleSnapshot;
    if (tb) {
      // Do not fall back to strategic res1 hit-testing while tactical is active: `gameState.hexes`
      // still covers the globe at res1, so coordinates outside the battle footprint would keep a
      // stale res1 `hit` and the hex tooltip would never clear when the pointer leaves the res4 grid.
      return hitTestTacticalRes4HexAtContainerPixel(x, y, tb);
    }
    const set = new Set(S.gameState.hexes.map((h) => h.h3Index));
    return hitTestHexAtContainerPixel(x, y, set);
  }

  function getSelectedHumanUnitsAtMouseDown(state: GameStateSnapshot): GroupedMarchSelectedUnit[] {
    const tb = S.tacticalBattleSnapshot;
    if (tb) {
      return S.selectedUnitIdsAtMouseDown
        .map((id) => tb.subUnits.find((u) => u.id === id))
        .filter((u): u is NonNullable<typeof u> => !!u && u.player === 'human')
        .map((u) => ({
          id: u.id,
          h3Index: u.h3Index,
          player: 'human' as const,
          unitType: u.unitType,
        }));
    }
    return S.selectedUnitIdsAtMouseDown
      .map((id) => state.units.find((u) => u.id === id))
      .filter((unit): unit is NonNullable<typeof unit> => !!unit && unit.player === 'human');
  }

  /**
   * Resolves the res4/res1 hex of the primary selected unit for click-vs-selection clearing logic.
   *
   * Contract: Uses tactical sub-units when `S.tacticalBattleSnapshot` is set; otherwise strategic `state.units`.
   * When to use: Single-click map handler when comparing `hit` to the selected unit's current cell.
   * Expected outcome: `null` when nothing is selected or the id is unknown.
   * Exceptions: None.
   */
  function primarySelectedUnitHex(state: GameStateSnapshot): string | null {
    const primaryId = deps.getPrimarySelectedUnitId();
    if (!primaryId) return null;
    const tb = S.tacticalBattleSnapshot;
    if (tb) {
      const row = tb.subUnits.find((u) => u.id === primaryId);
      return row?.h3Index ?? null;
    }
    return state.units.find((u) => u.id === primaryId)?.h3Index ?? null;
  }

  async function commitGroupedAirFerryOrders(selectedIds: string[], destinationH3: string): Promise<boolean> {
    if (!window.gameApi?.validateGroupFerryTarget) return false;
    const validation = await window.gameApi.validateGroupFerryTarget({
      unitIds: selectedIds,
      destinationH3Index: destinationH3,
    });
    if (!validation.success) {
      deps.showMapToast(
        deps.formatTargetingValidationReason(validation.reason, 'Selected air units cannot ferry to that destination.'),
        { isError: true }
      );
      return true;
    }
    deps.replacePendingFerryOrdersForSelected(selectedIds, destinationH3);
    deps.clearCommittedOrderDraftState();
    deps.updatePendingOrdersSidebar();
    deps.updateSidebar();
    deps.redraw();
    return true;
  }

  async function commitGroupedMarchOrders(selectedIds: string[], destinationH3: string): Promise<boolean> {
    if (!window.gameApi?.assignHumanMarchOrders) return false;
    const assign = await window.gameApi.assignHumanMarchOrders({
      unitIds: selectedIds,
      destinationH3Index: destinationH3,
    });
    if (!assign.success) {
      deps.showMapToast(
        deps.formatTargetingValidationReason(assign.reason, 'Failed to assign movement order.'),
        { isError: true }
      );
      return true;
    }
    if (S.tacticalBattleSnapshot) {
      for (const subUnitId of selectedIds) {
        const idx = S.tacticalPendingMarches.findIndex((row) => row.subUnitId === subUnitId);
        if (idx >= 0) S.tacticalPendingMarches.splice(idx, 1);
        S.tacticalPendingMarches.push({ subUnitId, destinationH3Index: destinationH3 });
      }
    }
    deps.clearCommittedOrderDraftState();
    if (!S.tacticalBattleSnapshot) {
      await deps.refreshHumanStandingOrders();
    }
    deps.updatePendingOrdersSidebar();
    deps.updateSidebar();
    deps.redraw();
    return true;
  }

  mainMapEl.addEventListener('pointermove', (e) => {
    S.lastPointerClientX = e.clientX;
    S.lastPointerClientY = e.clientY;
    if (deps.shouldSuppressTerrainTooltip()) {
      deps.clearTerrainTooltipTimer();
      deps.hideTerrainTooltipVisual();
    }
    const mapHexSet = new Set((S.gameState?.hexes ?? []).map((h) => h.h3Index));
    const hit = clientXYToHit(e.clientX, e.clientY);
    const detailHit = deps.detailHitAtClientPixel(e.clientX, e.clientY, mapHexSet);

    const prevHit = S.hoveredHexH3;
    const prevDetail = S.hoveredDetailHexH3;
    const hitChanged = hit !== prevHit;
    const detailChanged = detailHit !== prevDetail;

    if (!hitChanged && !detailChanged) {
      const tipFollow = document.getElementById('hex-tooltip');
      if (
        !deps.shouldSuppressTerrainTooltip() &&
        tipFollow &&
        !tipFollow.classList.contains('hidden') &&
        hit
      ) {
        const state = deps.terrainStateForPointer(S.lastPointerClientX, S.lastPointerClientY, hit);
        const namingTarget = deps.namingLookupTargetForPointer(S.lastPointerClientX, S.lastPointerClientY, hit);
        void deps.showTerrainTooltip(S.lastPointerClientX, S.lastPointerClientY, state, namingTarget);
      }
      return;
    }

    S.hoveredHexH3 = hit;
    S.hoveredDetailHexH3 = detailHit;
    void deps.refreshHoverRoutePreview();
    deps.requestRedraw();

    const tooltipDelayShouldReset = S.tacticalBattleSnapshot ? hitChanged : hitChanged || detailChanged;
    if (tooltipDelayShouldReset) {
      deps.clearTerrainTooltipTimer();
      deps.hideTerrainTooltipVisual();
    }

    if (!hit || deps.shouldSuppressTerrainTooltip()) {
      return;
    }

    if (tooltipDelayShouldReset) {
      const targetHex = hit;
      S.terrainTooltipDelayTimer = setTimeout(() => {
        S.terrainTooltipDelayTimer = null;
        if (S.hoveredHexH3 !== targetHex || !S.gameState) return;
        if (deps.shouldSuppressTerrainTooltip()) return;
        const state = deps.terrainStateForPointer(S.lastPointerClientX, S.lastPointerClientY, targetHex);
        const namingTarget = deps.namingLookupTargetForPointer(S.lastPointerClientX, S.lastPointerClientY, targetHex);
        void deps.showTerrainTooltip(S.lastPointerClientX, S.lastPointerClientY, state, namingTarget);
      }, TERRAIN_TOOLTIP_DELAY_MS);
      return;
    }

    const tipFollow = document.getElementById('hex-tooltip');
    if (tipFollow && !tipFollow.classList.contains('hidden')) {
      const state = deps.terrainStateForPointer(S.lastPointerClientX, S.lastPointerClientY, hit);
      const namingTarget = deps.namingLookupTargetForPointer(S.lastPointerClientX, S.lastPointerClientY, hit);
      void deps.showTerrainTooltip(S.lastPointerClientX, S.lastPointerClientY, state, namingTarget);
    }
  });

  mainMapEl.addEventListener('pointerleave', (e) => {
    const next = e.relatedTarget;
    if (next instanceof Node) {
      const buildEntry = document.getElementById('build-entry-layer');
      const buildPopup = document.getElementById('build-popup');
      const tacticalEntry = document.getElementById('tactical-entry-layer');
      if (
        (buildEntry && buildEntry.contains(next)) ||
        (buildPopup && buildPopup.contains(next)) ||
        (tacticalEntry && tacticalEntry.contains(next))
      ) {
        return;
      }
    }
    deps.clearTerrainTooltipTimer();
    deps.hideTerrainTooltipVisual();
    if (S.hoveredHexH3 !== null || S.hoveredDetailHexH3 !== null) {
      S.hoveredHexH3 = null;
      S.hoveredDetailHexH3 = null;
      S.hoverRoutePreview = null;
      deps.requestRedraw();
    }
  });

  mainMapEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    S.selectedUnitIdsAtMouseDown = [...S.selectedUnitIds];
    deps.clearTerrainTooltipTimer();
    deps.hideTerrainTooltipVisual();
  });

  mainMapEl.addEventListener('click', async (e) => {
    const hit = clientXYToHit(e.clientX, e.clientY);
    S.selectedHexIndex = hit;
    deps.clearSidebarError();

    if (S.tacticalBattleSnapshot && !tacticalRendererHitInsideBattleFootprint(hit, S.tacticalBattleSnapshot)) {
      if (hit) {
        deps.showMapToast('That hex is outside the active tactical battle.', { isError: true });
      }
      return;
    }

    if (hit && S.airStrikeModeActive && S.selectedUnitIds.length > 0 && S.gameState) {
      if (!window.gameApi?.validateGroupAirStrikeTarget) return;
      const selectedIds = [...S.selectedUnitIds];
      const validation = await window.gameApi.validateGroupAirStrikeTarget({
        unitIds: selectedIds,
        targetH3Index: hit,
        targetType: S.airStrikeTargetType,
      });
      if (!validation.success) {
        deps.showMapToast(deps.formatTargetingValidationReason(validation.reason, 'Selected air units cannot strike that target.'), {
          isError: true,
        });
        S.airStrikeModeActive = false;
        S.hoverRoutePreview = null;
        S.hoverPreviewRequestSeq++;
        deps.updateRangedSidebar();
        deps.redraw();
        return;
      }
      deps.replacePendingAirStrikesForSelected(selectedIds, hit, S.airStrikeTargetType);
      S.airStrikeModeActive = false;
      deps.clearSelection();
      S.hoverRoutePreview = null;
      S.hoverPreviewRequestSeq++;
      deps.updateRangedSidebar();
      deps.hideStackCallout();
      deps.updateSidebar();
      deps.redraw();
      return;
    }

    if (hit && S.rangedModeActive && S.selectedUnitIds.length > 0 && S.gameState) {
      if (!window.gameApi?.validateGroupRangedTarget) return;
      const selectedIds = [...S.selectedUnitIds];
      const validation = await window.gameApi.validateGroupRangedTarget({ unitIds: selectedIds, targetH3Index: hit });
      if (!validation.success) {
        deps.showMapToast(deps.formatTargetingValidationReason(validation.reason, 'Selected units cannot fire at that target.'), {
          isError: true,
        });
        S.rangedModeActive = false;
        S.hoverRoutePreview = null;
        S.hoverPreviewRequestSeq++;
        deps.updateRangedSidebar();
        deps.redraw();
        return;
      }
      deps.replacePendingRangedAttacksForSelected(selectedIds, hit);
      S.rangedModeActive = false;
      deps.clearSelection();
      S.hoverRoutePreview = null;
      S.hoverPreviewRequestSeq++;
      deps.updateRangedSidebar();
      deps.hideStackCallout();
      deps.updateSidebar();
      deps.redraw();
      return;
    }

    const mapForClick = getMainLeafletMap() as { getContainer: () => HTMLElement } | null;
    const clickRect = mapForClick?.getContainer().getBoundingClientRect();
    const px = clickRect ? e.clientX - clickRect.left : 0;
    const py = clickRect ? e.clientY - clickRect.top : 0;
    const { unitsToDraw, movingIds } = S.gameState
      ? deps.getUnitsForDrawWithMovingIds(S.gameState)
      : { unitsToDraw: [] as GameStateSnapshot['units'], movingIds: undefined as Set<string> | undefined };

    if (await deps.tryHandleTacticalEntryAtClientXY(e.clientX, e.clientY)) {
      deps.updateSidebar();
      deps.updateRangedSidebar();
      deps.redraw();
      return;
    }

    if (deps.tryHandleBuildEntryAtClientXY(e.clientX, e.clientY)) {
      deps.updateSidebar();
      deps.updateRangedSidebar();
      deps.redraw();
      return;
    }

    const unitsAtHit = hit ? unitsToDraw.filter((u) => u.h3Index === hit && !movingIds?.has(u.id)) : [];
    const isStack = unitsAtHit.length >= 2;
    const isLoneAi = unitsAtHit.length === 1 && unitsAtHit[0]?.player !== 'human';
    const stackIconHit = !!hit && unitsAtHit.length > 0 && deps.containerPixelHitsDrawnUnitIcon(px, py, hit, unitsAtHit.length);
    if (hit && (isStack || isLoneAi) && stackIconHit) {
      S.ctrlKeyActive = e.ctrlKey;
      deps.showStackCallout(unitsAtHit, e.clientX, e.clientY);
      deps.updateSidebar();
      deps.updateRangedSidebar();
      deps.redraw();
      return;
    }

    deps.hideStackCallout();
    if (hit) {
      const unit = deps.getUnitAtHex(hit);
      const drawnAtHit = unitsToDraw.filter((u) => u.h3Index === hit && !movingIds?.has(u.id));
      const unitIconHit = drawnAtHit.length > 0 && deps.containerPixelHitsDrawnUnitIcon(px, py, hit, drawnAtHit.length);
      if (unit?.player === 'human' && unitIconHit) {
        applyHumanUnitIconClickSelectionPolicy({
          ctrlKey: e.ctrlKey,
          unitId: unit.id,
          deps: {
            replaceSelection: deps.replaceSelection,
            toggleUnitSelection: deps.toggleUnitSelection,
            refreshHoverRoutePreview: deps.refreshHoverRoutePreview,
            updateSidebar: deps.updateSidebar,
            updateRangedSidebar: deps.updateRangedSidebar,
            redraw: deps.redraw,
          },
        });
      } else if (unit?.player === 'human' && !unitIconHit) {
        clearDeferredHumanUnitSingleSelectTimer();
      } else if (deps.getPrimarySelectedUnitId() && S.gameState && hit !== primarySelectedUnitHex(S.gameState)) {
        clearDeferredHumanUnitSingleSelectTimer();
      } else {
        clearDeferredHumanUnitSingleSelectTimer();
        deps.clearSelection();
        S.hoverRoutePreview = null;
      }
    } else {
      clearDeferredHumanUnitSingleSelectTimer();
      deps.clearSelection();
      S.hoverRoutePreview = null;
    }

    deps.updateSidebar();
    deps.updateRangedSidebar();
    deps.redraw();
  });

  mainMapEl.addEventListener('dblclick', async (e) => {
    clearDeferredHumanUnitSingleSelectTimer();
    if (!S.gameState) {
      emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', { reason: 'missing_game_state' });
      return;
    }
    const state = S.gameState;
    if (S.rangedModeActive || S.airStrikeModeActive) {
      emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
        reason: 'targeting_mode_active',
        rangedModeActive: S.rangedModeActive,
        airStrikeModeActive: S.airStrikeModeActive,
      });
      return;
    }
    const hit = clientXYToHit(e.clientX, e.clientY);
    const destinationH3 = S.selectedHexIndex ?? S.hoveredHexH3 ?? hit;
    if (!destinationH3 || S.selectedUnitIdsAtMouseDown.length === 0) {
      emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
        reason: !destinationH3 ? 'missing_destination' : 'missing_selection_at_mouse_down',
        selectedAtMouseDownCount: S.selectedUnitIdsAtMouseDown.length,
      });
      return;
    }

    const selectedAtMouseDown = getSelectedHumanUnitsAtMouseDown(state);
    if (selectedAtMouseDown.length === 0) {
      emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
        reason: 'selection_not_human_units',
        selectedAtMouseDownCount: 0,
      });
      return;
    }
    const selectedIds = selectedAtMouseDown.map((unit) => unit.id);
    if (selectedAtMouseDown.every((unit) => unit.h3Index === destinationH3)) {
      emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
        reason: 'destination_equals_current_positions',
        selectedCount: selectedAtMouseDown.length,
      });
      return;
    }
    const hasAirSelection = selectedAtMouseDown.some((unit) => unit.unitType === 'air');
    const hasNonAirSelection = selectedAtMouseDown.some((unit) => unit.unitType !== 'air');
    if (hasAirSelection && hasNonAirSelection) {
      emitParityDiagnosticsBreadcrumb('planning.doubleClickRejected', {
        reason: 'mixed_air_non_air_selection',
        selectedCount: selectedAtMouseDown.length,
      });
      deps.showMapToast('Cannot issue grouped movement for mixed air and non-air units.', { isError: true });
      return;
    }

    emitParityDiagnosticsBreadcrumb('planning.doubleClickAccepted', {
      tacticalModeActive: !!S.tacticalBattleSnapshot,
      selectedCount: selectedAtMouseDown.length,
      destinationH3,
      hasAirSelection,
    });
    if (hasAirSelection) {
      if (await commitGroupedAirFerryOrders(selectedIds, destinationH3)) return;
      return;
    }

    await commitGroupedMarchOrders(selectedIds, destinationH3);
  });

  mainMapEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (S.selectedUnitIds.length === 0 && !S.hoverRoutePreview) return;
    deps.clearSelection();
    S.selectedUnitIdsAtMouseDown = [];
    S.selectedHexIndex = null;
    S.hoverRoutePreview = null;
    deps.updateSidebar();
    deps.updateRangedSidebar();
    deps.redraw();
  });
}
