import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { applyInitialCameraForState } from '../map/mapHelpers';
import { tacticalReleaseRendererSessionForNewStrategicMatch } from '../tactical/tacticalUiOrchestration';
import { rendererSharedState as S } from './state';
import { installRendererGameMap } from './installRendererGameMap';
import { syncMapExtentToSnapshot } from '../map/mapExtent';

/**
 * Documents the `ApplySnapshotDeps` interface as a named contract surface (interface ApplySnapshotDeps).

 * Purpose: Supports maintainability by documenting why `ApplySnapshotDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface ApplySnapshotDeps {
    /**
   * Specifies the contract for the `rebuildUnitDisplayNameLookup` member (rebuildUnitDisplayNameLookup: (state: GameStateSnapshot | null) => void;).

   * Contract: Describes stable behavior for callers of `rebuildUnitDisplayNameLookup` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rebuildUnitDisplayNameLookup: (state: GameStateSnapshot | null) => void;
    /**
   * Specifies the contract for the `reconcileSelectionToCurrentState` member (reconcileSelectionToCurrentState: () => void;).

   * Contract: Describes stable behavior for callers of `reconcileSelectionToCurrentState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
reconcileSelectionToCurrentState: () => void;
    /**
   * Specifies the contract for the `updateClientStaleEnemyIntel` member (updateClientStaleEnemyIntel: (previousState: GameStateSnapshot | null, state: GameStateSnapshot) => void;).

   * Contract: Describes stable behavior for callers of `updateClientStaleEnemyIntel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateClientStaleEnemyIntel: (previousState: GameStateSnapshot | null, state: GameStateSnapshot) => void;
    /**
   * Specifies the contract for the `clearStrategicTooltipSummaryCaches` member (clearStrategicTooltipSummaryCaches: () => void;).

   * Contract: Describes stable behavior for callers of `clearStrategicTooltipSummaryCaches` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearStrategicTooltipSummaryCaches: () => void;
    /**
   * Specifies the contract for the `refreshHumanStandingOrders` member (refreshHumanStandingOrders: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `refreshHumanStandingOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshHumanStandingOrders: () => Promise<void>;
    /**
   * Specifies the contract for the `updateGameStateSidebar` member (updateGameStateSidebar: (state: GameStateSnapshot | null) => void;).

   * Contract: Describes stable behavior for callers of `updateGameStateSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateGameStateSidebar: (state: GameStateSnapshot | null) => void;
    /**
   * Specifies the contract for the `updateRangedSidebar` member (updateRangedSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updateRangedSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateRangedSidebar: () => void;
    /**
   * Specifies the contract for the `updateSidebar` member (updateSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updateSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateSidebar: () => void;
    /**
   * Specifies the contract for the `updatePendingOrdersSidebar` member (updatePendingOrdersSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updatePendingOrdersSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updatePendingOrdersSidebar: () => void;
    /**
   * Specifies the contract for the `updateGameOverUI` member (updateGameOverUI: (state: GameStateSnapshot) => void;).

   * Contract: Describes stable behavior for callers of `updateGameOverUI` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateGameOverUI: (state: GameStateSnapshot) => void;
    /**
   * Specifies the contract for the `updateReadyButtonState` member (updateReadyButtonState: () => void;).

   * Contract: Describes stable behavior for callers of `updateReadyButtonState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateReadyButtonState: () => void;
    /**
   * Specifies the contract for the `redraw` member (redraw: () => void;).

   * Contract: Describes stable behavior for callers of `redraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
redraw: () => void;
    /**
   * Specifies the contract for the `refreshBuildPopupIfOpen` member (refreshBuildPopupIfOpen: () => void;).

   * Contract: Describes stable behavior for callers of `refreshBuildPopupIfOpen` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshBuildPopupIfOpen: () => void;
    /**
   * Specifies the contract for the `reconcileTacticalBattleAfterStrategicSnapshot` member (reconcileTacticalBattleAfterStrategicSnapshot: (nextState: GameStateSnapshot) => void;).

   * Contract: Drops renderer tactical overlay state when the main strategic snapshot no longer matches the active tactical session anchor turn/phase.
   * When to use: Immediately after every `S.gameState` replacement from the main process.
   * Expected outcome: Prevents stale tactical mode after new game, ready-advanced turns, or phase changes.
   * Exceptions: None.
   */
  reconcileTacticalBattleAfterStrategicSnapshot: (nextState: GameStateSnapshot) => void;
    /**
   * Specifies the contract for the `applyRestoredTacticalBattleFromMain` member (applyRestoredTacticalBattleFromMain?: (battle: TacticalBattleSnapshot) => void;).

   * Contract: Enters tactical mode when the main process attached `tacticalBattleSession` to `getGameState` (restart restore).
   * When to use: Optional; omitted in tests that do not model tactical UI.
   * Expected outcome: Renderer tactical snapshot and map chrome match the restored main-process session.
   * Exceptions: None; implementation should be defensive and avoid duplicate activation for the same `battleId`.
   */
