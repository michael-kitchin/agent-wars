/**
 * Land infantry/armor tactical march helpers: transport continuity and stateful shortest-path search.
 *
 * Purpose: Keeps `tacticalRes4MovementPlanner` under file-size limits while isolating road/rail corridor rules that depend on
 * the incoming hex (`prev`) as well as the current step head cell.
 * When to use: Only from `planTacticalRes4March` for `infantry` / `armor` unit rows with a `TacticalTerrainKindResolver`.
 * Expected outcome: Same paths/costs as a single-state Dijkstra when no transport overlay exists; with overlays, steps use
 * march pair rules (both endpoints any road/rail) and loose interior continuity instead of slot-aligned corridor masks only.
 * Exceptions: None; malformed H3 inputs yield empty neighbor lists via `gridDisk` catch paths.
 */

import {
  normalizeDbTerrainKindToTacticalCategory,
  tacticalEnterHexMovementCost,
  tacticalLandUnitMayOccupyCellWithoutTransport,
  type TacticalMovementCategory,
  type TacticalTerrainKindResolver,
} from './tacticalTerrainMovement';
import {
  popNumericPriorityMinHeap,
  pushNumericPriorityMinHeap,
  type NumericPriorityHeapEntry,
} from './numericPriorityMinHeap';
import {
  res4NeighborsInFootprint,
  type Res4FootprintNeighborLookup,
  tacticalRes4TransportMarchAdjacentPairAllowsStep,
  tacticalRes4TransportMarchInteriorContinuity,
  tacticalRes4TransportStepSpeedMultiplier,
  type TacticalRes4TransportMasks,
} from './tacticalRes4TransportLink';

/** Separator for land Dijkstra state keys (`hex` + predecessor hex); H3 indexes do not contain this character. */
const LAND_STATE_SEP = '\u0000';

/**
 * Encodes land march Dijkstra state as a single map key: current hex plus the hex we entered from (null at the origin state).
 *
 * Purpose: Distinguishes identical cells reached with different transport-continuity histories without allocating objects per heap push.
 * When to use: Stateful land march search and single-source within-budget reachability collectors.
 * Expected outcome: Round-trips with `parseLandStateKey`.
 * Exceptions: None.
 */
export function landStateKey(h: string, prev: string | null): string {
  return `${h}${LAND_STATE_SEP}${prev ?? ''}`;
}

/**
 * Decodes a `landStateKey` string into `{ h, prev }` for path reconstruction.
 *
 * Purpose: Reverses `landStateKey` after Dijkstra completes.
 * When to use: Rebuilding the cheapest land path from predecessor links, or aggregating best cost per hex in multi-sink searches.
 * Expected outcome: `prev` is null when the key’s predecessor segment is empty (origin).
 * Exceptions: None.
 */
export function parseLandStateKey(key: string): { h: string; prev: string | null } {
  const i = key.indexOf(LAND_STATE_SEP);
  if (i < 0) return { h: key, prev: null };
  const h = key.slice(0, i);
  const rest = key.slice(i + LAND_STATE_SEP.length);
  return { h, prev: rest.length > 0 ? rest : null };
}

/**
 * Returns true when the unit could not legally occupy `h` at base terrain cost (ignoring road/rail plains overrides).
 *
 * Purpose: Armor/water-style impassable cells need a stricter transport continuity rule on the **first** step onto a
 * transport link so a single marked edge cannot unlock an otherwise blocked interior tile unless a corridor continues through it.
 * When to use: `landTransportPlainsEnterAllowed` branching.
 * Expected outcome: False for urban/rubble (those use dedicated enter-cost rules first).
 * Exceptions: None.
 */
export function landTerrainBlocksWithoutTransport(
  unitTypeForMovement: string,
  terrain: TacticalTerrainKindResolver,
  h: string
): boolean {
  if (unitTypeForMovement !== 'infantry' && unitTypeForMovement !== 'armor') return false;
  return !tacticalLandUnitMayOccupyCellWithoutTransport(unitTypeForMovement, h, terrain);
}

