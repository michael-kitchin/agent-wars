import assert from 'node:assert/strict';
import * as fs from 'fs';
import Module from 'node:module';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { setTerrainMetadataPathOverrideForTests } from '../terrainMetadataPaths';
import {
  regionPackDirectory,
  regionalPackJsonFiles,
  setRegionPackUserDataRootForTests,
} from './regionPackExtract';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { REGIONAL_JSON_FILES } = require('../../../scripts/generated-regional-manifest.cjs') as {
  REGIONAL_JSON_FILES: readonly string[];
};

/**
 * Builds a temp tree with `data/generated/regions/<id>/`.
 *
 * Purpose: The path override has to look like a repository root.
 * When to use: At the start of each extract test.
 * Expected outcome: The region directory path.
 * Exceptions: None.
 */
function makeRegionRoot(regionId: string): { root: string; regionDirectory: string; userData: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'region-pack-'));
  const regionDirectory = path.join(root, 'data', 'generated', 'regions', regionId);
  const userData = path.join(root, 'user-data');
  fs.mkdirSync(regionDirectory, { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  return { root, regionDirectory, userData };
}

test('the packed JSON names match the packaging manifest', () => {
  assert.deepEqual([...regionalPackJsonFiles()], [...REGIONAL_JSON_FILES]);
});

/**
 * Call shape of Node's module loader.
 *
 * Purpose: The extract test replaces this loader so `require('electron')` returns a stand-in app.
 * When to use: `installBoundElectronUserData` saves and restores the real loader.
 * Expected outcome: Node's request, parent, and main flag, and whatever the loader returns.
 * Exceptions: None.
 */
type ModuleLoad = (this: unknown, request: string, parent: unknown, isMain: boolean) => unknown;

/**
 * Serves Electron `app.getPath` only when it is called on the app object.
 *
 * Purpose: Packaged extraction asks Electron for user data. A detached `getPath` throws, which the extractor used to treat as "no user data".
 * When to use: Around one zip-only extract that must not use the test user-data override.
 * Expected outcome: `require('electron')` returns this app until the restore function runs.
 * Exceptions: None.
 */
function installBoundElectronUserData(userDataDir: string): () => void {
  const moduleWithLoad = Module as unknown as { _load: ModuleLoad };
  const originalLoad = moduleWithLoad._load;
  const app = {
    getPath(this: unknown, name: string): string {
      if (this !== app) throw new TypeError('getPath called without app');
      if (name !== 'userData') throw new Error(`unexpected path ${name}`);
      return userDataDir;
    },
  };
  moduleWithLoad._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return { app };
    return originalLoad.call(this, request, parent, isMain);
  };
  return () => {
    moduleWithLoad._load = originalLoad;
  };
}

