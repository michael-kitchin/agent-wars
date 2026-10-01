/**
 * Main-map double-click planning for strategic and tactical games.
 *
 * Purpose: Turns one double-click into exactly one outcome — a ranged attack, an air strike, a ferry, a march,
 * a rejection toast, a full deselect, or nothing — using the shared decision table so the two map modes cannot drift apart.
 * When to use: From the `dblclick` listener wired by `wireMainMapInteractions`.
 * Expected outcome: Orders are planned for the selection captured when the gesture started, never for
 * whichever icon happens to sit under the second click.
 * Exceptions: None; ferry validation failures surface as toasts.
 */

import type { AirStrikeTargetType, GameStateSnapshot } from '../../shared/ipcTypes';
import { resolutionPlaybackBlocksMapOrders } from '../../shared/mapOrderGestureGate';
import { selectionUnitIdSetsDiffer } from '../../shared/selectionUnitIdSets';
import {
  mapSelectionComposition,
  resolveMapDoubleClickAction,
  type MapDoubleClickDecisionInput,
} from '../../shared/mapPlanningGesture';
import { clearMapSelectionChrome } from '../core/selection';
import { emitParityDiagnosticsBreadcrumb } from '../core/parityDiagnostics';
import { rendererSharedState as S } from '../core/state';
import { tacticalRendererHitInsideBattleFootprint } from '../tactical/tacticalUiGuards';
import {
  clearDeferredHumanUnitSingleSelectTimer,
  clearDeferredStackCalloutTimer,
} from './mapClickSelectionPolicy';

/**
 * Minimal unit row the double-click path needs from a strategic unit or a tactical sub-unit.
 *
 * Contract: Matches the fields read while grouping a march or ferry (`id`, `h3Index`, `player`, `unitType`).
 * When to use: Returned by the caller's `getSelectedHumanUnitsAtMouseDown`.
 * Expected outcome: Human-owned ids suitable for the march and ferry IPC in both modes.
 * Exceptions: None.
 */
export type DoubleClickSelectedUnit = Pick<
  GameStateSnapshot['units'][number],
  'id' | 'h3Index' | 'player' | 'unitType'
>;

/**
 * Side effects and lookups the double-click handler needs from the map interaction wiring.
 *
 * Contract: Every member behaves exactly as the identically named `wireMainMapInteractions` dependency.
 * When to use: Built once per `dblclick` dispatch so this module never imports the renderer composition root.
 * Expected outcome: `commitGroupedMarchOrders` owns its own toast, sidebar refresh, and redraw.
 * Exceptions: None.
 */
export type MainMapDoubleClickDeps = {
  clientXYToHit: (clientX: number, clientY: number) => string | null;
  pointerHitsDrawnUnitIcon: (clientX: number, clientY: number, h3Index: string) => boolean;
  getSelectedHumanUnitsAtMouseDown: (state: GameStateSnapshot) => DoubleClickSelectedUnit[];
  commitGroupedMarchOrders: (selectedIds: string[], destinationH3: string) => Promise<boolean>;
  showMapToast: (message: string, options?: { isError?: boolean }) => void;
  formatTargetingValidationReason: (reason: string | undefined, fallbackMessage: string) => string;
  replacePendingFerryOrdersForSelected: (selectedIds: string[], destinationH3Index: string) => void;
  /**
   * Queues one air strike per snapshot unit, replacing any previous strike for those ids.
   *
   * Purpose: The double-click commit path records the strike the click path used to record.
   * When to use: After `validateGroupAirStrikeTarget` succeeds.
   * Expected outcome: `pendingAirStrikes` holds the new rows for `selectedIds` and keeps other units' rows.
   * Exceptions: None.
   */
  replacePendingAirStrikesForSelected: (
    selectedIds: string[],
    targetH3Index: string,
    targetType: AirStrikeTargetType
  ) => void;
  /**
   * Queues one ranged attack per snapshot unit, replacing any previous attack for those ids.
   *
   * Purpose: The double-click commit path records the attack the click path used to record.
   * When to use: After `validateGroupRangedTarget` succeeds.
   * Expected outcome: `pendingRangedAttacks` holds the new rows for `selectedIds` and keeps other units' rows.
   * Exceptions: None.
   */
  replacePendingRangedAttacksForSelected: (selectedIds: string[], targetH3Index: string) => void;
  /**
   * Clears the live selection, both targeting flags, the selected hex, and the hover preview.
   *
   * Purpose: A successful attack ends targeting the same way the old click path did. `clearCommittedOrderDraftState` also changes committed-line visibility, so this path must not call it.
   * When to use: Only after a ranged attack or air strike has been queued.
   * Expected outcome: Selection chrome for the draft is clear. Queued orders stay queued.
   * Exceptions: None.
   */
  clearSelection: () => void;
  /**
   * Hides an open stack callout.
   *
   * Purpose: A successful attack used to close the callout from the click path.
   * When to use: After a ranged attack or air strike has been queued.
   * Expected outcome: The callout is hidden.
   * Exceptions: None.
   */
  hideStackCallout: () => void;
  clearCommittedOrderDraftState: () => void;
  updatePendingOrdersSidebar: () => void;
  updateSidebar: () => void;
  updateRangedSidebar: () => void;
  redraw: () => void;
};

