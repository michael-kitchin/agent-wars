/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const generatedDir = path.join(process.cwd(), 'data', 'generated');

function ensurePythonAvailable() {
  const probe = spawnSync('python', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    throw new Error('zip-generated-data: required "python" executable is not available on PATH.');
  }
}

function zipJsonFile(jsonFilename) {
  const zipFilename = `${jsonFilename}.zip`;
  const py = [
    'import zipfile, pathlib',
    `base = pathlib.Path(r'''${generatedDir}''')`,
    `src = base / r'''${jsonFilename}'''`,
    `dst = base / r'''${zipFilename}'''`,
    'with zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED) as zf:',
    `    zf.write(src, arcname=r'''${jsonFilename}''')`,
  ].join('\n');
  const result = spawnSync('python', ['-c', py], {
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
  ensurePythonAvailable();
  const files = fs
    .readdirSync(generatedDir)
    .filter((name) => name.endsWith('.json') && fs.statSync(path.join(generatedDir, name)).isFile())
    .sort();
  if (files.length === 0) {
    console.log('zip-generated-data: no json files found; nothing to do.');
    return;
  }
  for (const jsonFilename of files) zipJsonFile(jsonFilename);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
