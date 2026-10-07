/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { resolvePythonExecutable } = require('./resolve-python.cjs');
const { zipJsonFile } = require('./generated-data-zip-helpers.cjs');
const { REGIONAL_JSON_FILES, REGIONS_DIR_SEGMENTS } = require('./generated-regional-manifest.cjs');

/**
 * Purpose: Archive every present regional JSON file.
 * When to use: After regional generation, and not as part of the global data pack.
 * Expected outcome: One `<file>.zip` beside each present JSON file. The `qa` folder is skipped.
 * Exceptions: Throws when Python is missing or a zip command fails.
 */
function main() {
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
    for (const jsonFilename of REGIONAL_JSON_FILES) {
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