/**
 * Explains an `ignore` outcome for the parity breadcrumb without duplicating the decision rules.
 *
 * Purpose: Keeps the long-standing reason strings stable for anyone triaging planning parity from the console.
 * When to use: Only when `resolveMapDoubleClickAction` returned `ignore`.
 * Expected outcome: The most specific reason that applies, falling back to the own-hex case.
 * Exceptions: None.
 */
function ignoreReasonFor(input: MapDoubleClickDecisionInput): string {
  if (input.targetingModeActive) return 'targeting_mode_active';
  if (!input.hasDestination) return 'missing_destination';
  if (input.composition === 'empty') return 'missing_selection_at_mouse_down';
  return 'destination_equals_current_positions';
}

/**
 * Applies the shared double-click decision table to one map double-click.
 *
 * Purpose: Single entry point for support-target commits, move and ferry planning, mixed-selection rejection,
 * and the air deselect gesture, so strategic and tactical behavior stays identical.
 * When to use: From the map `dblclick` listener; call it without awaiting and let it settle on its own.
 * Expected outcome: While resolution playback is running, returns before planning or clearing. A targeting
 * double-click either queues that attack or shows its validation toast, and does not plan a move. Otherwise
 * at most one order is queued or one toast is shown per call. An empty click that cannot plan an air ferry
 * clears the selection without discarding anything already queued for Ready.
 * Exceptions: None; a missing ferry API is reported as an ignored double-click.
 */
