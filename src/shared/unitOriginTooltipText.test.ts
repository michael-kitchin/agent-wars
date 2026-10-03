import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latLngToCell } from 'h3-js';
import { getStrategicRes1HexCode } from './hexLlmCodeAssignment';
import { formatUnitOriginTooltipText, unitOriginsPresentTheSame } from './unitOriginTooltipText';
import type { UnitOrigin } from './unitOriginTypes';

const PARIS_RES1 = latLngToCell(48.85, 2.35, 1);

test('a known birth country shows its name, the birth hex code, and the title-cased terrain', () => {
  const hexCode = getStrategicRes1HexCode(PARIS_RES1);
  assert.equal(hexCode?.length, 2);
  const origin: UnitOrigin = {
    birthH3Index: PARIS_RES1,
    birthRes4H3Index: null,
    birthTerrainKind: 'plains',
    birthCountryName: 'France',
    birthCountryCode: 'FR',
    birthIsUrban: false,
  };
  assert.equal(formatUnitOriginTooltipText(origin), `Origin: France (${hexCode})\nTerrain: Plains`);
  assert.equal(
    formatUnitOriginTooltipText({ ...origin, birthIsUrban: true }),
    `Origin: France (${hexCode})\nTerrain: Plains`
  );
  assert.equal(
    formatUnitOriginTooltipText(origin, 'Bonus: +1 (country)'),
    `Origin: France (${hexCode})\nTerrain: Plains\nBonus: +1 (country)`
  );
});

test('an unknown birth country and terrain fall back to Unknown, and a hex without a code drops the parenthetical', () => {
  const unknownHere: UnitOrigin = {
    birthH3Index: PARIS_RES1,
    birthRes4H3Index: null,
    birthTerrainKind: null,
    birthCountryName: null,
    birthCountryCode: null,
    birthIsUrban: false,
  };
  assert.equal(
    formatUnitOriginTooltipText(unknownHere),
    `Origin: Unknown (${getStrategicRes1HexCode(PARIS_RES1)})\nTerrain: Unknown`
  );
  const noCode: UnitOrigin = { ...unknownHere, birthH3Index: 'not-a-hex' };
  assert.equal(formatUnitOriginTooltipText(noCode), 'Origin: Unknown\nTerrain: Unknown');
});

/**
 * Checks that equal birth fields count as the same origin and one differing field does not.
 *
 * Purpose: Loss toasts share one flag per display name, so two units from the same place must still get that flag.
 * When to use: From this file's runner.
 * Expected outcome: Matching copies return true; a different birth hex returns false.
 * Exceptions: AssertionError when the comparison drifts.
 */
test('origins that present the same flag and tooltip match, and a different birth hex does not', () => {
  const origin: UnitOrigin = {
    birthH3Index: PARIS_RES1,
    birthRes4H3Index: null,
    birthTerrainKind: 'plains',
    birthCountryName: 'France',
    birthCountryCode: 'FR',
    birthIsUrban: false,
  };
  const copy: UnitOrigin = { ...origin };
  assert.equal(unitOriginsPresentTheSame(origin, copy), true);
  assert.equal(unitOriginsPresentTheSame(origin, { ...origin, birthH3Index: 'not-a-hex' }), false);
});
