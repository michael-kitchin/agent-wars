/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolvePythonExecutable } = require('./resolve-python.cjs');

const generatedDir = path.join(process.cwd(), 'data', 'generated');

/** Archives named `<basename>.json.zip` (e.g. terrain_res1_metadata.json.zip, terrain_res1_naming.json.zip). */

function shouldExtract(zipPath, jsonPath) {
  if (!fs.existsSync(jsonPath)) return true;
  const jsonStat = fs.statSync(jsonPath);
  if (jsonStat.size <= 0) return true;
  return false;
}

function extractZip(pythonCmd, zipFilename, jsonFilename) {
  const py = [
    'import pathlib, zipfile',
    `base = pathlib.Path(r'''${generatedDir}''')`,
    `z = base / r'''${zipFilename}'''`,
    `out = base / r'''${jsonFilename}'''`,
    'with zipfile.ZipFile(z, "r") as zf:',
    `    with zf.open(r'''${jsonFilename}''') as src, out.open("wb") as dst:`,
    '        dst.write(src.read())',
  ].join('\n');
  const result = spawnSync(pythonCmd, ['-c', py], {
    cwd: generatedDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || 'unknown extraction error';
    throw new Error(`extract-generated-data: failed to extract ${zipFilename}: ${detail}`.trim());
  }
  console.log(`extracted ${zipFilename} -> ${jsonFilename}`);
}

function main() {
  if (!fs.existsSync(generatedDir)) {
    console.log(`extract-generated-data: ${generatedDir} does not exist; nothing to do.`);
    return;
  }
  const zipFiles = fs
    .readdirSync(generatedDir)
    .filter((name) => name.endsWith('.json.zip') && fs.statSync(path.join(generatedDir, name)).isFile())
    .sort();
  if (zipFiles.length === 0) {
    console.log('extract-generated-data: no *.json.zip files found; nothing to do.');
    return;
  }
  const pythonCmd = resolvePythonExecutable();
  if (!pythonCmd) {
    throw new Error(
      'extract-generated-data: no Python found. Install Python 3 and ensure `python3` or `python` is on PATH, or set PYTHON to the interpreter path.',
    );
  }
  for (const zipFilename of zipFiles) {
    const jsonFilename = zipFilename.slice(0, -4); // remove ".zip"
    const zipPath = path.join(generatedDir, zipFilename);
    const jsonPath = path.join(generatedDir, jsonFilename);
    if (!shouldExtract(zipPath, jsonPath)) continue;
    extractZip(pythonCmd, zipFilename, jsonFilename);
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
