import { cellToLatLng } from 'h3-js';
import { getOrderedHexList, getWorldUnitCounts } from '../../mapData';
import { logDebug } from '../../logger';
import type { BuildUnitType } from '../../productionRules';
import { MAX_UNITS_PER_TYPE } from '../../productionCaps';
import { getScenarioHomeRegionHexes, isScenarioPassableLandTerrainKind } from '../../regionScenario';
import { loadScenarioState, REGION_VS_REGION_SCENARIO_ID } from '../scenarioState';
import type { GuardedDbRunAndGetAllOps } from '../dbOps';
import type { FlexAirSlotDeps } from './initialFlexAirSlot';
import { applySacrificeToBaselineCounts, resolveFlexUnitPlacement } from './initialFlexAirSlot';
import { countPlannedUnitsOfType, insertPlannedUnitsForPlayer, type PlannedUnitTuple } from './plannedUnits';
import type { SpawnCandidate } from './spawnSelection';

/**
 * Documents the `RegionScenarioSeedDeps` interface as a named contract surface (export interface RegionScenarioSeedDeps extends GuardedDbRunAndGetAllOps).

 * Purpose: Supports maintainability by documenting why `RegionScenarioSeedDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface RegionScenarioSeedDeps extends GuardedDbRunAndGetAllOps {
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
 * Documents the `UnitPlanEntry` interface as a named contract surface (interface UnitPlanEntry).

 * Purpose: Supports maintainability by documenting why `UnitPlanEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface UnitPlanEntry {
    /**
   * Specifies the contract for the `key` member (key: string;).

   * Contract: Describes stable behavior for callers of `key` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
key: string;
    /**
   * Specifies the contract for the `unitType` member (unitType: BuildUnitType;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: BuildUnitType;
}

/**
 * Documents the `ScenarioSpawnPlan` interface as a named contract surface (interface ScenarioSpawnPlan).

 * Purpose: Supports maintainability by documenting why `ScenarioSpawnPlan` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface ScenarioSpawnPlan {
    /**
   * Specifies the contract for the `entries` member (entries: UnitPlanEntry[];).

   * Contract: Describes stable behavior for callers of `entries` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
entries: UnitPlanEntry[];
    /**
   * Specifies the contract for the `droppedReasons` member (droppedReasons: string[];).

   * Contract: Describes stable behavior for callers of `droppedReasons` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
droppedReasons: string[];
}

/**
 * Defines the `isNavalSpawnTerrain` function shape (function isNavalSpawnTerrain(terrain: string): boolean).

 * Purpose: Supports maintainability by documenting why `isNavalSpawnTerrain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isNavalSpawnTerrain(terrain: string): boolean {
  return terrain === 'water' || terrain === 'coastal';
}

/**
 * Defines the `buildInitialPlanEntries` function shape (function buildInitialPlanEntries(counts:).

 * Purpose: Supports maintainability by documenting why `buildInitialPlanEntries` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildInitialPlanEntries(counts: { infantry: number; armor: number; naval: number }): UnitPlanEntry[] {
  const entries: UnitPlanEntry[] = [];
  for (let i = 0; i < counts.infantry; i++) entries.push({ key: `infantry-${i + 1}`, unitType: 'infantry' });
  for (let i = 0; i < counts.armor; i++) entries.push({ key: `armor-${i + 1}`, unitType: 'armor' });
  for (let i = 0; i < counts.naval; i++) entries.push({ key: `naval-${i + 1}`, unitType: 'naval' });
  return entries;
}

/**
 * Defines the `applyScenarioSubstitutions` function shape (function applyScenarioSubstitutions().

 * Purpose: Supports maintainability by documenting why `applyScenarioSubstitutions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function applyScenarioSubstitutions(
  initialEntries: UnitPlanEntry[],
  hasLandCandidates: boolean,
  hasNavalCandidates: boolean
): UnitPlanEntry[] {
  let entries = [...initialEntries];
  if (!hasNavalCandidates) {
    const expanded: UnitPlanEntry[] = [];
    for (const entry of entries) {
      if (entry.unitType !== 'naval') {
        expanded.push(entry);
        continue;
      }
      expanded.push({ key: `${entry.key}::sub-armor`, unitType: 'armor' });
      expanded.push({ key: `${entry.key}::sub-infantry`, unitType: 'infantry' });
    }
    entries = expanded;
  }
  if (!hasLandCandidates) {
    entries = entries.map((entry) =>
      entry.unitType === 'infantry' || entry.unitType === 'armor'
        ? { key: `${entry.key}::sub-naval`, unitType: 'naval' }
        : entry
    );
  }
  return entries;
}

/**
 * Defines the `enforceScenarioCaps` function shape (function enforceScenarioCaps(entries: UnitPlanEntry[]): ScenarioSpawnPlan).

 * Purpose: Supports maintainability by documenting why `enforceScenarioCaps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function enforceScenarioCaps(entries: UnitPlanEntry[]): ScenarioSpawnPlan {
  const droppedReasons: string[] = [];
  let working = [...entries];
  const trimType = (unitType: BuildUnitType): void => {
    const allowed = MAX_UNITS_PER_TYPE[unitType];
    const typeEntries = working.filter((entry) => entry.unitType === unitType);
    const overflow = Math.max(0, typeEntries.length - allowed);
    if (overflow <= 0) return;
    const keepSet = new Set(typeEntries.slice(0, typeEntries.length - overflow).map((entry) => entry.key));
    let dropped = 0;
    working = working.filter((entry) => {
      if (entry.unitType !== unitType) return true;
      if (keepSet.has(entry.key)) return true;
      dropped += 1;
      droppedReasons.push(`Dropped ${entry.key} (${unitType}) due to cap overflow`);
      return false;
    });
    logDebug('seedUnits enforceScenarioCaps: dropped overflow', { unitType, dropped, allowed });
  };
  trimType('infantry');
  trimType('armor');
  trimType('naval');
  trimType('air');
  return { entries: working, droppedReasons };
}

/**
 * Defines the `dropUnitsWithoutTerrainCandidates` function shape (function dropUnitsWithoutTerrainCandidates().

 * Purpose: Supports maintainability by documenting why `dropUnitsWithoutTerrainCandidates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function dropUnitsWithoutTerrainCandidates(
  entries: UnitPlanEntry[],
  hasLandCandidates: boolean,
  hasNavalCandidates: boolean
): ScenarioSpawnPlan {
  const droppedReasons: string[] = [];
  const filtered = entries.filter((entry) => {
    if ((entry.unitType === 'infantry' || entry.unitType === 'armor') && !hasLandCandidates) {
      droppedReasons.push(`Dropped ${entry.key} (${entry.unitType}) because selected region has no passable land hexes`);
      return false;
    }
    if (entry.unitType === 'naval' && !hasNavalCandidates) {
      droppedReasons.push(`Dropped ${entry.key} (naval) because selected region has no water/coastal hexes`);
      return false;
    }
    return true;
  });
  return { entries: filtered, droppedReasons };
}

/**
 * Defines the `summarizePlanCounts` function shape (function summarizePlanCounts(entries: UnitPlanEntry[]): Record<BuildUnitType, number>).

 * Purpose: Supports maintainability by documenting why `summarizePlanCounts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function summarizePlanCounts(entries: UnitPlanEntry[]): Record<BuildUnitType, number> {
  const counts: Record<BuildUnitType, number> = { infantry: 0, armor: 0, naval: 0, air: 0 };
  for (const entry of entries) counts[entry.unitType] += 1;
  return counts;
}

/**
 * Defines the `sacrificeOnePlanEntry` function shape (function sacrificeOnePlanEntry(entries: UnitPlanEntry[]): UnitPlanEntry[]).

 * Purpose: Supports maintainability by documenting why `sacrificeOnePlanEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function sacrificeOnePlanEntry(entries: UnitPlanEntry[]): UnitPlanEntry[] {
  const counts = summarizePlanCounts(entries);
  const after = applySacrificeToBaselineCounts({
    infantry: counts.infantry,
    armor: counts.armor,
    naval: counts.naval,
  });
  if (!after) return entries;
  const droppedType: BuildUnitType | null =
    after.infantry < counts.infantry
      ? 'infantry'
      : after.armor < counts.armor
        ? 'armor'
        : after.naval < counts.naval
          ? 'naval'
          : null;
  if (!droppedType) return entries;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]!.unitType !== droppedType) continue;
    return entries.filter((_, idx) => idx !== i);
  }
  return entries;
}

/**
 * Defines the `assignSpawnHexesRoundRobin` function shape (function assignSpawnHexesRoundRobin().

 * Purpose: Supports maintainability by documenting why `assignSpawnHexesRoundRobin` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function assignSpawnHexesRoundRobin(
  candidates: ReadonlyArray<SpawnCandidate>,
  count: number,
  targetLat: number,
  targetLng: number
): string[] {
  if (count <= 0 || candidates.length <= 0) return [];
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      d2: (candidate.lat - targetLat) * (candidate.lat - targetLat) + (candidate.lng - targetLng) * (candidate.lng - targetLng),
    }))
    .sort((a, b) => a.d2 - b.d2)
    .map((item) => item.candidate);
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(ranked[i % ranked.length]!.h3);
  return out;
}

/**
 * Defines the `averageLatLng` function shape (function averageLatLng(candidates: ReadonlyArray<SpawnCandidate>):).

 * Purpose: Supports maintainability by documenting why `averageLatLng` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function averageLatLng(candidates: ReadonlyArray<SpawnCandidate>): { lat: number; lng: number } {
  if (candidates.length <= 0) return { lat: 0, lng: 0 };
  let lat = 0;
  let lng = 0;
  for (const candidate of candidates) {
    lat += candidate.lat;
    lng += candidate.lng;
  }
  return { lat: lat / candidates.length, lng: lng / candidates.length };
}

/**
 * Defines the `trySeedScenarioRegionVsRegion` function shape (export function trySeedScenarioRegionVsRegion(deps: RegionScenarioSeedDeps): boolean).

 * Purpose: Supports maintainability by documenting why `trySeedScenarioRegionVsRegion` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function trySeedScenarioRegionVsRegion(deps: RegionScenarioSeedDeps): boolean {
  const scenario = loadScenarioState(deps);
  if (scenario.scenarioId !== REGION_VS_REGION_SCENARIO_ID) return false;
  const counts = getWorldUnitCounts();
  const hexes = getOrderedHexList();
  const terrainRows = deps.getAll<{ h3_index: string; terrain: string; terrain_kind: string }>(
    'SELECT h3_index, terrain, terrain_kind FROM hexes'
  );
  const terrainByH3 = new Map(terrainRows.map((row) => [row.h3_index, row]));
  const allCandidates: SpawnCandidate[] = hexes.map((h3) => {
    const [lat, lng] = cellToLatLng(h3);
    const terrain = terrainByH3.get(h3)?.terrain ?? 'land';
    return { h3, lat, lng, terrain };
  });
  const buildSidePlan = (player: 'human' | 'opponent', regionName: string): { units: PlannedUnitTuple[] } => {
    const regionHexes = new Set(getScenarioHomeRegionHexes(regionName));
    const regionCandidates = allCandidates.filter((candidate) => regionHexes.has(candidate.h3));
    const passableLandCandidates = regionCandidates.filter(
      (candidate) => isScenarioPassableLandTerrainKind(terrainByH3.get(candidate.h3)?.terrain_kind ?? '')
    );
    const navalCandidates = regionCandidates.filter((candidate) => isNavalSpawnTerrain(candidate.terrain));
    const substituted = applyScenarioSubstitutions(
      buildInitialPlanEntries(counts),
      passableLandCandidates.length > 0,
      navalCandidates.length > 0
    );
    const capped = enforceScenarioCaps(substituted);
    const terrainFiltered = dropUnitsWithoutTerrainCandidates(
      capped.entries,
      passableLandCandidates.length > 0,
      navalCandidates.length > 0
    );
    const sacrificedEntries = sacrificeOnePlanEntry(terrainFiltered.entries);
    const droppedReasons = [...capped.droppedReasons, ...terrainFiltered.droppedReasons];
    const finalCounts = summarizePlanCounts(sacrificedEntries);
    const landAnchor = averageLatLng(passableLandCandidates.length > 0 ? passableLandCandidates : regionCandidates);
    const navalAnchor = averageLatLng(navalCandidates.length > 0 ? navalCandidates : regionCandidates);
    const infantrySpawns = assignSpawnHexesRoundRobin(passableLandCandidates, finalCounts.infantry, landAnchor.lat, landAnchor.lng);
    const armorSpawns = assignSpawnHexesRoundRobin(passableLandCandidates, finalCounts.armor, landAnchor.lat, landAnchor.lng);
    const navalSpawns = assignSpawnHexesRoundRobin(navalCandidates, finalCounts.naval, navalAnchor.lat, navalAnchor.lng);
    logDebug('seedUnits trySeedScenarioRegionVsRegion: side plan', {
      player,
      regionName,
      regionHexCount: regionHexes.size,
      passableLandCandidates: passableLandCandidates.length,
      navalCandidates: navalCandidates.length,
      finalCounts,
      droppedReasons,
    });
    const units: PlannedUnitTuple[] = [];
    for (let i = 0; i < infantrySpawns.length; i++) units.push([`${player}-infantry-${i + 1}`, 'infantry', infantrySpawns[i]!]);
    for (let i = 0; i < armorSpawns.length; i++) units.push([`${player}-armor-${i + 1}`, 'armor', armorSpawns[i]!]);
    for (let i = 0; i < navalSpawns.length; i++) units.push([`${player}-naval-${i + 1}`, 'naval', navalSpawns[i]!]);
    const usedH3 = new Set(units.map((u) => u[2]));
    const flex = resolveFlexUnitPlacement({
      deps: deps as FlexAirSlotDeps,
      player,
      regionHexSet: regionHexes,
      passableLandCandidates,
      navalCandidates,
      usedH3,
      plannedCountsAfterSacrifice: { ...finalCounts, air: 0 },
    });
    if (flex) {
      const ord = countPlannedUnitsOfType(units, flex.unitType) + 1;
      units.push([`${player}-${flex.unitType}-${ord}`, flex.unitType, flex.h3Index]);
    }
    return { units };
  };
  const humanPlan = buildSidePlan('human', scenario.humanHomeRegion);
  const opponentPlan = buildSidePlan('opponent', scenario.aiHomeRegion);
  insertPlannedUnitsForPlayer(deps, 'human', humanPlan.units);
  insertPlannedUnitsForPlayer(deps, 'opponent', opponentPlan.units);
  return true;
}
