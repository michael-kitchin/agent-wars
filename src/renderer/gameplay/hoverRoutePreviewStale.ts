import { rendererSharedState as S } from '../core/state';

/**
 * Returns whether async hover-preview work should still apply after an await (seq, hex, selection unchanged).
 *
 * Purpose: Centralizes the stale-guard used after IPC validation so duplicate ranged/air/march paths stay consistent.
 * When to use: Immediately after `await` validation or march preview in `refreshHoverRoutePreview` before mutating `S.hoverRoutePreview`.
 * Expected outcome: `false` when a newer hover request superseded this one or selection/hex drifted.
 * Exceptions: None.
 */
export function hoverRoutePreviewAsyncContextStillValid(args: {
  seqAtStart: number;
  hoveredH3: string;
  unitIdsAtStart: readonly string[];
}): boolean {
  if (args.seqAtStart !== S.hoverPreviewRequestSeq) return false;
  if (S.hoveredHexH3 !== args.hoveredH3) return false;
  const currentSelected = [...S.selectedUnitIds].sort().join('|');
  const requestedSelected = [...args.unitIdsAtStart].sort().join('|');
  return currentSelected === requestedSelected;
}
