/**
 * Resolves one substitutive starting slot per side: prefer air at a home-region airport hex,
 * else armor, infantry, naval (in that order) with cap checks.
 */

import { cellToLatLng } from 'h3-js';
import { logDebug, logError } from '../../logger';
import type { BuildUnitType } from '../../productionRules';
import type { GuardedDbRunAndGetAllOps } from '../dbOps';
import type { SpawnCandidate } from './spawnSelection';

/**
 * Documents the `FlexAirSlotDeps` type alias (export type FlexAirSlotDeps).

 * Purpose: Supports maintainability by documenting why `FlexAirSlotDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type FlexAirSlotDeps = GuardedDbRunAndGetAllOps;

/**
 * Defines the `applySacrificeToBaselineCounts` function shape (export function applySacrificeToBaselineCounts(counts: { infantry: number; armor: number; naval: number; }): { infantry: number; armor: number; naval:).

 * Purpose: Supports maintainability by documenting why `applySacrificeToBaselineCounts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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

/**
 * Defines the `sortH3Deterministic` function shape (function sortH3Deterministic(hexes: string[], latLngByH3: Map<string, [number, number]>): string[]).

 * Purpose: Supports maintainability by documenting why `sortH3Deterministic` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `airportH3InRegion` function shape (function airportH3InRegion(deps: FlexAirSlotDeps, regionHexSet: Set<string>): string[]).

 * Purpose: Supports maintainability by documenting why `airportH3InRegion` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `buildLatLngMap` function shape (function buildLatLngMap(hexes: Iterable<string>): Map<string, [number, number]>).

 * Purpose: Supports maintainability by documenting why `buildLatLngMap` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildLatLngMap(hexes: Iterable<string>): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  for (const h3 of hexes) {
    const [lat, lng] = cellToLatLng(h3);
    m.set(h3, [lat, lng]);
  }
  return m;
}

/**
 * Defines the `pickPreferredHex` function shape (function pickPreferredHex(sortedHexes: string[], usedH3: Set<string>): string | undefined).

 * Purpose: Supports maintainability by documenting why `pickPreferredHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function pickPreferredHex(sortedHexes: string[], usedH3: Set<string>): string | undefined {
  const unused = sortedHexes.find((h) => !usedH3.has(h));
  if (unused) return unused;
  return sortedHexes[0];
}

/**
 * Defines the `sortSpawnCandidates` function shape (function sortSpawnCandidates(candidates: SpawnCandidate[]): SpawnCandidate[]).

 * Purpose: Supports maintainability by documenting why `sortSpawnCandidates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function sortSpawnCandidates(candidates: SpawnCandidate[]): SpawnCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.lat !== b.lat) return a.lat - b.lat;
    if (a.lng !== b.lng) return a.lng - b.lng;
    return a.h3.localeCompare(b.h3);
  });
}

/**
 * Defines the `pickPreferredCandidate` function shape (function pickPreferredCandidate(candidates: SpawnCandidate[], usedH3: Set<string>): SpawnCandidate | undefined).

 * Purpose: Supports maintainability by documenting why `pickPreferredCandidate` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function pickPreferredCandidate(candidates: SpawnCandidate[], usedH3: Set<string>): SpawnCandidate | undefined {
  const ranked = sortSpawnCandidates(candidates);
  const unused = ranked.find((c) => !usedH3.has(c.h3));
  if (unused) return unused;
  return ranked[0];
}

/**
 * Defines the `resolveFlexUnitPlacement` function shape (export function resolveFlexUnitPlacement(args: { deps: FlexAirSlotDeps; player: 'human' | 'opponent'; regionHexSet: Set<string>; passableLandCandida).

 * Purpose: Supports maintainability by documenting why `resolveFlexUnitPlacement` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveFlexUnitPlacement(args: {
  deps: FlexAirSlotDeps;
  player: 'human' | 'opponent';
  regionHexSet: Set<string>;
  passableLandCandidates: SpawnCandidate[];
  navalCandidates: SpawnCandidate[];
  usedH3: Set<string>;
  plannedCountsAfterSacrifice: { infantry: number; armor: number; naval: number; air: number };
  maxUnitsPerType: Readonly<Record<BuildUnitType, number>>;
}): { unitType: BuildUnitType; h3Index: string } | null {
  logDebug('initialFlexAirSlot resolveFlexUnitPlacement', {
    player: args.player,
    regionHexCount: args.regionHexSet.size,
    passableLand: args.passableLandCandidates.length,
    navalCandidates: args.navalCandidates.length,
  });
  const latLngByH3 = buildLatLngMap(args.regionHexSet);
  const capRoom = (t: BuildUnitType): boolean =>
    args.plannedCountsAfterSacrifice[t] + 1 <= args.maxUnitsPerType[t];

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
 * Defines the `logHomeRegionControlParity` function shape (export function logHomeRegionControlParity().

 * Purpose: Supports maintainability by documenting why `logHomeRegionControlParity` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
