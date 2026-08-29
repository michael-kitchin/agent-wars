/**
 * Land and naval strategic march preview: occupiable dest → `plan_route`, with land-only nearby snap.
 *
 * Purpose: Keeps naval multi-turn standing orders on occupiable water while forbidding inland-port
 * and dry-land snaps onto nearby transit.
 * When to use: From `computeHumanMarchPreviewForUnit` after air and land-mass early exits.
 * Expected outcome: A valid preview when `plan_route` succeeds; null when the hover should show invalid.
 * Exceptions: None; callers supply a memoized `planRoute`.
 */

import { gridDisk } from 'h3-js';
import { logDebug, logTrace } from '../../logger';
import { terrainIsPassableForDomain } from '../../pathfinding';
import {
  canLandUnitTraverseEdge,
  landUnitCanOccupyHex,
} from '../../../shared/landTraversalRes1';
import { isLandUnitType } from '../landMovementConstraints';
import type { PlanRouteError, PlanRouteOk } from '../../tools/pathfinding';
import type { HumanMarchPreviewComputationContext } from '../humanMarchPreviewComputationContext';
import {
  navalLookupForHexState,
  navalStrategicHexIsOccupiable,
} from '../../navalStrategicPath';

/**
 * Maximum nearby land-hex probes per hover.
 *
 * Purpose: Bounds fallback cost when the hovered land hex has no direct route.
 * When to use: `findNearbyLandMarchPreview` only.
 * Expected outcome: Search stops after this many `plan_route` attempts.
 * Exceptions: None.
 */
const MAX_NEARBY_FALLBACK_ATTEMPTS = 16;

/**
 * Maximum H3 ring radius for land nearby fallback.
 *
 * Purpose: Limits how far a land hover may snap to a routable neighbor.
 * When to use: `findNearbyLandMarchPreview` only.
 * Expected outcome: Rings 1..this value are scanned in order.
 * Exceptions: None.
 */
const MAX_NEARBY_FALLBACK_RADIUS = 6;

/**
 * Wall-clock budget for nearby land fallback on one hover.
 *
 * Purpose: Hover preview must stay responsive when rings are large.
 * When to use: `findNearbyLandMarchPreview` only.
 * Expected outcome: Search aborts after this many milliseconds.
 * Exceptions: None.
 */
const MAX_NEARBY_FALLBACK_BUDGET_MS = 20;

/**
 * Successful ground-unit march preview fields (no strategic terrain slowdown).
 *
 * Purpose: Avoid importing `HumanOrderPreviewResult` from the impl module (circular).
 * When to use: Return type of `resolveLandOrNavalMarchPreview` and nearby fallback.
 * Expected outcome: Structurally assignable to `HumanOrderPreviewResult`.
 * Exceptions: None.
 */
export type GroundMarchPreviewOk = {
  valid: true;
  showInvalidMarker: false;
  arrowLatLng: [number, number];
  segments: Array<{ turn: number; hexes: [number, number][] }>;
  slowerTerrainDisplayTitle: null;
  orderPreviewTerrainImpact: null;
};

/**
 * Unit fields needed to decide occupiability and call `plan_route`.
 *
 * Purpose: Keeps this module free of the impl’s verbose unit alias.
 * When to use: Pass the human unit already loaded by preview.
 * Expected outcome: `unitType` is `naval` or a land combat type.
 * Exceptions: None.
 */
export type GroundMarchPreviewUnit = {
  id: string;
  unitType: string;
  h3Index: string;
};

/**
 * Named arguments for land/naval hover routing.
 *
 * Purpose: Stays under the method-argument limit while injecting cached `plan_route` and diagnostics.
 * When to use: `resolveLandOrNavalMarchPreview`.
 * Expected outcome: `planRoute` is the caller’s memoized Tool 1 wrapper.
 * Exceptions: None.
 */
