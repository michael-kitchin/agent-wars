/**
 * Merges renderer-local tactical march drafts over the committed tactical snapshot for display and hit-testing.
 */

import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { rendererSharedState as S } from '../core/state';

/**
 * Returns the res4 hex where a tactical sub-unit should be drawn, including any pending march draft destination.
 *
 * Purpose: Keeps map icons, stack hit tests, and selection chrome aligned with draft orders before Ready commits them.
 * When to use: Any tactical path that previously read `subUnits[].h3Index` directly for human-visible placement.
 * Expected outcome: Pending destination wins when listed in `S.tacticalPendingMarches`; otherwise the snapshot cell.
 * Exceptions: None; unknown ids fall back to the snapshot row or empty string when absent.
 */
export function tacticalEffectiveH3ForSubUnit(tb: TacticalBattleSnapshot, subUnitId: string): string {
  const draft = S.tacticalPendingMarches.find((r) => r.subUnitId === subUnitId);
  if (draft) return draft.destinationH3Index;
  return tb.subUnits.find((u) => u.id === subUnitId)?.h3Index ?? '';
}

/**
 * Returns sub-unit rows with `h3Index` replaced by draft destinations where drafts exist (for canvas drawing).
 *
 * Purpose: Builds the drawable unit list for tactical mode without mutating `S.tacticalBattleSnapshot`.
 * When to use: `getUnitsForDrawWithMovingIds` tactical branch and similar consumers.
 * Expected outcome: Shallow copies with updated `h3Index` only where a matching pending march exists.
 * Exceptions: None.
 */
export function tacticalSubUnitsWithDraftOverlay(tb: TacticalBattleSnapshot): TacticalBattleSnapshot['subUnits'] {
  return tb.subUnits.map((u) => {
    const draft = S.tacticalPendingMarches.find((r) => r.subUnitId === u.id);
    return draft ? { ...u, h3Index: draft.destinationH3Index } : u;
  });
}
