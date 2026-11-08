/**
 * Contracts for reading a basemap vector zip.
 * Run: `node dist/main/basemap/basemapVectorRead.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { zipSync } from 'fflate';
import { readBasemapVectorText } from './basemapVectorRead';

describe('basemap vector read', () => {
  it('returns null when the vectors folder is absent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basemap-vectors-'));
    assert.equal(readBasemapVectorText('coastlines', root), null);
  });

  it('returns the coastline member text', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basemap-vectors-'));
    const vectors = path.join(root, 'vectors');
    fs.mkdirSync(vectors);
    const text = '{"kind":"coastlines"}';
    const bytes = zipSync({ 'coastlines.json': new TextEncoder().encode(text) });
    fs.writeFileSync(path.join(vectors, 'coastlines.json.zip'), bytes);
    assert.equal(readBasemapVectorText('coastlines', root), text);
  });
});