export interface ResolveLandOrNavalMarchPreviewArgs {
  /**
   * Hover pathfinding context for the current selection.
   *
   * Contract: Same snapshot used to build the naval lookup and land-mass checks.
   * When to use: Always the active hover session context.
   * Expected outcome: Hex rows and infrastructure match the masked game state.
   * Exceptions: None.
   */
  context: HumanMarchPreviewComputationContext;
  /**
   * Human unit being previewed.
   *
   * Contract: Must be land or naval; air is handled before this helper.
   * When to use: Always.
   * Expected outcome: Naval uses berth occupancy; land uses land-mass occupancy.
   * Exceptions: None.
   */
  unit: GroundMarchPreviewUnit;
  /**
   * Hovered destination hex id.
   *
   * Contract: Must exist on the map (caller already resolved `hoveredHex`).
   * When to use: Always.
   * Expected outcome: Direct `plan_route` target when occupiable.
   * Exceptions: None.
   */
  hoveredH3Index: string;
  /**
   * Memoized `plan_route` for this hover session.
   *
   * Contract: Returns Tool 1 ok/error; must not throw.
   * When to use: Direct dest and land nearby candidates.
   * Expected outcome: Naval multi-turn paths are valid when occupiable.
   * Exceptions: None.
   */
  planRoute: (unitId: string, destinationH3Index: string) => PlanRouteOk | PlanRouteError;
  /**
   * Increments nearby-fallback attempt diagnostics.
   *
   * Contract: Called once per candidate that reaches `plan_route`.
   * When to use: Land nearby search only.
   * Expected outcome: Caller updates `fallbackAttemptCount`.
   * Exceptions: None.
   */
  noteFallbackAttempt: () => void;
  /**
   * Increments nearby-fallback time-budget abort diagnostics.
   *
   * Contract: Called when the wall-clock budget expires.
   * When to use: Land nearby search only.
   * Expected outcome: Caller updates `fallbackBudgetAbortCount`.
   * Exceptions: None.
   */
  noteFallbackBudgetAbort: () => void;
}

/**
 * Builds the empty strategic-terrain tooltip fields for a successful ground march preview.
 *
 * Purpose: Strategic land/naval previews must not show tactical slower-terrain chrome.
 * When to use: After a successful `plan_route` in this module.
 * Expected outcome: Both tooltip fields are null.
 * Exceptions: None.
 */
function emptyStrategicTerrainFields(
  unitId: string,
  unitType: string
): Pick<GroundMarchPreviewOk, 'slowerTerrainDisplayTitle' | 'orderPreviewTerrainImpact'> {
  logTrace('humanMarchPreviewGroundRoute emptyStrategicTerrainFields', { unitId, unitType });
  return { slowerTerrainDisplayTitle: null, orderPreviewTerrainImpact: null };
}

/**
 * Maps a successful Tool 1 route onto a ground march preview.
 *
 * Purpose: Shared construction for direct and nearby land successes.
 * When to use: After `planRoute` returns status ok.
 * Expected outcome: Valid preview with route segments and no slower-terrain tooltip.
 * Exceptions: None.
 */
function previewFromPlanRouteOk(unit: GroundMarchPreviewUnit, planned: PlanRouteOk): GroundMarchPreviewOk {
  logTrace('humanMarchPreviewGroundRoute previewFromPlanRouteOk', { unitId: unit.id });
  return {
    valid: true,
    showInvalidMarker: false,
    arrowLatLng: planned.destination,
    segments: planned.path.map((seg) => ({ turn: seg.turn, hexes: seg.hexes })),
    ...emptyStrategicTerrainFields(unit.id, unit.unitType),
  };
}

/**
 * Snaps a passable-but-unroutable land hover onto a nearby land hex with a legal route.
 *
 * Purpose: Land units keep nearby fallback; naval must not use this (inland clicks would become water/berths).
 * When to use: Land only, after the hovered hex failed `plan_route`.
 * Expected outcome: First nearby land candidate with an ok route, or null.
 * Exceptions: Aborts on time budget or attempt cap.
 */
