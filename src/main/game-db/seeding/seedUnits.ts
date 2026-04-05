import { cellToLatLng } from 'h3-js';
import { getOrderedHexList, getWorldUnitCounts } from '../../mapData';
import { logDebug } from '../../logger';
import type { BuildUnitType } from '../../productionRules';
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

interface SeedUnitsDeps extends GuardedDbRunAndGetAllOps {
  allocateNextUnitDisplayOrder: (unitType: BuildUnitType) => number;
}

/**
 * Why this exists:
 *     Seeds initial human/opponent unit placement using deterministic terrain pools plus randomized side assignment.
 * When to use:
 *     New database bootstrap and full game reset flows.
 * What to expect:
 *     Throws when required regional/ocean spawn capacity cannot satisfy configured world unit counts.
 */
export function seedUnits(deps: SeedUnitsDeps): void {
  logDebug('gameDb seedUnits');
  if (!deps.hasDb()) return;
  const hexes = getOrderedHexList();
  const counts = getWorldUnitCounts();
  const terrainRows = deps.getAll<{ h3_index: string; terrain: string }>('SELECT h3_index, terrain FROM hexes');
  const terrainByH3 = new Map(terrainRows.map((r) => [r.h3_index, r.terrain]));
  const candidates: SpawnCandidate[] = hexes.map((h3) => {
    const [lat, lng] = cellToLatLng(h3);
    return { h3, lat, lng, terrain: terrainByH3.get(h3) ?? 'land' };
  });
  const landPerSide = counts.infantry + counts.armor;
  const usedH3 = new Set<string>();
  const asiaLandCandidates = selectRegionalLandCandidates(candidates, landPerSide, 'northeast Asia', northeastAsiaLandRegionStages());
  const africaLandCandidates = selectRegionalLandCandidates(candidates, landPerSide, 'southern Africa', southernAfricaLandRegionStages());
  const humanStartsInAsia = Math.random() < 0.5;
  logDebug('gameDb seedUnits: randomized land spawn region assignment', { humanStartsInAsia });
  const humanLand = humanStartsInAsia
    ? pickClosestSpawnCandidates(asiaLandCandidates, landPerSide, usedH3, 62, 145)
    : pickClosestSpawnCandidates(africaLandCandidates, landPerSide, usedH3, -34, 24);
  const opponentLand = humanStartsInAsia
    ? pickClosestSpawnCandidates(africaLandCandidates, landPerSide, usedH3, -34, 24)
    : pickClosestSpawnCandidates(asiaLandCandidates, landPerSide, usedH3, 62, 145);
  if (humanLand.length < landPerSide || opponentLand.length < landPerSide) {
    throw new Error('Could not allocate required regional land spawn hexes');
  }

  const humanUnits: [string, BuildUnitType, string][] = [];
  let idx = 0;
  for (let i = 0; i < counts.infantry; i++) humanUnits.push([`human-infantry-${i + 1}`, 'infantry', humanLand[idx++]!.h3]);
  for (let i = 0; i < counts.armor; i++) humanUnits.push([`human-armor-${i + 1}`, 'armor', humanLand[idx++]!.h3]);
  const pacificCandidates = candidates.filter(isPacificOceanHex);
  const atlanticCandidates = candidates.filter(isAtlanticOceanHex);
  const indianCandidates = candidates.filter(isIndianOceanHex);
  const humanNavalPools = [pacificCandidates, indianCandidates, atlanticCandidates];
  for (let i = 0; i < counts.naval; i++) {
    let spawn: SpawnCandidate | null = null;
    for (const pool of humanNavalPools) {
      const picked = pickClosestSpawnCandidates(pool, 1, usedH3, 10, -150);
      if (picked.length > 0) {
        spawn = picked[0]!;
        break;
      }
    }
    if (!spawn) throw new Error('Could not allocate required human naval spawn hex');
    humanUnits.push([`human-naval-${i + 1}`, 'naval', spawn.h3]);
  }
  for (const [id, unitType, h3Index] of humanUnits) {
    deps.run('INSERT INTO units (id, player, unit_type, display_order, h3_index) VALUES (?, ?, ?, ?, ?)', [
      id,
      'human',
      unitType,
      deps.allocateNextUnitDisplayOrder(unitType),
      h3Index,
    ]);
  }

  const opponentUnits: [string, BuildUnitType, string][] = [];
  idx = 0;
  for (let i = 0; i < counts.infantry; i++) opponentUnits.push([`opponent-infantry-${i + 1}`, 'infantry', opponentLand[idx++]!.h3]);
  for (let i = 0; i < counts.armor; i++) opponentUnits.push([`opponent-armor-${i + 1}`, 'armor', opponentLand[idx++]!.h3]);
  const opponentNavalPools = [atlanticCandidates, indianCandidates, pacificCandidates];
  for (let i = 0; i < counts.naval; i++) {
    let spawn: SpawnCandidate | null = null;
    for (const pool of opponentNavalPools) {
      const picked = pickClosestSpawnCandidates(pool, 1, usedH3, 0, -25);
      if (picked.length > 0) {
        spawn = picked[0]!;
        break;
      }
    }
    if (!spawn) throw new Error('Could not allocate required opponent naval spawn hex');
    opponentUnits.push([`opponent-naval-${i + 1}`, 'naval', spawn.h3]);
  }
  for (const [id, unitType, h3Index] of opponentUnits) {
    deps.run('INSERT INTO units (id, player, unit_type, display_order, h3_index) VALUES (?, ?, ?, ?, ?)', [
      id,
      'opponent',
      unitType,
      deps.allocateNextUnitDisplayOrder(unitType),
      h3Index,
    ]);
  }
}
