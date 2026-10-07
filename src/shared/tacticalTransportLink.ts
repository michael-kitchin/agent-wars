/**
 * Tactical tactical transport (road/rail) edge detection for march planning.
 *
 * Purpose: Aligns gameplay with bundled `road_sides` / `rail_sides` masks: neighbor slot indices must match `gridDisk(h, 1)`
 * iteration order used when authoring terrain JSON.
 * When to use: Strict **slot-aligned** helpers (`tacticalTransportEdgeActive`) for tests/diagnostics; **march** helpers
 * (`tacticalTransportMarchAdjacentPairAllowsStep`) for resolver `transportFromTo`, continuity, and §12.4 speed scaling.
 * Expected outcome: March passage allows adjacent steps when **both** endpoints have valid masks with **any** road/rail side set;
 * strict APIs still require the traversed side marked on the head cell only.
 * Exceptions: `gridDisk` failures yield empty rings and false negatives.
 */

import { gridDisk } from 'h3-js';

export type TacticalTransportMasks = {
  roadSides: readonly boolean[];
  railSides: readonly boolean[];
};

/**
 * Process-global cache for `tacticalGridDiskNeighborsOrdered` results.
 *
 * Purpose: Eliminates repeated native H3 `gridDisk` calls from the Dijkstra transport-mask alignment path
 * (`neighborSlotIndex`, `tacticalTransportMarchAdjacentPairAllowsStep`, etc.), which otherwise calls
 * `gridDisk` several times per edge relaxation even after footprint adjacency is precomputed.
 * When to use: Populated automatically by `tacticalGridDiskNeighborsOrdered`; capacity sized to cover a
 * full strategic footprint (~343 cells) plus some margin.
 * Expected outcome: After the first call per cell, subsequent calls return the cached ring in O(1).
 * Exceptions: None.
 */
const orderedRingMemo = new Map<string, string[]>();
const ORDERED_RING_MEMO_CAPACITY = 1_000;

/**
 * Returns ordered tactical ring-1 neighbors of `fromH3` (excludes `fromH3`), or empty when H3 throws.
 *
 * Purpose: Stable neighbor list for indexing into `roadSides` / `rail_sides` arrays on the same cell.
 * Result is memoized process-globally so repeated Dijkstra calls within a battle pay the H3 cost only once per cell.
 * When to use: `neighborSlotIndex` and transport spawn scans.
 * Expected outcome: Same iteration order as `tacticalNeighborsInFootprint` neighbor iteration for a single origin (before footprint filtering).
 * Exceptions: Swallows `gridDisk` errors and returns `[]`.
 */
export function tacticalGridDiskNeighborsOrdered(fromH3: string): string[] {
  const cached = orderedRingMemo.get(fromH3);
  if (cached !== undefined) return cached;
  let ring: string[];
  try {
    ring = [...gridDisk(fromH3, 1)].filter((h) => h !== fromH3);
  } catch {
    ring = [];
  }
  if (orderedRingMemo.size >= ORDERED_RING_MEMO_CAPACITY) {
    const oldest = orderedRingMemo.keys().next().value as string | undefined;
    if (oldest !== undefined) orderedRingMemo.delete(oldest);
  }
  orderedRingMemo.set(fromH3, ring);
  return ring;
}

/**
 * Lists tactical neighbors of `h` that remain inside the tactical battle footprint.
 *
 * Purpose: Single edge list for §12.4 Dijkstra on the tactical grid (`planTacticalMarch` land and naval branches).
 * When to use: Any tactical pathfinding restricted to a parent strategic child set.
 * Expected outcome: Excludes `h` itself; returns only indexes present in `tacticalSet`; empty when `gridDisk` throws.
 * Exceptions: Swallows malformed H3 like other tactical helpers.
 */
export function tacticalNeighborsInFootprint(h: string, tacticalSet: ReadonlySet<string>): string[] {
  const out: string[] = [];
  try {
    for (const n of gridDisk(h, 1)) {
      if (n !== h && tacticalSet.has(n)) out.push(n);
    }
  } catch {
    return out;
  }
  return out;
}