function findNearbyLandMarchPreview(
  args: ResolveLandOrNavalMarchPreviewArgs
): GroundMarchPreviewOk | null {
  logDebug('humanMarchPreviewGroundRoute findNearbyLandMarchPreview', {
    unitId: args.unit.id,
    hoveredH3Index: args.hoveredH3Index,
  });
  const startedAtMs = Date.now();
  let attempts = 0;
  const seen = new Set<string>([args.hoveredH3Index]);
  for (let radius = 1; radius <= MAX_NEARBY_FALLBACK_RADIUS; radius++) {
    if (Date.now() - startedAtMs >= MAX_NEARBY_FALLBACK_BUDGET_MS) {
      args.noteFallbackBudgetAbort();
      return null;
    }
    let ring: string[] = [];
    try {
      ring = gridDisk(args.hoveredH3Index, radius);
    } catch {
      break;
    }
    for (const candidateH3 of ring) {
      if (Date.now() - startedAtMs >= MAX_NEARBY_FALLBACK_BUDGET_MS) {
        args.noteFallbackBudgetAbort();
        return null;
      }
      if (attempts >= MAX_NEARBY_FALLBACK_ATTEMPTS) return null;
      if (seen.has(candidateH3)) continue;
      seen.add(candidateH3);
      const passabilityTerrain = args.context.passabilityByH3.get(candidateH3) ?? 'land';
      if (!terrainIsPassableForDomain(passabilityTerrain, 'land')) continue;
      if (isLandUnitType(args.unit.unitType) && candidateH3 !== args.unit.h3Index) {
        const landMass = args.context.pathfindingSession.landMass;
        if (!landUnitCanOccupyHex(candidateH3, landMass)) continue;
        if (!canLandUnitTraverseEdge(args.unit.h3Index, candidateH3, landMass)) continue;
      }
      attempts += 1;
      args.noteFallbackAttempt();
      const planned = args.planRoute(args.unit.id, candidateH3);
      if (planned.status !== 'ok') continue;
      return previewFromPlanRouteOk(args.unit, planned);
    }
  }
  return null;
}

/**
 * Returns a valid land/naval march preview, or null when the hover should show as unreachable.
 *
 * Purpose: Occupiable naval dests use `plan_route` (multi-turn standing orders). Naval never nearby-snaps.
 * When to use: After air ferry and land-mass occupancy early-outs in the preview impl.
 * Expected outcome: Ok preview for occupiable dests with a route; nearby land snap only for land units;
 * null for dry inland, unreachable land seaports, and failed land routes.
 * Exceptions: None.
 */
export function resolveLandOrNavalMarchPreview(
  args: ResolveLandOrNavalMarchPreviewArgs
): GroundMarchPreviewOk | null {
  logDebug('humanMarchPreviewGroundRoute resolveLandOrNavalMarchPreview', {
    unitId: args.unit.id,
    unitType: args.unit.unitType,
    hoveredH3Index: args.hoveredH3Index,
  });
  const navalLookup =
    args.unit.unitType === 'naval'
      ? navalLookupForHexState(
          args.context.pathfindingSession,
          args.context.state.hexes,
          args.context.state.res1Infrastructure
        )
      : undefined;
  const hoveredPassable =
    args.unit.unitType === 'naval'
      ? Boolean(navalLookup && navalStrategicHexIsOccupiable(args.hoveredH3Index, navalLookup))
      : landUnitCanOccupyHex(args.hoveredH3Index, args.context.pathfindingSession.landMass);
  if (hoveredPassable) {
    const planned = args.planRoute(args.unit.id, args.hoveredH3Index);
    if (planned.status === 'ok') return previewFromPlanRouteOk(args.unit, planned);
  }
  if (args.unit.unitType === 'naval') return null;
  if (!hoveredPassable) return null;
  return findNearbyLandMarchPreview(args);
}