/**
 * Legacy transport shim when `landTransportMarchContext` is absent: symmetric `transportFromTo` for blocked destinations.
 *
 * Purpose: Keeps rare test/legacy resolvers without road/rail maps aligned with reciprocal blocked-destination rules.
 * When to use: `classifyLandInfantryArmorEnterStep` only when `terrain.landTransportMarchContext` is undefined.
 * Expected outcome: Non-blocking `toH3` uses forward edge only; blocking `toH3` requires forward and return edges.
 * Exceptions: None.
 */
function legacyLandTransportPlainsEnterAllowed(args: {
  terrain: TacticalTerrainKindResolver;
  fromH3: string;
  toH3: string;
  unitTypeForMovement: string;
}): boolean {
  const { terrain, fromH3, toH3, unitTypeForMovement } = args;
  if (!terrain.transportFromTo?.(fromH3, toH3)) return false;
  if (!landTerrainBlocksWithoutTransport(unitTypeForMovement, terrain, toH3)) return true;
  return !!terrain.transportFromTo?.(toH3, fromH3);
}

/**
 * Returns true when infantry/armor may apply the transport plains enter-cost override for `fromH3` → `toH3` under continuity rules.
 *
 * Purpose: Non-blocking steps require `tacticalRes4TransportMarchAdjacentPairAllowsStep` (both endpoints any road/rail) plus
 * `tacticalRes4TransportMarchInteriorContinuity` when `prevOfFrom` is set. **Blocking** destinations use the same adjacent pair
 * rule (symmetric). **Transit** onto a blocking non-goal cell needs a witness neighbor `w` with march interior continuity on `toH3`.
 * When to use: Land march `enterCost` after rubble/urban fast paths.
 * Expected outcome: Transport plains apply only when these predicates pass; blocked goals fail when either endpoint lacks overlay bits.
 * Exceptions: None.
 */
