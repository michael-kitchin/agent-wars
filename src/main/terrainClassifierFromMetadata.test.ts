/**
 * Essential contracts for metadata-driven classification (mirrors Python `classifier.py` order).
 */

import * as assert from 'assert';
import type { ClassifierThresholds } from './terrainMetadataLoad';
import type { HexMetadataRecordRes1, HexMetadataRecordRes4 } from './terrainMetadataLoad';
import { recordHasMajorAirport, recordHasMajorPort } from './terrainMetadataLoad';
import {
  classifyCellWithoutUrbanOverride,
  classifyRes4TerrainKind,
  isRes4UrbanOverlayHex,
  waterRelationFromMaskMetrics,
} from './terrainClassifierFromMetadata';

const t: ClassifierThresholds = {
  arctic_dominant_min: 26,
  forest_dominant_min: 38,
  desert_barren_min: 28,
  mountain_tri_mean_min: 24,
  mountain_slope_mean_min: 5,
  mountain_elevation_max_min: 700,
};

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
    port_count_total: 0,
    port_count_by_scalerank: [],
    ...partial,
  };
}

function testWaterRelationFromMaskMetrics(): void {
  assert.strictEqual(waterRelationFromMaskMetrics({ all_water: true, intersects_water: true }), 'in_water');
  assert.strictEqual(waterRelationFromMaskMetrics({ all_water: false, intersects_water: false }), 'no_water');
  assert.strictEqual(waterRelationFromMaskMetrics({ all_water: false, intersects_water: true }), 'coastal_band');
}

function testEmptyLandcoverIsNodataBeforeCoastal(): void {
  const r = baseRow({ all_water: false, intersects_water: true });
  assert.strictEqual(classifyCellWithoutUrbanOverride(r, t, 'desert'), 'desert');
}

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

function testInteriorForest(): void {
  const r = baseRow({
    arctic_mean: 0,
    forest_mean: 40,
    desert_mean: 0,
  });
  assert.strictEqual(classifyCellWithoutUrbanOverride(r, t, 'water'), 'forest');
}

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

function testMajorInfrastructureGates(): void {
  assert.ok(!recordHasMajorAirport(baseRow({ airport_count_by_scalerank: [{ scalerank: 8, count: 1 }] })));
  assert.ok(!recordHasMajorAirport(baseRow({ airport_count_by_scalerank: [{ scalerank: 6, count: 1 }] })));
  assert.ok(recordHasMajorAirport(baseRow({ airport_count_by_scalerank: [{ scalerank: 5, count: 1 }] })));
  assert.ok(!recordHasMajorPort(baseRow({ port_count_by_scalerank: [{ scalerank: -1, count: 1 }] })));
  assert.ok(recordHasMajorPort(baseRow({ port_count_by_scalerank: [{ scalerank: 5, count: 2 }, { scalerank: 9, count: 1 }] })));
}

function main(): void {
  testWaterRelationFromMaskMetrics();
  testEmptyLandcoverIsNodataBeforeCoastal();
  testInWaterWithLandcoverIsWater();
  testInteriorForest();
  testRes4UrbanOverride();
  testRes4NoUrbanWhenFullyWater();
  testRes4UrbanOverlayScalerankGate();
  testRes4UrbanOverlayIntersectionWithoutEdgeCrossing();
  testMajorInfrastructureGates();
  console.log('terrainClassifierFromMetadata.test: ok');
}

main();
