/**
 * Queues a missile launch from a map double-click.
 *
 * Purpose: Keeps the launch commit out of the map handler so that file does not grow, and so the handler
 *   does not import the order lists itself.
 * When to use: From `handleMainMapDoubleClick` while missile aiming is on and the pointer is over a hex.
 * Expected outcome: A legal target is queued and aiming ends. An illegal target shows a toast and leaves aiming on.
 * Exceptions: A missing validation API is reported as an ignored double-click.
 */

import { MISSILE_LAUNCH_REJECTED_DEFAULT_MESSAGE } from '../../shared/missileRules';
import { selectionUnitIdSetsDiffer } from '../../shared/selectionUnitIdSets';
import { rendererSharedState as S } from '../core/state';
import { emitParityDiagnosticsBreadcrumb } from '../core/parityDiagnostics';
import { getValidateGroupMissileLaunchTarget } from '../gameplay/gameApiHumanOrderPreview';
import { replacePendingMissileLaunchesForSelected } from '../gameplay/tacticalOrders';

/**
 * The map handler pieces a launch commit needs.
 *
 * Purpose: Avoids importing the double-click handler's full dependency type from the module that calls this one.
 * When to use: The `deps` argument of `planMissileLaunchFromDoubleClick`.
 * Expected outcome: The same methods the air-strike branch uses after validation.
 * Exceptions: None.
 */
type MissileLaunchDoubleClickDeps = {
  showMapToast: (message: string, options?: { isError?: boolean }) => void;
  formatTargetingValidationReason: (reason: string | undefined, fallbackMessage: string) => string;
  clearSelection: () => void;
  hideStackCallout: () => void;
  updateSidebar: () => void;
  updateRangedSidebar: () => void;
  redraw: () => void;
};

/**
 * Arguments for one launch double-click.
 *
 * Purpose: The handler already resolved the hex and the selection the gesture started with.
 * When to use: Only from `handleMainMapDoubleClick`.
 * Expected outcome: The launch is planned for `idsAtStart`, not for whatever is selected after the await.
 * Exceptions: None.
 */
export type MissileLaunchDoubleClickArgs = {
  readonly deps: MissileLaunchDoubleClickDeps;
  readonly clickHit: string;
  readonly idsAtStart: readonly string[];
  readonly acceptedDetails: { readonly tacticalModeActive: boolean; readonly selectedCount: number; readonly destinationH3: string };
};

/**
 * Validates the hovered hex and queues one launch per selected missile.
 *
 * Purpose: Mirrors the air-strike double-click, including the check that aiming and the selection did not change while waiting.
 * When to use: When `S.missileLaunchModeActive` is true.
 * Expected outcome: Success replaces those missiles' pending launches, turns aiming off, and clears the selection.
 *   Failure toasts the validator's reason. A changed selection or a cleared aim does nothing.
 * Exceptions: None. A missing API returns after a breadcrumb.
 */
export async function planMissileLaunchFromDoubleClick(args: MissileLaunchDoubleClickArgs): Promise<void> {
  const validate = getValidateGroupMissileLaunchTarget();
  if (!validate) {
    emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', { reason: 'support_target_api_missing' });
    return;
  }
  const validation = await validate({ unitIds: [...args.idsAtStart], targetH3Index: args.clickHit });
  if (!S.missileLaunchModeActive || selectionUnitIdSetsDiffer(args.idsAtStart, S.selectedUnitIds)) {
    emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
      reason: 'targeting_changed_during_validation',
      selectedCount: args.idsAtStart.length,
    });
    return;
  }
  if (!validation.success) {
    emitParityDiagnosticsBreadcrumb('planning.doubleClickRejected', {
      reason: 'missile_launch_target_rejected',
      selectedCount: args.idsAtStart.length,
      destinationH3: args.clickHit,
    });
    args.deps.showMapToast(
      args.deps.formatTargetingValidationReason(validation.reason, MISSILE_LAUNCH_REJECTED_DEFAULT_MESSAGE),
      { isError: true }
    );
    args.deps.updateRangedSidebar();
    args.deps.redraw();
    return;
  }
  emitParityDiagnosticsBreadcrumb('planning.doubleClickAccepted', {
    ...args.acceptedDetails,
    destinationH3: args.clickHit,
    hasMissileSelection: true,
  });
  replacePendingMissileLaunchesForSelected([...args.idsAtStart], args.clickHit);
  S.missileLaunchModeActive = false;
  args.deps.clearSelection();
  S.hoverRoutePreview = null;
  S.hoverPreviewRequestSeq++;
  args.deps.updateRangedSidebar();
  args.deps.hideStackCallout();
  args.deps.updateSidebar();
  args.deps.redraw();
}
