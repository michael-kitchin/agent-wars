/**
 * One battle march step, classified as a normal priced step, a terrain-bonus stop, or blocked.
 *
 * Purpose: The planner, the beat search, Best Options, and the march tooltip must agree on when the terrain bonus
 * applies. Today's step price is always tried first, so roads, rails, urban entry, seaports, and weather keep their
 * rules and the bonus only opens a step those rules refuse.
 * When to use: Any code that needs a naval step cost or needs to know whether a step is a terrain-bonus stop.
 * Expected outcome: Pure results with no logging and no I/O.
 * Exceptions: None.
 */

import {
  blockedHexLandTransitAllowsRelaxation,
  landInfantryArmorEnterCost,
} from './tacticalLandMarchContinuity';
import {
  isNavalTacticalCellNavigable,
  nativeTacticalTerrainKindIsWaterOrCoastalForNavalRouting,
  normalizeDbTerrainKindToTacticalCategory,
  type TacticalMovementCategory,
  type TacticalTerrainKindResolver,
} from './tacticalTerrainMovement';
import type { TacticalFootprintNeighborLookup } from './tacticalTransportLink';
import type { WeatherState } from './weatherBonusTypes';

/**
 * Movement cost for a naval unit to step from `fromH3` into `toH3` (§12.4 naval footprint rules).
 *
 * Purpose: Single implementation shared by naval search, the beat search, and tactical spawn checks so “navigable”
 * matches “can leave this cell”.
 * When to use: Naval step pricing, and `tacticalNavalHasMovableNeighborInFootprint` when filtering snapshot spawns.
 * Expected outcome: `1` for a legal enter; `Infinity` when the destination is not navigable or when the move is adjacent land-berth→land-berth seaport (both endpoints lack native water/coastal kinds even if `is_seaport` is set on channel tiles).
 * Exceptions: None; `fromH3` null skips the seaport adjacency guard (unused by pathfinding today).
 */
export function tacticalNavalEnterNeighborCost(
  fromH3: string | null,
  toH3: string,
  terrain: TacticalTerrainKindResolver
): number {
  if (terrain.isUrbanTactical?.(toH3) || terrain.isRubbleTactical?.(toH3)) {
    return Infinity;
  }
  const resolved = terrain.effectiveKindForTacticalHex(toH3);
  const seaportTo = terrain.isSeaportTactical?.(toH3) ?? false;
  if (
    !isNavalTacticalCellNavigable({
      resolvedKindForCell: resolved,
      parentTerrain: terrain.parentTerrain,
      parentTerrainKind: terrain.parentTerrainKind,
      isSeaportCell: seaportTo,
    })
  ) {
    return Infinity;
  }
  if (seaportTo && fromH3 != null && (terrain.isSeaportTactical?.(fromH3) ?? false)) {
    const fromResolved = terrain.effectiveKindForTacticalHex(fromH3);
    if (
      !nativeTacticalTerrainKindIsWaterOrCoastalForNavalRouting(fromResolved) &&
      !nativeTacticalTerrainKindIsWaterOrCoastalForNavalRouting(resolved)
    ) {
      return Infinity;
    }
  }
  return 1;
}

/**
 * Inputs shared by every step check in one battle march.
 *
 * Purpose: Parameter object, so the beat search and the reachability lists pass one value per march instead of
 * repeating terrain, footprint, and weather arguments per step.
 * When to use: `classifyTacticalMarchStep` and `collectTerrainBonusStopsFromReached`.
 * Expected outcome: Same meaning as the matching `planTacticalMarch` arguments.
 * Exceptions: None.
 */
export type TacticalMarchStepContext = {
  readonly terrain: TacticalTerrainKindResolver;
  /** Movement row from `tacticalMovementUnitTypeForPathfinding`: `infantry`, `armor`, or `naval`. */
  readonly moveType: string;
  readonly tacticalSet: ReadonlySet<string>;
  /** Origin of the whole march; the land transit guard never applies there. */
  readonly marchStartH3: string;
  /** Goal of the whole march; the land transit guard never applies there. Reachability lists pass a sentinel. */
  readonly marchGoalH3: string;
  readonly footprintNeighbors?: TacticalFootprintNeighborLookup;
  readonly weatherEnabled?: boolean;
  readonly weather?: WeatherState | null;
  readonly weatherTags?: readonly WeatherState[] | null;
  /**
   * Category from `terrainBonusMarchCategoryForMover`.
   *
   * Contract: `null` or omitted means no terrain-bonus stops.
   * When to use: Pass the resolved category for the moving sub-unit.
   * Expected outcome: Steps into a non-urban, non-rubble cell of this category that today's rules refuse become stops.
   * Exceptions: None.
   */
  readonly terrainBonusCategory?: TacticalMovementCategory | null;
};

/**
 * How one march step may be taken.
 *
 * Contract: `normal` carries today's finite, positive cost. `terrainBonusStop` spends the rest of the beat and stops
 * the unit. `blocked` may not be taken.
 * When to use: Return type of `classifyTacticalMarchStep`.
 * Expected outcome: Exactly one kind per step.
 * Exceptions: None.
 */
export type TacticalMarchStepClass =
  | { readonly kind: 'normal'; readonly cost: number }
  | { readonly kind: 'terrainBonusStop' }
  | { readonly kind: 'blocked' };

