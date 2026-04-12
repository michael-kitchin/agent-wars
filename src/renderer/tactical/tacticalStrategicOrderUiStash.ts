/**
 * Saves strategic planning drafts (standing movement, ranged, air, ferry) while a tactical battle owns the sidebar contract.
 */

import type {
  AirStrikeOrder,
  FerryOrder,
  HumanStandingOrderSnapshot,
  RangedAttackOrder,
} from '../../shared/ipcTypes';
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
  S.tacticalPendingMarches = [];
  S.rangedModeActive = false;
  S.airStrikeModeActive = false;
}

/**
 * Restores strategic draft lists captured at tactical entry after tactical teardown completes.
 *
 * Contract: No-op without a prior stash; clears tactical march rows because strategic drafts return.
 * When to use: After tactical exit Ready-equivalent flow and when strategic reconciliation tears down a stale tactical session.
 * Expected outcome: Sidebar pending lists match what the player had before tactical mode unless a new-game reset cleared stash.
 * Exceptions: None.
 */
export function restoreStrategicOrderDraftsAfterTacticalSession(): void {
  if (!strategicOrderDraftStash) return;
  S.humanStandingOrders = strategicOrderDraftStash.humanStandingOrders;
  S.pendingRangedAttacks = strategicOrderDraftStash.pendingRangedAttacks;
  S.pendingAirStrikes = strategicOrderDraftStash.pendingAirStrikes;
  S.pendingFerryOrders = strategicOrderDraftStash.pendingFerryOrders;
  strategicOrderDraftStash = null;
  S.tacticalPendingMarches = [];
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