applyRestoredTacticalBattleFromMain?: (battle: TacticalBattleSnapshot) => void;
}

/**
 * Documents the `RefreshBuildQueueDeps` interface as a named contract surface (interface RefreshBuildQueueDeps).

 * Purpose: Supports maintainability by documenting why `RefreshBuildQueueDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface RefreshBuildQueueDeps {
    /**
   * Specifies the contract for the `applyGameStateSnapshot` member (applyGameStateSnapshot: ( nextState: GameStateSnapshot, options?: { refreshStandingOrders?: boolean; updateGameStateSidebarUi?: boolean;).

   * Contract: Describes stable behavior for callers of `applyGameStateSnapshot` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
applyGameStateSnapshot: (
    nextState: GameStateSnapshot,
    options?: {
      refreshStandingOrders?: boolean;
      updateGameStateSidebarUi?: boolean;
      updateSelectionUi?: boolean;
      updateGameOverUi?: boolean;
      updateReadyButton?: boolean;
      refreshBuildPopup?: boolean;
      redraw?: boolean;
    }
  ) => Promise<void>;
}

/**
 * Reloads the strategic snapshot from main and applies it, logging a caller-supplied message on failure.
 *
 * Purpose: Build-queue and sealift refreshes share the getGameState guard and the same catch path.
 * When to use: After a main-process mutation that the open map must redraw from a fresh snapshot.
 * Expected outcome: `applyGameStateSnapshot` runs with `applyOptions`, or the function returns when `getGameState` is missing.
 * Exceptions: Failures are logged with `console.error(failureMessage, err)` and not rethrown.
 */
export async function refreshGameStateFromMain(
  deps: Pick<RefreshBuildQueueDeps, 'applyGameStateSnapshot'>,
  applyOptions: {
    refreshStandingOrders?: boolean;
    updateGameStateSidebarUi?: boolean;
    updateSelectionUi?: boolean;
    updateGameOverUi?: boolean;
    updateReadyButton?: boolean;
    refreshBuildPopup?: boolean;
    redraw?: boolean;
  },
  failureMessage: string
): Promise<void> {
  if (!window.gameApi?.getGameState) return;
  try {
    const nextState = (await window.gameApi.getGameState()) as GameStateSnapshot;
    await deps.applyGameStateSnapshot(nextState, applyOptions);
  } catch (err) {
    console.error(failureMessage, err);
  }
}

/**
 * Reloads strategic state after a build-queue edit and redraws without touching selection or standing orders.
 *
 * Purpose: The build popup and map production marks must match the queue main just stored.
 * When to use: After a successful build-queue IPC mutation.
 * Expected outcome: The map redraws from the fresh snapshot; sidebar selection and standing orders stay as they were.
 * Exceptions: Logs `refreshGameStateAfterBuildQueueChange failed:` and does not rethrow.
 */
