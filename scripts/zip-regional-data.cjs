/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { resolvePythonExecutable } = require('./resolve-python.cjs');
const { zipJsonFile } = require('./generated-data-zip-helpers.cjs');
const { REGIONAL_JSON_FILES, REGIONS_DIR_SEGMENTS } = require('./generated-regional-manifest.cjs');

/**
 * Purpose: Choose which regional JSON names this run archives.
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
 * Purpose: Archive present regional JSON files.
 * When to use: After regional generation, and not as part of the global data pack. Pass file names to limit the zip.
 * Expected outcome: One `<file>.zip` beside each present named JSON file. The `qa` folder is skipped.
 * Exceptions: Throws when Python is missing, a zip command fails, or a file name is unknown.
 */
function main() {
  const jsonFiles = selectedRegionalFiles('zip-regional-data');
  const regionsDir = path.join(process.cwd(), ...REGIONS_DIR_SEGMENTS);
  if (!fs.existsSync(regionsDir)) {
    console.log(`zip-regional-data: ${regionsDir} does not exist; nothing to do.`);
    return;
  }
  const pythonCmd = resolvePythonExecutable();
  if (!pythonCmd) {
    throw new Error('zip-regional-data: no Python found.');
  }
  const folders = fs.readdirSync(regionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'qa')
    .map((entry) => path.join(regionsDir, entry.name));
  for (const folder of folders) {
    for (const jsonFilename of jsonFiles) {
      const jsonPath = path.join(folder, jsonFilename);
      if (!fs.existsSync(jsonPath) || !fs.statSync(jsonPath).isFile()) continue;
      zipJsonFile(pythonCmd, folder, jsonFilename);
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
