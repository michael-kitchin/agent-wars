/**
 * Builds tactical pending-march rows with stable path data for continuation beats after Ready commit.
 */

import { findPathTailFromCurrentPosition } from '../../shared/marchPathUtils';
import type { TacticalPendingMarchRow } from '../../shared/ipc/humanOrderPreviewTypes';
import { buildTacticalMarchDraftDestinationPreview } from '../../shared/tacticalMarchHoverPreview';
import { filterTacticalMarchContinuationsToPresentSubUnits } from '../../shared/tacticalMarchContinuations';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * Converts IPC continuation rows into pending-march state rows, reusing committed path tails when possible.
 *
 * Purpose: Keeps tactical march overlay polylines stable across beats by advancing stored H3 paths instead of replanning.
 * When to use: `readyHandler` after tactical Ready commit when `tacticalMarchContinuations` is non-empty.
 * Expected outcome: Each row includes `pathH3Indexes` and `cachedSegments` when a valid route exists; falls back to fresh planning when off-path. Continuations for sub-units absent from `battle.subUnits` are omitted.
 * Exceptions: None.
 */
export function buildTacticalPendingMarchRowsFromContinuations(args: {
  battle: TacticalBattleSnapshot;
  continuations: readonly { subUnitId: string; destinationH3Index: string }[];
  previousBySubUnitId: ReadonlyMap<string, TacticalPendingMarchRow>;
}): TacticalPendingMarchRow[] {
  const livingIds = new Set(args.battle.subUnits.map((u) => u.id));
  const livingContinuations = filterTacticalMarchContinuationsToPresentSubUnits(
    args.continuations,
    livingIds
  );
  return livingContinuations.map((cont) => {
    const prev = args.previousBySubUnitId.get(cont.subUnitId);
    const sub = args.battle.subUnits.find((u) => u.id === cont.subUnitId);
    const newUnitH3 = sub?.h3Index;
    if (prev?.pathH3Indexes && newUnitH3) {
      const tail = findPathTailFromCurrentPosition(prev.pathH3Indexes, newUnitH3);
      if (tail) {
        const result = buildTacticalMarchDraftDestinationPreview(
          args.battle,
          cont.subUnitId,
          cont.destinationH3Index,
          { overridePathH3Indexes: tail }
        );
        if (result.preview.valid && result.preview.segments.length > 0) {
          return {
            subUnitId: cont.subUnitId,
            destinationH3Index: cont.destinationH3Index,
            pathH3Indexes: [...tail],
            cachedSegments: result.preview.segments,
          };
        }
      }
    }
    const result = buildTacticalMarchDraftDestinationPreview(
      args.battle,
      cont.subUnitId,
      cont.destinationH3Index
    );
    return {
      subUnitId: cont.subUnitId,
      destinationH3Index: cont.destinationH3Index,
      ...(result.pathH3Indexes ? { pathH3Indexes: result.pathH3Indexes } : {}),
      ...(result.preview.valid && result.preview.segments.length > 0
        ? { cachedSegments: result.preview.segments }
        : {}),
    };
  });
}

/**
 * Builds a single pending-march row with cached path data when a draft destination is first committed on the map.
 *
 * Purpose: Stores the planned H3 path and lat/lng segments at draft time so render frames do not rerun Dijkstra.
 * When to use: `mainMapInteractions` after upserting a tactical pending march row.
 * Expected outcome: Row includes `pathH3Indexes` and `cachedSegments` when the preview is valid.
 * Exceptions: None.
 */
export function buildTacticalPendingMarchRowFromDraft(args: {
  battle: TacticalBattleSnapshot;
  subUnitId: string;
  destinationH3Index: string;
}): TacticalPendingMarchRow {
  const result = buildTacticalMarchDraftDestinationPreview(
    args.battle,
    args.subUnitId,
    args.destinationH3Index
  );
  return {
    subUnitId: args.subUnitId,
    destinationH3Index: args.destinationH3Index,
    ...(result.pathH3Indexes ? { pathH3Indexes: result.pathH3Indexes } : {}),
    ...(result.preview.valid && result.preview.segments.length > 0
      ? { cachedSegments: result.preview.segments }
      : {}),
  };
}