test('a zip-only region is extracted once into user data', () => {
  const regionId = 'sample_pack';
  const { root, regionDirectory, userData } = makeRegionRoot(regionId);
  const zip = zipSync({ 'region_manifest.json': strToU8('{"schema_version":"1.1.0"}') });
  fs.writeFileSync(path.join(regionDirectory, 'region_manifest.json.zip'), zip);
  setTerrainMetadataPathOverrideForTests(root);
  setRegionPackUserDataRootForTests(userData);
  try {
    const extracted = regionPackDirectory(regionId);
    const expected = path.join(userData, 'generated-regions', regionId);
    assert.equal(extracted, expected);
    assert.equal(fs.readFileSync(path.join(expected, 'region_manifest.json'), 'utf8'), '{"schema_version":"1.1.0"}');
    assert.ok(fs.existsSync(path.join(expected, 'pack.ready')));
    assert.equal(regionPackDirectory(regionId), expected);
    assert.equal(fs.existsSync(path.join(userData, 'generated-regions', `.${regionId}.extracting`)), false);
  } finally {
    setTerrainMetadataPathOverrideForTests(null);
    setRegionPackUserDataRootForTests(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a zip-only region extracts into Electron user data when getPath must stay bound', () => {
  const regionId = 'sample_pack';
  const { root, regionDirectory, userData } = makeRegionRoot(regionId);
  const zip = zipSync({ 'region_manifest.json': strToU8('{"schema_version":"1.1.0"}') });
  fs.writeFileSync(path.join(regionDirectory, 'region_manifest.json.zip'), zip);
  setTerrainMetadataPathOverrideForTests(root);
  setRegionPackUserDataRootForTests(null);
  const restoreElectron = installBoundElectronUserData(userData);
  try {
    const extracted = regionPackDirectory(regionId);
    const expected = path.join(userData, 'generated-regions', regionId);
    assert.equal(extracted, expected);
    assert.equal(fs.readFileSync(path.join(expected, 'region_manifest.json'), 'utf8'), '{"schema_version":"1.1.0"}');
    assert.ok(fs.existsSync(path.join(expected, 'pack.ready')));
  } finally {
    restoreElectron();
    setTerrainMetadataPathOverrideForTests(null);
    setRegionPackUserDataRootForTests(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a missing extracted JSON file is restored from the zip', () => {
  const regionId = 'sample_pack';
  const { root, regionDirectory, userData } = makeRegionRoot(regionId);
  const manifest = zipSync({ 'region_manifest.json': strToU8('{"schema_version":"1.1.0"}') });
  const weather = zipSync({ 'terrain_res_s_weather.json': strToU8('{"cells":[]}') });
  fs.writeFileSync(path.join(regionDirectory, 'region_manifest.json.zip'), manifest);
  fs.writeFileSync(path.join(regionDirectory, 'terrain_res_s_weather.json.zip'), weather);
  setTerrainMetadataPathOverrideForTests(root);
  setRegionPackUserDataRootForTests(userData);
  try {
    const extracted = regionPackDirectory(regionId);
    assert.ok(extracted);
    const weatherPath = path.join(extracted, 'terrain_res_s_weather.json');
    fs.rmSync(weatherPath);
    assert.equal(regionPackDirectory(regionId), extracted);
    assert.equal(fs.readFileSync(weatherPath, 'utf8'), '{"cells":[]}');
    assert.equal(fs.existsSync(path.join(userData, 'generated-regions', `.${regionId}.extracting`)), false);
  } finally {
    setTerrainMetadataPathOverrideForTests(null);
    setRegionPackUserDataRootForTests(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a cached pack whose manifest differs from the zip is extracted again', () => {
  const regionId = 'sample_pack';
  const { root, regionDirectory, userData } = makeRegionRoot(regionId);
  const next = '{"schema_version":"1.2.0"}';
  const zip = zipSync({ 'region_manifest.json': strToU8(next) });
  fs.writeFileSync(path.join(regionDirectory, 'region_manifest.json.zip'), zip);
  const cached = path.join(userData, 'generated-regions', regionId);
  fs.mkdirSync(cached, { recursive: true });
  fs.writeFileSync(path.join(cached, 'region_manifest.json'), '{"schema_version":"1.1.0"}');
  fs.writeFileSync(path.join(cached, 'pack.ready'), '');
  fs.writeFileSync(path.join(cached, 'keep.txt'), 'old');
  setTerrainMetadataPathOverrideForTests(root);
  setRegionPackUserDataRootForTests(userData);
  try {
    const extracted = regionPackDirectory(regionId);
    assert.equal(extracted, cached);
    assert.equal(fs.readFileSync(path.join(cached, 'region_manifest.json'), 'utf8'), next);
    assert.equal(fs.existsSync(path.join(cached, 'keep.txt')), false);
  } finally {
    setTerrainMetadataPathOverrideForTests(null);
    setRegionPackUserDataRootForTests(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a cached pack whose manifest matches the zip is reused', () => {
  const regionId = 'sample_pack';
  const { root, regionDirectory, userData } = makeRegionRoot(regionId);
  const text = '{"schema_version":"1.2.0"}';
  const zip = zipSync({ 'region_manifest.json': strToU8(text) });
  fs.writeFileSync(path.join(regionDirectory, 'region_manifest.json.zip'), zip);
  const cached = path.join(userData, 'generated-regions', regionId);
  fs.mkdirSync(cached, { recursive: true });
  fs.writeFileSync(path.join(cached, 'region_manifest.json'), text);
  fs.writeFileSync(path.join(cached, 'pack.ready'), '');
  fs.writeFileSync(path.join(cached, 'keep.txt'), 'stay');
  setTerrainMetadataPathOverrideForTests(root);
  setRegionPackUserDataRootForTests(userData);
  try {
    assert.equal(regionPackDirectory(regionId), cached);
    assert.equal(fs.readFileSync(path.join(cached, 'keep.txt'), 'utf8'), 'stay');
  } finally {
    setTerrainMetadataPathOverrideForTests(null);
    setRegionPackUserDataRootForTests(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('extracted repo JSON is used and a broken zip leaves no temp directory', () => {
  const regionId = 'sample_pack';
  const { root, regionDirectory, userData } = makeRegionRoot(regionId);
  fs.writeFileSync(path.join(regionDirectory, 'region_manifest.json'), '{}');
  setTerrainMetadataPathOverrideForTests(root);
  setRegionPackUserDataRootForTests(userData);
  try {
    assert.equal(regionPackDirectory(regionId), regionDirectory);
    assert.equal(fs.existsSync(path.join(userData, 'generated-regions', regionId)), false);
    fs.rmSync(path.join(regionDirectory, 'region_manifest.json'));
    fs.writeFileSync(path.join(regionDirectory, 'region_manifest.json.zip'), Buffer.from('not-a-zip'));
    assert.throws(() => regionPackDirectory(regionId));
    const parent = path.join(userData, 'generated-regions');
    assert.equal(fs.existsSync(path.join(parent, `.${regionId}.extracting`)), false);
    assert.equal(fs.existsSync(path.join(parent, regionId)), false);
  } finally {
    setTerrainMetadataPathOverrideForTests(null);
    setRegionPackUserDataRootForTests(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
