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
const crypto = require('crypto');
const { unzipSync } = require('fflate');

const { GENERATED_TERRAIN_JSON_FILES } = require('./generated-data-manifest.cjs');
const { REGIONS_DIR_SEGMENTS } = require('./generated-regional-manifest.cjs');

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
  assertRegionalCatalogZips();
  assertBasemapPacks();
}

/**
 * Fails the pack when a catalog region has no manifest archive.
 *
 * Purpose: A packaged app cannot list or play a region whose zip was never committed.
 * When to use: From the pre-pack check, and from the packaged-tree check.
 * Expected outcome: Returns when every catalog id has a non-empty `region_manifest.json.zip`.
 * Exceptions: Throws listing the ids that have no archive.
 */
function assertRegionalCatalogZips(regionsDir = path.join(repoRoot, ...REGIONS_DIR_SEGMENTS)) {
  const missing = [];
  for (const regionId of catalogRegionIds()) {
    const zipPath = path.join(regionsDir, regionId, 'region_manifest.json.zip');
    if (!fs.existsSync(zipPath) || !fs.statSync(zipPath).isFile() || fs.statSync(zipPath).size <= 0) {
      missing.push(regionId);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `generated-data-pack-assert: catalog regions missing region_manifest.json.zip: ${missing.join(', ')}`,
    );
  }
}

/**
 * Reads regional catalog folder ids from the typed catalog.
 *
 * Purpose: The pack check stays aligned with `REGIONAL_RULES_BY_ID` without a second id list.
 * When to use: Before asserting that each id has a zip.
 * Expected outcome: One id per `regionalMapRules` row.
 * Exceptions: Throws when the catalog file has no rows.
 */
function catalogRegionIds() {
  const catalogPath = path.join(repoRoot, 'src', 'shared', 'regionalRulesCatalog.ts');
  const text = fs.readFileSync(catalogPath, 'utf8');
  const ids = [...text.matchAll(/^  ([a-z0-9_]+): regionalMapRules\(/gm)].map((match) => match[1]);
  if (ids.length === 0) {
    throw new Error('generated-data-pack-assert: regional catalog has no ids');
  }
  return ids;
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
  assertPackagedRegionalZips(packagedDirs, releaseDir);
  assertPackagedBasemapPacks(packagedDirs, releaseDir);
}

/**
 * Ensures each catalog region archive was copied into a packaged `data/generated` tree.
 */
function assertPackagedRegionalZips(packagedDirs, releaseDir) {
  const failures = [];
  for (const regionId of catalogRegionIds()) {
    const present = packagedDirs.some((dir) => {
      const zipPath = path.join(dir, 'regions', regionId, 'region_manifest.json.zip');
      return fs.existsSync(zipPath) && fs.statSync(zipPath).isFile() && fs.statSync(zipPath).size > 0;
    });
    if (!present) failures.push(regionId);
  }
  if (failures.length > 0) {
    throw new Error(
      `generated-data-pack-assert: packaged app is missing regional archives: ${failures.join(', ')}. ` +
        `Searched under ${releaseDir}`,
    );
  }
}

/**
 * Checks the global hillshade pack and every regional pack in the repo.
 *
 * Purpose: A build must not ship a manifest whose zip bytes do not match.
 * When to use: From the pre-pack check, after the regional JSON archives.
 * Expected outcome: Returns when global and every catalog region have a matching pack.
 *   A catalog region whose directory exists without `basemap_pack.json.zip` still fails.
 * Exceptions: Throws when a pack, a shared tile, or a partition zip is missing or has the wrong sha256.
 */
function assertBasemapPacks() {
  const root = path.join(repoRoot, 'data', 'generated', 'basemap');
  assertOneBasemapPack(path.join(root, 'global'), true);
  const regionsDir = path.join(root, 'regions');
  const present = fs.existsSync(regionsDir) ? fs.readdirSync(regionsDir) : [];
  const packed = [];
  for (const regionId of present) {
    if (!/^[a-z0-9_]+$/.test(regionId)) continue;
    const directory = path.join(regionsDir, regionId);
    if (!fs.existsSync(path.join(directory, 'basemap_pack.json.zip'))) continue;
    assertOneBasemapPack(directory, true);
    packed.push(regionId);
  }
  if (!REQUIRE_EVERY_REGION_PACK) return;
  const missing = catalogRegionIds().filter((regionId) => !packed.includes(regionId));
  if (missing.length > 0) {
    throw new Error(`generated-data-pack-assert: missing basemap packs: ${missing.join(', ')}`);
  }
}

// Every catalog region ships a pack, so a missing directory fails the pre-pack check.
const REQUIRE_EVERY_REGION_PACK = true;

/**
 * Checks one hillshade pack directory against its manifest.
 *
 * Purpose: The manifest hash is the contract the app uses before it unpacks.
 * When to use: For the global pack and for each regional pack that has a manifest zip.
 * Expected outcome: Returns when the shared tiles and every listed partition zip match the manifest.
 * Exceptions: Throws when the manifest, a named file, or a hash does not match. A relative name that leaves the directory is refused.
 */
function assertOneBasemapPack(directory, required) {
  const manifestZip = path.join(directory, 'basemap_pack.json.zip');
  if (!fs.existsSync(manifestZip)) {
    if (required) throw new Error(`generated-data-pack-assert: missing ${manifestZip}`);
    return;
  }
  const archive = unzipSync(new Uint8Array(fs.readFileSync(manifestZip)));
  const member = archive['basemap_pack.json'];
  if (!member) throw new Error(`generated-data-pack-assert: ${manifestZip} has no manifest`);
  const manifest = JSON.parse(Buffer.from(member).toString('utf8'));
  const indexesName = refusePackRelative(manifest.indexesZip, directory);
  for (const name of [manifest.landTile, manifest.waterTile, indexesName]) {
    const filePath = path.join(directory, refusePackRelative(name, directory));
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size <= 0) {
      throw new Error(`generated-data-pack-assert: missing ${filePath}`);
    }
  }
  const indexesPath = path.join(directory, indexesName);
  const indexesHash = crypto.createHash('sha256').update(fs.readFileSync(indexesPath)).digest('hex');
  if (indexesHash !== manifest.indexesSha256) {
    throw new Error(`generated-data-pack-assert: indexes hash mismatch in ${directory}`);
  }
  for (const [key, entry] of Object.entries(manifest.partitions || {})) {
    if (!entry || !entry.zip) continue;
    const zipPath = path.join(directory, refusePackRelative(entry.zip, `${directory} ${key}`));
    if (!fs.existsSync(zipPath)) throw new Error(`generated-data-pack-assert: missing ${zipPath}`);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
    if (hash !== entry.sha256) throw new Error(`generated-data-pack-assert: sha256 mismatch for ${key}`);
  }
}

