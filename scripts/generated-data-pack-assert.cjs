'use strict';

/**
 * Pre- and post-pack checks that generated terrain JSON is present for electron-builder.
 *
 * Purpose: Fail fast when archives were not extracted or electron-builder omitted bundled terrain files.
 * When to use: Before `electron-builder` (pre-pack) and after CI `dir` builds (post-pack).
 * Expected outcome: Exits 0 when all manifest JSON files exist on disk; exits 1 with a clear message otherwise.
 */

const fs = require('fs');
const path = require('path');

const { GENERATED_TERRAIN_JSON_FILES } = require('./generated-data-manifest.cjs');

const repoRoot = path.resolve(__dirname, '..');
const generatedDir = path.join(repoRoot, 'data', 'generated');

/**
 * Returns absolute paths under `generatedDir` that are missing or empty for pack.
 */
function findMissingExtractedGeneratedJson(rootDir = generatedDir) {
  const missing = [];
  for (const jsonFilename of GENERATED_TERRAIN_JSON_FILES) {
    const filePath = path.join(rootDir, jsonFilename);
    if (!fs.existsSync(filePath)) {
      missing.push(`${jsonFilename} (missing)`);
      continue;
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) {
      missing.push(`${jsonFilename} (empty)`);
    }
  }
  return missing;
}

/**
 * Ensures extracted JSON exists under `data/generated` before electron-builder runs.
 */
function assertExtractedGeneratedJsonForPack() {
  const missing = findMissingExtractedGeneratedJson();
  if (missing.length > 0) {
    throw new Error(
      `generated-data-pack-assert: extracted JSON required for packaging is missing or empty: ${missing.join(', ')}. ` +
        'Run npm run generated:extract (commit *.json.zip archives, not extracted JSON).',
    );
  }
}

/**
 * Recursively collects directories named `generated` whose parent is `data`.
 */
function collectPackagedGeneratedDirs(rootDir) {
  const found = [];
  if (!fs.existsSync(rootDir)) return found;

  /** @param {string} dir */
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      if (entry.name === 'generated' && path.basename(dir) === 'data') {
        found.push(child);
        continue;
      }
      walk(child);
    }
  }

  walk(rootDir);
  return found;
}

/**
 * Ensures at least one packaged `data/generated` tree contains every manifest JSON file.
 */
function assertPackagedGeneratedJson(releaseDir = path.join(repoRoot, 'release')) {
  const packagedDirs = collectPackagedGeneratedDirs(releaseDir);
  if (packagedDirs.length === 0) {
    throw new Error(
      `generated-data-pack-assert: no packaged data/generated directory found under ${releaseDir}`,
    );
  }

  const failures = [];
  for (const jsonFilename of GENERATED_TERRAIN_JSON_FILES) {
    const presentIn = packagedDirs.filter((dir) => {
      const filePath = path.join(dir, jsonFilename);
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0;
    });
    if (presentIn.length === 0) {
      failures.push(jsonFilename);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `generated-data-pack-assert: packaged app is missing terrain JSON: ${failures.join(', ')}. ` +
        `Searched under ${releaseDir} in: ${packagedDirs.join('; ')}`,
    );
  }
}

function main() {
  const mode = process.argv[2] || 'pre-pack';
  if (mode === 'pre-pack') {
    assertExtractedGeneratedJsonForPack();
    console.log('generated-data-pack-assert: pre-pack check passed');
    return;
  }
  if (mode === 'post-pack') {
    const releaseArg = process.argv[3];
    const releaseDir = releaseArg ? path.resolve(releaseArg) : path.join(repoRoot, 'release');
    assertPackagedGeneratedJson(releaseDir);
    console.log(`generated-data-pack-assert: post-pack check passed (${releaseDir})`);
    return;
  }
  throw new Error(`generated-data-pack-assert: unknown mode ${mode} (use pre-pack or post-pack)`);
}

module.exports = {
  assertExtractedGeneratedJsonForPack,
  assertPackagedGeneratedJson,
  findMissingExtractedGeneratedJson,
  collectPackagedGeneratedDirs,
};

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
