import { cellToParent } from 'h3-js';
import type { PipelineTerrainKind } from '../../shared/pipelineTerrain';
import {
  classifyCellWithoutUrbanOverride,
  classifyTacticalTerrainKind,
  isTacticalUrbanOverlayHex,
} from '../terrainClassifierFromMetadata';
import {
  DEFAULT_CLASSIFIER_THRESHOLDS,
  DEFAULT_NODATA_FALLBACK_TERRAIN,
  type HexMetadataRecordStrategic,
  type HexMetadataRecordTactical,
} from '../terrainMetadataLoad';

/**
 * Rolls each strategic cell up to the dominant tactical terrain kind.
 *
 * Purpose: A started match stores this kind on the hex. The preview must use the same rollup without installing the pack.
 * When to use: After both metadata files have been parsed at the preview map's resolutions.
 * Expected outcome: One kind per strategic record. An equal child count keeps the kind that sorts first.
 * Exceptions: None. A tactical child whose parent is absent from the strategic records is counted and then ignored.
 */
export function dominantStrategicTerrainKinds(
  strategicRecords: readonly HexMetadataRecordStrategic[],
  tacticalRecords: readonly HexMetadataRecordTactical[],
  strategicResolution: number
): ReadonlyMap<string, PipelineTerrainKind> {
  const thresholds = DEFAULT_CLASSIFIER_THRESHOLDS;
  const nodata = DEFAULT_NODATA_FALLBACK_TERRAIN;
  const fallback = new Map<string, PipelineTerrainKind>();
  for (const row of strategicRecords) {
    fallback.set(row.h3_index, classifyCellWithoutUrbanOverride(row, thresholds, nodata));
  }
  const childCounts = new Map<string, Map<PipelineTerrainKind, number>>();
  for (const row of tacticalRecords) {
    const childKind = classifyTacticalTerrainKind(row, thresholds, nodata);
    const parentH3 = cellToParent(row.h3_index, strategicResolution);
    let counts = childCounts.get(parentH3);
    if (!counts) {
      counts = new Map<PipelineTerrainKind, number>();
      childCounts.set(parentH3, counts);
    }
    counts.set(childKind, (counts.get(childKind) ?? 0) + 1);
  }
  const kinds = new Map<string, PipelineTerrainKind>();
  for (const row of strategicRecords) {
    const counts = childCounts.get(row.h3_index);
    if (!counts || counts.size === 0) {
      kinds.set(row.h3_index, fallback.get(row.h3_index) ?? nodata);
      continue;
    }
    let dominantKind: PipelineTerrainKind | null = null;
    let dominantCount = -1;
    for (const [kind, count] of counts) {
      if (count > dominantCount || (count === dominantCount && dominantKind !== null && kind.localeCompare(dominantKind) < 0)) {
        dominantKind = kind;
        dominantCount = count;
      }
    }
    kinds.set(row.h3_index, dominantKind ?? fallback.get(row.h3_index) ?? nodata);
  }
  return kinds;
}

/**
 * Counts generated urban tactical cells under each strategic parent.
 *
 * Purpose: Tech icons use this baseline. Air strikes do not change it, and the preview must not read the loaded match's counts.
 * When to use: After the tactical metadata for the preview map has been parsed.
 * Expected outcome: A positive count only for parents that have at least one urban child at or below `urbanOverlayMaxScalerank`. Other parents are absent.
 * Exceptions: None. A child whose parent is outside the footprint is counted and then ignored by the hex builder.
 */
export function baselineUrbanHexCounts(
  tacticalRecords: readonly HexMetadataRecordTactical[],
  strategicResolution: number,
  urbanOverlayMaxScalerank: number
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const row of tacticalRecords) {
    if (!isTacticalUrbanOverlayHex(row, urbanOverlayMaxScalerank)) continue;
    const parentH3 = cellToParent(row.h3_index, strategicResolution);
    counts.set(parentH3, (counts.get(parentH3) ?? 0) + 1);
  }
  return counts;
}
