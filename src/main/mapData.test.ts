import * as assert from 'assert';

import {
  H3_RESOLUTION,
  LATLNG_DECIMAL_PLACES,
  getLatLngDecimalPlacesForResolution,
  roundLatLng,
} from './mapData';

function testDecimalPlacesByResolutionBands(): void {
  assert.strictEqual(getLatLngDecimalPlacesForResolution(0), 2);
  assert.strictEqual(getLatLngDecimalPlacesForResolution(1), 2);
  assert.strictEqual(getLatLngDecimalPlacesForResolution(2), 3);
  assert.strictEqual(getLatLngDecimalPlacesForResolution(3), 3);
  assert.strictEqual(getLatLngDecimalPlacesForResolution(4), 4);
  assert.strictEqual(getLatLngDecimalPlacesForResolution(5), 4);
  assert.strictEqual(getLatLngDecimalPlacesForResolution(6), 5);
}

function testExportedDecimalPlacesMatchActiveResolution(): void {
  assert.strictEqual(
    LATLNG_DECIMAL_PLACES,
    getLatLngDecimalPlacesForResolution(H3_RESOLUTION),
    'LATLNG_DECIMAL_PLACES should stay derived from active H3 resolution'
  );
}

function testRoundLatLngUsesConfiguredPrecision(): void {
  const [lat, lng] = roundLatLng(12.345678, -98.7654321);
  if (LATLNG_DECIMAL_PLACES === 2) {
    assert.strictEqual(lat, 12.35);
    assert.strictEqual(lng, -98.77);
  } else {
    const f = 10 ** LATLNG_DECIMAL_PLACES;
    assert.strictEqual(lat, Math.round(12.345678 * f) / f);
    assert.strictEqual(lng, Math.round(-98.7654321 * f) / f);
  }
}

function run(): void {
  testDecimalPlacesByResolutionBands();
  testExportedDecimalPlacesMatchActiveResolution();
  testRoundLatLngUsesConfiguredPrecision();
  // eslint-disable-next-line no-console
  console.log('mapData.test.ts passed');
}

run();
