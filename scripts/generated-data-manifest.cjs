'use strict';

/**
 * Canonical list of large generated terrain JSON blobs stored in git as `*.json.zip`.
 *
 * Purpose: Single source of truth for zip, extract, packaging tests, and electron-builder contracts.
 * When to use: Import from build scripts and tests that wire generated terrain data.
 * Expected outcome: Every listed basename has a matching archive under `data/generated/`.
 */

/** @type {readonly string[]} */
const GENERATED_TERRAIN_JSON_FILES = Object.freeze([
  'terrain_res1_metadata.json',
  'terrain_res4_metadata.json',
  'terrain_res1_naming.json',
  'terrain_res4_naming.json',
  'terrain_res1_landmass.json',
  'terrain_res1_weather.json',
  'terrain_res4_road_rail_sides.json',
  'terrain_res4_road_rail_vectors.json',
]);

module.exports = {
  GENERATED_TERRAIN_JSON_FILES,
};
