/**
 * The Dismiss control on a selection-panel row, and the confirm that turns that mercenary Neutral.
 *
 * Purpose: The panel draws the button. This module owns the armed rows, the in-flight rows, and the click.
 * When to use: From `renderSelectionPanel` while building unit rows.
 * Expected outcome: Confirm calls `dismissMercenary`. Cancel only restores Dismiss. A refusal toasts and stays armed.
 * Exceptions: A thrown IPC call toasts `DISMISS_MERCENARY_FAILED` and does not rethrow.
 */

import { resolutionPlaybackBlocksMapOrders } from '../../shared/mapOrderGestureGate';
import {
  DISMISS_MERCENARY_CANCEL_LABEL,
  DISMISS_MERCENARY_CANCEL_TOOLTIP,
  DISMISS_MERCENARY_CONFIRM_LABEL,
  DISMISS_MERCENARY_CONFIRM_TOOLTIP,
  DISMISS_MERCENARY_FAILED,
  DISMISS_MERCENARY_LABEL,
  DISMISS_MERCENARY_TOOLTIP,
  mercenaryDismissShown,
} from '../../shared/mercenaryDismiss';
import { draftsWithoutUnits } from '../../shared/draftsWithoutUnits';
import type { SelectionPanelRow } from '../../shared/selectionPanelSummary';
import { removeUnitsFromSelection } from '../core/selection';
import { rendererSharedState as S } from '../core/state';

/**
 * Callbacks the dismiss buttons need from the panel's wiring.
 *
 * Purpose: This module does not import the renderer entry or the snapshot wrapper.
 * When to use: Pass the deps stored by `wireSelectionPanel`.
 * Expected outcome: A toast, a snapshot reload, a map redraw, and a panel redraw.
 * Exceptions: None. `reloadAfterDismiss` logs its own failure and resolves.
 */
export interface MercenaryDismissCellDeps {
  /**
   * Shows a short message on the map.
   *
   * Contract: `isError` styles the toast as a refusal.
   * When to use: A refused or thrown dismiss.
   * Expected outcome: The sentence stays up the way other map toasts do.
   * Exceptions: None.
   */
  readonly showMapToast: (message: string, options?: { readonly isError?: boolean }) => void;
  /**
   * Reloads the match after a dismiss that already succeeded.
   *
   * Contract: Resolves after the snapshot is applied, or after a logged failure.
   * When to use: Only after `success: true`.
   * Expected outcome: The treasury, the tokens, an open Hire tab, and an open stack list match the board.
   * Exceptions: None. A failed reload does not reject.
   */
  readonly reloadAfterDismiss: () => Promise<void>;
  /**
   * Paints the map after the selection and the selected hex have been updated.
   *
   * Contract: Reads the selection state that `removeUnitsFromSelection` just wrote.
   * When to use: After a successful dismiss removes the converted units.
   * Expected outcome: Unit rings and the selected hex match the selection. An empty selection leaves no hex highlighted.
   * Exceptions: None. A missing canvas returns without throwing.
   */
  readonly redrawMap: () => void;
  /**
   * Draws the selection panel again.
   *
   * Contract: Uses the deps stored at wiring. A no-op before that.
   * When to use: After arming, cancelling, or finishing a dismiss.
   * Expected outcome: Rows that are still armed show Cancel and Confirm.
   * Exceptions: None.
   */
  readonly redrawSelectionPanel: () => void;
}

/**
 * Unit ids whose row is showing Cancel and Confirm.
 *
 * Purpose: A redraw must not put those rows back on Dismiss.
 * When to use: Add on Dismiss. Remove on Cancel, or after a successful confirm finishes.
 * Expected outcome: Several ids may be armed at once.
 * Exceptions: None.
 */
const dismissArmedUnitIds = new Set<string>();

/**
 * Unit ids whose confirm has been sent and has not finished.
 *
 * Purpose: A second click, or a redraw, must not send another dismiss before the snapshot arrives.
 * When to use: Add when Confirm is clicked. Remove when the call refuses, throws, or the success path finishes.
 * Expected outcome: That row's Cancel and Confirm stay disabled until then.
 * Exceptions: None.
 */
