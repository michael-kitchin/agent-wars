/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { resolvePythonExecutable } = require('./resolve-python.cjs');
const { extractZip, shouldExtractGeneratedJson } = require('./generated-data-zip-helpers.cjs');
const { REGIONAL_JSON_FILES, REGIONS_DIR_SEGMENTS } = require('./generated-regional-manifest.cjs');

/**
 * Purpose: Choose which regional JSON names this run extracts.
 * When to use: At the start of `main`, before any folder is read.
 * Expected outcome: Every regional file when no names were passed. Otherwise only the named files.
 * Exceptions: Throws before any file is touched when a name is not in `REGIONAL_JSON_FILES`.
 */
function selectedRegionalFiles(scriptName) {
  const requested = process.argv.slice(2);
  if (requested.length === 0) return [...REGIONAL_JSON_FILES];
  for (const name of requested) {
    if (!REGIONAL_JSON_FILES.includes(name)) {
      throw new Error(`${scriptName}: unknown regional file ${name}`);
    }
  }
  return requested;
}

/**
 * Purpose: Restore regional JSON files from their zip archives.
 * When to use: When a regional JSON file was removed and its archive is still present. Pass file names to limit the extract.
 * Expected outcome: Extracts archives that are newer than the JSON. A missing region is skipped. Named files are the only ones extracted.
 * Exceptions: Throws when Python is missing, an extraction fails, or a file name is unknown. Does not throw for a missing region.
 */
function main() {
  const jsonFiles = selectedRegionalFiles('extract-regional-data');
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
    for (const jsonFilename of jsonFiles) {
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
