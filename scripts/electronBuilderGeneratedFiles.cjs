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

module.exports = {
  buildElectronBuilderGeneratedFileEntries,
  buildElectronBuilderGeneratedResourceFilter,
  buildElectronBuilderRegionalZipFileEntries,
  buildElectronBuilderRegionalZipResource,
};