const dismissInFlightUnitIds = new Set<string>();

/**
 * Forgets armed ids that this draw is not showing as the player's mercenaries.
 *
 * Purpose: A unit that left the selection, or stopped being a human mercenary, must not reopen on Cancel.
 * When to use: After the panel builds the rows it is about to show. Pass the ids that still pass `mercenaryDismissShown`.
 * Expected outcome: Armed ids outside that list are dropped. An in-flight id stays in flight.
 * Exceptions: None.
 */
export function forgetDismissArmedExcept(unitIds: readonly string[]): void {
  const keep = new Set(unitIds);
  for (const unitId of dismissArmedUnitIds) {
    if (!keep.has(unitId)) dismissArmedUnitIds.delete(unitId);
  }
}

/**
 * Returns whether this row may show a dismiss control.
 *
 * Purpose: The panel and the cell share one reading of planning, playback, and the row.
 * When to use: Before choosing the dismiss layout, and inside `createMercenaryDismissCell`.
 * Expected outcome: True only for a human mercenary during strategic planning while playback is not running.
 * Exceptions: None.
 */
export function selectionRowDismissShown(row: Pick<SelectionPanelRow, 'player' | 'isMercenary'>): boolean {
  return mercenaryDismissShown({
    strategicPlanning: S.tacticalBattleSnapshot == null && S.gameState?.phase === 'planning',
    playbackRunning: resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation),
    player: row.player,
    isMercenary: row.isMercenary,
  });
}

/**
 * Builds one dismiss button.
 *
 * Purpose: Dismiss, Cancel, and Confirm share the chip's class, the tip attribute, and the click guard.
 * When to use: From `createMercenaryDismissCell`.
 * Expected outcome: A button whose visible text is `label`. The click does not bubble.
 * Exceptions: None.
 */
