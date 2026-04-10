import * as assert from 'assert';

import {
  H3_RESOLUTION,
  LATLNG_DECIMAL_PLACES,
  getLatLngDecimalPlacesForResolution,
  roundLatLng,
} from './mapData';

/**
 * Defines the `testDecimalPlacesByResolutionBands` function shape (function testDecimalPlacesByResolutionBands(): void).

 * Purpose: Supports maintainability by documenting why `testDecimalPlacesByResolutionBands` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testDecimalPlacesByResolutionBands(): void {
  assert.strictEqual(getLatLngDecimalPlacesForResolution(0), 2);
  assert.strictEqual(getLatLngDecimalPlacesForResolution(1), 2);
  assert.strictEqual(getLatLngDecimalPlacesForResolution(2), 3);
  assert.strictEqual(getLatLngDecimalPlacesForResolution(3), 3);
  assert.strictEqual(getLatLngDecimalPlacesForResolution(4), 4);
  assert.strictEqual(getLatLngDecimalPlacesForResolution(5), 4);
  assert.strictEqual(getLatLngDecimalPlacesForResolution(6), 5);
}

/**
 * Defines the `testExportedDecimalPlacesMatchActiveResolution` function shape (function testExportedDecimalPlacesMatchActiveResolution(): void).

 * Purpose: Supports maintainability by documenting why `testExportedDecimalPlacesMatchActiveResolution` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testExportedDecimalPlacesMatchActiveResolution(): void {
  assert.strictEqual(
    LATLNG_DECIMAL_PLACES,
    getLatLngDecimalPlacesForResolution(H3_RESOLUTION),
    'LATLNG_DECIMAL_PLACES should stay derived from active H3 resolution'
  );
}

/**
 * Defines the `testRoundLatLngUsesConfiguredPrecision` function shape (function testRoundLatLngUsesConfiguredPrecision(): void).

 * Purpose: Supports maintainability by documenting why `testRoundLatLngUsesConfiguredPrecision` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testDecimalPlacesByResolutionBands();
  testExportedDecimalPlacesMatchActiveResolution();
  testRoundLatLngUsesConfiguredPrecision();
  console.log('mapData.test.ts passed');
}

run();
