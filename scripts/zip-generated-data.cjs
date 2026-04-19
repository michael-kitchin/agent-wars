/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolvePythonExecutable } = require('./resolve-python.cjs');

const generatedDir = path.join(process.cwd(), 'data', 'generated');

/** JSON blobs under data/generated that we archive for git + extract at build time (see extract-generated-data.cjs). */
const GENERATED_JSON_TO_ZIP = [
  'terrain_res1_metadata.json',
  'terrain_res4_metadata.json',
  'terrain_res1_naming.json',
  'terrain_res4_naming.json',
  'terrain_res4_road_rail_sides.json',
  'terrain_res4_road_rail_vectors.json',
];

function zipJsonFile(pythonCmd, jsonFilename) {
  const zipFilename = `${jsonFilename}.zip`;
  const py = [
    'import zipfile, pathlib',
    `base = pathlib.Path(r'''${generatedDir}''')`,
    `src = base / r'''${jsonFilename}'''`,
    `dst = base / r'''${zipFilename}'''`,
    'with zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED) as zf:',
    `    zf.write(src, arcname=r'''${jsonFilename}''')`,
  ].join('\n');
  const result = spawnSync(pythonCmd, ['-c', py], {
    cwd: generatedDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || 'unknown zip error';
    throw new Error(`zip-generated-data: failed to archive ${jsonFilename}: ${detail}`.trim());
  }
  console.log(`zipped ${jsonFilename} -> ${zipFilename}`);
}

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
  for (const jsonFilename of present) zipJsonFile(pythonCmd, jsonFilename);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