export async function refreshGameStateAfterBuildQueueChange(deps: RefreshBuildQueueDeps): Promise<void> {
  await refreshGameStateFromMain(
    deps,
    {
      refreshStandingOrders: false,
      updateGameStateSidebarUi: false,
      updateSelectionUi: false,
      updateGameOverUi: false,
      updateReadyButton: false,
      refreshBuildPopup: false,
      redraw: true,
    },
    'refreshGameStateAfterBuildQueueChange failed:'
  );
}

/**
 * Reloads strategic game state after a successful sealift embark/debark so embark flags stay current.
 *
 * Purpose: Selection and march preview read `embarkedOnNavalUnitId` from `S.gameState`; without a refresh,
 * manually debarked land units remain blocked for same-turn select/move even though SQLite cleared the assignment.
 * When to use: After successful strategic `updateSealiftSlot` (embark or debark) in the stack callout.
 * Expected outcome: Client unit rows match main-process embark state; optional standing-order refresh after embark cancels.
 * Exceptions: Swallows getGameState/apply failures after logging (sealift IPC already succeeded).
 */
export async function refreshGameStateAfterSealiftChange(
  deps: RefreshBuildQueueDeps,
  options: { refreshStandingOrders?: boolean } = {}
): Promise<void> {
  await refreshGameStateFromMain(
    deps,
    {
      refreshStandingOrders: options.refreshStandingOrders === true,
      updateGameStateSidebarUi: true,
      updateSelectionUi: true,
      updateGameOverUi: false,
      updateReadyButton: false,
      refreshBuildPopup: false,
      redraw: true,
    },
    'refreshGameStateAfterSealiftChange failed:'
  );
}

