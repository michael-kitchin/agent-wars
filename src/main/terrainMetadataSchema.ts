/**
 * The shape and fixed limits of the bundled hex metadata files.
 *
 * Purpose: `terrainMetadataLoad.ts` validates files against this schema.
 * When to use: When reading a metadata constant or a metadata record type.
 * Expected outcome: The schema version, the classifier limits, and the record types.
 * Exceptions: None.
 */

import { GLOBAL_GAME_MAP } from '../shared/activeGameMap';
import { STRATEGIC_H3_RESOLUTION, TACTICAL_H3_RESOLUTION } from '../shared/h3Resolutions';
import type { PipelineTerrainKind } from '../shared/pipelineTerrain';

/**
 * Documents the module-scope binding `EXPECTED_HEX_METADATA_SCHEMA_VERSION` (EXPECTED_HEX_METADATA_SCHEMA_VERSION).

 * Purpose: Supports maintainability by documenting why `EXPECTED_HEX_METADATA_SCHEMA_VERSION` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const EXPECTED_HEX_METADATA_SCHEMA_VERSION = '2.0.0';

/**
 * Documents the `ClassifierThresholds` interface as a named contract surface (export interface ClassifierThresholds).

 * Purpose: Supports maintainability by documenting why `ClassifierThresholds` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ClassifierThresholds {
    /**
   * Specifies the contract for the `arctic_dominant_min` member (arctic_dominant_min: number;).

   * Contract: Describes stable behavior for callers of `arctic_dominant_min` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
arctic_dominant_min: number;
    /**
   * Specifies the contract for the `forest_dominant_min` member (forest_dominant_min: number;).

   * Contract: Describes stable behavior for callers of `forest_dominant_min` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
forest_dominant_min: number;
    /**
   * Specifies the contract for the `desert_barren_min` member (desert_barren_min: number;).

   * Contract: Describes stable behavior for callers of `desert_barren_min` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
desert_barren_min: number;
    /**
   * Specifies the contract for the `mountain_tri_mean_min` member (mountain_tri_mean_min: number;).

   * Contract: Describes stable behavior for callers of `mountain_tri_mean_min` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
mountain_tri_mean_min: number;
    /**
   * Specifies the contract for the `mountain_slope_mean_min` member (mountain_slope_mean_min: number;).

   * Contract: Describes stable behavior for callers of `mountain_slope_mean_min` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
mountain_slope_mean_min: number;
    /**
   * Specifies the contract for the `mountain_elevation_max_min` member (mountain_elevation_max_min: number;).

   * Contract: Describes stable behavior for callers of `mountain_elevation_max_min` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
mountain_elevation_max_min: number;
}

/**
 * Documents the module-scope binding `DEFAULT_CLASSIFIER_THRESHOLDS` (DEFAULT_CLASSIFIER_THRESHOLDS: Readonly<ClassifierThresholds>).

 * Purpose: Supports maintainability by documenting why `DEFAULT_CLASSIFIER_THRESHOLDS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const DEFAULT_CLASSIFIER_THRESHOLDS: Readonly<ClassifierThresholds> = {
    /**
   * Documents the object literal property `arctic_dominant_min` (arctic_dominant_min: 26).

   * Purpose: Supports maintainability by documenting why `arctic_dominant_min` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
arctic_dominant_min: 26,
    /**
   * Documents the object literal property `forest_dominant_min` (forest_dominant_min: 38).

   * Purpose: Supports maintainability by documenting why `forest_dominant_min` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
forest_dominant_min: 38,
    /**
   * Documents the object literal property `desert_barren_min` (desert_barren_min: 28).

   * Purpose: Supports maintainability by documenting why `desert_barren_min` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
desert_barren_min: 28,
    /**
   * Documents the object literal property `mountain_tri_mean_min` (mountain_tri_mean_min: 24).

   * Purpose: Supports maintainability by documenting why `mountain_tri_mean_min` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
mountain_tri_mean_min: 24,
    /**
   * Documents the object literal property `mountain_slope_mean_min` (mountain_slope_mean_min: 5).

   * Purpose: Supports maintainability by documenting why `mountain_slope_mean_min` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
mountain_slope_mean_min: 5,
    /**
   * Documents the object literal property `mountain_elevation_max_min` (mountain_elevation_max_min: 700).

   * Purpose: Supports maintainability by documenting why `mountain_elevation_max_min` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
mountain_elevation_max_min: 700,
};

/**
 * Documents the module-scope binding `DEFAULT_NODATA_FALLBACK_TERRAIN` (DEFAULT_NODATA_FALLBACK_TERRAIN: PipelineTerrainKind).

 * Purpose: Supports maintainability by documenting why `DEFAULT_NODATA_FALLBACK_TERRAIN` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const DEFAULT_NODATA_FALLBACK_TERRAIN: PipelineTerrainKind = 'water';

/**
 * H3 resolution of parent cells in terrain metadata packs.
 *
 * Purpose: Names the strategic resolution used when validating strategic metadata rows.
 * When to use: Terrain metadata load and validation.
 * Expected outcome: Always equals `STRATEGIC_H3_RESOLUTION` (1).
 * Exceptions: None.
 */
