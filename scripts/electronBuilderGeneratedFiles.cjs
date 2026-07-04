'use strict';

const { GENERATED_TERRAIN_JSON_FILES } = require('./generated-data-manifest.cjs');

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

module.exports = {
  buildElectronBuilderGeneratedFileEntries,
  buildElectronBuilderGeneratedResourceFilter,
};
