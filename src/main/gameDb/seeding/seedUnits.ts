import { cellToLatLng } from 'h3-js';
import { getOrderedHexList, getWorldUnitCounts } from '../../mapData';
import { logDebug, logError } from '../../logger';
import {
  claimInitialPlacementHex,
  findMixedInitialPlacementHexes,
  type InitialPlacementSide,
} from '../../../shared/initialPlacementSides';
import type { BuildUnitType } from '../../productionRules';
import { isScenarioPassableLandTerrainKind } from '../../regionScenario';
import {
  isAtlanticOceanHex,
  isIndianOceanHex,
  isPacificOceanHex,
  northeastAsiaLandRegionStages,
  pickClosestSpawnCandidates,
  selectRegionalLandCandidates,
  southernAfricaLandRegionStages,
  type SpawnCandidate,
} from './spawnSelection';
import type { GuardedDbRunAndGetAllOps } from '../dbOps';
import type { FlexAirSlotDeps } from './initialFlexAirSlot';
import { applySacrificeToBaselineCounts, resolveFlexUnitPlacement } from './initialFlexAirSlot';
import { insertPlannedUnitsForPlayer, type PlannedUnitOwner, type PlannedUnitPlan } from './plannedUnits';
import type { UnitOrigin } from '../../../shared/unitOriginTypes';
import { trySeedScenarioRegionVsRegion } from './regionScenarioSeeding';
import { readPersistedMaxUnitsPerType } from '../gameSizeConfig';

/**
 * Documents the `SeedUnitsDeps` interface as a named contract surface (interface SeedUnitsDeps extends GuardedDbRunAndGetAllOps).

 * Purpose: Supports maintainability by documenting why `SeedUnitsDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface SeedUnitsDeps extends GuardedDbRunAndGetAllOps {
    /**
   * Specifies the contract for the `getOne` member (getOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | undefined;).

   * Contract: Describes stable behavior for callers of `getOne` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | undefined;
    /**
   * Specifies the contract for the `allocateNextUnitDisplayOrder` member (allocateNextUnitDisplayOrder: (unitType: BuildUnitType) => number;).

   * Contract: Describes stable behavior for callers of `allocateNextUnitDisplayOrder` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
allocateNextUnitDisplayOrder: (unitType: BuildUnitType, player: PlannedUnitOwner) => number;
    /**
     * Allocates the next compact unit-id ordinal for a player and type.
     *
     * Contract: Independent of display order; throws when the database is not open.
     * When to use: Threaded through to `insertPlannedUnitsForPlayer`.
     * Expected outcome: Unique positive integers per player and type.
     * Exceptions: Throws when the database is not open.
     */
    allocateNextUnitIdOrdinal: (unitType: BuildUnitType, player: PlannedUnitOwner) => number;
  /**
   * Resolves the birth origin of a unit about to be inserted.
   *
   * Contract: Never throws; returns at least the birth hex.
   * When to use: Threaded through to `insertPlannedUnitsForPlayer`.
   * Expected outcome: Origin stored in the unit's `birth_*` columns.
   * Exceptions: None.
   */
  resolveBirthOrigin: (unitId: string, h3Index: string) => UnitOrigin;
}

/**
 * Documents the `SeedUnitEntry` type alias (type SeedUnitEntry).

 * Purpose: Supports maintainability by documenting why `SeedUnitEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type SeedUnitEntry = PlannedUnitPlan;

/**
 * Defines the `mergeNavalCandidatePools` function shape (function mergeNavalCandidatePools(pools: SpawnCandidate[][]): SpawnCandidate[]).

 * Purpose: Supports maintainability by documenting why `mergeNavalCandidatePools` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function mergeNavalCandidatePools(pools: SpawnCandidate[][]): SpawnCandidate[] {
  const seen = new Set<string>();
  const out: SpawnCandidate[] = [];
  for (const pool of pools) {
    for (const c of pool) {
      if (seen.has(c.h3)) continue;
      seen.add(c.h3);
      out.push(c);
    }
  }
  return out;
}

/**
 * Defines the `buildSideUnits` function shape (function buildSideUnits(args: { deps: SeedUnitsDeps; player: 'human' | 'opponent'; counts: { infantry: number; armor: number; naval: number }; landS).

 * Purpose: Builds one side's opening units from land spawns already reserved in `occupiedByHex`, then naval and flex hexes that the other side does not hold.
 * When to use: From `seedUnits` after both sides' land hexes have been claimed.
 * Expected outcome: The side's unit list. A flex unit that would sit on the other side is left out.
 * Exceptions: Throws when a required naval hex cannot be allocated, including when the only remaining hex is already held by the other side.
 */
