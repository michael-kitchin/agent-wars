/**
 * Terrain labels produced by the terrain pipeline (`terrain_*_metadata.json` classification).
 * Shared between main (seeding) and renderer (styling); keep in sync with Python TERRAIN_ENUM.
 *
 * Passability (`land` | `water` | `coastal` | `wetlands`) is what SQLite `hexes.terrain` stores; pipeline kinds
 * include `coastal` and `wetlands` as littoral / mixed land-water labels.
 */

export const PIPELINE_TERRAIN_KINDS = [
  'water',
  'coastal',
  'wetlands',
  'plains',
  'forest',
  'mountain',
  'desert',
  'arctic',
] as const;

export type PipelineTerrainKind = (typeof PIPELINE_TERRAIN_KINDS)[number];

/** Stored on `hexes.terrain` for movement and pathfinding. */
export type PassabilityTerrain = 'land' | 'water' | 'coastal' | 'wetlands';

const KIND_SET = new Set<string>(PIPELINE_TERRAIN_KINDS);

/**
 * Returns true when the string is one of the pipeline terrain enum values.
 * Use when validating CSV rows or DB values before insert.
 */
export function isPipelineTerrainKind(s: string): s is PipelineTerrainKind {
  return KIND_SET.has(s);
}

/**
 * Maps pipeline terrain kind to passability for SQLite and pathfinding.
 * `water` → `water`; `coastal` / `wetlands` keep dual-domain passability; all other kinds → `land`.
 * Main process seeding should call `terrainPassability.pipelineTerrainToPassability` for trace logging.
 */
export function pipelineTerrainToPassability(kind: PipelineTerrainKind): PassabilityTerrain {
  if (kind === 'water') return 'water';
  if (kind === 'coastal') return 'coastal';
  if (kind === 'wetlands') return 'wetlands';
  return 'land';
}

/**
 * Returns true if infantry/armor may enter or end movement on this passability terrain.
 */
export function passabilityAllowsLandUnit(t: PassabilityTerrain | string): boolean {
  return t === 'land' || t === 'coastal' || t === 'wetlands';
}

/**
 * Returns true if naval units may enter or end movement on this passability terrain.
 */
export function passabilityAllowsNavalUnit(t: PassabilityTerrain | string): boolean {
  return t === 'water' || t === 'coastal';
}
