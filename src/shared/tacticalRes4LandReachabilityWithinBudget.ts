/**
 * Single-source infantry/armor reachability within one tactical beat’s MP budget (Ready-parity membership).
 *
 * Purpose: Mirrors strategic `getLandMassReachableHexes` (one search from origin) for res4 terrain-weighted marches, so Best
 * Options does not run one Dijkstra per candidate hex.
 */

import {
  blockedHexLandTransitAllowsRelaxation,
  landInfantryArmorEnterCost,
  landStateKey,
  landTerrainBlocksWithoutTransport,
  parseLandStateKey,
} from './tacticalRes4LandMarchContinuity';
import type { Res4FootprintNeighborLookup } from './tacticalRes4TransportLink';
import type { TacticalTerrainKindResolver } from './tacticalTerrainMovement';
import {
  popNumericPriorityMinHeap,
  pushNumericPriorityMinHeap,
  type NumericPriorityHeapEntry,
} from './numericPriorityMinHeap';

/** Sentinel march goal so transit rules apply; never equals a real H3 index. */
const TRANSIT_ONLY_GOAL = '';

/**
 * Lists infantry/armor footprint cells reachable this beat under the same enter-cost rules as `planTacticalRes4March`.
 *
 * Purpose: Tactical analogue of strategic `getLandMassReachableHexes` — one origin search, then membership by budget.
 * When to use: `collectTacticalLegalMoveDestinationRes4Hexes` for infantry/armor Best Options / possible-actions rows.
 * Expected outcome: Destination hexes with a finite path totaling ≤ `movementPointBudget`, excluding the origin; blocking
 * destinations are recovered via goal short-circuit backfill so membership matches per-destination `reachableThisTurn`.
 * Exceptions: None; never throws.
 */
export function collectInfantryArmorReachableWithinBudget(args: {
  fromH3: string;
  res4Set: ReadonlySet<string>;
  unitTypeForMovement: string;
  movementPointBudget: number;
  terrain: TacticalTerrainKindResolver;
  footprintNeighbors: Res4FootprintNeighborLookup;
}): string[] {
  const { fromH3, res4Set, unitTypeForMovement, movementPointBudget, terrain } = args;
  const neighborsOf = args.footprintNeighbors;
  const distLand = new Map<string, number>();
  const heapLand: NumericPriorityHeapEntry<string>[] = [];
  const startKey = landStateKey(fromH3, null);
  distLand.set(startKey, 0);
  pushNumericPriorityMinHeap(heapLand, startKey, 0);

  const bestCostByHex = new Map<string, number>([[fromH3, 0]]);
  const bestPrevByHex = new Map<string, string | null>([[fromH3, null]]);

  while (heapLand.length > 0) {
    const node = popNumericPriorityMinHeap(heapLand);
    if (!node) break;
    const { payload: key, d } = node;
    if (d !== distLand.get(key)) continue;
    if (d > movementPointBudget) continue;
    const { h, prev } = parseLandStateKey(key);
    for (const nb of neighborsOf(h)) {
      if (
        !blockedHexLandTransitAllowsRelaxation({
          unitTypeForMovement,
          terrain,
          h,
          prev,
          nb,
          marchStartH3: fromH3,
          marchGoalH3: TRANSIT_ONLY_GOAL,
        })
      ) {
        continue;
      }
      const w = landInfantryArmorEnterCost({
        toH3: nb,
        unitTypeForMovement,
        terrain,
        fromH3: h,
        prevOfFrom: prev,
        marchGoalH3: TRANSIT_ONLY_GOAL,
        res4Set,
        footprintNeighbors: neighborsOf,
      });
      if (!Number.isFinite(w) || w <= 0) continue;
      const nd = d + w;
      if (nd > movementPointBudget) continue;
      const nk = landStateKey(nb, h);
      const prevD = distLand.get(nk);
      if (prevD === undefined || nd < prevD) {
        distLand.set(nk, nd);
        pushNumericPriorityMinHeap(heapLand, nk, nd);
        const best = bestCostByHex.get(nb);
        if (best === undefined || nd < best) {
          bestCostByHex.set(nb, nd);
          bestPrevByHex.set(nb, h);
        }
      }
    }
  }

  const out: string[] = [];
  const outSet = new Set<string>();
  for (const [h, cost] of bestCostByHex) {
    if (h === fromH3) continue;
    if (cost <= movementPointBudget) {
      out.push(h);
      outSet.add(h);
    }
  }

  for (const goal of res4Set) {
    if (goal === fromH3 || outSet.has(goal)) continue;
    if (!landTerrainBlocksWithoutTransport(unitTypeForMovement, terrain, goal)) continue;
    for (const nb of neighborsOf(goal)) {
      const dNb = bestCostByHex.get(nb);
      if (dNb === undefined || dNb > movementPointBudget) continue;
      const prevOfFrom = nb === fromH3 ? null : (bestPrevByHex.get(nb) ?? null);
      const step = landInfantryArmorEnterCost({
        toH3: goal,
        unitTypeForMovement,
        terrain,
        fromH3: nb,
        prevOfFrom,
        marchGoalH3: goal,
        res4Set,
        footprintNeighbors: neighborsOf,
      });
      if (!Number.isFinite(step) || step <= 0) continue;
      if (dNb + step <= movementPointBudget) {
        out.push(goal);
        outSet.add(goal);
        break;
      }
    }
  }
  return out;
}
