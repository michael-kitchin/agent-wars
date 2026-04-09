/**
 * Resolves one substitutive starting slot per side: prefer air at a home-region airport hex,
 * else armor, infantry, naval (in that order) with cap checks.
 */

import { cellToLatLng } from 'h3-js';
import { logDebug, logError } from '../../logger';
import type { BuildUnitType } from '../../productionRules';
import { MAX_UNITS_PER_TYPE } from '../../productionCaps';
import type { GuardedDbRunAndGetAllOps } from '../dbOps';
import type { SpawnCandidate } from './spawnSelection';

export type FlexAirSlotDeps = GuardedDbRunAndGetAllOps;

/**
 * Why this exists:
 *     Chooses which baseline land or naval slot is sacrificed so the substitutive flex unit (air or fallback)
 *     does not increase total unit count.
 * When to use:
 *     Global and region-vs-region seeding before building per-side unit rows.
 * What to expect:
 *     Returns a copy of counts with one fewer infantry, else armor, else naval; returns null if all are zero.
 */
export function applySacrificeToBaselineCounts(counts: {
  infantry: number;
  armor: number;
  naval: number;
}): { infantry: number; armor: number; naval: number } | null {
  logDebug('initialFlexAirSlot applySacrificeToBaselineCounts', { counts });
  if (counts.infantry > 0) return { ...counts, infantry: counts.infantry - 1 };
  if (counts.armor > 0) return { ...counts, armor: counts.armor - 1 };
  if (counts.naval > 0) return { ...counts, naval: counts.naval - 1 };
  return null;
}

function sortH3Deterministic(hexes: string[], latLngByH3: Map<string, [number, number]>): string[] {
  return [...hexes].sort((a, b) => {
    const la = latLngByH3.get(a);
    const lb = latLngByH3.get(b);
    if (la && lb) {
      if (la[0] !== lb[0]) return la[0] - lb[0];
      if (la[1] !== lb[1]) return la[1] - lb[1];
    }
    return a.localeCompare(b);
  });
}

function airportH3InRegion(deps: FlexAirSlotDeps, regionHexSet: Set<string>): string[] {
  const rows = deps.getAll<{ h3_index: string }>(
    'SELECT h3_index FROM res1_infrastructure WHERE airport_count > 0 AND airport_count IS NOT NULL'
  );
  const out: string[] = [];
  for (const row of rows) {
    const h3 = row.h3_index;
    if (regionHexSet.has(h3)) out.push(h3);
  }
  return out;
}

function buildLatLngMap(hexes: Iterable<string>): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  for (const h3 of hexes) {
    const [lat, lng] = cellToLatLng(h3);
    m.set(h3, [lat, lng]);
  }
  return m;
}

function pickPreferredHex(sortedHexes: string[], usedH3: Set<string>): string | undefined {
  const unused = sortedHexes.find((h) => !usedH3.has(h));
  if (unused) return unused;
  return sortedHexes[0];
}

function sortSpawnCandidates(candidates: SpawnCandidate[]): SpawnCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.lat !== b.lat) return a.lat - b.lat;
    if (a.lng !== b.lng) return a.lng - b.lng;
    return a.h3.localeCompare(b.h3);
  });
}

function pickPreferredCandidate(candidates: SpawnCandidate[], usedH3: Set<string>): SpawnCandidate | undefined {
  const ranked = sortSpawnCandidates(candidates);
  const unused = ranked.find((c) => !usedH3.has(c.h3));
  if (unused) return unused;
  return ranked[0];
}

/**
 * Why this exists:
 *     Picks flex unit type and spawn hex for one substitutive starting unit inside a home region (or global land home + naval pool).
 * When to use:
 *     After infrastructure exists and baseline counts reflect sacrifice (one fewer baseline unit).
 * What to expect:
 *     Tries air at regional airport, then armor, infantry on passable land, then naval in naval candidate pool; updates usedH3 when preferring fresh hexes.
 */
export function resolveFlexUnitPlacement(args: {
  deps: FlexAirSlotDeps;
  player: 'human' | 'opponent';
  regionHexSet: Set<string>;
  passableLandCandidates: SpawnCandidate[];
  navalCandidates: SpawnCandidate[];
  usedH3: Set<string>;
  plannedCountsAfterSacrifice: { infantry: number; armor: number; naval: number; air: number };
}): { unitType: BuildUnitType; h3Index: string } | null {
  logDebug('initialFlexAirSlot resolveFlexUnitPlacement', {
    player: args.player,
    regionHexCount: args.regionHexSet.size,
    passableLand: args.passableLandCandidates.length,
    navalCandidates: args.navalCandidates.length,
  });
  const latLngByH3 = buildLatLngMap(args.regionHexSet);
  const capRoom = (t: BuildUnitType): boolean =>
    args.plannedCountsAfterSacrifice[t] + 1 <= MAX_UNITS_PER_TYPE[t];

  const airportHexes = sortH3Deterministic(airportH3InRegion(args.deps, args.regionHexSet), latLngByH3);
  if (capRoom('air') && airportHexes.length > 0) {
    const h3 = pickPreferredHex(airportHexes, args.usedH3);
    if (h3) {
      args.usedH3.add(h3);
      return { unitType: 'air', h3Index: h3 };
    }
  }

  if (capRoom('armor') && args.passableLandCandidates.length > 0) {
    const c = pickPreferredCandidate(args.passableLandCandidates, args.usedH3);
    if (c) {
      args.usedH3.add(c.h3);
      return { unitType: 'armor', h3Index: c.h3 };
    }
  }

  if (capRoom('infantry') && args.passableLandCandidates.length > 0) {
    const c = pickPreferredCandidate(args.passableLandCandidates, args.usedH3);
    if (c) {
      args.usedH3.add(c.h3);
      return { unitType: 'infantry', h3Index: c.h3 };
    }
  }

  if (capRoom('naval') && args.navalCandidates.length > 0) {
    const c = pickPreferredCandidate(args.navalCandidates, args.usedH3);
    if (c) {
      args.usedH3.add(c.h3);
      return { unitType: 'naval', h3Index: c.h3 };
    }
  }

  logDebug('initialFlexAirSlot resolveFlexUnitPlacement: no flex placement', { player: args.player });
  return null;
}

/**
 * Why this exists:
 *     Verifies res1_control rows for scenario home regions match the owning player (defensive diagnostic).
 * When to use:
 *     Optional diagnostic after control seeding when region hex sets are known.
 * What to expect:
 *     Logs error-level lines for mismatches; never throws.
 */
export function logHomeRegionControlParity(
  deps: FlexAirSlotDeps,
  humanHomeHexes: Set<string>,
  aiHomeHexes: Set<string>
): void {
  logDebug('initialFlexAirSlot logHomeRegionControlParity', {
    humanHexCount: humanHomeHexes.size,
    aiHexCount: aiHomeHexes.size,
  });
  const rows = deps.getAll<{ h3_index: string; controller_player_id: string | null }>(
    'SELECT h3_index, controller_player_id FROM res1_control'
  );
  for (const row of rows) {
    const h3 = row.h3_index;
    const c = row.controller_player_id;
    if (humanHomeHexes.has(h3) && !aiHomeHexes.has(h3) && c !== 'human') {
      logError('initialFlexAirSlot home region control mismatch (expected human)', { h3Index: h3, controller: c });
    }
    if (aiHomeHexes.has(h3) && !humanHomeHexes.has(h3) && c !== 'opponent') {
      logError('initialFlexAirSlot home region control mismatch (expected opponent)', { h3Index: h3, controller: c });
    }
  }
}