export const METADATA_PARENT_RESOLUTION = STRATEGIC_H3_RESOLUTION;
/**
 * H3 resolution of child cells in terrain metadata packs.
 *
 * Purpose: Names the tactical resolution used when validating tactical metadata rows.
 * When to use: Terrain metadata load and validation.
 * Expected outcome: Always equals `TACTICAL_H3_RESOLUTION` (4).
 * Exceptions: None.
 */
export const METADATA_CHILD_RESOLUTION = TACTICAL_H3_RESOLUTION;

/**
 * Documents the module-scope binding `TERRAIN_METADATA_COUNT_KEYS` (TERRAIN_METADATA_COUNT_KEYS).

 * Purpose: Supports maintainability by documenting why `TERRAIN_METADATA_COUNT_KEYS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const TERRAIN_METADATA_COUNT_KEYS = {
  airport_count_total: 'airport_count_total',
  airport_count_by_scalerank: 'airport_count_by_scalerank',
  seaport_count_total: 'seaport_count_total',
  seaport_count_by_scalerank: 'seaport_count_by_scalerank',
} as const;

/**
 * Documents the `ScalerankCountRow` interface as a named contract surface (export interface ScalerankCountRow).

 * Purpose: Supports maintainability by documenting why `ScalerankCountRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ScalerankCountRow {
    /**
   * Specifies the contract for the `scalerank` member (scalerank: number;).

   * Contract: Describes stable behavior for callers of `scalerank` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
scalerank: number;
    /**
   * Specifies the contract for the `count` member (count: number;).

   * Contract: Describes stable behavior for callers of `count` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
count: number;
}

/**
 * Documents the `UrbanByScalerankRow` interface as a named contract surface (export interface UrbanByScalerankRow).

 * Purpose: Supports maintainability by documenting why `UrbanByScalerankRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface UrbanByScalerankRow {
    /**
   * Specifies the contract for the `scalerank` member (scalerank: number;).

   * Contract: Describes stable behavior for callers of `scalerank` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
scalerank: number;
    /**
   * Specifies the contract for the `all_urban` member (all_urban: boolean;).

   * Contract: Describes stable behavior for callers of `all_urban` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
all_urban: boolean;
    /**
   * Specifies the contract for the `intersects_urban` member (intersects_urban: boolean;).

   * Contract: Describes stable behavior for callers of `intersects_urban` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
intersects_urban: boolean;
    /**
   * Specifies the contract for the `urban_edges` member (urban_edges: number;).

   * Contract: Describes stable behavior for callers of `urban_edges` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urban_edges: number;
}

/**
 * Documents the module-scope binding `MAJOR_POINT_FEATURE_MAX_SCALERANK` (MAJOR_POINT_FEATURE_MAX_SCALERANK).

 * Purpose: Supports maintainability by documenting why `MAJOR_POINT_FEATURE_MAX_SCALERANK` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const MAJOR_POINT_FEATURE_MAX_SCALERANK = GLOBAL_GAME_MAP.scaleranks.airport;

/**
 * Documents the module-scope binding `URBAN_OVERLAY_MAX_SCALERANK` (URBAN_OVERLAY_MAX_SCALERANK).

 * Purpose: Supports maintainability by documenting why `URBAN_OVERLAY_MAX_SCALERANK` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const URBAN_OVERLAY_MAX_SCALERANK = GLOBAL_GAME_MAP.scaleranks.urbanOverlay;

/**
 * Documents the `HexMetadataRecordStrategic` interface as a named contract surface (export interface HexMetadataRecordStrategic).

 * Purpose: Supports maintainability by documenting why `HexMetadataRecordStrategic` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexMetadataRecordStrategic {
    /**
   * Specifies the contract for the `h3_index` member (h3_index: string;).

   * Contract: Describes stable behavior for callers of `h3_index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3_index: string;
    /**
   * Specifies the contract for the `total_edges` member (total_edges: number;).

   * Contract: Describes stable behavior for callers of `total_edges` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
total_edges: number;
    /**
   * Specifies the contract for the `all_water` member (all_water: boolean;).

   * Contract: Describes stable behavior for callers of `all_water` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
all_water: boolean;
    /**
   * Specifies the contract for the `intersects_water` member (intersects_water: boolean;).

   * Contract: Describes stable behavior for callers of `intersects_water` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
intersects_water: boolean;
    /**
   * Specifies the contract for the `water_edges` member (water_edges: number;).

   * Contract: Describes stable behavior for callers of `water_edges` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
water_edges: number;
    /**
   * Specifies the contract for the `arctic_mean` member (arctic_mean: number | null;).

   * Contract: Describes stable behavior for callers of `arctic_mean` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
arctic_mean: number | null;
    /**
   * Specifies the contract for the `forest_mean` member (forest_mean: number | null;).

   * Contract: Describes stable behavior for callers of `forest_mean` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
forest_mean: number | null;
    /**
   * Specifies the contract for the `desert_mean` member (desert_mean: number | null;).

   * Contract: Describes stable behavior for callers of `desert_mean` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
desert_mean: number | null;
    /**
   * Specifies the contract for the `tri_mean` member (tri_mean: number | null;).

   * Contract: Describes stable behavior for callers of `tri_mean` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tri_mean: number | null;
    /**
   * Specifies the contract for the `slope_mean` member (slope_mean: number | null;).

   * Contract: Describes stable behavior for callers of `slope_mean` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
slope_mean: number | null;
    /**
   * Specifies the contract for the `elevation_max` member (elevation_max: number | null;).

   * Contract: Describes stable behavior for callers of `elevation_max` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
elevation_max: number | null;
    /**
   * Specifies the contract for the `airport_count_total` member (airport_count_total: number;).

   * Contract: Describes stable behavior for callers of `airport_count_total` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airport_count_total: number;
    /**
   * Specifies the contract for the `airport_count_by_scalerank` member (airport_count_by_scalerank: ScalerankCountRow[];).

   * Contract: Describes stable behavior for callers of `airport_count_by_scalerank` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airport_count_by_scalerank: ScalerankCountRow[];
    /**
   * Specifies the contract for the `seaport_count_total` member (seaport_count_total: number;).

   * Contract: Describes stable behavior for callers of `seaport_count_total` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaport_count_total: number;
    /**
   * Specifies the contract for the `seaport_count_by_scalerank` member (seaport_count_by_scalerank: ScalerankCountRow[];).

   * Contract: Describes stable behavior for callers of `seaport_count_by_scalerank` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaport_count_by_scalerank: ScalerankCountRow[];
}

/**
 * Documents the `HexMetadataRecordTactical` interface as a named contract surface (export interface HexMetadataRecordTactical extends HexMetadataRecordStrategic).

 * Purpose: Supports maintainability by documenting why `HexMetadataRecordTactical` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexMetadataRecordTactical extends HexMetadataRecordStrategic {
    /**
   * Specifies the contract for the `all_urban` member (all_urban: boolean;).

   * Contract: Describes stable behavior for callers of `all_urban` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
all_urban: boolean;
    /**
   * Specifies the contract for the `intersects_urban` member (intersects_urban: boolean;).

   * Contract: Describes stable behavior for callers of `intersects_urban` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
intersects_urban: boolean;
    /**
   * Specifies the contract for the `urban_edges` member (urban_edges: number;).

   * Contract: Describes stable behavior for callers of `urban_edges` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urban_edges: number;
    /**
   * Specifies the contract for the `urban_by_scalerank` member (urban_by_scalerank: UrbanByScalerankRow[];).

   * Contract: Describes stable behavior for callers of `urban_by_scalerank` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urban_by_scalerank: UrbanByScalerankRow[];
}

/**
 * Documents the `HexMetadataEnvelope` interface as a named contract surface (export interface HexMetadataEnvelope).

 * Purpose: Supports maintainability by documenting why `HexMetadataEnvelope` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexMetadataEnvelope {
    /**
   * Specifies the contract for the `schema_version` member (schema_version: string;).

   * Contract: Describes stable behavior for callers of `schema_version` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
schema_version: string;
    /**
   * Specifies the contract for the `resolution` member (resolution: number;).

   * Contract: Describes stable behavior for callers of `resolution` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
resolution: number;
    /**
   * Specifies the contract for the `record_count` member (record_count: number;).

   * Contract: Describes stable behavior for callers of `record_count` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
record_count: number;
    /**
   * Specifies the contract for the `records` member (records: HexMetadataRecordStrategic[] | HexMetadataRecordTactical[];).

   * Contract: Describes stable behavior for callers of `records` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
records: HexMetadataRecordStrategic[] | HexMetadataRecordTactical[];
}
