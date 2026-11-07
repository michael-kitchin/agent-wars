/**
 * Pack reader, unpacker, and tile resolver contracts.
 *
 * Purpose: The offline basemap is served from zips. These tests use a temp pack, not the shipped world.
 * When to use: From the main-process node test run.
 * Expected outcome: Shaded tiles unpack once, flat and water stay shared, and unsafe paths are refused.
 * Exceptions: None. Assertions throw.
 */

import assert from 'node:assert/strict';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, test } from 'node:test';
import { zipSync } from 'fflate';
import { setTerrainMetadataPathOverrideForTests } from '../terrainMetadataPaths';
import { setBasemapUserDataRootForTests, unpackBasemapPartition } from './basemapPartitionExtract';
import { ancestorKey, resolveBasemapTile } from './basemapTileResolve';
import { readBasemapManifest, selectBasemapRoot } from './basemapPackRead';

/**
 * Writes a one-partition global pack and points the path override at it.
 *
 * Purpose: Resolver tests need a manifest, an index, shared tiles, and one shaded tile.
 * When to use: At the start of a resolver or unpack test.
 * Expected outcome: The pack directory and a user-data directory.
 * Exceptions: None.
 */
function writeFixture(): { root: string; pack: string; userData: string; zipPath: string; sha256: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basemap-pack-'));
  const pack = path.join(root, 'data', 'generated', 'basemap', 'global');
  const userData = path.join(root, 'user-data');
  fs.mkdirSync(pack, { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  const shaded = zipSync({ '0/0/0.webp': new Uint8Array([1, 2, 3, 4]) });
  const zipPath = path.join(pack, 'z0_x0_y0.zip');
  fs.writeFileSync(zipPath, shaded);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
  const indexBytes = new TextEncoder().encode(JSON.stringify({ flat: ['4/8/5'], shaded: ['0/0/0'] }));
  const indexes = zipSync({ 'z0_x0_y0.json': indexBytes });
  fs.writeFileSync(path.join(pack, 'indexes.json.zip'), indexes);
  const indexesSha256 = crypto.createHash('sha256').update(indexes).digest('hex');
  fs.writeFileSync(path.join(pack, 'land.webp'), Buffer.from([9, 9, 9]));
  fs.writeFileSync(path.join(pack, 'water.webp'), Buffer.from([8, 8, 8]));
  const manifest = {
    schema: 1,
    kind: 'global',
    mapId: 'global',
    zoomMin: 0,
    zoomMax: 7,
    settingsHash: 'a'.repeat(64),
    sourcesHash: 'b'.repeat(64),
    landTile: 'land.webp',
    waterTile: 'water.webp',
    indexesZip: 'indexes.json.zip',
    indexesSha256,
    partitions: { z0_x0_y0: { zip: 'z0_x0_y0.zip', sha256 } },
  };
  fs.writeFileSync(
    path.join(pack, 'basemap_pack.json.zip'),
    zipSync({ 'basemap_pack.json': new TextEncoder().encode(JSON.stringify(manifest)) }),
  );
  setTerrainMetadataPathOverrideForTests(root);
  setBasemapUserDataRootForTests(userData);
  return { root, pack, userData, zipPath, sha256 };
}

describe('basemap pack', { concurrency: 1 }, () => {
test('ancestor keys follow the partition shift', () => {
  assert.equal(ancestorKey(9, 243, 157), 'z5_x15_y9');
  assert.equal(ancestorKey(6, 30, 19), 'z3_x3_y2');
  assert.equal(ancestorKey(4, 8, 5), 'z0_x0_y0');
  assert.equal(ancestorKey(0, 1, 0), 'z0_x1_y0');
  assert.equal(ancestorKey(8, 0, 10), 'z5_x0_y1');
});

test('a packaged root outside app.asar wins over the archive copy', () => {
  const asar = path.join('resources', 'app.asar', 'data', 'generated', 'basemap');
  const resources = path.join('resources', 'data', 'generated', 'basemap');
  const unpacked = path.join('resources', 'app.asar.unpacked', 'data', 'generated', 'basemap');
  const present = new Set([asar, resources, unpacked]);
  assert.equal(selectBasemapRoot([asar, resources], (candidate) => present.has(candidate)), resources);
  assert.equal(selectBasemapRoot([unpacked, asar], (candidate) => present.has(candidate)), unpacked);
  assert.equal(selectBasemapRoot([asar], (candidate) => present.has(candidate)), asar);
  assert.equal(selectBasemapRoot([resources], () => false), null);
});

test('a shaded partition unpacks once and a changed hash unpacks again', async () => {
  const fixture = writeFixture();
  const counter = { count: 0 };
  const first = await unpackBasemapPartition('global', 'z0_x0_y0', fixture.zipPath, fixture.sha256, counter);
  const second = await unpackBasemapPartition('global', 'z0_x0_y0', fixture.zipPath, fixture.sha256, counter);
  assert.equal(counter.count, 1);
  assert.equal(first, second);
  assert.equal(fs.readFileSync(path.join(first, 'partition.ready'), 'utf8'), fixture.sha256);
  await unpackBasemapPartition('global', 'z0_x0_y0', fixture.zipPath, `${'c'.repeat(64)}`, counter);
  assert.equal(counter.count, 2);
  fs.rmSync(fixture.root, { recursive: true, force: true });
  setTerrainMetadataPathOverrideForTests(null);
  setBasemapUserDataRootForTests(null);
});

test('two overlapping unpacks write once', async () => {
  const fixture = writeFixture();
  const counter = { count: 0 };
  const first = unpackBasemapPartition('global', 'z0_x0_y0', fixture.zipPath, fixture.sha256, counter);
  const second = unpackBasemapPartition('global', 'z0_x0_y0', fixture.zipPath, fixture.sha256, counter);
  await Promise.all([first, second]);
  assert.equal(counter.count, 1);
  fs.rmSync(fixture.root, { recursive: true, force: true });
  setBasemapUserDataRootForTests(null);
  setTerrainMetadataPathOverrideForTests(null);
});

test('a partition key with a parent segment is refused before a read', async () => {
  const fixture = writeFixture();
  await assert.rejects(() => unpackBasemapPartition('global', '../outside', fixture.zipPath, fixture.sha256));
  assert.equal(fs.existsSync(path.join(fixture.userData, 'generated-basemap', 'outside')), false);
  fs.rmSync(fixture.root, { recursive: true, force: true });
  setBasemapUserDataRootForTests(null);
  setTerrainMetadataPathOverrideForTests(null);
});

test('shaded, flat, water, and rejected urls resolve from the fixture pack', async () => {
  const fixture = writeFixture();
  const shaded = await resolveBasemapTile('agentwars-basemap://tiles/global/0/0/0.webp');
  const flat = await resolveBasemapTile('agentwars-basemap://tiles/global/4/8/5.webp');
  const water = await resolveBasemapTile('agentwars-basemap://tiles/global/4/1/1.webp');
  const zoom8 = await resolveBasemapTile('agentwars-basemap://tiles/global/8/0/0.webp');
  const escaped = await resolveBasemapTile('agentwars-basemap://tiles/global/0/0/../1/0.webp');
  const png = await resolveBasemapTile('agentwars-basemap://tiles/global/0/0/0.png');
  const unknown = await resolveBasemapTile('agentwars-basemap://tiles/missing_map/0/0/0.webp');
  assert.equal(shaded.status, 200);
  assert.deepEqual(shaded.body, new Uint8Array([1, 2, 3, 4]));
  assert.equal(shaded.cacheControl, 'public, max-age=31536000');
  assert.deepEqual(flat.body, new Uint8Array([9, 9, 9]));
  assert.deepEqual(water.body, new Uint8Array([8, 8, 8]));
  assert.deepEqual(zoom8.body, new Uint8Array([8, 8, 8]));
  assert.equal(escaped.status, 404);
  assert.equal(png.status, 404);
  assert.equal(unknown.status, 404);
  assert.equal(readBasemapManifest(fixture.pack).schema, 1);
  fs.rmSync(fixture.root, { recursive: true, force: true });
  setBasemapUserDataRootForTests(null);
  setTerrainMetadataPathOverrideForTests(null);
});

test('the basemap scheme is registered before the app is ready', () => {
  const source = fs.readFileSync(path.resolve('src/main/main.ts'), 'utf8');
  const scheme = source.indexOf('registerSchemesAsPrivileged');
  const ready = source.indexOf('app.whenReady');
  assert.ok(scheme >= 0 && ready > scheme);
});

test('the shipped global pack manifest is schema 1 for zooms 0 through 7', () => {
  const pack = path.resolve('data/generated/basemap/global/basemap_pack.json.zip');
  assert.ok(fs.existsSync(pack));
  const manifest = readBasemapManifest(path.dirname(pack));
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.zoomMin, 0);
  assert.equal(manifest.zoomMax, 7);
});
});
