/**
 * Tactical res4 transport (road/rail) edge detection for march planning.
 *
 * Purpose: Aligns gameplay with bundled `road_sides` / `rail_sides` masks: neighbor slot indices must match `gridDisk(h, 1)`
 * iteration order used when authoring terrain JSON.
 * When to use: `TacticalTerrainKindResolver.transportFromTo` and spawn passability when a land bridge exists.
 * Expected outcome: `tacticalRes4TransportEdgeActive` is true only when the **from** cell’s `roadSides`/`railSides` mark that edge’s slot (head-only) and neither cell is rubble; mask arrays must match the `gridDisk` ring length. March **continuity**
 * (including goal legs) composes these edges via `tacticalRes4TransportInteriorContinuityOnCurr` in `tacticalRes4LandMarchContinuity`.
 * Exceptions: `gridDisk` failures yield empty rings and false negatives.
 */

import { gridDisk } from 'h3-js';

export type TacticalRes4TransportMasks = {
  roadSides: readonly boolean[];
  railSides: readonly boolean[];
};

/**
 * Returns ordered res4 ring-1 neighbors of `fromH3` (excludes `fromH3`), or empty when H3 throws.
 *
 * Purpose: Stable neighbor list for indexing into `roadSides` / `rail_sides` arrays on the same cell.
 * When to use: `neighborSlotIndex` and transport spawn scans.
 * Expected outcome: Same iteration order as `neighborsInFootprint` in the tactical march planner for a single origin.
 * Exceptions: Swallows `gridDisk` errors and returns `[]`.
 */
export function res4GridDiskNeighborsOrdered(fromH3: string): string[] {
  try {
    return [...gridDisk(fromH3, 1)].filter((h) => h !== fromH3);
  } catch {
    return [];
  }
}

/**
 * Returns the side index on `fromH3` whose `gridDisk` neighbor equals `toH3`, or null when not adjacent.
 *
 * Purpose: Maps an ordered march step to the correct `roadSides[i]` / `railSides[i]` slot on the head cell.
 * When to use: `tacticalRes4TransportEdgeActive` and any helper that must align mask indices to ring neighbors.
 * Expected outcome: Integer in `[0, ring.length)` when `toH3` is a ring-1 neighbor; otherwise null.
 * Exceptions: None.
 */
export function neighborSlotIndex(fromH3: string, toH3: string): number | null {
  const ring = res4GridDiskNeighborsOrdered(fromH3);
  const i = ring.indexOf(toH3);
  return i >= 0 ? i : null;
}

function maskActiveAtSlot(masks: TacticalRes4TransportMasks | undefined, slot: number): boolean {
  if (!masks) return false;
  const { roadSides, railSides } = masks;
  if (slot < 0 || slot >= roadSides.length || slot >= railSides.length) return false;
  return !!(roadSides[slot] || railSides[slot]);
}

/**
 * Returns true when a land march may use a road/rail link on the **from** hex for this step (not rubble on either end).
 *
 * Purpose: **Head-only** edge test: the traversed side must be marked on `fromH3`; the neighbor’s reciprocal slot is ignored so unrelated edges on a road hex do not enable movement.
 * When to use: Land `enterCostForHex` override and infantry/armor spawn relaxation on bridge cells.
 * Expected outcome: False when either endpoint is rubble, `fromH3` has no mask row, `toH3` is not ring-1 from `fromH3`, or `roadSides`/`railSides` length differs from the `gridDisk(from,1)` ring length (avoids mis-indexing).
 * Exceptions: None.
 */
