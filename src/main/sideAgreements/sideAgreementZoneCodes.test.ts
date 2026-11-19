/**
 * Zone hex codes and H3 indexes.
 *
 * Purpose: A model reply holds bad codes often, so translation must skip them without throwing.
 * When to use: `npm run build:main`, then `node dist/main/sideAgreements/sideAgreementZoneCodes.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIDE_AGREEMENT_ZONE_MAX_HEXES } from '../../shared/sideAgreements';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import {
  STRATEGIC_ZONE_CODE_TRANSLATOR,
  zoneCodesToH3,
  zoneH3ToCodes,
  type ZoneCodeTranslator,
} from './sideAgreementZoneCodes';

/**
 * A translator that knows two hexes.
 *
 * Purpose: The translation rules are checked without the strategic registry.
 * When to use: The cases below.
 * Expected outcome: `DO` and `D4` translate. Everything else is unknown.
 * Exceptions: None.
 */
const FAKE_TRANSLATOR: ZoneCodeTranslator = {
  codeToH3: (code) => ({ DO: 'h-do', D4: 'h-d4' } as Record<string, string>)[code] ?? null,
  h3ToCode: (index) => ({ 'h-do': 'DO', 'h-d4': 'D4' } as Record<string, string>)[index] ?? null,
};

test('codes are trimmed, uppercased, deduplicated, and counted when skipped', () => {
  const result = zoneCodesToH3(['DO', ' d4 ', 'ZZ', 7, 'DO'], FAKE_TRANSLATOR);
  assert.deepEqual(result.h3, ['h-do', 'h-d4']);
  assert.equal(result.droppedCount, 3);
});

test('a zone keeps at most the limit and counts the rest as dropped', () => {
  const many: ZoneCodeTranslator = { codeToH3: (code) => `h-${code}`, h3ToCode: () => null };
  const codes = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'];
  const result = zoneCodesToH3(codes, many);
  assert.equal(result.h3.length, SIDE_AGREEMENT_ZONE_MAX_HEXES);
  assert.equal(result.droppedCount, 1);
});

test('stored indexes translate back and an unknown one is skipped', () => {
  assert.deepEqual(zoneH3ToCodes(['h-d4', 'h-none', 'h-do'], FAKE_TRANSLATOR), ['D4', 'DO']);
});

test('the strategic translator returns null for unknown input without throwing', () => {
  withTempGameDb('aw-zone-codes-', () => {
    assert.equal(STRATEGIC_ZONE_CODE_TRANSLATOR.codeToH3('!!'), null);
    assert.equal(STRATEGIC_ZONE_CODE_TRANSLATOR.h3ToCode('not-a-cell'), null);
  });
});