function buildSideUnits(args: {
  deps: SeedUnitsDeps;
  player: 'human' | 'opponent';
  counts: { infantry: number; armor: number; naval: number };
  landSpawns: SpawnCandidate[];
  navalPools: SpawnCandidate[][];
  navalTargetLat: number;
  navalTargetLng: number;
  usedGlobalH3: Set<string>;
  occupiedByHex: Map<string, InitialPlacementSide>;
  homeHexSet: Set<string>;
  passableLandCandidates: SpawnCandidate[];
  sacrificed: { infantry: number; armor: number; naval: number } | null;
  maxUnitsPerType: Readonly<Record<BuildUnitType, number>>;
}): SeedUnitEntry[] {
  const units: SeedUnitEntry[] = [];
  let idx = 0;
  for (let i = 0; i < args.counts.infantry; i++) units.push({ unitType: 'infantry', h3Index: args.landSpawns[idx++]!.h3 });
  for (let i = 0; i < args.counts.armor; i++) units.push({ unitType: 'armor', h3Index: args.landSpawns[idx++]!.h3 });
  for (let i = 0; i < args.counts.naval; i++) {
    let spawn: SpawnCandidate | null = null;
    for (const pool of args.navalPools) {
      const picked = pickClosestSpawnCandidates(pool, 1, args.usedGlobalH3, args.navalTargetLat, args.navalTargetLng);
      if (picked.length > 0) {
        spawn = picked[0]!;
        break;
      }
    }
    if (!spawn) {
      logError('seedUnits could not allocate a naval spawn hex', { player: args.player });
      throw new Error(`Could not allocate required ${args.player} naval spawn hex`);
    }
    units.push({ unitType: 'naval', h3Index: spawn.h3 });
    if (!claimInitialPlacementHex(args.occupiedByHex, spawn.h3, args.player)) {
      logError('seedUnits naval spawn hex held by the other side', { player: args.player, h3Index: spawn.h3 });
      throw new Error(`Could not allocate required ${args.player} naval spawn hex`);
    }
  }

  if (args.sacrificed) {
    const usedSideHexes = new Set<string>([...args.usedGlobalH3, ...units.map((unit) => unit.h3Index)]);
    const flex = resolveFlexUnitPlacement({
      deps: args.deps as FlexAirSlotDeps,
      player: args.player,
      regionHexSet: args.homeHexSet,
      passableLandCandidates: args.passableLandCandidates,
      navalCandidates: mergeNavalCandidatePools(args.navalPools),
      usedH3: usedSideHexes,
      plannedCountsAfterSacrifice: { ...args.counts, air: 0 },
      maxUnitsPerType: args.maxUnitsPerType,
    });
    if (flex && claimInitialPlacementHex(args.occupiedByHex, flex.h3Index, args.player)) {
      units.push({ unitType: flex.unitType, h3Index: flex.h3Index });
      args.usedGlobalH3.add(flex.h3Index);
    } else if (flex) {
      logDebug('seedUnits omitted flex unit on a hex held by the other side', {
        player: args.player,
        h3Index: flex.h3Index,
      });
    } else {
      logDebug('seedUnits omitted flex unit', { player: args.player });
    }
  }

  return units;
}

/**
 * Defines the `seedUnits` function shape (export function seedUnits(deps: SeedUnitsDeps): void).

 * Purpose: Seeds one side in each home region without putting both sides in the same hex.
 * When to use: From a new-match reset after terrain rows exist.
 * Expected outcome: Human and opponent opening units are inserted. A flex unit that would land on the other side is omitted.
 * Exceptions: Throws when a required land or naval hex cannot be allocated, or when a hex would contain both sides.
 */