/**
 * Defines the `applyGameStateSnapshot` function shape (export async function applyGameStateSnapshot( deps: ApplySnapshotDeps, nextState: GameStateSnapshot, options: { refreshStandingOrders?: boolean;).

 * Purpose: Supports maintainability by documenting why `applyGameStateSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function applyGameStateSnapshot(
  deps: ApplySnapshotDeps,
  nextState: GameStateSnapshot,
  options: {
    refreshStandingOrders?: boolean;
    updateGameStateSidebarUi?: boolean;
    updateSelectionUi?: boolean;
    updateGameOverUi?: boolean;
    updateReadyButton?: boolean;
    refreshBuildPopup?: boolean;
    redraw?: boolean;
  } = {}
): Promise<void> {
  installRendererGameMap(nextState);
  syncMapExtentToSnapshot(nextState);
  const previousState = S.gameState;
  S.gameState = nextState;
  deps.reconcileTacticalBattleAfterStrategicSnapshot(nextState);
  if (
    !nextState.tacticalBattleSession &&
    (S.tacticalBattleSnapshot != null ||
      S.preTacticalLeafletMinZoom != null ||
      S.preTacticalLeafletMaxZoom != null)
  ) {
    tacticalReleaseRendererSessionForNewStrategicMatch(nextState);
  }
  const restored = nextState.tacticalBattleSession;
  if (restored && deps.applyRestoredTacticalBattleFromMain) {
    const cur = S.tacticalBattleSnapshot;
    // Re-run tactical activation when the snapshot matches but `enterTacticalMapView` never finalized (e.g. map not
    // ready on first paint, or a second `getGameState` arrived before `finalizeTacticalViewZoomAndPan` captured zoom).
    const materiallyDifferent =
      !cur ||
      cur.battleId !== restored.battleId ||
      cur.tacticalTurnNumber !== restored.tacticalTurnNumber ||
      (!!cur &&
        cur.battleId === restored.battleId &&
        cur.tacticalTurnNumber === restored.tacticalTurnNumber &&
        S.preTacticalLeafletMinZoom == null);
    if (materiallyDifferent) {
      deps.applyRestoredTacticalBattleFromMain(restored);
    }
  }
  deps.rebuildUnitDisplayNameLookup(nextState);
  deps.reconcileSelectionToCurrentState();
  deps.updateClientStaleEnemyIntel(previousState, nextState);
  if (!S.initialCameraApplied && nextState.hexes.length > 0) {
    if (nextState.tacticalBattleSession) {
      // Skip strategic initial camera so restored tactical `enterTacticalMapView` framing is not overwritten.
      S.initialCameraApplied = true;
    } else {
      applyInitialCameraForState(nextState);
    }
  }
  deps.clearStrategicTooltipSummaryCaches();
  if (options.refreshStandingOrders) await deps.refreshHumanStandingOrders();
  if (options.updateGameStateSidebarUi) deps.updateGameStateSidebar(nextState);
  if (options.updateSelectionUi) {
    deps.updateRangedSidebar();
    deps.updateSidebar();
    deps.updatePendingOrdersSidebar();
  }
  if (options.updateGameOverUi) deps.updateGameOverUI(nextState);
  if (options.updateReadyButton) deps.updateReadyButtonState();
  if (options.redraw) deps.redraw();
  if (options.refreshBuildPopup) deps.refreshBuildPopupIfOpen();
}

/**
 * Defines the `updateClientStaleEnemyIntel` function shape (export function updateClientStaleEnemyIntel(previousState: GameStateSnapshot | null, state: GameStateSnapshot): void).

 * Purpose: Supports maintainability by documenting why `updateClientStaleEnemyIntel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateClientStaleEnemyIntel(previousState: GameStateSnapshot | null, state: GameStateSnapshot): void {
  const currentTurn = state.turnNumber;
  const hasFogData = Array.isArray(state.visibleHexes);
  const visibleHexes = hasFogData ? new Set(state.visibleHexes!) : new Set<string>();
  const visibleEnemiesNow = state.units.filter((u) => u.player !== 'human');
  const visibleEnemyIdsNow = new Set(visibleEnemiesNow.map((u) => u.id));
  const visibleEnemyHexesNow = new Set(visibleEnemiesNow.map((u) => u.h3Index));

  for (const enemy of visibleEnemiesNow) {
    S.lastObservedEnemyByUnitId.set(enemy.id, { h3Index: enemy.h3Index, lastSeenTurn: currentTurn });
    S.clientStaleEnemyIntelByUnitId.delete(enemy.id);
  }

  if (previousState) {
    const previousVisibleEnemies = previousState.units.filter((u) => u.player !== 'human');
    for (const enemy of previousVisibleEnemies) {
      if (visibleEnemyIdsNow.has(enemy.id)) continue;
      S.lastObservedEnemyByUnitId.set(enemy.id, {
        h3Index: enemy.h3Index,
        lastSeenTurn: previousState.turnNumber,
      });
      if (!hasFogData || !visibleHexes.has(enemy.h3Index)) {
        S.clientStaleEnemyIntelByUnitId.set(enemy.id, {
          unitId: enemy.id,
          lastKnownH3Index: enemy.h3Index,
          lastSeenTurn: previousState.turnNumber,
          staleUntilTurn: previousState.turnNumber + 2,
        });
      }
    }
  }

  for (const [unitId, stale] of S.clientStaleEnemyIntelByUnitId) {
    const isNowVisible = visibleEnemyIdsNow.has(unitId);
    const contradictedOnVisibleHex = hasFogData && visibleHexes.has(stale.lastKnownH3Index) && !visibleEnemyHexesNow.has(stale.lastKnownH3Index);
    const expired = currentTurn > stale.staleUntilTurn;
    if (isNowVisible || contradictedOnVisibleHex || expired) {
      S.clientStaleEnemyIntelByUnitId.delete(unitId);
      S.lastRenderedVisibleEnemyByUnitId.delete(unitId);
    }
  }
}
