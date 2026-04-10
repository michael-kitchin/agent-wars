/**
 * Documents the module-scope binding `PIPELINE_TERRAIN_KINDS` (PIPELINE_TERRAIN_KINDS).

 * Purpose: Supports maintainability by documenting why `PIPELINE_TERRAIN_KINDS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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

/**
 * Documents the `PipelineTerrainKind` type alias (export type PipelineTerrainKind).

 * Purpose: Supports maintainability by documenting why `PipelineTerrainKind` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type PipelineTerrainKind = (typeof PIPELINE_TERRAIN_KINDS)[number];

/**
 * Documents the `PassabilityTerrain` type alias (export type PassabilityTerrain).

 * Purpose: Supports maintainability by documenting why `PassabilityTerrain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type PassabilityTerrain = 'land' | 'water' | 'coastal' | 'wetlands';

/**
 * Documents the module-scope binding `KIND_SET` (KIND_SET).

 * Purpose: Supports maintainability by documenting why `KIND_SET` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const KIND_SET = new Set<string>(PIPELINE_TERRAIN_KINDS);

/**
 * Defines the `isPipelineTerrainKind` function shape (export function isPipelineTerrainKind(s: string): s is PipelineTerrainKind).

 * Purpose: Supports maintainability by documenting why `isPipelineTerrainKind` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isPipelineTerrainKind(s: string): s is PipelineTerrainKind {
  return KIND_SET.has(s);
}

/**
 * Defines the `pipelineTerrainToPassability` function shape (export function pipelineTerrainToPassability(kind: PipelineTerrainKind): PassabilityTerrain).

 * Purpose: Supports maintainability by documenting why `pipelineTerrainToPassability` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function pipelineTerrainToPassability(kind: PipelineTerrainKind): PassabilityTerrain {
  if (kind === 'water') return 'water';
  if (kind === 'coastal') return 'coastal';
  if (kind === 'wetlands') return 'wetlands';
  return 'land';
}

/**
 * Defines the `passabilityAllowsLandUnit` function shape (export function passabilityAllowsLandUnit(t: PassabilityTerrain | string): boolean).

 * Purpose: Supports maintainability by documenting why `passabilityAllowsLandUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function passabilityAllowsLandUnit(t: PassabilityTerrain | string): boolean {
  return t === 'land' || t === 'coastal' || t === 'wetlands';
}

/**
 * Defines the `passabilityAllowsNavalUnit` function shape (export function passabilityAllowsNavalUnit(t: PassabilityTerrain | string): boolean).

 * Purpose: Supports maintainability by documenting why `passabilityAllowsNavalUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function passabilityAllowsNavalUnit(t: PassabilityTerrain | string): boolean {
  return t === 'water' || t === 'coastal';
}
