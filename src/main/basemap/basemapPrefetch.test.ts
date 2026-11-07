/**
 * Battle prefetch partition keys.
 *
 * Purpose: A battle should unpack the partitions under its footprint, not the whole region.
 * When to use: From the main-process node test run.
 * Expected outcome: Western Europe's sample battle maps to a small set of zoom-5 keys, and prefetch does not write a partition before it returns control.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cellToChildren } from 'h3-js';
import { test } from 'node:test';
import { zipSync } from 'fflate';
import { setTerrainMetadataPathOverrideForTests } from '../terrainMetadataPaths';
import { setBasemapUserDataRootForTests } from './basemapPartitionExtract';
import { partitionKeysForBattle, startBasemapPrefetch } from './basemapPrefetch';

test('a western Europe battle covers a few zoom-5 partitions', () => {
  const children = cellToChildren('831f80fffffffff', 4);
  const keys = partitionKeysForBattle(children);
  assert.ok(keys.length > 0);
  assert.ok(keys.length < 16, `expected a battle subset, got ${keys.length}`);
  assert.ok(keys.every((key) => /^z5_x\d+_y\d+$/.test(key)));
});

test('prefetch yields before it writes a partition', async () => {
  const children = cellToChildren('831f80fffffffff', 4);
  const keys = partitionKeysForBattle(children);
  assert.ok(keys.length > 0);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basemap-prefetch-'));
  const pack = path.join(root, 'data', 'generated', 'basemap', 'regions', 'western_europe');
  const userData = path.join(root, 'user-data');
  fs.mkdirSync(pack, { recursive: true });
  const partitions: Record<string, { zip: string; sha256: string }> = {};
  for (const key of keys) {
    const bytes = zipSync({ '9/0/0.webp': new Uint8Array([1]) });
    const zipName = `${key}.zip`;
    fs.writeFileSync(path.join(pack, zipName), bytes);
    partitions[key] = { zip: zipName, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }
  const manifest = {
    schema: 1,
    kind: 'region',
    mapId: 'western_europe',
    zoomMin: 8,
    zoomMax: 9,
    settingsHash: 'a'.repeat(64),
    sourcesHash: 'b'.repeat(64),
    landTile: 'land.webp',
    waterTile: 'water.webp',
    indexesZip: 'indexes.json.zip',
    indexesSha256: 'c'.repeat(64),
    partitions,
  };
  fs.writeFileSync(
    path.join(pack, 'basemap_pack.json.zip'),
    zipSync({ 'basemap_pack.json': new TextEncoder().encode(JSON.stringify(manifest)) }),
  );
  setTerrainMetadataPathOverrideForTests(root);
  setBasemapUserDataRootForTests(userData);
  const ready = path.join(userData, 'generated-basemap', 'western_europe', keys[0] ?? '', 'partition.ready');
  try {
    const pending = startBasemapPrefetch({ gameMapId: 'western_europe', childH3Indexes: children });
    assert.equal(fs.existsSync(ready), false);
    await pending;
    assert.equal(fs.readFileSync(ready, 'utf8'), partitions[keys[0] ?? '']?.sha256);
  } finally {
    setTerrainMetadataPathOverrideForTests(null);
    setBasemapUserDataRootForTests(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
