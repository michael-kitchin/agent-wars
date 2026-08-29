/**
 * Builds the pathfinding-heavy preview computation context from a masked `GameStateSnapshot`.
 *
 * Purpose: Isolates pure snapshot → maps/session wiring from hover-session caching and route memoization in `humanMarchPreview`.
 * When to use: When (re)building the per-hover pathfinding session after selection or environment invalidation.
 * Expected outcome: A stable `stateCacheKey` for route memo keys plus a live `PathfindingSession` for `executePlanRouteWithSession`.
 * Exceptions: None; underlying builders propagate only if snapshot data is inconsistent (same as prior inline behavior).
 */

import { buildLatLngCoordinateMap } from '../mapData';
import { logTrace } from '../logger';
import { createPathfindingSession } from '../tools/pathfinding';
import { buildNormalizedTerrainByH3 } from '../movementTerrain';
import { buildTerrainMapsFromHexRows } from './landMovementConstraints';
import type { PathfindingSession } from '../tools/pathfinding';
import type { GameStateSnapshot } from '../../shared/ipcTypes';

/**
 * Cached maps and the pathfinding session reused across hover destinations for one human preview session.
 *
 * Purpose: Holds everything `executePlanRouteCached` needs besides unit/destination ids.
 * When to use: Stored on `ActiveHoverPathfindingSession.context` and rebuilt when signatures change.
 * Expected outcome: `stateCacheKey` changes when any unit id or hex position in the snapshot changes.
 * Exceptions: None.
 */
export type HumanMarchPreviewComputationContext = {
  state: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
  passabilityByH3: Map<string, string>;
  terrainByH3: Map<string, string>;
  terrainKindByH3: Map<string, string>;
  stateCacheKey: string;
  pathfindingSession: PathfindingSession;
};

/**
 * Builds a deterministic cache key fragment from current unit ids and hex positions in the snapshot.
 *
 * Purpose: Separates route memo entries when the strategic/tactical board changes without rebuilding the pathfinding session.
 * When to use: Inside `buildHumanMarchPreviewComputationContextFromState` only.
 * Expected outcome: Sorted `id:h3` pairs joined by `|` for stable string ordering.
 * Exceptions: None.
 */
export function buildHumanMarchPreviewStateCacheKey(state: GameStateSnapshot): string {
  const unitSignature = state.units
    .map((u) => `${u.id}:${u.h3Index}`)
    .sort()
    .join('|');
  return `u:${unitSignature}`;
}

/**
 * Materializes coordinate maps, terrain views, and a pathfinding session for march preview routing.
 *
 * Purpose: Single factory for the heavy `PreviewComputationContext` object previously embedded in `humanMarchPreview.ts`.
 * When to use: After loading `GameStateSnapshot` for the active player in hover preview.
 * Expected outcome: `pathfindingSession` is ready for repeated `executePlanRouteWithSession` calls for the same snapshot.
 * Exceptions: None.
 */
export function buildHumanMarchPreviewComputationContextFromState(
  state: GameStateSnapshot
): HumanMarchPreviewComputationContext {
  logTrace('humanMarchPreviewComputationContext buildHumanMarchPreviewComputationContextFromState', {
    turnNumber: state.turnNumber,
    hexCount: state.hexes.length,
    unitCount: state.units.length,
  });
  const hexList = state.hexes.map((h) => h.h3Index);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
  const { terrainByH3, terrainKindByH3 } = buildTerrainMapsFromHexRows(state.hexes);
  return {
    state,
    latLngByH3,
    resolveToH3,
    passabilityByH3: buildNormalizedTerrainByH3(state.hexes),
    terrainByH3,
    terrainKindByH3,
    stateCacheKey: buildHumanMarchPreviewStateCacheKey(state),
    pathfindingSession: createPathfindingSession(state, latLngByH3, resolveToH3),
  };
}
