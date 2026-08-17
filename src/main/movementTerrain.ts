import { getRes1InfrastructureForHex } from './gameDb';
import { logTrace } from './logger';
import { isNativeNavalTransitTerrain } from '../shared/navalStrategicEdges';

/**
 * Documents the `HexMovementTerrainInput` interface as a named contract surface (export interface HexMovementTerrainInput).

 * Purpose: Supports maintainability by documenting why `HexMovementTerrainInput` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexMovementTerrainInput {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `terrain` member (terrain: string;).

   * Contract: Describes stable behavior for callers of `terrain` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrain: string;
    /**
   * Specifies the contract for the `terrainKind` member (terrainKind?: string;).

   * Contract: Describes stable behavior for callers of `terrainKind` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainKind?: string;
}

/**
 * Returns whether live res-1 infrastructure currently has a seaport on this hex.
 *
 * Purpose: Spawn, mixed occupancy, and related checks must follow destroyed counts, not world metadata.
 * When to use: Single-hex seaport presence. Naval routing uses snapshot merge (`seaportCountByH3ForNavalLookup`).
 * Expected outcome: True only when `res1_infrastructure.seaport_count > 0`. A missing row counts as 0.
 * Exceptions: None.
 */
export function hexHasSeaport(h3Index: string): boolean {
  logTrace('movementTerrain hexHasSeaport', { h3Index });
  return getRes1InfrastructureForHex(h3Index).seaportCount > 0;
}

/**
 * Defines the `normalizeMovementTerrain` function shape (export function normalizeMovementTerrain(input: HexMovementTerrainInput): string).

 * Purpose: Supports maintainability by documenting why `normalizeMovementTerrain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function normalizeMovementTerrain(input: HexMovementTerrainInput): string {
  logTrace('movementTerrain normalizeMovementTerrain', input);
  if (input.terrainKind === 'coastal' || input.terrainKind === 'wetlands') return input.terrainKind;
  return input.terrain;
}

/**
 * Defines the `buildNormalizedTerrainByH3` function shape (export function buildNormalizedTerrainByH3( hexes: ReadonlyArray<{ h3Index: string; terrain: string; terrainKind?: string }> ): Map<string, string> { log).

 * Purpose: Supports maintainability by documenting why `buildNormalizedTerrainByH3` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `isLandSeaportSpawnHex` function shape (export function isLandSeaportSpawnHex(input:).

 * Purpose: Supports maintainability by documenting why `isLandSeaportSpawnHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isLandSeaportSpawnHex(input: { h3Index: string; normalizedTerrain: string; terrainKind?: string }): boolean {
  logTrace('movementTerrain isLandSeaportSpawnHex', input);
  if (isNativeNavalTransitTerrain(input.normalizedTerrain, input.terrainKind)) return false;
  return hexHasSeaport(input.h3Index);
}