export function tacticalRes4TransportEdgeActive(args: {
  fromH3: string;
  toH3: string;
  /** Keys are res4 H3; values are parallel `roadSides` / `railSides` arrays for that cell. */
  roadRailByH3: ReadonlyMap<string, TacticalRes4TransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const { fromH3, toH3, roadRailByH3, rubbleByH3 } = args;
  if (rubbleByH3?.[fromH3] || rubbleByH3?.[toH3]) return false;
  const ring = res4GridDiskNeighborsOrdered(fromH3);
  const i = ring.indexOf(toH3);
  if (i < 0) return false;
  const masks = roadRailByH3.get(fromH3);
  if (!masks) return false;
  const { roadSides, railSides } = masks;
  if (roadSides.length !== ring.length || railSides.length !== ring.length) return false;
  return maskActiveAtSlot(masks, i);
}

/** §12.4 road-line effective movement budget multiplier (divide enter MPs by this value on a road-only transport step). */
export const TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER = 1.25 as const;

/** §12.4 rail-line effective movement budget multiplier (divide enter MPs by this value on a rail-marked transport step). */
export const TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER = 1.5 as const;

/**
 * Returns true when the **from** cell marks **road** on the side toward `toH3` (same rubble, adjacency, and length guards as `tacticalRes4TransportEdgeActive`).
 *
 * Purpose: Split road vs rail for diagnostics; gameplay cost should use `tacticalRes4TransportStepSpeedMultiplier` so combined edges prefer rail.
 * When to use: Unit tests and structured logs that list explicit mask hits.
 * Expected outcome: True iff `roadSides[slot]` at the resolved ring index and the mask row matches `gridDisk(from,1)` length.
 * Exceptions: None.
 */
export function tacticalRes4TransportStepRoadActive(args: {
  fromH3: string;
  toH3: string;
  roadRailByH3: ReadonlyMap<string, TacticalRes4TransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const { fromH3, toH3, roadRailByH3, rubbleByH3 } = args;
  if (rubbleByH3?.[fromH3] || rubbleByH3?.[toH3]) return false;
  const ring = res4GridDiskNeighborsOrdered(fromH3);
  const i = ring.indexOf(toH3);
  if (i < 0) return false;
  const masks = roadRailByH3.get(fromH3);
  if (!masks) return false;
  const { roadSides, railSides } = masks;
  if (roadSides.length !== ring.length || railSides.length !== ring.length) return false;
  return !!roadSides[i];
}

/**
 * Returns true when the **from** cell marks **rail** on the side toward `toH3` (same rubble, adjacency, and length guards as `tacticalRes4TransportEdgeActive`).
 *
 * Purpose: Split road vs rail for diagnostics; gameplay cost should use `tacticalRes4TransportStepSpeedMultiplier` so combined edges prefer rail.
 * When to use: Unit tests and structured logs that list explicit mask hits.
 * Expected outcome: True iff `railSides[slot]` at the resolved ring index and the mask row matches `gridDisk(from,1)` length.
 * Exceptions: None.
 */
export function tacticalRes4TransportStepRailActive(args: {
  fromH3: string;
  toH3: string;
  roadRailByH3: ReadonlyMap<string, TacticalRes4TransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const { fromH3, toH3, roadRailByH3, rubbleByH3 } = args;
  if (rubbleByH3?.[fromH3] || rubbleByH3?.[toH3]) return false;
  const ring = res4GridDiskNeighborsOrdered(fromH3);
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
 * Purpose: Road lines scale effective budget by 1.25×, rail by 1.5×; when **both** masks mark the same edge, rail wins (lower MP cost).
 * When to use: Land march enter cost after transport legality and base transport MP (plains or blocking-transport) are fixed.
 * Expected outcome: `1` when `tacticalRes4TransportEdgeActive` is false; else `TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER` if `railSides[slot]`, else `TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER` if `roadSides[slot]`, else `1`.
 * Exceptions: None.
 */
export function tacticalRes4TransportStepSpeedMultiplier(args: {
  fromH3: string;
  toH3: string;
  roadRailByH3: ReadonlyMap<string, TacticalRes4TransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): number {
  if (!tacticalRes4TransportEdgeActive(args)) return 1;
  const { fromH3, toH3, roadRailByH3 } = args;
  const ring = res4GridDiskNeighborsOrdered(fromH3);
  const i = ring.indexOf(toH3);
  if (i < 0) return 1;
  const masks = roadRailByH3.get(fromH3);
  if (!masks) return 1;
  const { railSides, roadSides } = masks;
  if (railSides[i]) return TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER;
  if (roadSides[i]) return TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER;
  return 1;
}

/**
 * Returns true when both adjacent hexes head-mark the shared boundary for road/rail (symmetric link across the step).
 *
 * Purpose: Blocked tactical destinations (armor `mountains`, infantry `water`, etc.) require reciprocal mask support so
 * entry is authorized on the destination cell as well as on the approach cell.
 * When to use: `landTransportPlainsEnterAllowed` when `toH3` is blocking without urban/rubble override.
 * Expected outcome: True only when `tacticalRes4TransportEdgeActive` holds for `fromH3`→`toH3` and `toH3`→`fromH3` (each cell
 * must have a valid mask row when required by those predicates).
 * Exceptions: None.
 */
export function tacticalRes4TransportReciprocalBoundaryActive(args: {
  fromH3: string;
  toH3: string;
  roadRailByH3: ReadonlyMap<string, TacticalRes4TransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  return (
    tacticalRes4TransportEdgeActive({
      fromH3: args.fromH3,
      toH3: args.toH3,
      roadRailByH3: args.roadRailByH3,
      rubbleByH3: args.rubbleByH3,
    }) &&
    tacticalRes4TransportEdgeActive({
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
 * `currH3` with the same rubble/length rules as `tacticalRes4TransportEdgeActive`, so a cheap “bridge” step cannot cut
 * through a cell that only carries a single marked edge.
 * When to use: Land march planning when deciding whether a transport plains-cost override may apply on an interior or goal step.
 * Expected outcome: False when `prevH3 === nextH3`, either adjacency fails, or either directed edge from `currH3` is inactive.
 * Exceptions: None.
 */
export function tacticalRes4TransportInteriorContinuityOnCurr(args: {
  prevH3: string;
  currH3: string;
  nextH3: string;
  roadRailByH3: ReadonlyMap<string, TacticalRes4TransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const { prevH3, currH3, nextH3, roadRailByH3, rubbleByH3 } = args;
  if (prevH3 === nextH3) return false;
  return (
    tacticalRes4TransportEdgeActive({
      fromH3: currH3,
      toH3: prevH3,
      roadRailByH3,
      rubbleByH3,
    }) &&
    tacticalRes4TransportEdgeActive({
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
 * When to use: `tacticalRes4HasStrikeableInfrastructure` and AI legal-hex collection.
 * Expected outcome: False when masks absent, length mismatch, or rubble suppresses transport gameplay.
 * Exceptions: None.
 */
export function tacticalRes4CellHasActiveTransportCorridor(args: {
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
 * When to use: `computeTacticalBattleSnapshot` placement after the baseline `isInfantryOrArmorTacticalSpawnCell` check fails.
 * Expected outcome: True only when at least one footprint neighbor shares an active transport edge with `cellH3`.
 * Exceptions: None.
 */
export function tacticalRes4InfantryArmorSpawnAllowedViaTransport(args: {
  cellH3: string;
  childFootprint: ReadonlySet<string>;
  roadRailByH3: ReadonlyMap<string, TacticalRes4TransportMasks>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const { cellH3, childFootprint, roadRailByH3, rubbleByH3 } = args;
  for (const nb of res4GridDiskNeighborsOrdered(cellH3)) {
    if (!childFootprint.has(nb)) continue;
    if (
      tacticalRes4TransportEdgeActive({
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
 * When to use: `computeTacticalBattleSnapshot`, `refreshTacticalBattleRes4TerrainFromGameDb`, and tests that synthesize transport masks.
 * Expected outcome: Optional `res4RoadSidesByH3` / `res4RailSidesByH3` records plus a `roadRailByH3` map suitable for `tacticalRes4TransportEdgeActive`; empty map when no overlays hit the footprint.
 * Exceptions: Drops rows whose padded arrays would still disagree in length (malformed asset rows).
 */
export function tacticalRes4FootprintTransportOverlayRecords(args: {
  childFootprint: ReadonlySet<string>;
  overlays: ReadonlyArray<{
    h3Index: string;
    roadSides: readonly boolean[];
    railSides: readonly boolean[];
  }>;
}): {
  res4RoadSidesByH3?: Record<string, readonly boolean[]>;
  res4RailSidesByH3?: Record<string, readonly boolean[]>;
  roadRailByH3: Map<string, TacticalRes4TransportMasks>;
} {
  const road: Record<string, readonly boolean[]> = {};
  const rail: Record<string, readonly boolean[]> = {};
  const roadRailByH3 = new Map<string, TacticalRes4TransportMasks>();
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
    res4RoadSidesByH3: has ? road : undefined,
    res4RailSidesByH3: has ? rail : undefined,
    roadRailByH3,
  };
}
