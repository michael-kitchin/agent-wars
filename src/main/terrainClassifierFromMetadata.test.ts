/**
 * Essential contracts for metadata-driven classification (mirrors Python `classifier.py` order).
 */

import * as assert from 'assert';
import type { ClassifierThresholds } from './terrainMetadataLoad';
import type { HexMetadataRecordRes1, HexMetadataRecordRes4 } from './terrainMetadataLoad';
import { recordHasMajorAirport, recordHasMajorSeaport } from './terrainMetadataLoad';
import {
  classifyCellWithoutUrbanOverride,
  classifyRes4TerrainKind,
  isRes4UrbanOverlayHex,
  waterRelationFromMaskMetrics,
} from './terrainClassifierFromMetadata';

/**
 * Documents the module-scope binding `t` (t: ClassifierThresholds).

 * Purpose: Supports maintainability by documenting why `t` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const t: ClassifierThresholds = {
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
 * Defines the `baseRow` function shape (function baseRow(partial: Partial<HexMetadataRecordRes1>): HexMetadataRecordRes1).

 * Purpose: Supports maintainability by documenting why `baseRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function baseRow(partial: Partial<HexMetadataRecordRes1>): HexMetadataRecordRes1 {
  return {
    h3_index: '81003ffffffffff',
    total_edges: 6,
    all_water: false,
    intersects_water: false,
    water_edges: 0,
    arctic_mean: null,
    forest_mean: null,
    desert_mean: null,
    tri_mean: null,
    slope_mean: null,
    elevation_max: null,
    airport_count_total: 0,
    airport_count_by_scalerank: [],
    seaport_count_total: 0,
    seaport_count_by_scalerank: [],
    ...partial,
  };
}

/**
 * Defines the `testWaterRelationFromMaskMetrics` function shape (function testWaterRelationFromMaskMetrics(): void).

 * Purpose: Supports maintainability by documenting why `testWaterRelationFromMaskMetrics` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testWaterRelationFromMaskMetrics(): void {
  assert.strictEqual(waterRelationFromMaskMetrics({ all_water: true, intersects_water: true, water_edges: 6 }), 'in_water');
  assert.strictEqual(waterRelationFromMaskMetrics({ all_water: false, intersects_water: false, water_edges: 0 }), 'no_water');
  assert.strictEqual(waterRelationFromMaskMetrics({ all_water: false, intersects_water: true, water_edges: 2 }), 'wetlands_band');
  assert.strictEqual(waterRelationFromMaskMetrics({ all_water: false, intersects_water: true, water_edges: 3 }), 'coastal_band');
}

/**
 * Defines the `testEmptyLandcoverIsNodataBeforeCoastal` function shape (function testEmptyLandcoverIsNodataBeforeCoastal(): void).

 * Purpose: Supports maintainability by documenting why `testEmptyLandcoverIsNodataBeforeCoastal` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testEmptyLandcoverIsNodataBeforeCoastal(): void {
  const r = baseRow({ all_water: false, intersects_water: true, water_edges: 3 });
  assert.strictEqual(classifyCellWithoutUrbanOverride(r, t, 'desert'), 'desert');
}

/**
 * Defines the `testInWaterWithLandcoverIsWater` function shape (function testInWaterWithLandcoverIsWater(): void).

 * Purpose: Supports maintainability by documenting why `testInWaterWithLandcoverIsWater` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testInWaterWithLandcoverIsWater(): void {
  const r = baseRow({
    all_water: true,
    intersects_water: true,
    arctic_mean: 0,
    forest_mean: 0,
    desert_mean: 0,
  });
  assert.strictEqual(classifyCellWithoutUrbanOverride(r, t, 'water'), 'water');
}

/**
 * Defines the `testWetlandsBandWithLandcoverIsWetlands` function shape (function testWetlandsBandWithLandcoverIsWetlands(): void).

 * Purpose: Supports maintainability by documenting why `testWetlandsBandWithLandcoverIsWetlands` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testWetlandsBandWithLandcoverIsWetlands(): void {
  const r = baseRow({
    all_water: false,
    intersects_water: true,
    water_edges: 2,
    arctic_mean: 0,
    forest_mean: 0,
    desert_mean: 0,
  });
  assert.strictEqual(classifyCellWithoutUrbanOverride(r, t, 'water'), 'wetlands');
}

/**
 * Defines the `testInteriorForest` function shape (function testInteriorForest(): void).

 * Purpose: Supports maintainability by documenting why `testInteriorForest` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testInteriorForest(): void {
  const r = baseRow({
    arctic_mean: 0,
    forest_mean: 40,
    desert_mean: 0,
  });
  assert.strictEqual(classifyCellWithoutUrbanOverride(r, t, 'water'), 'forest');
}

/**
 * Defines the `testRes4UrbanOverride` function shape (function testRes4UrbanOverride(): void).

 * Purpose: Supports maintainability by documenting why `testRes4UrbanOverride` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testRes4UrbanOverride(): void {
  const r: HexMetadataRecordRes4 = {
    ...baseRow({
      all_water: false,
      intersects_water: false,
      arctic_mean: 0,
      forest_mean: 10,
      desert_mean: 0,
    }),
    all_urban: false,
    intersects_urban: true,
    urban_edges: 2,
    urban_by_scalerank: [{ scalerank: 5, all_urban: false, intersects_urban: true, urban_edges: 2 }],
  };
  assert.strictEqual(classifyRes4TerrainKind(r, t, 'water'), 'plains');
  assert.ok(isRes4UrbanOverlayHex(r));
}

/**
 * Defines the `testRes4NoUrbanWhenFullyWater` function shape (function testRes4NoUrbanWhenFullyWater(): void).

 * Purpose: Supports maintainability by documenting why `testRes4NoUrbanWhenFullyWater` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testRes4NoUrbanWhenFullyWater(): void {
  const r: HexMetadataRecordRes4 = {
    ...baseRow({
      all_water: true,
      intersects_water: true,
      arctic_mean: 0,
      forest_mean: 0,
      desert_mean: 0,
    }),
    all_urban: true,
    intersects_urban: true,
    urban_edges: 6,
    urban_by_scalerank: [{ scalerank: 4, all_urban: true, intersects_urban: true, urban_edges: 6 }],
  };
  assert.strictEqual(classifyRes4TerrainKind(r, t, 'water'), 'water');
  assert.ok(isRes4UrbanOverlayHex(r));
}

/**
 * Defines the `testRes4UrbanOverlayScalerankGate` function shape (function testRes4UrbanOverlayScalerankGate(): void).

 * Purpose: Supports maintainability by documenting why `testRes4UrbanOverlayScalerankGate` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testRes4UrbanOverlayScalerankGate(): void {
  const r: HexMetadataRecordRes4 = {
    ...baseRow({
      all_water: false,
      intersects_water: false,
      arctic_mean: 0,
      forest_mean: 0,
      desert_mean: 0,
    }),
    all_urban: false,
    intersects_urban: true,
    urban_edges: 2,
    urban_by_scalerank: [{ scalerank: 6, all_urban: false, intersects_urban: true, urban_edges: 2 }],
  };
  assert.ok(!isRes4UrbanOverlayHex(r));
}

/**
 * Defines the `testRes4UrbanOverlayIntersectionWithoutEdgeCrossing` function shape (function testRes4UrbanOverlayIntersectionWithoutEdgeCrossing(): void).

 * Purpose: Supports maintainability by documenting why `testRes4UrbanOverlayIntersectionWithoutEdgeCrossing` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testRes4UrbanOverlayIntersectionWithoutEdgeCrossing(): void {
  const r: HexMetadataRecordRes4 = {
    ...baseRow({
      all_water: false,
      intersects_water: false,
      arctic_mean: 0,
      forest_mean: 0,
      desert_mean: 0,
    }),
    all_urban: false,
    intersects_urban: true,
    urban_edges: 0,
    urban_by_scalerank: [{ scalerank: 5, all_urban: false, intersects_urban: true, urban_edges: 0 }],
  };
  assert.ok(isRes4UrbanOverlayHex(r));
}

/**
 * Defines the `testMajorInfrastructureGates` function shape (function testMajorInfrastructureGates(): void).

 * Purpose: Supports maintainability by documenting why `testMajorInfrastructureGates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testMajorInfrastructureGates(): void {
  assert.ok(!recordHasMajorAirport(baseRow({ airport_count_by_scalerank: [{ scalerank: 8, count: 1 }] })));
  assert.ok(!recordHasMajorAirport(baseRow({ airport_count_by_scalerank: [{ scalerank: 6, count: 1 }] })));
  assert.ok(recordHasMajorAirport(baseRow({ airport_count_by_scalerank: [{ scalerank: 5, count: 1 }] })));
  assert.ok(!recordHasMajorSeaport(baseRow({ seaport_count_by_scalerank: [{ scalerank: -1, count: 1 }] })));
  assert.ok(recordHasMajorSeaport(baseRow({ seaport_count_by_scalerank: [{ scalerank: 5, count: 2 }, { scalerank: 9, count: 1 }] })));
}

/**
 * Defines the `main` function shape (function main(): void).

 * Purpose: Supports maintainability by documenting why `main` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function main(): void {
  testWaterRelationFromMaskMetrics();
  testEmptyLandcoverIsNodataBeforeCoastal();
  testInWaterWithLandcoverIsWater();
  testWetlandsBandWithLandcoverIsWetlands();
  testInteriorForest();
  testRes4UrbanOverride();
  testRes4NoUrbanWhenFullyWater();
  testRes4UrbanOverlayScalerankGate();
  testRes4UrbanOverlayIntersectionWithoutEdgeCrossing();
  testMajorInfrastructureGates();
  console.log('terrainClassifierFromMetadata.test: ok');
}

main();
