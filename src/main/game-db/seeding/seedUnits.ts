import { cellToLatLng } from 'h3-js';
import { getOrderedHexList, getWorldUnitCounts } from '../../mapData';
import { logDebug } from '../../logger';
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
import { countPlannedUnitsOfType, insertPlannedUnitsForPlayer, type PlannedUnitTuple } from './plannedUnits';
import { trySeedScenarioRegionVsRegion } from './regionScenarioSeeding';

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
allocateNextUnitDisplayOrder: (unitType: BuildUnitType) => number;
}

/**
 * Documents the `SeedUnitEntry` type alias (type SeedUnitEntry).

 * Purpose: Supports maintainability by documenting why `SeedUnitEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type SeedUnitEntry = PlannedUnitTuple;

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

 * Purpose: Supports maintainability by documenting why `buildSideUnits` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
  homeHexSet: Set<string>;
  passableLandCandidates: SpawnCandidate[];
  sacrificed: { infantry: number; armor: number; naval: number } | null;
}): SeedUnitEntry[] {
  const units: SeedUnitEntry[] = [];
  let idx = 0;
  for (let i = 0; i < args.counts.infantry; i++) units.push([`${args.player}-infantry-${i + 1}`, 'infantry', args.landSpawns[idx++]!.h3]);
  for (let i = 0; i < args.counts.armor; i++) units.push([`${args.player}-armor-${i + 1}`, 'armor', args.landSpawns[idx++]!.h3]);
  for (let i = 0; i < args.counts.naval; i++) {
    let spawn: SpawnCandidate | null = null;
    for (const pool of args.navalPools) {
      const picked = pickClosestSpawnCandidates(pool, 1, args.usedGlobalH3, args.navalTargetLat, args.navalTargetLng);
      if (picked.length > 0) {
        spawn = picked[0]!;
        break;
      }
    }
    if (!spawn) throw new Error(`Could not allocate required ${args.player} naval spawn hex`);
    units.push([`${args.player}-naval-${i + 1}`, 'naval', spawn.h3]);
  }

  if (args.sacrificed) {
    const usedSideHexes = new Set(units.map((u) => u[2]));
    const flex = resolveFlexUnitPlacement({
      deps: args.deps as FlexAirSlotDeps,
      player: args.player,
      regionHexSet: args.homeHexSet,
      passableLandCandidates: args.passableLandCandidates,
      navalCandidates: mergeNavalCandidatePools(args.navalPools),
      usedH3: usedSideHexes,
      plannedCountsAfterSacrifice: { ...args.counts, air: 0 },
    });
    if (flex) {
      const ord = countPlannedUnitsOfType(units, flex.unitType) + 1;
      units.push([`${args.player}-${flex.unitType}-${ord}`, flex.unitType, flex.h3Index]);
    }
  }

  return units;
}

/**
 * Defines the `seedUnits` function shape (export function seedUnits(deps: SeedUnitsDeps): void).

 * Purpose: Supports maintainability by documenting why `seedUnits` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
    homeHexSet: humanHomeHexSet,
    passableLandCandidates: passableHumanLand,
    sacrificed,
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
    homeHexSet: opponentHomeHexSet,
    passableLandCandidates: passableOpponentLand,
    sacrificed,
  });

  insertPlannedUnitsForPlayer(deps, 'human', humanUnits);
  insertPlannedUnitsForPlayer(deps, 'opponent', opponentUnits);
}