function landTransportPlainsEnterAllowed(args: {
  unitTypeForMovement: string;
  fromH3: string;
  toH3: string;
  prevOfFrom: string | null;
  marchGoalH3: string;
  terrain: TacticalTerrainKindResolver;
  roadRailByH3: ReadonlyMap<string, TacticalRes4TransportMasks>;
  rubbleByH3: Readonly<Record<string, boolean>>;
  footprintNeighborsOf: (h: string) => readonly string[];
}): boolean {
  const blocking = landTerrainBlocksWithoutTransport(args.unitTypeForMovement, args.terrain, args.toH3);
  const { prevOfFrom, marchGoalH3, fromH3, toH3 } = args;
  const { roadRailByH3, rubbleByH3 } = args;
  if (!blocking) {
    if (
      !tacticalRes4TransportMarchAdjacentPairAllowsStep({
        fromH3,
        toH3,
        roadRailByH3,
        rubbleByH3,
      })
    ) {
      return false;
    }
    if (prevOfFrom === null) return true;
    return tacticalRes4TransportMarchInteriorContinuity({
      prevH3: prevOfFrom,
      currH3: fromH3,
      nextH3: toH3,
      roadRailByH3,
      rubbleByH3,
    });
  }
  if (
    !tacticalRes4TransportMarchAdjacentPairAllowsStep({
      fromH3,
      toH3,
      roadRailByH3,
      rubbleByH3,
    })
  ) {
    return false;
  }
  if (toH3 === marchGoalH3) return true;
  for (const w of args.footprintNeighborsOf(toH3)) {
    if (w === fromH3) continue;
    if (
      tacticalRes4TransportMarchInteriorContinuity({
        prevH3: fromH3,
        currH3: toH3,
        nextH3: w,
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
 * Returns true when land Dijkstra may relax edge `h` → `nb` after arriving at `h` from `prev`.
 *
 * Purpose: Prevents **transiting** through a hex that is impassable without transport (e.g. armor in `mountains`, infantry in `water`)
 * unless road/rail masks on `h` admit a corridor `prev → h → nb`. March start and goal cells skip this check so blocked destinations
 * still follow `landTransportPlainsEnterAllowed` / first-step witness rules only.
 * When to use: Neighbor expansion inside `planInfantryArmorLandContinuityMarch` for `infantry` / `armor` only; also single-source
 * reachability collectors that must match that search.
 * Expected outcome: False when `h` is blocked, `prev` is set, `h` is neither start nor goal, and `tacticalRes4TransportMarchInteriorContinuity` fails (or legacy `transportFromTo` lacks both legs).
 * Exceptions: None.
 */
export function blockedHexLandTransitAllowsRelaxation(args: {
  unitTypeForMovement: string;
  terrain: TacticalTerrainKindResolver;
  h: string;
  prev: string | null;
  nb: string;
  marchStartH3: string;
  marchGoalH3: string;
}): boolean {
  const { unitTypeForMovement, terrain, h, prev, nb, marchStartH3, marchGoalH3 } = args;
  if (unitTypeForMovement !== 'infantry' && unitTypeForMovement !== 'armor') return true;
  if (prev == null) return true;
  if (h === marchStartH3 || h === marchGoalH3) return true;
  if (!landTerrainBlocksWithoutTransport(unitTypeForMovement, terrain, h)) return true;
  const ctx = terrain.landTransportMarchContext;
  if (ctx != null) {
    return tacticalRes4TransportMarchInteriorContinuity({
      prevH3: prev,
      currH3: h,
      nextH3: nb,
      roadRailByH3: ctx.roadRailByH3,
      rubbleByH3: ctx.rubbleByH3,
    });
  }
  return !!(terrain.transportFromTo?.(h, prev) && terrain.transportFromTo?.(h, nb));
}

/**
 * Returns §12.4 movement points for one **authorized** transport step after base transport MPs and road/rail budget scaling.
 *
 * Purpose: Single formula for transport enter pricing shared by `classifyLandInfantryArmorEnterStep` and legacy `enterCostForHex` shims.
 * When to use: Only when continuity / reciprocal rules already allow transport pricing for `fromH3` → `toH3`.
 * Expected outcome: Blocking destinations use infantry **1** / armor **2** base MPs; non-blocking steps use §12.4 cost for
 * `tacticalCategoryForDestination`, except **urban** destinations use plains-equivalent base so armor stays finite on harsh kinds;
 * result divides by `tacticalRes4TransportStepSpeedMultiplier` when `landTransportMarchContext` is present, else multiplier **1** (legacy).
 * Exceptions: None.
 */
export function landTransportStepMovementPointsAfterAuthorization(args: {
  unitTypeForMovement: string;
  fromH3: string;
  toH3: string;
  blockingDestination: boolean;
  terrain: TacticalTerrainKindResolver;
  /** §12.4 category for `toH3`; ignored when `blockingDestination` is true (fixed blocking bases apply). */
  tacticalCategoryForDestination: TacticalMovementCategory;
  /**
   * When true, non-blocking base MPs use plains-equivalent §12.4 costs so urban infrastructure destinations remain finite for armor on
   * mountain-class kinds with urban overlay.
   */
  isUrbanDestination: boolean;
}): number {
  const {
    unitTypeForMovement,
    fromH3,
    toH3,
    blockingDestination,
    terrain,
    tacticalCategoryForDestination,
    isUrbanDestination,
  } = args;
  const baseTransportMp = blockingDestination
    ? unitTypeForMovement === 'armor'
      ? 2
      : 1
    : isUrbanDestination
      ? tacticalEnterHexMovementCost(unitTypeForMovement, 'plains')
      : tacticalEnterHexMovementCost(unitTypeForMovement, tacticalCategoryForDestination);
  const ctx = terrain.landTransportMarchContext;
  const mult =
    ctx != null
      ? tacticalRes4TransportStepSpeedMultiplier({
          fromH3,
          toH3,
          roadRailByH3: ctx.roadRailByH3,
          rubbleByH3: ctx.rubbleByH3,
        })
      : 1;
  return baseTransportMp / mult;
}

/**
 * Stable labels for which rule produced the final infantry/armor enter cost on a single res4 step.
 *
 * Contract: Diagnostic-only; matches `classifyLandInfantryArmorEnterStep` branches.
 * When to use: Debug logs and tests that assert mountain steps use transport vs urban vs base costs.
 * Expected outcome: `transport_plains` / `transport_blocking` when the road/rail continuity bundle (or legacy `transportFromTo`) authorizes transport pricing.
 * Exceptions: None.
 */
export type LandInfantryArmorEnterAppliedReason =
  | 'rubble'
  | 'urban'
  | 'transport_plains'
  | 'transport_blocking'
  | 'base';

/**
 * Read-only explanation of one land march step `fromH3` → `toH3` for infantry/armor (same inputs as `landInfantryArmorEnterCost`).
 *
 * Contract: `appliedCost` matches `landInfantryArmorEnterCost` for the same arguments; safe to call from logging without mutating state.
 * When to use: `debug.log` triage for “why did armor cross mountain?” and unit tests on transport vs urban overrides.
 * Expected outcome: `transportEdgeActive` matches march pair (`fromH3`→`toH3`, both cells any road/rail). `transportContinuityAllowed`
 * follows `landTransportPlainsEnterAllowed` / legacy shim. Legacy snapshots without `landTransportMarchContext` use forward
 * `transportFromTo` for non-blocking `toH3` and both directions for blocking `toH3`.
 * Exceptions: None.
 */
export type LandInfantryArmorEnterStepClassification = {
  appliedCost: number;
  appliedReason: LandInfantryArmorEnterAppliedReason;
  effectiveKindRaw: string;
  tacticalCategory: TacticalMovementCategory;
  baseEnterCost: number;
  urbanOverride: boolean;
  rubbleOverride: boolean;
  transportEdgeActive: boolean;
  transportContinuityAllowed: boolean;
  blockingTerrainWithoutTransport: boolean;
  /**
   * §12.4 road/rail effective budget multiplier for this step (`1`, `2`, or `3`); `1` when the step is not priced as transport
   * or legacy snapshots lack mask rows (no speedup). Enter MPs equal base transport MPs divided by this value.
   */
  transportEffectiveBudgetMultiplier: number;
};

/**
 * Classifies a single infantry/armor land enter for diagnostics; `appliedCost` is the march planner’s authoritative step cost.
 *
 * Purpose: Single implementation shared by `landInfantryArmorEnterCost` and structured logging so cost and explanations cannot drift.
 * When to use: Any time code needs terrain category, transport flags, or rule label for the step, not only the numeric cost.
 * Expected outcome: Transport steps use terrain-native (or plains-equivalent for urban) non-blocking base MPs, or blocking-transport
 * base MPs, divided by road (2.0) / rail (3.0) multipliers when mask rows exist.
 * Exceptions: None.
 */
export function classifyLandInfantryArmorEnterStep(args: {
  toH3: string;
  unitTypeForMovement: string;
  terrain: TacticalTerrainKindResolver;
  fromH3: string;
  prevOfFrom: string | null;
  marchGoalH3: string;
  res4Set: ReadonlySet<string>;
  /** Precomputed footprint adjacency; when omitted, falls back to `res4NeighborsInFootprint` per step. */
  footprintNeighbors?: Res4FootprintNeighborLookup;
}): LandInfantryArmorEnterStepClassification {
  const { toH3, unitTypeForMovement, terrain, fromH3, prevOfFrom, marchGoalH3, res4Set } = args;
  const neighborsOf = args.footprintNeighbors ?? ((h: string) => res4NeighborsInFootprint(h, res4Set));
  const raw = terrain.effectiveKindForRes4Hex(toH3);
  const cat = normalizeDbTerrainKindToTacticalCategory(raw, terrain.parentTerrain);
  const base = tacticalEnterHexMovementCost(unitTypeForMovement, cat);
  const ctx = terrain.landTransportMarchContext;
  const rubbleOverride = !!terrain.isRubbleRes4?.(toH3);
  const urbanOverride = !!terrain.isUrbanRes4?.(toH3);
  const blockingDestination =
    !rubbleOverride && !urbanOverride && landTerrainBlocksWithoutTransport(unitTypeForMovement, terrain, toH3);
  const transportEdgeActive =
    ctx != null
      ? tacticalRes4TransportMarchAdjacentPairAllowsStep({
          fromH3,
          toH3,
          roadRailByH3: ctx.roadRailByH3,
          rubbleByH3: ctx.rubbleByH3,
        })
      : blockingDestination
        ? !!(terrain.transportFromTo?.(fromH3, toH3) && terrain.transportFromTo?.(toH3, fromH3))
        : !!terrain.transportFromTo?.(fromH3, toH3);
  const transportContinuityAllowed =
    ctx != null
      ? landTransportPlainsEnterAllowed({
          unitTypeForMovement,
          fromH3,
          toH3,
          prevOfFrom,
          marchGoalH3,
          terrain,
          roadRailByH3: ctx.roadRailByH3,
          rubbleByH3: ctx.rubbleByH3,
          footprintNeighborsOf: neighborsOf,
        })
      : legacyLandTransportPlainsEnterAllowed({ terrain, fromH3, toH3, unitTypeForMovement });
  const blockingTerrainWithoutTransport = blockingDestination;

  if (rubbleOverride) {
    return {
      appliedCost: 2,
      appliedReason: 'rubble',
      effectiveKindRaw: raw,
      tacticalCategory: cat,
      baseEnterCost: base,
      urbanOverride: false,
      rubbleOverride: true,
      transportEdgeActive,
      transportContinuityAllowed: false,
      blockingTerrainWithoutTransport: false,
      transportEffectiveBudgetMultiplier: 1,
    };
  }
  const useTransport = transportContinuityAllowed;
  if (urbanOverride && !useTransport) {
    return {
      appliedCost: 1,
      appliedReason: 'urban',
      effectiveKindRaw: raw,
      tacticalCategory: cat,
      baseEnterCost: base,
      urbanOverride: true,
      rubbleOverride: false,
      transportEdgeActive,
      transportContinuityAllowed,
      blockingTerrainWithoutTransport: false,
      transportEffectiveBudgetMultiplier: 1,
    };
  }
  const transportEffectiveBudgetMultiplier =
    useTransport && ctx != null
      ? tacticalRes4TransportStepSpeedMultiplier({
          fromH3,
          toH3,
          roadRailByH3: ctx.roadRailByH3,
          rubbleByH3: ctx.rubbleByH3,
        })
      : 1;
  const appliedCost = useTransport
    ? landTransportStepMovementPointsAfterAuthorization({
        unitTypeForMovement,
        fromH3,
        toH3,
        blockingDestination,
        terrain,
        tacticalCategoryForDestination: cat,
        isUrbanDestination: urbanOverride,
      })
    : base;
  return {
    appliedCost,
    appliedReason: useTransport
      ? blockingDestination
        ? 'transport_blocking'
        : 'transport_plains'
      : 'base',
    effectiveKindRaw: raw,
    tacticalCategory: cat,
    baseEnterCost: base,
    urbanOverride: false,
    rubbleOverride: false,
    transportEdgeActive,
    transportContinuityAllowed,
    blockingTerrainWithoutTransport,
    transportEffectiveBudgetMultiplier: useTransport ? transportEffectiveBudgetMultiplier : 1,
  };
}

/**
 * Computes §12.4 land enter cost for infantry/armor with optional transport continuity context from the snapshot.
 *
 * Purpose: Matches Dijkstra edge relaxation and first-stop truncation so both agree on transport overrides.
 * When to use: Exported for `planTacticalRes4March` land branch (search + budget truncation).
 * Expected outcome: Transport pricing matches `classifyLandInfantryArmorEnterStep` (including road/rail speedup and blocking-transport base MPs).
 * Exceptions: None.
 */
export function landInfantryArmorEnterCost(args: {
  toH3: string;
  unitTypeForMovement: string;
  terrain: TacticalTerrainKindResolver;
  fromH3: string;
  prevOfFrom: string | null;
  marchGoalH3: string;
  res4Set: ReadonlySet<string>;
  /** Precomputed footprint adjacency; when omitted, falls back to `res4NeighborsInFootprint` per step. */
  footprintNeighbors?: Res4FootprintNeighborLookup;
}): number {
  return classifyLandInfantryArmorEnterStep(args).appliedCost;
}

/**
 * Builds compact per-step “category→reason” tokens along a planned land path for debug logs (elided when long).
 *
 * Purpose: Answers “why was this mountain step legal?” without trace-level planner dumps.
 * When to use: After a reachable `planTacticalRes4March` land result, alongside `terrainKindsAlongPath`.
 * Expected outcome: One token per enter step (`path.length - 1`), same elision pattern as terrain kind previews (~7 … ~6).
 * Exceptions: Returns `null` when `path` is missing or shorter than two cells.
 */
export function summarizeLandMarchStepLegalityAlongPath(args: {
  path: readonly string[] | null | undefined;
  unitTypeForMovement: string;
  terrain: TacticalTerrainKindResolver;
  marchGoalH3: string;
  res4Set: ReadonlySet<string>;
}): string | null {
  const { path, unitTypeForMovement, terrain, marchGoalH3, res4Set } = args;
  if (!path || path.length < 2) return null;
  const tokens: string[] = [];
  for (let i = 1; i < path.length; i++) {
    const c = classifyLandInfantryArmorEnterStep({
      toH3: path[i]!,
      unitTypeForMovement,
      terrain,
      fromH3: path[i - 1]!,
      prevOfFrom: i >= 2 ? path[i - 2]! : null,
      marchGoalH3,
      res4Set,
    });
    tokens.push(`${c.tacticalCategory}→${c.appliedReason}`);
  }
  if (tokens.length <= 14) return tokens.join(',');
  return `${tokens.slice(0, 7).join(',')}…${tokens.slice(-6).join(',')}`;
}

/**
 * JSON-friendly row for one enter step in `debug.log` (maps a path segment to transport flags and rule reason).
 *
 * Contract: `appliedCost` is null when the underlying step cost is not finite so log serializers never emit `Infinity`.
 * When to use: `tacticalMarchPlan ok` diagnostics alongside `stepLegalityAlongPath` token strings.
 * Expected outcome: For `transport_plains` steps, both transport flags are typically true; rubble steps bypass transport; urban steps
 * use transport pricing only when `transportContinuityAllowed` is true.
 * Exceptions: None.
 */
export type LandMarchStepLegalityDetailLog = {
  fromH3: string;
  toH3: string;
  appliedReason: LandInfantryArmorEnterAppliedReason;
  tacticalCategory: TacticalMovementCategory;
  transportEdgeActive: boolean;
  transportContinuityAllowed: boolean;
  blockingTerrainWithoutTransport: boolean;
  /** Same meaning as `LandInfantryArmorEnterStepClassification.transportEffectiveBudgetMultiplier` for this step. */
  transportEffectiveBudgetMultiplier: number;
  appliedCost: number | null;
};

/**
 * Builds per-step legality detail objects for every enter along a planned land path (infantry/armor).
 *
 * Purpose: Lets `debug.log` list exact `fromH3`/`toH3` pairs with transport edge vs continuity for screenshot correlation.
 * When to use: Only from main-process march validation logging after a reachable land plan.
 * Expected outcome: Length `path.length - 1` when `path` is valid; each row matches `classifyLandInfantryArmorEnterStep` for that step.
 * Exceptions: Returns `null` when `path` is missing or shorter than two cells.
 */
export function buildLandMarchStepLegalityDetailAlongPath(args: {
  path: readonly string[] | null | undefined;
  unitTypeForMovement: string;
  terrain: TacticalTerrainKindResolver;
  marchGoalH3: string;
  res4Set: ReadonlySet<string>;
}): LandMarchStepLegalityDetailLog[] | null {
  const { path, unitTypeForMovement, terrain, marchGoalH3, res4Set } = args;
  if (!path || path.length < 2) return null;
  const out: LandMarchStepLegalityDetailLog[] = [];
  for (let i = 1; i < path.length; i++) {
    const c = classifyLandInfantryArmorEnterStep({
      toH3: path[i]!,
      unitTypeForMovement,
      terrain,
      fromH3: path[i - 1]!,
      prevOfFrom: i >= 2 ? path[i - 2]! : null,
      marchGoalH3,
      res4Set,
    });
    out.push({
      fromH3: path[i - 1]!,
      toH3: path[i]!,
      appliedReason: c.appliedReason,
      tacticalCategory: c.tacticalCategory,
      transportEdgeActive: c.transportEdgeActive,
      transportContinuityAllowed: c.transportContinuityAllowed,
      blockingTerrainWithoutTransport: c.blockingTerrainWithoutTransport,
      transportEffectiveBudgetMultiplier: c.transportEffectiveBudgetMultiplier,
      appliedCost: Number.isFinite(c.appliedCost) ? c.appliedCost : null,
    });
  }
  return out;
}

/**
 * Reconstructs the hex path from land state-space parent pointers.
 *
 * Purpose: Converts `(hex,prev)` predecessors into `[fromH3, …, toH3]` for previews and budget truncation.
 * When to use: After land Dijkstra finds a finite `goalKey`.
 * Expected outcome: Includes both endpoints when consistent; otherwise `null`.
 * Exceptions: None.
 */
function reconstructLandPath(
  parent: Map<string, string | null>,
  fromH3: string,
  toH3: string,
  goalKey: string
): string[] | null {
  const rev: string[] = [];
  let cur: string | null | undefined = goalKey;
  while (cur != null) {
    const { h } = parseLandStateKey(cur);
    rev.push(h);
    if (h === fromH3) break;
    cur = parent.get(cur) ?? null;
  }
  if (rev.length === 0 || rev[rev.length - 1] !== fromH3) return null;
  const path = rev.reverse();
  if (path[path.length - 1] !== toH3) return null;
  return path;
}

/**
 * Runs stateful Dijkstra for infantry/armor land marches with transport continuity and returns the cheapest path if any.
 *
 * Purpose: Encapsulates expanded search state `(hex, prevHex)` so the main planner file stays smaller.
 * When to use: `planTacticalRes4March` after validating footprint membership.
 * Expected outcome: `null` when no finite-cost route exists; otherwise total cost matches summing `landInfantryArmorEnterCost` along the path. Search may omit relaxations that `landInfantryArmorEnterCost` would score on paper when the current hex is a blocked transit cell without paired transport on that hex.
 * Exceptions: None.
 */
export function planInfantryArmorLandContinuityMarch(args: {
  fromH3: string;
  toH3: string;
  res4Set: ReadonlySet<string>;
  unitTypeForMovement: string;
  terrain: TacticalTerrainKindResolver;
  /** Precomputed footprint adjacency; when omitted, falls back to `res4NeighborsInFootprint` per state. */
  footprintNeighbors?: Res4FootprintNeighborLookup;
}): { path: string[]; totalCost: number } | null {
  const { fromH3, toH3, res4Set, unitTypeForMovement, terrain } = args;
  const neighborsOf = args.footprintNeighbors ?? ((h: string) => res4NeighborsInFootprint(h, res4Set));
  const distLand = new Map<string, number>();
  const parentLand = new Map<string, string | null>();
  const heapLand: NumericPriorityHeapEntry<string>[] = [];
  const startKey = landStateKey(fromH3, null);
  distLand.set(startKey, 0);
  parentLand.set(startKey, null);
  pushNumericPriorityMinHeap(heapLand, startKey, 0);
  while (heapLand.length > 0) {
    const node = popNumericPriorityMinHeap(heapLand);
    if (!node) break;
    const { payload: key, d } = node;
    if (d !== distLand.get(key)) continue;
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
          marchGoalH3: toH3,
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
        marchGoalH3: toH3,
        res4Set,
        footprintNeighbors: neighborsOf,
      });
      if (!Number.isFinite(w) || w <= 0) continue;
      const nd = d + w;
      const nk = landStateKey(nb, h);
      const prevD = distLand.get(nk);
      if (prevD === undefined || nd < prevD) {
        distLand.set(nk, nd);
        parentLand.set(nk, key);
        pushNumericPriorityMinHeap(heapLand, nk, nd);
      }
    }
  }
  let bestGoalKey: string | undefined;
  let total = Infinity;
  for (const [k, v] of distLand) {
    if (parseLandStateKey(k).h !== toH3) continue;
    if (v < total) {
      total = v;
      bestGoalKey = k;
    }
  }
  if (bestGoalKey === undefined || !Number.isFinite(total)) return null;
  const path = reconstructLandPath(parentLand, fromH3, toH3, bestGoalKey);
  if (!path || path.length < 2) return null;
  return { path, totalCost: total };
}
