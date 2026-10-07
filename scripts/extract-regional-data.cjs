/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { resolvePythonExecutable } = require('./resolve-python.cjs');
const { extractZip, shouldExtractGeneratedJson } = require('./generated-data-zip-helpers.cjs');
const { REGIONAL_JSON_FILES, REGIONS_DIR_SEGMENTS } = require('./generated-regional-manifest.cjs');

/**
 * Purpose: Restore regional JSON files from their zip archives.
 * When to use: When a regional JSON file was removed and its archive is still present.
 * Expected outcome: Extracts archives that are newer than the JSON. A missing region is skipped.
 * Exceptions: Throws when Python is missing or an extraction fails. Does not throw for a missing region.
 */
function main() {
  const regionsDir = path.join(process.cwd(), ...REGIONS_DIR_SEGMENTS);
  if (!fs.existsSync(regionsDir)) {
    console.log(`extract-regional-data: ${regionsDir} does not exist; nothing to do.`);
    return;
  }
  const pythonCmd = resolvePythonExecutable();
  if (!pythonCmd) {
    throw new Error('extract-regional-data: no Python found.');
  }
  const folders = fs.readdirSync(regionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'qa')
    .map((entry) => path.join(regionsDir, entry.name));
  for (const folder of folders) {
    for (const jsonFilename of REGIONAL_JSON_FILES) {
      const zipFilename = `${jsonFilename}.zip`;
      const zipPath = path.join(folder, zipFilename);
      const jsonPath = path.join(folder, jsonFilename);
      if (!fs.existsSync(zipPath)) continue;
      if (!shouldExtractGeneratedJson(zipPath, jsonPath)) continue;
      extractZip(pythonCmd, folder, zipFilename, jsonFilename);
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
