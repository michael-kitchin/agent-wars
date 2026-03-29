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

export type WaterRelationKind = 'in_water' | 'coastal_band' | 'wetlands_band' | 'no_water';

/**
 * Why this exists:
 *     Derive the water-mask relation string used by terrain classification from exported mask metrics.
 * When to use:
 *     Before interior / water / coastal / wetlands classification for each hex row.
 * What to expect:
 *     `in_water` matches `MaskPolygonMetrics.all_in_mask`; `no_water` when the cell does not intersect water.
 *     For intersecting mixed cells, classifies as `wetlands_band` when `water_edges <= 2`, otherwise `coastal_band`.
 */
export function waterRelationFromMaskMetrics(
  r: Pick<HexMetadataRecordRes1, 'all_water' | 'intersects_water' | 'water_edges'>
): WaterRelationKind {
  if (r.all_water) return 'in_water';
  if (!r.intersects_water) return 'no_water';
  return r.water_edges <= 2 ? 'wetlands_band' : 'coastal_band';
}

function landcoverDictNonEmpty(r: HexMetadataRecordRes1): boolean {
  return r.arctic_mean != null || r.forest_mean != null || r.desert_mean != null;
}

function classifyInteriorBiome(
  r: HexMetadataRecordRes1,
  t: ClassifierThresholds
): Exclude<PipelineTerrainKind, 'water' | 'coastal' | 'wetlands'> {
  const c10 = r.arctic_mean ?? 0;
  const forest = r.forest_mean ?? 0;
  const c11 = r.desert_mean ?? 0;
  if (c10 >= t.arctic_dominant_min) return 'arctic';
  if (forest >= t.forest_dominant_min) return 'forest';
  const tri_ok = r.tri_mean != null && r.tri_mean >= t.mountain_tri_mean_min;
  const slope_ok = r.slope_mean != null && r.slope_mean >= t.mountain_slope_mean_min;
  const elev_ok = r.elevation_max != null && r.elevation_max >= t.mountain_elevation_max_min;
  if (tri_ok || (slope_ok && elev_ok)) return 'mountain';
  if (c11 >= t.desert_barren_min) return 'desert';
  return 'plains';
}

/**
 * Why this exists:
 *     Replay `classify_cell` from aggregated metadata means (res-1 or res-4) without urban override.
 * When to use:
 *     For every parent hex and as the base step for res-4 before urban replacement.
 * What to expect:
 *     Returns pipeline terrain kinds; empty land-cover aggregates yield `nodataFallback` before water checks, matching Python order.
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
 * Why this exists:
 *     Classify a res-4 metadata row into the base terrain kind (urban handled separately as an overlay state).
 * When to use:
 *     When building res-4 base terrain kinds and renderer override rows.
 * What to expect:
 *     Same classification as res-1 replay (`classifyCellWithoutUrbanOverride`) with no urban substitution.
 */
export function classifyRes4TerrainKind(
  r: HexMetadataRecordRes4,
  t: ClassifierThresholds,
  nodataFallback: PipelineTerrainKind
): PipelineTerrainKind {
  return classifyCellWithoutUrbanOverride(r, t, nodataFallback);
}

/**
 * Why this exists:
 *     Determine whether a res-4 hex should be marked as urban overlay without changing its base terrain kind.
 * When to use:
 *     During res-4 cache build and renderer tooltip/fill selection.
 * What to expect:
 *     True when any urban bucket with scalerank <= `maxScalerank` intersects the hex.
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
