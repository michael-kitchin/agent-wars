'use strict';

const { GENERATED_TERRAIN_JSON_FILES } = require('./generated-data-manifest.cjs');
const { REGIONS_DIR_SEGMENTS } = require('./generated-regional-manifest.cjs');

/**
 * Builds electron-builder `files` entries for extracted terrain JSON under `data/generated/`.
 */
function buildElectronBuilderGeneratedFileEntries() {
  return GENERATED_TERRAIN_JSON_FILES.map((filename) => `data/generated/${filename}`);
}

/**
 * Builds the `extraResources` filter list for terrain JSON copied beside the packaged app.
 */
function buildElectronBuilderGeneratedResourceFilter() {
  return [...GENERATED_TERRAIN_JSON_FILES];
}

/**
 * electron-builder `files` glob for regional archives.
 * Extracted regional JSON stays out of the package.
 */
function buildElectronBuilderRegionalZipFileEntries() {
  const regionsPath = REGIONS_DIR_SEGMENTS.join('/');
  return [`${regionsPath}/**/*.json.zip`];
}

/**
 * `extraResources` entry that copies regional zips beside the packaged app.
 */
function buildElectronBuilderRegionalZipResource() {
  return {
    from: REGIONS_DIR_SEGMENTS.join('/'),
    to: REGIONS_DIR_SEGMENTS.join('/'),
    filter: ['**/*.json.zip'],
  };
}

/**
 * electron-builder `files` glob for the offline hillshade packs.
 *
 * Purpose: Ship the basemap zips and shared WebP files inside the app archive.
 * When to use: From the shipping electron-builder config's `files` list.
 * Expected outcome: Globs for the pack zips and the shared WebP files. Extracted regional JSON stays on the regional helper.
 */
function buildElectronBuilderBasemapFileEntries() {
  return ['data/generated/basemap/**/*.zip', 'data/generated/basemap/**/*.webp'];
}

/**
 * `extraResources` entry that copies the hillshade packs beside the packaged app.
 *
 * Purpose: The protocol reads the packs from resources, not only from inside asar.
 * When to use: From the shipping config's `extraResources`, next to the regional zips.
 * Expected outcome: Zip and WebP files under `data/generated/basemap`.
 */
function buildElectronBuilderBasemapResource() {
  return {
    from: 'data/generated/basemap',
    to: 'data/generated/basemap',
    filter: ['**/*.zip', '**/*.webp'],
  };
}

module.exports = {
  buildElectronBuilderGeneratedFileEntries,
  buildElectronBuilderGeneratedResourceFilter,
  buildElectronBuilderRegionalZipFileEntries,
  buildElectronBuilderRegionalZipResource,
  buildElectronBuilderBasemapFileEntries,
  buildElectronBuilderBasemapResource,
};