export async function handleMainMapDoubleClick(
  event: MouseEvent,
  deps: MainMapDoubleClickDeps
): Promise<void> {
  if (resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation)) return;
  clearDeferredHumanUnitSingleSelectTimer();
  S.gestureSelectionSnapshotAtMs = 0;

  const state = S.gameState;
  if (!state) {
    emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', { reason: 'missing_game_state' });
    return;
  }

  // Prefer the hex under this click. `replaceSelection` rewrites `selectedHexIndex` to the primary
  // selected unit's own hex, so trusting it first would retarget a double-click onto a unit icon.
  const clickHit = deps.clientXYToHit(event.clientX, event.clientY);
  const destinationH3 = clickHit ?? S.hoveredHexH3 ?? S.selectedHexIndex;
  const selectedAtMouseDown = deps.getSelectedHumanUnitsAtMouseDown(state);
  const selectedIds = selectedAtMouseDown.map((unit) => unit.id);
  const iconHit =
    destinationH3 !== null &&
    destinationH3 === clickHit &&
    deps.pointerHitsDrawnUnitIcon(event.clientX, event.clientY, destinationH3);

  const decisionInput: MapDoubleClickDecisionInput = {
    targetingModeActive: S.rangedModeActive || S.airStrikeModeActive,
    pointerHasHit: clickHit !== null,
    hasDestination: destinationH3 !== null,
    composition: mapSelectionComposition(selectedAtMouseDown.map((unit) => unit.unitType)),
    allSelectedUnitsAlreadyAtDestination:
      selectedAtMouseDown.length > 0 &&
      selectedAtMouseDown.every((unit) => unit.h3Index === destinationH3),
    iconHit,
    ferryEligible: null,
  };

  let action = resolveMapDoubleClickAction(decisionInput);
  let ferryRejectionReason: string | undefined;

  if (action.kind === 'ignore') {
    emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
      reason: ignoreReasonFor(decisionInput),
      selectedCount: selectedAtMouseDown.length,
    });
    return;
  }
  // Every remaining outcome supersedes the popup the first click scheduled. Returning above instead
  // leaves it scheduled, so double-clicking a stack with nothing to plan still shows the same popup a
  // single click would.
  clearDeferredStackCalloutTimer();
  // `ignore` is the only outcome the decision table returns without a destination, so this narrowing
  // never actually fires; it keeps that guarantee visible to the type checker instead of casting below.
  if (destinationH3 === null) return;

  if (action.kind === 'needFerryValidation') {
    if (!window.gameApi?.validateGroupFerryTarget) {
      emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', { reason: 'ferry_api_missing' });
      return;
    }
    const validation = await window.gameApi.validateGroupFerryTarget({
      unitIds: selectedIds,
      destinationH3Index: destinationH3,
    });
    ferryRejectionReason = validation.reason;
    // Re-resolving with a settled `ferryEligible` cannot reach `ignore`: nothing else in the input changed.
    action = resolveMapDoubleClickAction({ ...decisionInput, ferryEligible: validation.success });
  }

  const acceptedDetails = {
    tacticalModeActive: !!S.tacticalBattleSnapshot,
    selectedCount: selectedAtMouseDown.length,
    destinationH3,
  };

  switch (action.kind) {
    case 'rejectMixed':
      emitParityDiagnosticsBreadcrumb('planning.doubleClickRejected', {
        reason: 'mixed_air_non_air_selection',
        selectedCount: selectedAtMouseDown.length,
      });
      deps.showMapToast('Cannot issue grouped movement for mixed air and non-air units.', { isError: true });
      return;

    case 'rejectFerry':
      emitParityDiagnosticsBreadcrumb('planning.doubleClickRejected', {
        reason: 'ferry_destination_rejected',
        selectedCount: selectedAtMouseDown.length,
        destinationH3,
      });
      deps.showMapToast(
        deps.formatTargetingValidationReason(
          ferryRejectionReason,
          'Selected air units cannot ferry to that destination.'
        ),
        { isError: true }
      );
      return;

    case 'deselect':
      emitParityDiagnosticsBreadcrumb('planning.doubleClickDeselect', {
        selectedCount: selectedAtMouseDown.length,
        destinationH3,
      });
      clearMapSelectionChrome();
      deps.updateSidebar();
      deps.updateRangedSidebar();
      deps.redraw();
      return;

    case 'planSupportTarget': {
      // The decision table only returns this kind when the pointer is over a hex. This narrows the type.
      if (clickHit === null) return;
      if (
        S.tacticalBattleSnapshot &&
        !tacticalRendererHitInsideBattleFootprint(clickHit, S.tacticalBattleSnapshot)
      ) {
        emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
          reason: 'outside_tactical_footprint',
          selectedCount: selectedAtMouseDown.length,
        });
        return;
      }
      S.selectedHexIndex = clickHit;
      const idsAtStart = [...selectedIds];
      if (S.airStrikeModeActive) {
        if (!window.gameApi?.validateGroupAirStrikeTarget) {
          emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', { reason: 'support_target_api_missing' });
          return;
        }
        const targetTypeAtStart = S.airStrikeTargetType;
        const validation = await window.gameApi.validateGroupAirStrikeTarget({
          unitIds: idsAtStart,
          targetH3Index: clickHit,
          targetType: targetTypeAtStart,
        });
        if (!S.airStrikeModeActive || selectionUnitIdSetsDiffer(idsAtStart, S.selectedUnitIds)) {
          emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
            reason: 'targeting_changed_during_validation',
            selectedCount: idsAtStart.length,
          });
          return;
        }
        if (!validation.success) {
          emitParityDiagnosticsBreadcrumb('planning.doubleClickRejected', {
            reason: 'air_strike_target_rejected',
            selectedCount: idsAtStart.length,
            destinationH3: clickHit,
          });
          deps.showMapToast(
            deps.formatTargetingValidationReason(validation.reason, 'Selected air units cannot strike that target.'),
            { isError: true }
          );
          deps.updateRangedSidebar();
          deps.redraw();
          return;
        }
        emitParityDiagnosticsBreadcrumb('planning.doubleClickAccepted', {
          ...acceptedDetails,
          destinationH3: clickHit,
          hasAirSelection: true,
        });
        deps.replacePendingAirStrikesForSelected(idsAtStart, clickHit, targetTypeAtStart);
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
      if (!S.rangedModeActive) {
        emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
          reason: 'targeting_changed_during_validation',
          selectedCount: idsAtStart.length,
        });
        return;
      }
      if (!window.gameApi?.validateGroupRangedTarget) {
        emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', { reason: 'support_target_api_missing' });
        return;
      }
      const validation = await window.gameApi.validateGroupRangedTarget({
        unitIds: idsAtStart,
        targetH3Index: clickHit,
      });
      if (!S.rangedModeActive || selectionUnitIdSetsDiffer(idsAtStart, S.selectedUnitIds)) {
        emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
          reason: 'targeting_changed_during_validation',
          selectedCount: idsAtStart.length,
        });
        return;
      }
      if (!validation.success) {
        emitParityDiagnosticsBreadcrumb('planning.doubleClickRejected', {
          reason: 'ranged_target_rejected',
          selectedCount: idsAtStart.length,
          destinationH3: clickHit,
        });
        deps.showMapToast(
          deps.formatTargetingValidationReason(validation.reason, 'Selected units cannot fire at that target.'),
          { isError: true }
        );
        deps.updateRangedSidebar();
        deps.redraw();
        return;
      }
      emitParityDiagnosticsBreadcrumb('planning.doubleClickAccepted', {
        ...acceptedDetails,
        destinationH3: clickHit,
        hasAirSelection: false,
      });
      deps.replacePendingRangedAttacksForSelected(idsAtStart, clickHit);
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

    case 'planFerry':
      emitParityDiagnosticsBreadcrumb('planning.doubleClickAccepted', {
        ...acceptedDetails,
        hasAirSelection: true,
      });
      deps.replacePendingFerryOrdersForSelected(selectedIds, destinationH3);
      deps.clearCommittedOrderDraftState();
      deps.updatePendingOrdersSidebar();
      deps.updateSidebar();
      deps.updateRangedSidebar();
      deps.redraw();
      return;

    case 'planMarch':
      emitParityDiagnosticsBreadcrumb('planning.doubleClickAccepted', {
        ...acceptedDetails,
        hasAirSelection: false,
      });
      await deps.commitGroupedMarchOrders(selectedIds, destinationH3);
      return;

    default:
      return;
  }
}
