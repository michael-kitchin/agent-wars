/** Folder segments for regional packs, relative to the repository root. */
const REGIONS_DIR_SEGMENTS = ['data', 'generated', 'regions'];

/**
 * JSON files packed for one region.
 * The app does not load these yet. Extraction skips a file that was never zipped.
 */
const REGIONAL_JSON_FILES = Object.freeze([
  'region_manifest.json',
  'terrain_res_s_metadata.json',
  'terrain_res_t_metadata.json',
  'terrain_res_s_naming.json',
  'terrain_res_t_naming.json',
  'terrain_res_s_landmass.json',
  'terrain_res_s_weather.json',
  'terrain_res_t_road_rail_sides.json',
  'terrain_res_t_road_rail_vectors.json',
  'terrain_res_t_origin_units.json',
]);

module.exports = {
  REGIONS_DIR_SEGMENTS,
  REGIONAL_JSON_FILES,
};