export function seedUnits(deps: SeedUnitsDeps): void {
  logDebug('gameDb seedUnits');
  if (!deps.hasDb()) return;
  if (trySeedScenarioRegionVsRegion(deps)) return;
  const hexes = getOrderedHexList();
  const counts = getWorldUnitCounts();
  const terrainRows = deps.getAll<{ h3_index: string; terrain: string; terrain_kind: string }>(
    'SELECT h3_index, terrain, terrain_kind FROM hexes'
  );
  const terrainRowByH3 = new Map(terrainRows.map((r) => [r.h3_index, r]));
  const candidates: SpawnCandidate[] = hexes.map((h3) => {
    const row = terrainRowByH3.get(h3);
    const [lat, lng] = cellToLatLng(h3);
    return { h3, lat, lng, terrain: row?.terrain ?? 'land' };
  });
  const sacrificed = applySacrificeToBaselineCounts(counts);
  const maxUnitsPerType = readPersistedMaxUnitsPerType(deps);
  const eff = sacrificed ?? counts;
  const landPerSide = eff.infantry + eff.armor;
  const usedH3 = new Set<string>();
  const asiaLandCandidates = selectRegionalLandCandidates(candidates, landPerSide, 'northeast Asia', northeastAsiaLandRegionStages());
  const africaLandCandidates = selectRegionalLandCandidates(candidates, landPerSide, 'southern Africa', southernAfricaLandRegionStages());
  const humanStartsInAsia = Math.random() < 0.5;
  logDebug('gameDb seedUnits: randomized land spawn region assignment', { humanStartsInAsia });
  const humanRegionLandCandidates = humanStartsInAsia ? asiaLandCandidates : africaLandCandidates;
  const opponentRegionLandCandidates = humanStartsInAsia ? africaLandCandidates : asiaLandCandidates;
  const humanLand = humanStartsInAsia
    ? pickClosestSpawnCandidates(asiaLandCandidates, landPerSide, usedH3, 62, 145)
    : pickClosestSpawnCandidates(africaLandCandidates, landPerSide, usedH3, -34, 24);
  const opponentLand = humanStartsInAsia
    ? pickClosestSpawnCandidates(africaLandCandidates, landPerSide, usedH3, -34, 24)
    : pickClosestSpawnCandidates(asiaLandCandidates, landPerSide, usedH3, 62, 145);
  if (humanLand.length < landPerSide || opponentLand.length < landPerSide) {
    throw new Error('Could not allocate required regional land spawn hexes');
  }
  const occupiedByHex = new Map<string, InitialPlacementSide>();
  for (const spawn of humanLand) {
    if (!claimInitialPlacementHex(occupiedByHex, spawn.h3, 'human')) {
      logError('seedUnits opening placement mixed sides', { h3Index: spawn.h3, side: 'human' });
      throw new Error('Opening placement mixed sides');
    }
  }
  for (const spawn of opponentLand) {
    if (!claimInitialPlacementHex(occupiedByHex, spawn.h3, 'opponent')) {
      logError('seedUnits opening placement mixed sides', { h3Index: spawn.h3, side: 'opponent' });
      throw new Error('Opening placement mixed sides');
    }
  }

  const passableHumanLand = humanRegionLandCandidates.filter((c) =>
    isScenarioPassableLandTerrainKind(terrainRowByH3.get(c.h3)?.terrain_kind ?? '')
  );
  const passableOpponentLand = opponentRegionLandCandidates.filter((c) =>
    isScenarioPassableLandTerrainKind(terrainRowByH3.get(c.h3)?.terrain_kind ?? '')
  );
  const humanHomeHexSet = new Set(humanRegionLandCandidates.map((c) => c.h3));
  const opponentHomeHexSet = new Set(opponentRegionLandCandidates.map((c) => c.h3));

  const pacificCandidates = candidates.filter(isPacificOceanHex);
  const atlanticCandidates = candidates.filter(isAtlanticOceanHex);
  const indianCandidates = candidates.filter(isIndianOceanHex);
  const humanNavalPools = [pacificCandidates, indianCandidates, atlanticCandidates];
  const opponentNavalPools = [atlanticCandidates, indianCandidates, pacificCandidates];

  const humanUnits = buildSideUnits({
    deps,
    player: 'human',
    counts: eff,
    landSpawns: humanLand,
    navalPools: humanNavalPools,
    navalTargetLat: 10,
    navalTargetLng: -150,
    usedGlobalH3: usedH3,
    occupiedByHex,
    homeHexSet: humanHomeHexSet,
    passableLandCandidates: passableHumanLand,
    sacrificed,
    maxUnitsPerType,
  });
  const opponentUnits = buildSideUnits({
    deps,
    player: 'opponent',
    counts: eff,
    landSpawns: opponentLand,
    navalPools: opponentNavalPools,
    navalTargetLat: 0,
    navalTargetLng: -25,
    usedGlobalH3: usedH3,
    occupiedByHex,
    homeHexSet: opponentHomeHexSet,
    passableLandCandidates: passableOpponentLand,
    sacrificed,
    maxUnitsPerType,
  });

  const mixedHexes = findMixedInitialPlacementHexes([
    ...humanUnits.map((unit) => ({ h3Index: unit.h3Index, side: 'human' as const })),
    ...opponentUnits.map((unit) => ({ h3Index: unit.h3Index, side: 'opponent' as const })),
  ]);
  if (mixedHexes.length > 0) {
    logError('seedUnits opening placement mixed sides', { hexes: mixedHexes });
    throw new Error('Opening placement mixed sides');
  }

  insertPlannedUnitsForPlayer(deps, 'human', humanUnits);
  insertPlannedUnitsForPlayer(deps, 'opponent', opponentUnits);
}
