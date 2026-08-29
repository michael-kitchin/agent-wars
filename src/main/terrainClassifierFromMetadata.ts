/**
 * Deterministic terrain classification from hex metadata rows; mirrors `scripts/terrain_pipeline/classifier.py` + res-4 urban override in `pipeline.py`.
 */

import {
  URBAN_OVERLAY_MAX_SCALERANK,
  type ClassifierThresholds,
  type HexMetadataRecordRes1,
  type HexMetadataRecordRes4,
} from './terrainMetadataLoad';
import type { PipelineTerrainKind } from '../shared/pipelineTerrain';

/**
 * Documents the `WaterRelationKind` type alias (export type WaterRelationKind).

 * Purpose: Supports maintainability by documenting why `WaterRelationKind` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type WaterRelationKind = 'in_water' | 'coastal_band' | 'wetlands_band' | 'no_water';

/**
 * Defines the `waterRelationFromMaskMetrics` function shape (export function waterRelationFromMaskMetrics().

 * Purpose: Supports maintainability by documenting why `waterRelationFromMaskMetrics` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function waterRelationFromMaskMetrics(
  r: Pick<HexMetadataRecordRes1, 'all_water' | 'intersects_water' | 'water_edges'>
): WaterRelationKind {
  if (r.all_water) return 'in_water';
  if (!r.intersects_water) return 'no_water';
  return r.water_edges <= 2 ? 'wetlands_band' : 'coastal_band';
}

/**
 * Defines the `landcoverDictNonEmpty` function shape (function landcoverDictNonEmpty(r: HexMetadataRecordRes1): boolean).

 * Purpose: Supports maintainability by documenting why `landcoverDictNonEmpty` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function landcoverDictNonEmpty(r: HexMetadataRecordRes1): boolean {
  return r.arctic_mean != null || r.forest_mean != null || r.desert_mean != null;
}

/**
 * Defines the `classifyInteriorBiome` function shape (function classifyInteriorBiome( r: HexMetadataRecordRes1, t: ClassifierThresholds ): Exclude<PipelineTerrainKind, 'water' | 'coastal' | 'wetlands'> {).

 * Purpose: Supports maintainability by documenting why `classifyInteriorBiome` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function classifyInteriorBiome(
  r: HexMetadataRecordRes1,
  t: ClassifierThresholds
): Exclude<PipelineTerrainKind, 'water' | 'coastal' | 'wetlands'> {
  const c10 = r.arctic_mean ?? 0;
  const forest = r.forest_mean ?? 0;
  const c11 = r.desert_mean ?? 0;
  if (c10 >= t.arctic_dominant_min) return 'arctic';
  if (forest >= t.forest_dominant_min) return 'forest';
  const triOk = r.tri_mean != null && r.tri_mean >= t.mountain_tri_mean_min;
  const slopeOk = r.slope_mean != null && r.slope_mean >= t.mountain_slope_mean_min;
  const elevOk = r.elevation_max != null && r.elevation_max >= t.mountain_elevation_max_min;
  if (triOk || (slopeOk && elevOk)) return 'mountain';
  if (c11 >= t.desert_barren_min) return 'desert';
  return 'plains';
}

/**
 * Defines the `classifyCellWithoutUrbanOverride` function shape (export function classifyCellWithoutUrbanOverride( r: HexMetadataRecordRes1, t: ClassifierThresholds, nodataFallback: PipelineTerrainKind ): PipelineTe).

 * Purpose: Supports maintainability by documenting why `classifyCellWithoutUrbanOverride` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function classifyCellWithoutUrbanOverride(
  r: HexMetadataRecordRes1,
  t: ClassifierThresholds,
  nodataFallback: PipelineTerrainKind
): PipelineTerrainKind {
  if (!landcoverDictNonEmpty(r)) return nodataFallback;
  const wr = waterRelationFromMaskMetrics(r);
  if (wr === 'in_water') return 'water';
  if (wr === 'wetlands_band') return 'wetlands';
  if (wr === 'coastal_band') return 'coastal';
  return classifyInteriorBiome(r, t);
}

/**
 * Defines the `classifyRes4TerrainKind` function shape (export function classifyRes4TerrainKind( r: HexMetadataRecordRes4, t: ClassifierThresholds, nodataFallback: PipelineTerrainKind ): PipelineTerrainKind).

 * Purpose: Supports maintainability by documenting why `classifyRes4TerrainKind` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function classifyRes4TerrainKind(
  r: HexMetadataRecordRes4,
  t: ClassifierThresholds,
  nodataFallback: PipelineTerrainKind
): PipelineTerrainKind {
  return classifyCellWithoutUrbanOverride(r, t, nodataFallback);
}

/**
 * Defines the `isRes4UrbanOverlayHex` function shape (export function isRes4UrbanOverlayHex().

 * Purpose: Supports maintainability by documenting why `isRes4UrbanOverlayHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isRes4UrbanOverlayHex(
  r: Pick<HexMetadataRecordRes4, 'urban_by_scalerank'>,
  maxScalerank = URBAN_OVERLAY_MAX_SCALERANK
): boolean {
  for (const row of r.urban_by_scalerank) {
    if (row.scalerank < 0 || row.scalerank > maxScalerank) continue;
    if (row.intersects_urban || row.all_urban) return true;
  }
  return false;
}