/** Lookup for ring-1 neighbors inside a fixed tactical footprint without per-call `gridDisk`. */
export type TacticalFootprintNeighborLookup = (h: string) => readonly string[];

/**
 * Precomputes footprint-restricted ring-1 adjacency for every cell in `tacticalSet`.
 *
 * Purpose: Avoids thousands of native H3 `gridDisk` calls during tactical march Dijkstra on a static footprint.
 * When to use: Session cache in `tacticalMovementPlanningCache` before calling `planTacticalMarch`.
 * Expected outcome: For each `h` in `tacticalSet`, value equals `tacticalNeighborsInFootprint(h, tacticalSet)`.
 * Exceptions: None; malformed cells get empty neighbor lists like the live helper.
 */
export function buildTacticalFootprintAdjacencyMap(tacticalSet: ReadonlySet<string>): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const h of tacticalSet) {
    adj.set(h, tacticalNeighborsInFootprint(h, tacticalSet));
  }
  return adj;
}

/**
 * Wraps a precomputed adjacency map as a `TacticalFootprintNeighborLookup` for march planners.
 *
 * Purpose: Lets Dijkstra loops call `neighborsOf(h)` instead of `tacticalNeighborsInFootprint(h, tacticalSet)`.
 * When to use: After `buildTacticalFootprintAdjacencyMap` in the tactical planning session cache.
 * Expected outcome: Returns the cached list for known cells; `[]` for unknown `h`.
 * Exceptions: None.
 */
export function tacticalFootprintNeighborLookupFromMap(
  adjacency: ReadonlyMap<string, readonly string[]>
): TacticalFootprintNeighborLookup {
  return (h: string) => adjacency.get(h) ?? [];
}

/**
 * Returns the side index on `fromH3` whose `gridDisk` neighbor equals `toH3`, or null when not adjacent.
 *
 * Purpose: Maps an ordered march step to the correct `roadSides[i]` / `railSides[i]` slot on the head cell.
 * When to use: `tacticalTransportEdgeActive` and any helper that must align mask indices to ring neighbors.
 * Expected outcome: Integer in `[0, ring.length)` when `toH3` is a ring-1 neighbor; otherwise null.
 * Exceptions: None.
 */
export function neighborSlotIndex(fromH3: string, toH3: string): number | null {
  const ring = tacticalGridDiskNeighborsOrdered(fromH3);
  const i = ring.indexOf(toH3);
  return i >= 0 ? i : null;
}

function maskActiveAtSlot(masks: TacticalTransportMasks | undefined, slot: number): boolean {
  if (!masks) return false;
  const { roadSides, railSides } = masks;
  if (slot < 0 || slot >= roadSides.length || slot >= railSides.length) return false;
  return !!(roadSides[slot] || railSides[slot]);
}

/**
 * Returns true when `masks` has length aligned with `ringLen` and at least one road or rail side is set.
 *
 * Purpose: Shared check for “cell participates in transport overlay” without fixing a neighbor slot.
 * When to use: `tacticalTransportMarchAdjacentPairAllowsStep` after verifying `roadSides`/`railSides` length equals `ringLen`.
 * Expected outcome: False when lengths mismatch or every side is false.
 * Exceptions: None.
 */
export function tacticalTransportMaskHasAnyRoadOrRail(masks: TacticalTransportMasks, ringLen: number): boolean {
  const { roadSides, railSides } = masks;
  if (roadSides.length !== ringLen || railSides.length !== ringLen) return false;
  for (let i = 0; i < ringLen; i++) {
    if (roadSides[i] || railSides[i]) return true;
  }
  return false;
}

/**
 * Returns true when `h3` has a map row whose arrays match `gridDisk(h3,1)` length and at least one road/rail side is true.
 *
 * Purpose: Endpoint eligibility for march pairs independent of which boundary shares the step.
 * When to use: Building `tacticalTransportMarchAdjacentPairAllowsStep`.
 * Expected outcome: False when missing row, length mismatch vs ring, or all sides false.
 * Exceptions: None.
 */
