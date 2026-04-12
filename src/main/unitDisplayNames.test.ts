/**
 * Contract tests for player-facing unit display names.
 * Run with: node dist/main/unitDisplayNames.test.js
 */

import * as assert from 'assert';
import {
  buildUnitDisplayNameLookup,
  fallbackDisplayNameFromUnitId,
  formatTacticalSubUnitDisplayName,
} from '../shared/unitDisplayNames';

/**
 * Defines the `testBuildLookupUsesRomanNumeralsForAiAndOrdinalsForHuman` function shape (function testBuildLookupUsesRomanNumeralsForAiAndOrdinalsForHuman(): void).

 * Purpose: Supports maintainability by documenting why `testBuildLookupUsesRomanNumeralsForAiAndOrdinalsForHuman` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testBuildLookupUsesRomanNumeralsForAiAndOrdinalsForHuman(): void {
  const lookup = buildUnitDisplayNameLookup([
    { id: 'opponent-infantry-1', unitType: 'infantry', displayOrder: 1 },
    { id: 'opponent-infantry-2', unitType: 'infantry', displayOrder: 2 },
    { id: 'opponent-infantry-6', unitType: 'infantry', displayOrder: 6 },
    { id: 'opponent-infantry-20', unitType: 'infantry', displayOrder: 20 },
    { id: 'human-infantry-1', unitType: 'infantry', displayOrder: 1 },
    { id: 'human-infantry-2', unitType: 'infantry', displayOrder: 2 },
    { id: 'human-air-1', unitType: 'air', displayOrder: 3 },
    { id: 'opponent-air-1', unitType: 'air', displayOrder: 4 },
  ]);

  assert.strictEqual(lookup.get('opponent-infantry-1'), 'I Infantry');
  assert.strictEqual(lookup.get('opponent-infantry-2'), 'II Infantry');
  assert.strictEqual(lookup.get('opponent-infantry-6'), 'VI Infantry');
  assert.strictEqual(lookup.get('opponent-infantry-20'), 'XX Infantry');
  assert.strictEqual(lookup.get('human-infantry-1'), '1st Infantry');
  assert.strictEqual(lookup.get('human-infantry-2'), '2nd Infantry');
  assert.strictEqual(lookup.get('human-air-1'), '3rd Squadron');
  assert.strictEqual(lookup.get('opponent-air-1'), 'IV Squadron');
}

/**
 * Defines the `testFallbackUsesRomanNumeralsForAiAndLeavesUnknownIdsUntouched` function shape (function testFallbackUsesRomanNumeralsForAiAndLeavesUnknownIdsUntouched(): void).

 * Purpose: Supports maintainability by documenting why `testFallbackUsesRomanNumeralsForAiAndLeavesUnknownIdsUntouched` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testFallbackUsesRomanNumeralsForAiAndLeavesUnknownIdsUntouched(): void {
  assert.strictEqual(fallbackDisplayNameFromUnitId('opponent-armor-4'), 'IV Armored');
  assert.strictEqual(fallbackDisplayNameFromUnitId('human-armor-4'), '4th Armored');
  assert.strictEqual(fallbackDisplayNameFromUnitId('opponent-air-5'), 'V Squadron');
  assert.strictEqual(fallbackDisplayNameFromUnitId('human-air-6'), '6th Squadron');
  assert.strictEqual(fallbackDisplayNameFromUnitId('opponent-unknown'), 'opponent-unknown');
}

/**
 * Defines the `testFormatTacticalSubUnitDisplayName` function shape (function testFormatTacticalSubUnitDisplayName(): void).

 * Purpose: Locks milestone-2.1 tactical sub-label formatting to the shared strategic parent display string plus two-digit ordinal.
 * When to use: Regression guard when editing `formatTacticalSubUnitDisplayName` or tactical snapshot synthesis.
 * Expected outcome: Human ordinals and AI roman parent labels compose with zero-padded tactical indices.
 * Exceptions: None.
 */
function testFormatTacticalSubUnitDisplayName(): void {
  assert.strictEqual(formatTacticalSubUnitDisplayName('23rd Infantry', 1), '23rd Infantry (01)');
  assert.strictEqual(formatTacticalSubUnitDisplayName('IV Fleet', 12), 'IV Fleet (12)');
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testBuildLookupUsesRomanNumeralsForAiAndOrdinalsForHuman();
  testFallbackUsesRomanNumeralsForAiAndLeavesUnknownIdsUntouched();
  testFormatTacticalSubUnitDisplayName();
  console.log('unitDisplayNames tests passed');
}

run();
