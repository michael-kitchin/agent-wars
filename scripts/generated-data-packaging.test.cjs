/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { GENERATED_TERRAIN_JSON_FILES } = require('./generated-data-manifest.cjs');
const { shouldExtractGeneratedJson, REQUIRED_GENERATED_JSON_FILES } = require('./extract-generated-data.cjs');

const repoRoot = path.resolve(__dirname, '..');
const generatedDir = path.join(repoRoot, 'data', 'generated');

/**
 * Asserts git-tracked archives exist for every manifest entry so CI can extract before build.
 */
function testAllTerrainArchivesPresent() {
  const missing = [];
  for (const jsonFilename of GENERATED_TERRAIN_JSON_FILES) {
    const zipPath = path.join(generatedDir, `${jsonFilename}.zip`);
    if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size <= 0) {
      missing.push(`${jsonFilename}.zip`);
    }
  }
  assert.strictEqual(
    missing.length,
    0,
    `missing or empty generated archives (commit *.json.zip, not extracted JSON): ${missing.join(', ')}`,
  );
}

/**
 * Keeps zip/extract/electron-builder lists aligned via the shared manifest.
 */
function testManifestMatchesExtractRequiredList() {
  assert.deepStrictEqual(
    [...REQUIRED_GENERATED_JSON_FILES],
    [...GENERATED_TERRAIN_JSON_FILES],
    'extract-required list must match generated-data-manifest.cjs',
  );
}

/**
 * Re-extract when the archive is newer than an existing extracted file (local dev + fresh CI clones).
 */
function testShouldExtractWhenZipIsNewer() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'agent-wars-extract-'));
  try {
    const zipPath = path.join(tmpDir, 'sample.json.zip');
    const jsonPath = path.join(tmpDir, 'sample.json');
    fs.writeFileSync(jsonPath, '{"old":true}\n');
    const oldTime = Date.now() - 60_000;
    fs.utimesSync(jsonPath, oldTime / 1000, oldTime / 1000);
    fs.writeFileSync(zipPath, 'placeholder');
    const newTime = Date.now();
    fs.utimesSync(zipPath, newTime / 1000, newTime / 1000);
    assert.strictEqual(shouldExtractGeneratedJson(zipPath, jsonPath), true);
    assert.strictEqual(shouldExtractGeneratedJson(zipPath, path.join(tmpDir, 'missing.json')), true);
    fs.utimesSync(jsonPath, newTime / 1000, newTime / 1000);
    assert.strictEqual(shouldExtractGeneratedJson(zipPath, jsonPath), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Simulates a CI checkout: only archives present, extract produces required JSON files.
 */
function testExtractProducesRequiredJsonFromArchivesOnly() {
  const tmpRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'agent-wars-ci-extract-'));
  const tmpGenerated = path.join(tmpRoot, 'data', 'generated');
  fs.mkdirSync(tmpGenerated, { recursive: true });
  const prevCwd = process.cwd();
  try {
    for (const jsonFilename of GENERATED_TERRAIN_JSON_FILES) {
      const srcZip = path.join(generatedDir, `${jsonFilename}.zip`);
      assert.ok(fs.existsSync(srcZip), `expected archive for CI simulation: ${jsonFilename}.zip`);
      fs.copyFileSync(srcZip, path.join(tmpGenerated, `${jsonFilename}.zip`));
    }
    process.chdir(tmpRoot);
    const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'extract-generated-data.cjs')], {
      encoding: 'utf8',
      env: process.env,
    });
    assert.strictEqual(
      result.status,
      0,
      `extract-generated-data failed in CI simulation:\n${result.stderr || result.stdout}`,
    );
    for (const jsonFilename of GENERATED_TERRAIN_JSON_FILES) {
      const jsonPath = path.join(tmpGenerated, jsonFilename);
      assert.ok(fs.existsSync(jsonPath), `expected extracted ${jsonFilename}`);
      assert.ok(fs.statSync(jsonPath).size > 0, `expected non-empty ${jsonFilename}`);
    }
    const landmass = JSON.parse(fs.readFileSync(path.join(tmpGenerated, 'terrain_res1_landmass.json'), 'utf8'));
    assert.strictEqual(landmass.schema_version, '2.0.0', 'landmass archive must contain schema 2.0.0');
    const { findMissingExtractedGeneratedJson } = require('./generated-data-pack-assert.cjs');
    assert.deepStrictEqual(findMissingExtractedGeneratedJson(tmpGenerated), []);
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function main() {
  testManifestMatchesExtractRequiredList();
  testShouldExtractWhenZipIsNewer();
  testAllTerrainArchivesPresent();
  testExtractProducesRequiredJsonFromArchivesOnly();
  console.log('generated-data-packaging.test.cjs passed');
}

main();