function tacticalTransportCellHasValidAnySideOverlay(
  h3: string,
  roadRailByH3: ReadonlyMap<string, TacticalTransportMasks>
): boolean {
  const masks = roadRailByH3.get(h3);
  if (!masks) return false;
  const ring = tacticalGridDiskNeighborsOrdered(h3);
  return tacticalTransportMaskHasAnyRoadOrRail(masks, ring.length);
}

/**
 * Returns true when infantry/armor may treat the adjacent step `fromH3` → `toH3` as a transport step (both cells show any road/rail).
 *
 * Purpose: March-time passage when both tactical hexes carry transport overlay data; ignores **which** edge bits are set.
 * When to use: `transportFromTo`, land continuity, blocking-terrain transport authorization, spawn bridge checks.
 * Expected outcome: False when not ring-1 neighbors, either endpoint is rubble, either cell lacks a mask row or length-valid
 * overlay with at least one side flagged.
 * Exceptions: None.
 */
export function tacticalTransportMarchAdjacentPairAllowsStep(args: {
  fromH3: string;
  toH3: string;
  roadRailByH3: ReadonlyMap<string, TacticalTransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const { fromH3, toH3, roadRailByH3, rubbleByH3 } = args;
  if (rubbleByH3?.[fromH3] || rubbleByH3?.[toH3]) return false;
  const ring = tacticalGridDiskNeighborsOrdered(fromH3);
  if (ring.indexOf(toH3) < 0) return false;
  return (
    tacticalTransportCellHasValidAnySideOverlay(fromH3, roadRailByH3) &&
    tacticalTransportCellHasValidAnySideOverlay(toH3, roadRailByH3)
  );
}

/**
 * Returns true when `currH3` may sit between `prevH3` and `nextH3` on a transport march (both legs satisfy march pair rules).
 *
 * Purpose: Interior corridor continuity using loose pair checks instead of head-only dual slots on `currH3`.
 * When to use: `tacticalLandMarchContinuity` non-blocking steps with `prevOfFrom` set; blocked transit witness paths.
 * Expected outcome: False when `prevH3 === nextH3` or either adjacent pair fails `tacticalTransportMarchAdjacentPairAllowsStep`.
 * Exceptions: None.
 */
export function tacticalTransportMarchInteriorContinuity(args: {
  prevH3: string;
  currH3: string;
  nextH3: string;
  roadRailByH3: ReadonlyMap<string, TacticalTransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const { prevH3, currH3, nextH3, roadRailByH3, rubbleByH3 } = args;
  if (prevH3 === nextH3) return false;
  return (
    tacticalTransportMarchAdjacentPairAllowsStep({
      fromH3: currH3,
      toH3: prevH3,
      roadRailByH3,
      rubbleByH3,
    }) &&
    tacticalTransportMarchAdjacentPairAllowsStep({
      fromH3: currH3,
      toH3: nextH3,
      roadRailByH3,
      rubbleByH3,
    })
  );
}

/**
 * Returns true when a land march may use a road/rail link on the **from** hex for this step (not rubble on either end).
 *
 * Purpose: **Head-only** edge test: the traversed side must be marked on `fromH3`; the neighbor’s reciprocal slot is ignored so unrelated edges on a road hex do not enable movement.
 * When to use: Land `enterCostForHex` override and infantry/armor spawn relaxation on bridge cells.
 * Expected outcome: False when either endpoint is rubble, `fromH3` has no mask row, `toH3` is not ring-1 from `fromH3`, or `roadSides`/`railSides` length differs from the `gridDisk(from,1)` ring length (avoids mis-indexing).
 * Exceptions: None.
 */
export function tacticalTransportEdgeActive(args: {
  fromH3: string;
  toH3: string;
  /** Keys are tactical H3; values are parallel `roadSides` / `railSides` arrays for that cell. */
  roadRailByH3: ReadonlyMap<string, TacticalTransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const { fromH3, toH3, roadRailByH3, rubbleByH3 } = args;
  if (rubbleByH3?.[fromH3] || rubbleByH3?.[toH3]) return false;
  const ring = tacticalGridDiskNeighborsOrdered(fromH3);
  const i = ring.indexOf(toH3);
  if (i < 0) return false;
  const masks = roadRailByH3.get(fromH3);
  if (!masks) return false;
  const { roadSides, railSides } = masks;
  if (roadSides.length !== ring.length || railSides.length !== ring.length) return false;
  return maskActiveAtSlot(masks, i);
}

/** §12.4 road-line effective movement budget multiplier (divide enter MPs by this value on a road-only transport step). */
export const TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER = 2.0 as const;

/** §12.4 rail-line effective movement budget multiplier (divide enter MPs by this value on a rail-marked transport step). */
export const TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER = 3.0 as const;

/**
 * Returns true when the **from** cell marks **road** on the side toward `toH3` (same rubble, adjacency, and length guards as `tacticalTransportEdgeActive`).
 *
 * Purpose: Split road vs rail for diagnostics; gameplay cost should use `tacticalTransportStepSpeedMultiplier` so combined edges prefer rail.
 * When to use: Unit tests and structured logs that list explicit mask hits.
 * Expected outcome: True iff `roadSides[slot]` at the resolved ring index and the mask row matches `gridDisk(from,1)` length.
 * Exceptions: None.
 */
export function tacticalTransportStepRoadActive(args: {
  fromH3: string;
  toH3: string;
  roadRailByH3: ReadonlyMap<string, TacticalTransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const { fromH3, toH3, roadRailByH3, rubbleByH3 } = args;
  if (rubbleByH3?.[fromH3] || rubbleByH3?.[toH3]) return false;
  const ring = tacticalGridDiskNeighborsOrdered(fromH3);
  const i = ring.indexOf(toH3);
  if (i < 0) return false;
  const masks = roadRailByH3.get(fromH3);
  if (!masks) return false;
  const { roadSides, railSides } = masks;
  if (roadSides.length !== ring.length || railSides.length !== ring.length) return false;
  return !!roadSides[i];
}

/**
 * Returns true when the **from** cell marks **rail** on the side toward `toH3` (same rubble, adjacency, and length guards as `tacticalTransportEdgeActive`).
 *
 * Purpose: Split road vs rail for diagnostics; gameplay cost should use `tacticalTransportStepSpeedMultiplier` so combined edges prefer rail.
 * When to use: Unit tests and structured logs that list explicit mask hits.
 * Expected outcome: True iff `railSides[slot]` at the resolved ring index and the mask row matches `gridDisk(from,1)` length.
 * Exceptions: None.
 */
export function tacticalTransportStepRailActive(args: {
  fromH3: string;
  toH3: string;
  roadRailByH3: ReadonlyMap<string, TacticalTransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const { fromH3, toH3, roadRailByH3, rubbleByH3 } = args;
  if (rubbleByH3?.[fromH3] || rubbleByH3?.[toH3]) return false;
  const ring = tacticalGridDiskNeighborsOrdered(fromH3);
  const i = ring.indexOf(toH3);
  if (i < 0) return false;
  const masks = roadRailByH3.get(fromH3);
  if (!masks) return false;
  const { roadSides, railSides } = masks;
  if (roadSides.length !== ring.length || railSides.length !== ring.length) return false;
  return !!railSides[i];
}

/**
 * Returns the §12.4 **effective budget multiplier** for a directed transport step `fromH3` → `toH3` (divide base transport enter MPs by this value).
 *
 * Purpose: Road lines scale effective budget by 2×, rail by 3×; when `fromH3` carries **any** rail side prefer rail multiplier, else **any** road side prefer road (march pair must already hold).
 * When to use: Land march enter cost after transport legality and base transport MP (plains or blocking-transport) are fixed.
 * Expected outcome: `1` when `tacticalTransportMarchAdjacentPairAllowsStep` is false; else rail multiplier if any `railSides` on `fromH3`, else road if any `roadSides`, else `1`.
 * Exceptions: None.
 */
export function tacticalTransportStepSpeedMultiplier(args: {
  fromH3: string;
  toH3: string;
  roadRailByH3: ReadonlyMap<string, TacticalTransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): number {
  if (!tacticalTransportMarchAdjacentPairAllowsStep(args)) return 1;
  const { fromH3, roadRailByH3 } = args;
  const masks = roadRailByH3.get(fromH3);
  if (!masks) return 1;
  const ring = tacticalGridDiskNeighborsOrdered(fromH3);
  const { railSides, roadSides } = masks;
  if (roadSides.length !== ring.length || railSides.length !== ring.length) return 1;
  for (let i = 0; i < ring.length; i++) {
    if (railSides[i]) return TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER;
  }
  for (let i = 0; i < ring.length; i++) {
    if (roadSides[i]) return TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER;
  }
  return 1;
}

/**
 * Returns true when both adjacent hexes head-mark the shared boundary for road/rail (symmetric link across the step).
 *
 * @deprecated Tactical march uses `tacticalTransportMarchAdjacentPairAllowsStep` (both cells any road/rail). Retained for strict slot-aligned diagnostics only.
 *
 * Purpose: Historical reciprocal slot test; blocked destinations previously required both head marks on the shared edge.
 * When to use: Rare strict edge-case tests; prefer march-pair helpers for gameplay-adjacent logic.
 * Expected outcome: True only when `tacticalTransportEdgeActive` holds for `fromH3`→`toH3` and `toH3`→`fromH3`.
 * Exceptions: None.
 */
export function tacticalTransportReciprocalBoundaryActive(args: {
  fromH3: string;
  toH3: string;
  roadRailByH3: ReadonlyMap<string, TacticalTransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  return (
    tacticalTransportEdgeActive({
      fromH3: args.fromH3,
      toH3: args.toH3,
      roadRailByH3: args.roadRailByH3,
      rubbleByH3: args.rubbleByH3,
    }) &&
    tacticalTransportEdgeActive({
      fromH3: args.toH3,
      toH3: args.fromH3,
      roadRailByH3: args.roadRailByH3,
      rubbleByH3: args.rubbleByH3,
    })
  );
}

/**
 * Returns true when `currH3` may be traversed as an **interior** corridor cell between `prevH3` and `nextH3`.
 *
 * Purpose: Transport continuity requires both the entry side (curr→prev) and exit side (curr→next) to be head-marked on
 * `currH3` with the same rubble/length rules as `tacticalTransportEdgeActive`, so a cheap “bridge” step cannot cut
 * through a cell that only carries a single marked edge.
 * When to use: Land march planning when deciding whether a transport plains-cost override may apply on an interior or goal step.
 * Expected outcome: False when `prevH3 === nextH3`, either adjacency fails, or either directed edge from `currH3` is inactive.
 * Exceptions: None.
 */
export function tacticalTransportInteriorContinuityOnCurr(args: {
  prevH3: string;
  currH3: string;
  nextH3: string;
  roadRailByH3: ReadonlyMap<string, TacticalTransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const { prevH3, currH3, nextH3, roadRailByH3, rubbleByH3 } = args;
  if (prevH3 === nextH3) return false;
  return (
    tacticalTransportEdgeActive({
      fromH3: currH3,
      toH3: prevH3,
      roadRailByH3,
      rubbleByH3,
    }) &&
    tacticalTransportEdgeActive({
      fromH3: currH3,
      toH3: nextH3,
      roadRailByH3,
      rubbleByH3,
    })
  );
}

/**
 * Returns true when `cellH3` has any road or rail side flag set and the cell is not rubble.
 *
 * Purpose: Ranged strikeable “infrastructure” parity with urban for cells that only carry transport masks.
 * When to use: `tacticalHasStrikeableInfrastructure` and AI legal-hex collection.
 * Expected outcome: False when masks absent, length mismatch, or rubble suppresses transport gameplay.
 * Exceptions: None.
 */
export function tacticalCellHasActiveTransportCorridor(args: {
  cellH3: string;
  roadSidesByH3?: Readonly<Record<string, readonly boolean[]>>;
  railSidesByH3?: Readonly<Record<string, readonly boolean[]>>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const { cellH3, roadSidesByH3, railSidesByH3, rubbleByH3 } = args;
  if (rubbleByH3?.[cellH3]) return false;
  const rs = roadSidesByH3?.[cellH3];
  const rl = railSidesByH3?.[cellH3];
  if (!rs && !rl) return false;
  const n = Math.max(rs?.length ?? 0, rl?.length ?? 0);
  if (n === 0) return false;
  for (let i = 0; i < n; i++) {
    if ((rs?.[i] ?? false) || (rl?.[i] ?? false)) return true;
  }
  return false;
}

/**
 * Returns true when infantry or armor may spawn on a cell that is normally blocked (e.g. water) but lies on a transport link into the footprint.
 *
 * Purpose: Bridge / causeway tiles inside the tactical parent without widening spawn to arbitrary open water.
 * When to use: `computeTacticalBattleSnapshot` placement after `tacticalLandUnitMayOccupyCellWithoutTransport` fails.
 * Expected outcome: True only when at least one footprint neighbor forms a march transport pair with `cellH3` (both cells any road/rail).
 * Exceptions: None.
 */
export function tacticalInfantryArmorSpawnAllowedViaTransport(args: {
  cellH3: string;
  childFootprint: ReadonlySet<string>;
  roadRailByH3: ReadonlyMap<string, TacticalTransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const { cellH3, childFootprint, roadRailByH3, rubbleByH3 } = args;
  for (const nb of tacticalGridDiskNeighborsOrdered(cellH3)) {
    if (!childFootprint.has(nb)) continue;
    if (
      tacticalTransportMarchAdjacentPairAllowsStep({
        fromH3: cellH3,
        toH3: nb,
        roadRailByH3,
        rubbleByH3,
      })
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Filters global road/rail overlay rows to a tactical footprint and normalizes parallel side arrays for gameplay reads.
 *
 * Purpose: Single place to align `roadSides` / `railSides` lengths before snapshot fields and `Map` construction for transport predicates.
 * When to use: `computeTacticalBattleSnapshot`, `refreshTacticalBattleTacticalTerrainFromGameDb`, and tests that synthesize transport masks.
 * Expected outcome: Optional `tacticalRoadSidesByH3` / `tacticalRailSidesByH3` records plus a `roadRailByH3` map suitable for transport predicates; empty map when no overlays hit the footprint.
 * Exceptions: Drops rows whose padded arrays would still disagree in length (malformed asset rows).
 */
export function tacticalFootprintTransportOverlayRecords(args: {
  childFootprint: ReadonlySet<string>;
  overlays: ReadonlyArray<{
    h3Index: string;
    roadSides: readonly boolean[];
    railSides: readonly boolean[];
  }>;
}): {
  tacticalRoadSidesByH3?: Record<string, readonly boolean[]>;
  tacticalRailSidesByH3?: Record<string, readonly boolean[]>;
  roadRailByH3: Map<string, TacticalTransportMasks>;
} {
  const road: Record<string, readonly boolean[]> = {};
  const rail: Record<string, readonly boolean[]> = {};
  const roadRailByH3 = new Map<string, TacticalTransportMasks>();
  for (const o of args.overlays) {
    if (!args.childFootprint.has(o.h3Index)) continue;
    const n = Math.max(o.roadSides.length, o.railSides.length);
    if (n === 0) continue;
    const roadSides =
      o.roadSides.length >= n
        ? [...o.roadSides]
        : [...o.roadSides, ...Array.from({ length: n - o.roadSides.length }, () => false)];
    const railSides =
      o.railSides.length >= n
        ? [...o.railSides]
        : [...o.railSides, ...Array.from({ length: n - o.railSides.length }, () => false)];
    if (roadSides.length !== railSides.length) continue;
    road[o.h3Index] = roadSides;
    rail[o.h3Index] = railSides;
    roadRailByH3.set(o.h3Index, { roadSides, railSides });
  }
  const has = roadRailByH3.size > 0;
  return {
    tacticalRoadSidesByH3: has ? road : undefined,
    tacticalRailSidesByH3: has ? rail : undefined,
    roadRailByH3,
  };
}
