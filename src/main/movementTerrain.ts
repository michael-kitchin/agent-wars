import { getRes1InfrastructureForHex } from './gameDb';
import { getRes1ProductionContext, isTerrainClassificationCacheLoaded } from './terrainClassificationCache';
import { logTrace } from './logger';

export interface HexMovementTerrainInput {
  h3Index: string;
  terrain: string;
  terrainKind?: string;
}

/**
 * Why this exists:
 *     Provides one normalization rule for movement/passability terrain derived from hex DB fields.
 * When to use:
 *     Any planning/validation path that consumes `terrain` + `terrainKind` from snapshots or DB rows.
 * What to expect:
 *     Returns coastal/wetlands from terrainKind when present; otherwise returns base terrain.
 */
export function normalizeMovementTerrain(input: HexMovementTerrainInput): string {
  logTrace('movementTerrain normalizeMovementTerrain', input);
  if (input.terrainKind === 'coastal' || input.terrainKind === 'wetlands') return input.terrainKind;
  return input.terrain;
}

/**
 * Why this exists:
 *     Builds one canonical normalized-terrain lookup map for movement/pathfinding consumers.
 * When to use:
 *     Any read-only planning or validation flow that repeatedly needs normalized terrain by H3.
 * What to expect:
 *     Returns a map keyed by H3 index, where each value uses `normalizeMovementTerrain` rules.
 */
export function buildNormalizedTerrainByH3(
  hexes: ReadonlyArray<{ h3Index: string; terrain: string; terrainKind?: string }>
): Map<string, string> {
  logTrace('movementTerrain buildNormalizedTerrainByH3', { count: hexes.length });
  const out = new Map<string, string>();
  for (const hex of hexes) {
    out.set(
      hex.h3Index,
      normalizeMovementTerrain({ h3Index: hex.h3Index, terrain: hex.terrain, terrainKind: hex.terrainKind })
    );
  }
  return out;
}

/**
 * Why this exists:
 *     Centralizes the seaport-land exception test for naval spawn/egress behavior.
 * When to use:
 *     Naval movement validation and route planning when origin terrain is non-water-domain.
 * What to expect:
 *     Returns true only for land hexes with at least one intact seaport in mutable game state.
 */
export function isLandSeaportSpawnHex(input: { h3Index: string; normalizedTerrain: string }): boolean {
  logTrace('movementTerrain isLandSeaportSpawnHex', input);
  if (input.normalizedTerrain !== 'land') return false;
  const live = getRes1InfrastructureForHex(input.h3Index);
  if (live.seaportCount > 0) return true;
  if (!isTerrainClassificationCacheLoaded()) return false;
  return getRes1ProductionContext({ h3Index: input.h3Index }).seaportCount > 0;
}
