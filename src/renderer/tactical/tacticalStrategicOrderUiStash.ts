/**
 * Saves strategic planning drafts (standing movement, ranged, air, ferry) while a tactical battle owns the sidebar contract.
 */

import type {
  AirStrikeOrder,
  FerryOrder,
  HumanStandingOrderSnapshot,
  RangedAttackOrder,
} from '../../shared/ipcTypes';
import { filterOrdersToLivingUnitIds } from '../../shared/filterOrdersToLivingUnitIds';
import { rendererSharedState as S } from '../core/state';

/**
 * Captures renderer-only strategic order lists before tactical mode replaces them with tactical-specific UI.
 *
 * Contract: Idempotent while a stash row exists; clears ranged/air targeting modes that do not apply on the res4 map.
 * When to use: Tactical battle activation (IPC start and main snapshot restore) before mutating `S.tacticalBattleSnapshot`.
 * Expected outcome: `S.humanStandingOrders` and pending attack/ferry arrays become empty until restore or a full new-game reset.
 * Exceptions: None.
 */
let strategicOrderDraftStash: {
  humanStandingOrders: HumanStandingOrderSnapshot[];
  pendingRangedAttacks: RangedAttackOrder[];
  pendingAirStrikes: AirStrikeOrder[];
  pendingFerryOrders: FerryOrder[];
} | null = null;

/**
 * Copies current strategic draft order lists into module memory and clears renderer copies for tactical-only display.
 *
 * Contract: No-op when a stash is already held so nested activation cannot clobber the original snapshot.
 * When to use: First tactical session entry from magnifier or persisted tactical restore while strategic planning UI was visible.
 * Expected outcome: Strategic drafts are preserved for `restoreStrategicOrderDraftsAfterTacticalSession`.
 * Exceptions: None.
 */
export function stashStrategicOrderDraftsForTacticalSession(): void {
  if (strategicOrderDraftStash) return;
  strategicOrderDraftStash = {
    humanStandingOrders: [...S.humanStandingOrders],
    pendingRangedAttacks: [...S.pendingRangedAttacks],
    pendingAirStrikes: [...S.pendingAirStrikes],
    pendingFerryOrders: [...S.pendingFerryOrders],
  };
  S.humanStandingOrders = [];
  S.pendingRangedAttacks = [];
  S.pendingAirStrikes = [];
  S.pendingFerryOrders = [];
  // No `withTacticalHumanDraftPrefetchInvalidation`: entering tactical from strategic replaces sidebar contracts; this is
  // not a human tweak to an in-progress tactical beat draft. Tactical Run prefetch is not active until res4 planning UI is up.
  S.pendingEmbarkOrders = [];
  S.tacticalPendingMarches = [];
  S.tacticalOpponentDraft = null;
  S.rangedModeActive = false;
  S.airStrikeModeActive = false;
}

/**
 * Returns stash rows kept for units that still exist, or the original list when no snapshot is available.
 *
 * Purpose: Restore applies the same living-unit rule to standing, ranged, air, and ferry drafts without repeating the null-snapshot branch.
 * When to use: Only from `restoreStrategicOrderDraftsAfterTacticalSession`.
 * Expected outcome: Filtered copy when `livingUnitIds` is set; original row array when the strategic snapshot is missing.
 * Exceptions: None.
 */
function restoreDraftRowsForLivingUnits<T extends { unitId: string }>(
  rows: T[],
  livingUnitIds: Set<string> | null
): T[] {
  return livingUnitIds ? filterOrdersToLivingUnitIds(rows, livingUnitIds) : rows;
}

/**
 * Restores living-unit strategic draft lists captured at tactical entry after tactical teardown completes.
 *
 * Contract: No-op without a prior stash; clears tactical march rows because strategic drafts return.
 * When to use: After tactical exit has applied the post-exit strategic snapshot, and when strategic reconciliation tears down a stale tactical session.
 * Expected outcome: Sidebar pending lists match pre-tactical drafts except rows whose unit is missing from the current strategic snapshot.
 * Exceptions: When `S.gameState` is absent, the stash is restored unfiltered so a missing snapshot cannot wipe living drafts.
 */
export function restoreStrategicOrderDraftsAfterTacticalSession(): void {
  if (!strategicOrderDraftStash) return;
  const units = S.gameState?.units;
  const livingUnitIds = units ? new Set(units.map((u) => u.id)) : null;
  S.humanStandingOrders = restoreDraftRowsForLivingUnits(
    strategicOrderDraftStash.humanStandingOrders,
    livingUnitIds
  );
  S.pendingRangedAttacks = restoreDraftRowsForLivingUnits(
    strategicOrderDraftStash.pendingRangedAttacks,
    livingUnitIds
  );
  S.pendingAirStrikes = restoreDraftRowsForLivingUnits(
    strategicOrderDraftStash.pendingAirStrikes,
    livingUnitIds
  );
  S.pendingFerryOrders = restoreDraftRowsForLivingUnits(
    strategicOrderDraftStash.pendingFerryOrders,
    livingUnitIds
  );
  strategicOrderDraftStash = null;
  // No `withTacticalHumanDraftPrefetchInvalidation`: restoring strategic drafts after tactical exit; tactical prefetch
  // lifecycle does not apply to these arrays until the player is back in res4 tactical planning with Run prefetch rules.
  S.tacticalPendingMarches = [];
  S.pendingEmbarkOrders = [];
}

/**
 * Drops any in-memory strategic draft stash without merging back into `S` (new game / hard reset).
 *
 * Contract: Leaves current `S` order arrays untouched aside from callers that already cleared game state.
 * When to use: `newGame` flow after the renderer abandons the prior match.
 * Expected outcome: A later tactical entry can create a fresh stash row.
 * Exceptions: None.
 */
export function discardStrategicOrderUiStash(): void {
  strategicOrderDraftStash = null;
}