/**
 * Prices one step under today's rules, with no terrain bonus.
 *
 * Purpose: Matches what the land search and the naval search relax, including the land transit guard.
 * When to use: Only from `classifyTacticalMarchStep`.
 * Expected outcome: A finite positive cost, or `Infinity` when today's rules refuse the step.
 * Exceptions: None.
 */
function tacticalMarchStepCostWithoutBonus(
  ctx: TacticalMarchStepContext,
  step: { readonly fromH3: string; readonly prevH3: string | null; readonly toH3: string }
): number {
  const { terrain, moveType } = ctx;
  if (moveType === 'naval') return tacticalNavalEnterNeighborCost(step.fromH3, step.toH3, terrain);
  if (moveType !== 'infantry' && moveType !== 'armor') return Infinity;
  if (
    !blockedHexLandTransitAllowsRelaxation({
      unitTypeForMovement: moveType,
      terrain,
      h: step.fromH3,
      prev: step.prevH3,
      nb: step.toH3,
      marchStartH3: ctx.marchStartH3,
      marchGoalH3: ctx.marchGoalH3,
    })
  ) {
    return Infinity;
  }
  return landInfantryArmorEnterCost({
    toH3: step.toH3,
    unitTypeForMovement: moveType,
    terrain,
    fromH3: step.fromH3,
    prevOfFrom: step.prevH3,
    marchGoalH3: ctx.marchGoalH3,
    tacticalSet: ctx.tacticalSet,
    footprintNeighbors: ctx.footprintNeighbors,
    weatherEnabled: ctx.weatherEnabled,
    weather: ctx.weather,
    weatherTags: ctx.weatherTags,
  });
}

/**
 * Returns true when `toH3` is a cell the terrain bonus lets this mover stop on.
 *
 * Purpose: Urban cells, rubble, and naval seaport cells keep their own rules, so only plain terrain of the bonus
 * category qualifies.
 * When to use: `classifyTacticalMarchStep` after today's price refused the step, and battle tools that must not move a
 * destination the mover can reach through such a stop.
 * Expected outcome: True when a category is set, the cell is not urban or rubble, is not a seaport for naval, and its
 * movement category equals the bonus category.
 * Exceptions: None.
 */
export function cellAllowsTerrainBonusStop(
  ctx: Pick<TacticalMarchStepContext, 'terrain' | 'moveType' | 'terrainBonusCategory'>,
  toH3: string
): boolean {
  const category = ctx.terrainBonusCategory;
  if (category == null) return false;
  const { terrain } = ctx;
  if (terrain.isUrbanTactical?.(toH3) || terrain.isRubbleTactical?.(toH3)) return false;
  if (ctx.moveType === 'naval' && terrain.isSeaportTactical?.(toH3)) return false;
  return normalizeDbTerrainKindToTacticalCategory(terrain.effectiveKindForTacticalHex(toH3), terrain.parentTerrain) === category;
}

/**
 * Classifies one march step from `fromH3` (entered from `prevH3`) into `toH3`.
 *
 * Purpose: The single decision behind terrain-bonus movement. A step today's rules price is always `normal`, which is
 * what keeps roads and rails fast through blocked terrain.
 * When to use: Beat search relaxation, Best Options stop cells, and the march tooltip.
 * Expected outcome: `normal` with today's cost when that cost is finite and positive; otherwise `terrainBonusStop` when
 * the destination qualifies; otherwise `blocked`.
 * Exceptions: None.
 */
export function classifyTacticalMarchStep(
  ctx: TacticalMarchStepContext,
  step: { readonly fromH3: string; readonly prevH3: string | null; readonly toH3: string }
): TacticalMarchStepClass {
  const cost = tacticalMarchStepCostWithoutBonus(ctx, step);
  if (Number.isFinite(cost) && cost > 0) return { kind: 'normal', cost };
  return cellAllowsTerrainBonusStop(ctx, step.toH3) ? { kind: 'terrainBonusStop' } : { kind: 'blocked' };
}

/**
 * Lists the terrain-bonus stop cells next to cells already reached this beat.
 *
 * Purpose: Lets the this-beat reachability lists add stop cells after their own search, without changing that search.
 * When to use: After a single-source search inside one beat's budget, with every reached cell and its lowest spend.
 * Expected outcome: Distinct neighbors not in `exclude`, reached from a cell whose spend is below `movementPointBudget`,
 * whose step is a `terrainBonusStop`. Empty when the context has no bonus category. Nothing beyond a stop is listed.
 * Exceptions: None.
 */
export function collectTerrainBonusStopsFromReached(args: {
  readonly ctx: TacticalMarchStepContext;
  readonly reached: Iterable<{ readonly h3: string; readonly spent: number; readonly prevH3: string | null }>;
  readonly exclude: ReadonlySet<string>;
  readonly movementPointBudget: number;
  readonly neighborsOf: TacticalFootprintNeighborLookup;
}): string[] {
  const { ctx, exclude, movementPointBudget, neighborsOf } = args;
  if (ctx.terrainBonusCategory == null) return [];
  const added = new Set<string>();
  for (const { h3, spent, prevH3 } of args.reached) {
    if (spent >= movementPointBudget) continue;
    for (const nb of neighborsOf(h3)) {
      if (nb === ctx.marchStartH3 || exclude.has(nb) || added.has(nb)) continue;
      if (classifyTacticalMarchStep(ctx, { fromH3: h3, prevH3, toH3: nb }).kind === 'terrainBonusStop') added.add(nb);
    }
  }
  return [...added];
}
