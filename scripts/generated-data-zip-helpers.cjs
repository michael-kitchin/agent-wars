/* eslint-disable no-console */
const fs = require('fs');
const { spawnSync } = require('child_process');

/**
 * Purpose: Archive one JSON file next to itself as `<name>.zip`.
 * When to use: While packing global or regional generated JSON.
 * Expected outcome: Writes the zip and logs the filenames. The archive member name is the JSON basename.
 * Exceptions: Throws when Python exits non-zero or the source file cannot be read.
 */
function zipJsonFile(pythonCmd, dir, jsonFilename) {
  const zipFilename = `${jsonFilename}.zip`;
  const py = [
    'import zipfile, pathlib',
    `base = pathlib.Path(r'''${dir}''')`,
    `src = base / r'''${jsonFilename}'''`,
    `dst = base / r'''${zipFilename}'''`,
    'with zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED) as zf:',
    `    zf.write(src, arcname=r'''${jsonFilename}''')`,
  ].join('\n');
  const result = spawnSync(pythonCmd, ['-c', py], {
    cwd: dir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || 'unknown zip error';
    throw new Error(`failed to archive ${jsonFilename}: ${detail}`.trim());
  }
  console.log(`zipped ${jsonFilename} -> ${zipFilename}`);
}

/**
 * Purpose: Unpack one JSON member from a sibling zip.
 * When to use: When the extracted JSON is missing or older than the archive.
 * Expected outcome: Overwrites the JSON file and logs the filenames.
 * Exceptions: Throws when Python exits non-zero or the archive member is missing.
 */
function extractZip(pythonCmd, dir, zipFilename, jsonFilename) {
  const py = [
    'import pathlib, zipfile',
    `base = pathlib.Path(r'''${dir}''')`,
    `z = base / r'''${zipFilename}'''`,
    `out = base / r'''${jsonFilename}'''`,
    'with zipfile.ZipFile(z, "r") as zf:',
    `    with zf.open(r'''${jsonFilename}''') as src, out.open("wb") as dst:`,
    '        dst.write(src.read())',
  ].join('\n');
  const result = spawnSync(pythonCmd, ['-c', py], {
    cwd: dir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || 'unknown extraction error';
    throw new Error(`failed to extract ${zipFilename}: ${detail}`.trim());
  }
  console.log(`extracted ${zipFilename} -> ${jsonFilename}`);
}

/**
 * Purpose: Skip redundant extraction when JSON is already present and up to date.
 * When to use: Before calling Python zip extraction.
 * Expected outcome: True when JSON is missing, empty, or older than the archive.
 * Exceptions: None. A missing archive returns false when the JSON file already exists.
 */
function shouldExtractGeneratedJson(zipPath, jsonPath) {
  if (!fs.existsSync(jsonPath)) return true;
  const jsonStat = fs.statSync(jsonPath);
  if (jsonStat.size <= 0) return true;
  if (!fs.existsSync(zipPath)) return false;
  const zipStat = fs.statSync(zipPath);
  return zipStat.mtimeMs > jsonStat.mtimeMs;
}

module.exports = {
  zipJsonFile,
  extractZip,
  shouldExtractGeneratedJson,
};
