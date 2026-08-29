/** Loads and validates terrain hex metadata envelopes from the Python metadata pipeline. */

import * as fs from 'fs';
import { getResolution } from 'h3-js';
import { logDebug, logError, logTrace } from './logger';
import type { PipelineTerrainKind } from '../shared/pipelineTerrain';
import { resolveTerrainRes1MetadataPath, resolveTerrainRes4MetadataPath } from './terrainMetadataPaths';

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
 * Documents the module-scope binding `METADATA_PARENT_RESOLUTION` (METADATA_PARENT_RESOLUTION).

 * Purpose: Supports maintainability by documenting why `METADATA_PARENT_RESOLUTION` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const METADATA_PARENT_RESOLUTION = 1;
/**
 * Documents the module-scope binding `METADATA_CHILD_RESOLUTION` (METADATA_CHILD_RESOLUTION).

 * Purpose: Supports maintainability by documenting why `METADATA_CHILD_RESOLUTION` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const METADATA_CHILD_RESOLUTION = 4;

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
export const MAJOR_POINT_FEATURE_MAX_SCALERANK = 5;

/**
 * Documents the module-scope binding `URBAN_OVERLAY_MAX_SCALERANK` (URBAN_OVERLAY_MAX_SCALERANK).

 * Purpose: Supports maintainability by documenting why `URBAN_OVERLAY_MAX_SCALERANK` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const URBAN_OVERLAY_MAX_SCALERANK = 5;

/**
 * Documents the `HexMetadataRecordRes1` interface as a named contract surface (export interface HexMetadataRecordRes1).

 * Purpose: Supports maintainability by documenting why `HexMetadataRecordRes1` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexMetadataRecordRes1 {
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
 * Documents the `HexMetadataRecordRes4` interface as a named contract surface (export interface HexMetadataRecordRes4 extends HexMetadataRecordRes1).

 * Purpose: Supports maintainability by documenting why `HexMetadataRecordRes4` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexMetadataRecordRes4 extends HexMetadataRecordRes1 {
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
   * Specifies the contract for the `records` member (records: HexMetadataRecordRes1[] | HexMetadataRecordRes4[];).

   * Contract: Describes stable behavior for callers of `records` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
records: HexMetadataRecordRes1[] | HexMetadataRecordRes4[];
}

/**
 * Defines the `isRecord` function shape (function isRecord(x: unknown): x is Record<string, unknown>).

 * Purpose: Supports maintainability by documenting why `isRecord` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/**
 * Defines the `readNum` function shape (function readNum(r: Record<string, unknown>, key: string): number | null).

 * Purpose: Supports maintainability by documenting why `readNum` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readNum(r: Record<string, unknown>, key: string): number | null {
  const v = r[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`terrain metadata: "${key}" must be a number or null`);
  }
  return v;
}

/**
 * Defines the `readBool` function shape (function readBool(r: Record<string, unknown>, key: string): boolean).

 * Purpose: Supports maintainability by documenting why `readBool` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readBool(r: Record<string, unknown>, key: string): boolean {
  const v = r[key];
  if (typeof v !== 'boolean') throw new Error(`terrain metadata: "${key}" must be a boolean`);
  return v;
}

/**
 * Defines the `readInt` function shape (function readInt(r: Record<string, unknown>, key: string): number).

 * Purpose: Supports maintainability by documenting why `readInt` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readInt(r: Record<string, unknown>, key: string): number {
  const v = r[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`terrain metadata: "${key}" must be an integer`);
  }
  return v;
}

/**
 * Defines the `readStr` function shape (function readStr(r: Record<string, unknown>, key: string): string).

 * Purpose: Supports maintainability by documenting why `readStr` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readStr(r: Record<string, unknown>, key: string): string {
  const v = r[key];
  if (typeof v !== 'string' || !v) throw new Error(`terrain metadata: "${key}" must be a non-empty string`);
  return v;
}

/**
 * Defines the `readOptionalIntNonNegative` function shape (function readOptionalIntNonNegative(r: Record<string, unknown>, key: string, defaultValue: number): number).

 * Purpose: Supports maintainability by documenting why `readOptionalIntNonNegative` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readOptionalIntNonNegative(r: Record<string, unknown>, key: string, defaultValue: number): number {
  const v = r[key];
  if (v === undefined || v === null) return defaultValue;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`terrain metadata: optional "${key}" must be a non-negative integer`);
  }
  return v;
}

/**
 * Defines the `readScalerankCountArray` function shape (function readScalerankCountArray(r: Record<string, unknown>, key: string): ScalerankCountRow[]).

 * Purpose: Supports maintainability by documenting why `readScalerankCountArray` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readScalerankCountArray(r: Record<string, unknown>, key: string): ScalerankCountRow[] {
  const v = r[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error(`terrain metadata: "${key}" must be an array`);
  const out: ScalerankCountRow[] = [];
  for (let i = 0; i < v.length; i++) {
    const el = v[i];
    if (!isRecord(el)) throw new Error(`terrain metadata: ${key}[${i}] must be an object`);
    out.push({
      scalerank: readInt(el, 'scalerank'),
      count: readInt(el, 'count'),
    });
  }
  return out;
}

/**
 * Defines the `readUrbanByScalerankArray` function shape (function readUrbanByScalerankArray(r: Record<string, unknown>, key: string): UrbanByScalerankRow[]).

 * Purpose: Supports maintainability by documenting why `readUrbanByScalerankArray` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function readUrbanByScalerankArray(r: Record<string, unknown>, key: string): UrbanByScalerankRow[] {
  const v = r[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error(`terrain metadata: "${key}" must be an array`);
  const out: UrbanByScalerankRow[] = [];
  for (let i = 0; i < v.length; i++) {
    const el = v[i];
    if (!isRecord(el)) throw new Error(`terrain metadata: ${key}[${i}] must be an object`);
    out.push({
      scalerank: readInt(el, 'scalerank'),
      all_urban: readBool(el, 'all_urban'),
      intersects_urban: readBool(el, 'intersects_urban'),
      urban_edges: readInt(el, 'urban_edges'),
    });
  }
  return out;
}

/**
 * Defines the `recordHasMajorAirport` function shape (export function recordHasMajorAirport( r: Pick<HexMetadataRecordRes1, 'airport_count_by_scalerank'>, maxRank = MAJOR_POINT_FEATURE_MAX_SCALERANK ): boole).

 * Purpose: Supports maintainability by documenting why `recordHasMajorAirport` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function recordHasMajorAirport(
  r: Pick<HexMetadataRecordRes1, 'airport_count_by_scalerank'>,
  maxRank = MAJOR_POINT_FEATURE_MAX_SCALERANK
): boolean {
  for (const row of r.airport_count_by_scalerank) {
    if (row.count <= 0) continue;
    if (row.scalerank >= 0 && row.scalerank <= maxRank) return true;
  }
  return false;
}

/**
 * Defines the `recordHasMajorSeaport` function shape (export function recordHasMajorSeaport( r: Pick<HexMetadataRecordRes1, 'seaport_count_by_scalerank'>, maxRank = MAJOR_POINT_FEATURE_MAX_SCALERANK ): boole).

 * Purpose: Supports maintainability by documenting why `recordHasMajorSeaport` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function recordHasMajorSeaport(
  r: Pick<HexMetadataRecordRes1, 'seaport_count_by_scalerank'>,
  maxRank = MAJOR_POINT_FEATURE_MAX_SCALERANK
): boolean {
  for (const row of r.seaport_count_by_scalerank) {
    if (row.count <= 0) continue;
    if (row.scalerank >= 0 && row.scalerank <= maxRank) return true;
  }
  return false;
}

/**
 * Defines the `parseRes1Row` function shape (function parseRes1Row(raw: unknown, resolution: number): HexMetadataRecordRes1).

 * Purpose: Supports maintainability by documenting why `parseRes1Row` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function parseRes1Row(raw: unknown, resolution: number): HexMetadataRecordRes1 {
  if (!isRecord(raw)) throw new Error('terrain metadata: record must be an object');
  const h3Index = readStr(raw, 'h3_index');
  if (getResolution(h3Index) !== resolution) {
    throw new Error(`terrain metadata: h3_index ${h3Index} resolution != envelope ${resolution}`);
  }
  return {
    h3_index: h3Index,
    total_edges: readInt(raw, 'total_edges'),
    all_water: readBool(raw, 'all_water'),
    intersects_water: readBool(raw, 'intersects_water'),
    water_edges: readInt(raw, 'water_edges'),
    arctic_mean: readNum(raw, 'arctic_mean'),
    forest_mean: readNum(raw, 'forest_mean'),
    desert_mean: readNum(raw, 'desert_mean'),
    tri_mean: readNum(raw, 'tri_mean'),
    slope_mean: readNum(raw, 'slope_mean'),
    elevation_max: readNum(raw, 'elevation_max'),
    airport_count_total: readOptionalIntNonNegative(raw, TERRAIN_METADATA_COUNT_KEYS.airport_count_total, 0),
    airport_count_by_scalerank: readScalerankCountArray(raw, TERRAIN_METADATA_COUNT_KEYS.airport_count_by_scalerank),
    seaport_count_total: readOptionalIntNonNegative(raw, TERRAIN_METADATA_COUNT_KEYS.seaport_count_total, 0),
    seaport_count_by_scalerank: readScalerankCountArray(raw, TERRAIN_METADATA_COUNT_KEYS.seaport_count_by_scalerank),
  };
}

/**
 * Defines the `parseRes4Row` function shape (function parseRes4Row(raw: unknown, resolution: number): HexMetadataRecordRes4).

 * Purpose: Supports maintainability by documenting why `parseRes4Row` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function parseRes4Row(raw: unknown, resolution: number): HexMetadataRecordRes4 {
  const base = parseRes1Row(raw, resolution);
  if (!isRecord(raw)) throw new Error('terrain metadata: record must be an object');
  return {
    ...base,
    all_urban: readBool(raw, 'all_urban'),
    intersects_urban: readBool(raw, 'intersects_urban'),
    urban_edges: readInt(raw, 'urban_edges'),
    urban_by_scalerank: readUrbanByScalerankArray(raw, 'urban_by_scalerank'),
  };
}

/**
 * Defines the `parseMetadataEnvelope` function shape (function parseMetadataEnvelope(raw: unknown, expectedResolution: number): HexMetadataEnvelope).

 * Purpose: Supports maintainability by documenting why `parseMetadataEnvelope` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function parseMetadataEnvelope(raw: unknown, expectedResolution: number): HexMetadataEnvelope {
  if (!isRecord(raw)) throw new Error('terrain metadata: root must be an object');
  if (raw.schema_version !== EXPECTED_HEX_METADATA_SCHEMA_VERSION) {
    throw new Error(
      `terrain metadata: schema_version ${String(raw.schema_version)} != ${EXPECTED_HEX_METADATA_SCHEMA_VERSION}`
    );
  }
  const resolution = readInt(raw, 'resolution');
  if (resolution !== expectedResolution) {
    throw new Error(`terrain metadata: resolution ${resolution} != expected ${expectedResolution}`);
  }
  const recordCount = readInt(raw, 'record_count');
  const recs = raw.records;
  if (!Array.isArray(recs)) throw new Error('terrain metadata: records must be an array');
  if (recs.length !== recordCount) {
    throw new Error(`terrain metadata: record_count ${recordCount} != len(records) ${recs.length}`);
  }
  const parseRow =
    expectedResolution === 4 ? (r: unknown) => parseRes4Row(r, 4) : (r: unknown) => parseRes1Row(r, 1);
  const records = recs.map((r, i) => {
    try {
      return parseRow(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`terrain metadata: records[${i}]: ${msg}`);
    }
  }) as HexMetadataRecordRes1[] | HexMetadataRecordRes4[];
  const seen = new Set<string>();
  for (const row of records) {
    if (seen.has(row.h3_index)) throw new Error(`terrain metadata: duplicate h3_index ${row.h3_index}`);
    seen.add(row.h3_index);
  }
  return {
    schema_version: String(raw.schema_version),
    resolution,
    record_count: recordCount,
    records,
  };
}

/**
 * Defines the `loadTerrainRes1MetadataFromPath` function shape (export function loadTerrainRes1MetadataFromPath(absPath: string): HexMetadataEnvelope).

 * Purpose: Supports maintainability by documenting why `loadTerrainRes1MetadataFromPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainRes1MetadataFromPath(absPath: string): HexMetadataEnvelope {
  logDebug('terrainMetadataLoad loadTerrainRes1MetadataFromPath', { absPath });
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(absPath, 'utf8')) as unknown;
  } catch (err) {
    logError('terrainMetadataLoad loadTerrainRes1MetadataFromPath: read/parse failed', err);
    throw err;
  }
  return parseMetadataEnvelope(parsed, 1);
}

/**
 * Defines the `loadTerrainRes4MetadataFromPath` function shape (export function loadTerrainRes4MetadataFromPath(absPath: string): HexMetadataEnvelope).

 * Purpose: Supports maintainability by documenting why `loadTerrainRes4MetadataFromPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainRes4MetadataFromPath(absPath: string): HexMetadataEnvelope {
  logDebug('terrainMetadataLoad loadTerrainRes4MetadataFromPath', { absPath });
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(absPath, 'utf8')) as unknown;
  } catch (err) {
    logError('terrainMetadataLoad loadTerrainRes4MetadataFromPath: read/parse failed', err);
    throw err;
  }
  return parseMetadataEnvelope(parsed, 4);
}

/**
 * Defines the `loadTerrainRes1MetadataBundled` function shape (export function loadTerrainRes1MetadataBundled(): HexMetadataEnvelope).

 * Purpose: Supports maintainability by documenting why `loadTerrainRes1MetadataBundled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainRes1MetadataBundled(): HexMetadataEnvelope {
  logTrace('terrainMetadataLoad loadTerrainRes1MetadataBundled');
  return loadTerrainRes1MetadataFromPath(resolveTerrainRes1MetadataPath());
}

/**
 * Defines the `loadTerrainRes4MetadataBundled` function shape (export function loadTerrainRes4MetadataBundled(): HexMetadataEnvelope).

 * Purpose: Supports maintainability by documenting why `loadTerrainRes4MetadataBundled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainRes4MetadataBundled(): HexMetadataEnvelope {
  logTrace('terrainMetadataLoad loadTerrainRes4MetadataBundled');
  return loadTerrainRes4MetadataFromPath(resolveTerrainRes4MetadataPath());
}

/**
 * Defines the `assertTerrainMetadataMatchesHexList` function shape (export function assertTerrainMetadataMatchesHexList().

 * Purpose: Supports maintainability by documenting why `assertTerrainMetadataMatchesHexList` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function assertTerrainMetadataMatchesHexList(
  byH3: ReadonlyMap<string, PipelineTerrainKind>,
  expectedHexes: readonly string[]
): void {
  logTrace('terrainMetadataLoad assertTerrainMetadataMatchesHexList', { expectedCount: expectedHexes.length });
  if (byH3.size !== expectedHexes.length) {
    throw new Error(`terrain metadata classified count ${byH3.size} !== expected hex count ${expectedHexes.length}`);
  }
  for (const h of expectedHexes) {
    if (!byH3.has(h)) {
      throw new Error(`terrain metadata missing h3_index ${h}`);
    }
  }
}
