/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { resolvePythonExecutable } = require('./resolve-python.cjs');
const { zipJsonFile } = require('./generated-data-zip-helpers.cjs');

const { GENERATED_TERRAIN_JSON_FILES } = require('./generated-data-manifest.cjs');

const generatedDir = path.join(process.cwd(), 'data', 'generated');

/** JSON blobs under data/generated that we archive for git + extract at build time (see extract-generated-data.cjs). */
const GENERATED_JSON_TO_ZIP = GENERATED_TERRAIN_JSON_FILES;

function main() {
  if (!fs.existsSync(generatedDir)) {
    console.log(`zip-generated-data: ${generatedDir} does not exist; nothing to do.`);
    return;
  }
  const present = GENERATED_JSON_TO_ZIP.filter((name) => {
    const p = path.join(generatedDir, name);
    return fs.existsSync(p) && fs.statSync(p).isFile();
  });
  const missing = GENERATED_JSON_TO_ZIP.filter((name) => !present.includes(name));
  if (missing.length > 0) {
    console.log(`zip-generated-data: skipping missing files (${missing.join(', ')}).`);
  }
  if (present.length === 0) {
    console.log('zip-generated-data: no listed json files present; nothing to do.');
    return;
  }
  const pythonCmd = resolvePythonExecutable();
  if (!pythonCmd) {
    throw new Error(
      'zip-generated-data: no Python found. Install Python 3 and ensure `python3` or `python` is on PATH, or set PYTHON to the interpreter path.',
    );
  }
  for (const jsonFilename of present) zipJsonFile(pythonCmd, generatedDir, jsonFilename);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