/**
 * Keeps a manifest-relative name inside the pack directory.
 *
 * Purpose: A hash check must read the file the manifest names, not a path that leaves the pack.
 * When to use: For shared tile names, the index archive, and partition zip names.
 * Expected outcome: The same name when it is a relative path with no parent segment.
 * Exceptions: Throws when the name is empty, absolute, or contains `..` or a backslash.
 */
function refusePackRelative(name, label) {
  const unsafe = typeof name !== 'string'
    || name.length === 0
    || name.includes('..')
    || name.includes('\\')
    || name.startsWith('/')
    || path.isAbsolute(name);
  if (unsafe) throw new Error(`generated-data-pack-assert: refused path in ${label}`);
  return name;
}

/**
 * Ensures the packaged resources tree contains the global pack and every catalog region pack.
 *
 * Purpose: The pre-pack check reads the repo. This check reads the copy electron-builder placed under `release`.
 * When to use: From the post-pack check, beside the regional archive check.
 * Expected outcome: Returns when each `basemap_pack.json.zip` is present and non-empty.
 * Exceptions: Throws when the global pack or a catalog region pack is absent.
 */
function assertPackagedBasemapPacks(packagedDirs, releaseDir) {
  const failures = [];
  for (const mapId of ['global', ...catalogRegionIds()]) {
    const relative = mapId === 'global' ? ['basemap', 'global'] : ['basemap', 'regions', mapId];
    const present = packagedDirs.some((dir) => {
      const zipPath = path.join(dir, ...relative, 'basemap_pack.json.zip');
      return fs.existsSync(zipPath) && fs.statSync(zipPath).isFile() && fs.statSync(zipPath).size > 0;
    });
    if (!present) failures.push(mapId);
  }
  if (failures.length > 0) {
    throw new Error(
      `generated-data-pack-assert: packaged app is missing basemap packs: ${failures.join(', ')}. ` +
        `Searched under ${releaseDir}`,
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
