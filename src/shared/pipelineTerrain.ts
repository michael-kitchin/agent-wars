/**
 * Terrain labels produced by the terrain pipeline CSV (`terrain_res1_base.csv`).
 * Shared between main (seeding) and renderer (styling); keep in sync with Python TERRAIN_ENUM.
 *
 * Passability (`land` | `water` | `coastal`) is what SQLite `hexes.terrain` stores; pipeline kinds
 * include `coastal` as a littoral / mixed land–water label.
 */

export const PIPELINE_TERRAIN_KINDS = [
  'ocean',
  'coastal',
  'land',
  'forest',
  'mountain',
  'desert',
  'arctic',
] as const;

export type PipelineTerrainKind = (typeof PIPELINE_TERRAIN_KINDS)[number];

/** Stored on `hexes.terrain` for movement and pathfinding. */
export type PassabilityTerrain = 'land' | 'water' | 'coastal';

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
 * `ocean` → `water`; `coastal` → `coastal` (dual-domain); all other kinds → `land`.
 * Main process seeding should call `terrainPassability.pipelineTerrainToPassability` for trace logging.
 */
export function pipelineTerrainToPassability(kind: PipelineTerrainKind): PassabilityTerrain {
  if (kind === 'ocean') return 'water';
  if (kind === 'coastal') return 'coastal';
  return 'land';
}

/**
 * Returns true if infantry/armor may enter or end movement on this passability terrain.
 */
export function passabilityAllowsLandUnit(t: PassabilityTerrain | string): boolean {
  return t === 'land' || t === 'coastal';
}

/**
 * Returns true if naval units may enter or end movement on this passability terrain.
 */
export function passabilityAllowsNavalUnit(t: PassabilityTerrain | string): boolean {
  return t === 'water' || t === 'coastal';
}
