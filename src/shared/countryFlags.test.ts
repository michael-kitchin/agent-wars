import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { AVAILABLE_COUNTRY_FLAG_CODES, UNKNOWN_COUNTRY_FLAG_PATH, countryFlagAssetPath } from './countryFlags';

test('AVAILABLE_COUNTRY_FLAG_CODES matches the vendored static/flags files exactly', () => {
  const flagDir = path.join(process.cwd(), 'static', 'flags');
  const fileCodes = fs
    .readdirSync(flagDir)
    .filter((name) => name.endsWith('.svg'))
    .map((name) => path.basename(name, '.svg').toUpperCase())
    .sort();
  assert.deepEqual([...AVAILABLE_COUNTRY_FLAG_CODES].sort(), fileCodes);
});

test('countryFlagAssetPath resolves known codes and falls back to the placeholder', () => {
  assert.equal(countryFlagAssetPath('FR'), 'flags/fr.svg');
  assert.equal(countryFlagAssetPath(null), UNKNOWN_COUNTRY_FLAG_PATH);
  assert.equal(countryFlagAssetPath('ZZ'), UNKNOWN_COUNTRY_FLAG_PATH);
});
