import { cellToLatLng } from 'h3-js';
import { getOrderedHexList, getWorldUnitCounts } from '../../mapData';
import { logDebug } from '../../logger';
import type { BuildUnitType } from '../../productionRules';
import { MAX_UNITS_PER_TYPE } from '../../productionCaps';
import { getScenarioHomeRegionHexes, isScenarioPassableLandTerrainKind } from '../../regionScenario';
import { loadScenarioState, REGION_VS_REGION_SCENARIO_ID } from '../scenarioState';
import type { GuardedDbRunAndGetAllOps } from '../dbOps';
import type { SpawnCandidate } from './spawnSelection';

export interface RegionScenarioSeedDeps extends GuardedDbRunAndGetAllOps {
  getOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | undefined;
  allocateNextUnitDisplayOrder: (unitType: BuildUnitType) => number;
}

interface UnitPlanEntry {
  key: string;
  unitType: BuildUnitType;
}

interface ScenarioSpawnPlan {
  entries: UnitPlanEntry[];
  droppedReasons: string[];
}

function isNavalSpawnTerrain(terrain: string): boolean {
  return terrain === 'water' || terrain === 'coastal';
}

function buildInitialPlanEntries(counts: { infantry: number; armor: number; naval: number }): UnitPlanEntry[] {
  const entries: UnitPlanEntry[] = [];
  for (let i = 0; i < counts.infantry; i++) entries.push({ key: `infantry-${i + 1}`, unitType: 'infantry' });
  for (let i = 0; i < counts.armor; i++) entries.push({ key: `armor-${i + 1}`, unitType: 'armor' });
  for (let i = 0; i < counts.naval; i++) entries.push({ key: `naval-${i + 1}`, unitType: 'naval' });
  return entries;
}

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

function summarizePlanCounts(entries: UnitPlanEntry[]): Record<BuildUnitType, number> {
  const counts: Record<BuildUnitType, number> = { infantry: 0, armor: 0, naval: 0, air: 0 };
  for (const entry of entries) counts[entry.unitType] += 1;
  return counts;
}

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
 * Why this exists:
 *     Encapsulates region-vs-region spawn planning, substitution, cap enforcement, and deterministic placement.
 * When to use:
 *     Initial unit seeding during new-game reset before falling back to legacy global spawn logic.
 * What to expect:
 *     Returns true after inserting scenario units when scenario is active; returns false for non-scenario matches.
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
  const buildSidePlan = (player: 'human' | 'opponent', regionName: string): { units: [string, BuildUnitType, string][] } => {
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
    const droppedReasons = [...capped.droppedReasons, ...terrainFiltered.droppedReasons];
    const finalCounts = summarizePlanCounts(terrainFiltered.entries);
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
    const units: [string, BuildUnitType, string][] = [];
    for (let i = 0; i < infantrySpawns.length; i++) units.push([`${player}-infantry-${i + 1}`, 'infantry', infantrySpawns[i]!]);
    for (let i = 0; i < armorSpawns.length; i++) units.push([`${player}-armor-${i + 1}`, 'armor', armorSpawns[i]!]);
    for (let i = 0; i < navalSpawns.length; i++) units.push([`${player}-naval-${i + 1}`, 'naval', navalSpawns[i]!]);
    return { units };
  };
  const humanPlan = buildSidePlan('human', scenario.humanHomeRegion);
  const opponentPlan = buildSidePlan('opponent', scenario.aiHomeRegion);
  const insertPlannedUnits = (units: [string, BuildUnitType, string][], player: 'human' | 'opponent'): void => {
    for (const [id, unitType, h3Index] of units) {
      deps.run('INSERT INTO units (id, player, unit_type, display_order, h3_index) VALUES (?, ?, ?, ?, ?)', [
        id,
        player,
        unitType,
        deps.allocateNextUnitDisplayOrder(unitType),
        h3Index,
      ]);
    }
  };
  insertPlannedUnits(humanPlan.units, 'human');
  insertPlannedUnits(opponentPlan.units, 'opponent');
  return true;
}