function dismissButton(
  label: string,
  tooltip: string,
  unitName: string,
  disabled: boolean,
  onClick: () => void
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'selection-panel-order selection-panel-dismiss';
  button.textContent = label;
  button.setAttribute('aria-label', `${label} ${unitName}`);
  button.setAttribute('data-control-tooltip', tooltip);
  button.disabled = disabled;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

/**
 * Arms the row so the next draw shows Cancel and Confirm.
 *
 * Purpose: Dismiss itself does not call the main process.
 * When to use: The Dismiss button.
 * Expected outcome: The id is armed and the panel redraws.
 * Exceptions: None.
 */
function armMercenaryDismiss(unitId: string, deps: MercenaryDismissCellDeps): void {
  dismissArmedUnitIds.add(unitId);
  deps.redrawSelectionPanel();
}

/**
 * Leaves the row on Dismiss.
 *
 * Purpose: Cancel changes nothing about the unit.
 * When to use: The Cancel button, except while that id is in flight.
 * Expected outcome: The id is no longer armed and the panel redraws. An in-flight id is left alone.
 * Exceptions: None.
 */
function cancelMercenaryDismiss(unitId: string, deps: MercenaryDismissCellDeps): void {
  if (dismissInFlightUnitIds.has(unitId)) return;
  dismissArmedUnitIds.delete(unitId);
  deps.redrawSelectionPanel();
}

/**
 * Drops the converted units' unsent drafts and turns targeting off.
 *
 * Purpose: Those orders must not be submitted for units that are already Neutral.
 * When to use: After a successful dismiss, before the snapshot reload.
 * Expected outcome: The five pending arrays lose only the returned ids. Hover preview and the three targeting modes are off.
 * Exceptions: None.
 */
function clearDismissedUnitDrafts(unitIds: readonly string[]): void {
  S.pendingRangedAttacks = draftsWithoutUnits(S.pendingRangedAttacks, unitIds);
  S.pendingAirStrikes = draftsWithoutUnits(S.pendingAirStrikes, unitIds);
  S.pendingMissileLaunches = draftsWithoutUnits(S.pendingMissileLaunches, unitIds);
  S.pendingFerryOrders = draftsWithoutUnits(S.pendingFerryOrders, unitIds);
  S.pendingEmbarkOrders = draftsWithoutUnits(S.pendingEmbarkOrders, unitIds);
  S.hoverRoutePreview = null;
  S.rangedModeActive = false;
  S.airStrikeModeActive = false;
  S.missileLaunchModeActive = false;
}

/**
 * Sends the dismiss and applies a success or a refusal.
 *
 * Purpose: Confirm is the only click that changes the board.
 * When to use: The Confirm button. A second call while the id is in flight returns immediately.
 * Expected outcome: Success clears that unit's drafts, reloads the match, removes the converted units from the selection, and paints the map.
 *   A refusal or a throw toasts, clears only the in-flight flag, and leaves the row armed.
 * Exceptions: None. A thrown call is toasted as `DISMISS_MERCENARY_FAILED`.
 */
async function confirmMercenaryDismiss(unitId: string, deps: MercenaryDismissCellDeps): Promise<void> {
  if (dismissInFlightUnitIds.has(unitId)) return;
  dismissInFlightUnitIds.add(unitId);
  deps.redrawSelectionPanel();
  try {
    const dismiss = window.gameApi?.dismissMercenary;
    if (!dismiss) {
      throw new Error('dismissMercenary is unavailable');
    }
    const result = await dismiss({ unitId });
    if (!result.success) {
      dismissInFlightUnitIds.delete(unitId);
      deps.showMapToast(result.reason, { isError: true });
      deps.redrawSelectionPanel();
      return;
    }
    clearDismissedUnitDrafts(result.unitIds);
    await deps.reloadAfterDismiss();
    removeUnitsFromSelection([...result.unitIds]);
    dismissArmedUnitIds.delete(unitId);
    dismissInFlightUnitIds.delete(unitId);
    deps.redrawMap();
    deps.redrawSelectionPanel();
  } catch {
    dismissInFlightUnitIds.delete(unitId);
    deps.showMapToast(DISMISS_MERCENARY_FAILED, { isError: true });
    deps.redrawSelectionPanel();
  }
}

/**
 * Builds the dismiss cell for one row.
 *
 * Purpose: The panel inserts this cell only when the selection's layout has a dismiss column.
 * When to use: Once per row in that layout. Do not append the element here.
 * Expected outcome: An empty slot when the row does not show the control. Otherwise Dismiss, or Cancel and Confirm when
 *   the id is armed or in flight. In-flight buttons are disabled.
 * Exceptions: None.
 */
export function createMercenaryDismissCell(
  row: SelectionPanelRow,
  unitName: string,
  deps: MercenaryDismissCellDeps
): HTMLElement {
  const slot = document.createElement('span');
  slot.className = 'selection-panel-dismiss-slot';
  if (!selectionRowDismissShown(row)) return slot;
  const unitId = row.unitId;
  const inFlight = dismissInFlightUnitIds.has(unitId);
  if (dismissArmedUnitIds.has(unitId) || inFlight) {
    slot.append(
      dismissButton(DISMISS_MERCENARY_CANCEL_LABEL, DISMISS_MERCENARY_CANCEL_TOOLTIP, unitName, inFlight, () => {
        cancelMercenaryDismiss(unitId, deps);
      }),
      dismissButton(DISMISS_MERCENARY_CONFIRM_LABEL, DISMISS_MERCENARY_CONFIRM_TOOLTIP, unitName, inFlight, () => {
        void confirmMercenaryDismiss(unitId, deps);
      })
    );
    return slot;
  }
  slot.append(
    dismissButton(DISMISS_MERCENARY_LABEL, DISMISS_MERCENARY_TOOLTIP, unitName, false, () => {
      armMercenaryDismiss(unitId, deps);
    })
  );
  return slot;
}
