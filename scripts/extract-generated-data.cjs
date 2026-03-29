/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const generatedDir = path.join(process.cwd(), 'data', 'generated');

function ensureTarAvailable() {
  const probe = spawnSync('tar', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    throw new Error('extract-generated-data: required "tar" executable is not available on PATH.');
  }
}

function shouldExtract(zipPath, jsonPath) {
  if (!fs.existsSync(jsonPath)) return true;
  const jsonStat = fs.statSync(jsonPath);
  if (jsonStat.size <= 0) return true;
  return false;
}

function extractZip(zipFilename, jsonFilename) {
  const result = spawnSync('tar', ['-x', '-f', zipFilename], {
    cwd: generatedDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || 'unknown tar error';
    throw new Error(`extract-generated-data: failed to extract ${zipFilename}: ${detail}`.trim());
  }
  console.log(`extracted ${zipFilename} -> ${jsonFilename}`);
}

function main() {
  if (!fs.existsSync(generatedDir)) {
    console.log(`extract-generated-data: ${generatedDir} does not exist; nothing to do.`);
    return;
  }
  ensureTarAvailable();
  const zipFiles = fs
    .readdirSync(generatedDir)
    .filter((name) => name.endsWith('.json.zip') && fs.statSync(path.join(generatedDir, name)).isFile())
    .sort();
  if (zipFiles.length === 0) {
    console.log('extract-generated-data: no *.json.zip files found; nothing to do.');
    return;
  }
  for (const zipFilename of zipFiles) {
    const jsonFilename = zipFilename.slice(0, -4); // remove ".zip"
    const zipPath = path.join(generatedDir, zipFilename);
    const jsonPath = path.join(generatedDir, jsonFilename);
    if (!shouldExtract(zipPath, jsonPath)) continue;
    extractZip(zipFilename, jsonFilename);
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
