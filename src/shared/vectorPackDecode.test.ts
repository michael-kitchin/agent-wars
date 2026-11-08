/**
 * Contracts shared with the Python vector writer.
 * Run: `node dist/shared/vectorPackDecode.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  coastlineLodForZoom,
  decodePart,
  parseAdminBorderPack,
  parseCoastlinePack,
  quantizeDegrees,
  vectorCellKey,
  visibleCellRefs,
} from './vectorPackDecode';

const FIXTURE = path.resolve(process.cwd(), 'scripts', 'basemap_pipeline', 'tests', 'fixtures', 'vector_encoding_golden.json');

const DECODED: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 0], [0, 1], [1, 1]],
  [[20, 10], [20, 11]],
  [[0, -0.00001], [1, -0.00001]],
];

/**
 * Reads the shared encoding fixture.
 *
 * Purpose: Python and TypeScript assert the same parts and cell keys.
 * When to use: The fixture test in this file.
 * Expected outcome: The parsed JSON.
 * Exceptions: Throws when the fixture is missing.
 */
function loadFixture(): {
  note: string;
  quantum_deg: number;
  parts: { points_lonlat: number[][]; encoded: number[] }[];
  cells: [number, number, number, string][];
} {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as ReturnType<typeof loadFixture>;
}

describe('vector pack decode', () => {
  it('matches the shared fixture parts and cell keys', () => {
    const fixture = loadFixture();
    assert.equal(fixture.note, 'Test fixture for the vector encoding contract; values are synthetic.');
    fixture.parts.forEach((part, index) => {
      assert.deepEqual(decodePart(part.encoded, fixture.quantum_deg, 0), DECODED[index]);
    });
    for (const [lat, lng, cellDeg, key] of fixture.cells) {
      assert.equal(vectorCellKey(lat, lng, cellDeg), key);
    }
  });

  it('quantizes a negative half away from zero', () => {
    assert.equal(quantizeDegrees(-0.000005), -1);
  });

  it('rejects a coastline document with the wrong schema or kind', () => {
    assert.throws(
      () => parseCoastlinePack({ schema_version: '2.0.0', kind: 'coastlines', quantum_deg: 0.00001, lods: [] }),
      /schema_version/,
    );
    assert.throws(
      () => parseCoastlinePack({ schema_version: '1.0.0', kind: 'map_labels', quantum_deg: 0.00001, lods: [] }),
      /kind/,
    );
  });

  it('treats a missing border group as empty and rejects an unknown id', () => {
    const pack = parseAdminBorderPack({
      schema_version: '1.0.0',
      kind: 'admin_borders',
      quantum_deg: 0.00001,
      groups: [
        { id: 'country', lods: [] },
        { id: 'state', lods: [] },
      ],
    });
    assert.deepEqual(pack.groups.map((group) => group.id), ['country', 'country_disputed', 'state', 'state_disputed']);
    assert.deepEqual(pack.groups[1]?.lods, []);
    assert.deepEqual(pack.groups[3]?.lods, []);
    assert.throws(
      () => parseAdminBorderPack({
        schema_version: '1.0.0',
        kind: 'admin_borders',
        quantum_deg: 0.00001,
        groups: [{ id: 'coast', lods: [] }],
      }),
      /id/,
    );
  });

  it('picks the zoom band and keeps the last band open', () => {
    const pack = parseCoastlinePack({
      schema_version: '1.0.0',
      kind: 'coastlines',
      quantum_deg: 0.00001,
      lods: [
        { min_zoom: 0, max_zoom: 3, cell_deg: 360, cells: {} },
        { min_zoom: 3, max_zoom: 5, cell_deg: 30, cells: {} },
        { min_zoom: 7, max_zoom: null, cell_deg: 2, cells: {} },
      ],
    });
    assert.equal(coastlineLodForZoom(pack, 2.9)?.cellDeg, 360);
    assert.equal(coastlineLodForZoom(pack, 3)?.cellDeg, 30);
    assert.equal(coastlineLodForZoom(pack, 15)?.cellDeg, 2);
  });

  it('draws both sides of a view that crosses longitude 180', () => {
    const refs = visibleCellRefs({ west: 170, south: 0, east: 190, north: 1 }, 10, 100);
    assert.ok(refs.some((ref) => ref.key === vectorCellKey(0, 175, 10) && ref.lngOffset === 0));
    assert.ok(refs.some((ref) => ref.key === vectorCellKey(0, -175, 10) && ref.lngOffset === 360));
  });
});
