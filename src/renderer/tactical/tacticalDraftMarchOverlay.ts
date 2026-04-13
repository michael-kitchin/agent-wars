/**
 * Explicit tactical sub-unit position helpers for committed snapshot cells vs renderer-local march drafts.
 *
 * Purpose: Prevents ambiguous “effective position” reads across selection, hit-testing, and sidebar formatting.
 * When to use: Any tactical path that must distinguish committed `h3Index` from a draft destination before Ready.
 * Expected outcome: Committed cells always come from `TacticalBattleSnapshot.subUnits`; draft destinations from pending rows.
 * Exceptions: Unknown ids yield empty string or null as documented per helper.
 */

import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { emitParityDiagnosticsBreadcrumb } from '../core/parityDiagnostics';

/**
 * Returns the committed res4 cell for a tactical sub-unit from the authoritative battle snapshot.
 *
 * Purpose: Single source of truth for “where the unit is” before Ready applies drafts to the main snapshot.
 * When to use: Selection chrome, march planning origins, and hit-testing that must not jump to draft destinations.
 * Expected outcome: Snapshot `h3Index` for `subUnitId`, or empty string when absent.
 * Exceptions: None.
 */
export function tacticalCommittedH3ForSubUnit(battle: TacticalBattleSnapshot, subUnitId: string): string {
  return battle.subUnits.find((u) => u.id === subUnitId)?.h3Index ?? '';
}

/**
 * Returns the renderer-local draft march destination for a sub-unit when one exists in `tacticalPendingMarches`.
 *
 * Purpose: Separates draft destination lookup from committed snapshot reads.
 * When to use: Pending-order labels, draft route overlays, and any UI that should show planned destination.
 * Expected outcome: Destination res4 index when a draft row exists; otherwise null.
 * Exceptions: None.
 */
export function tacticalDraftMarchDestinationH3Index(
  pendingMarches: readonly { subUnitId: string; destinationH3Index: string }[],
  subUnitId: string
): string | null {
  const row = pendingMarches.find((r) => r.subUnitId === subUnitId);
  return row?.destinationH3Index ?? null;
}

/**
 * Returns the displayed res4 cell for a sub-unit, preferring a draft destination when present.
 *
 * Purpose: Optional helper for features that intentionally show units at their planned destination (ghost previews).
 * When to use: Only when UX explicitly requires draft placement; not for default selection/planning origins.
 * Expected outcome: Draft destination when listed; otherwise committed `h3Index`.
 * Exceptions: None.
 */
export function tacticalDisplayedH3ForSubUnit(
  battle: TacticalBattleSnapshot,
  pendingMarches: readonly { subUnitId: string; destinationH3Index: string }[],
  subUnitId: string
): string {
  const draftDestination = tacticalDraftMarchDestinationH3Index(pendingMarches, subUnitId);
  const source = draftDestination ? 'draft_destination' : 'committed_snapshot';
  emitParityDiagnosticsBreadcrumb('tactical.positionSourceSelection', {
    subUnitId,
    source,
  });
  return draftDestination ?? tacticalCommittedH3ForSubUnit(battle, subUnitId);
}

/**
 * Returns sub-unit rows with `h3Index` replaced by draft destinations where drafts exist (display-only overlay).
 *
 * Purpose: Builds drawable unit lists that intentionally reflect draft destinations without mutating the snapshot.
 * When to use: Features that require ghost/overlay placement distinct from committed cells.
 * Expected outcome: Shallow copies with `h3Index` overridden only when a pending march row exists.
 * Exceptions: None.
 */
export function tacticalSubUnitsWithMarchDraftOverlay(
  battle: TacticalBattleSnapshot,
  pendingMarches: readonly { subUnitId: string; destinationH3Index: string }[]
): TacticalBattleSnapshot['subUnits'] {
  return battle.subUnits.map((u) => {
    const dest = tacticalDraftMarchDestinationH3Index(pendingMarches, u.id);
    return dest ? { ...u, h3Index: dest } : u;
  });
}
