/**
 * Contract tests for player-facing unit display names.
 * Run with: node dist/main/unitDisplayNames.test.js
 */

import * as assert from 'assert';
import {
  buildStrategicUnitDisplayLabelResolver,
  buildKillLabelUnitRoster,
  buildUnitDisplayNameLookup,
  fallbackDisplayNameFromUnitId,
  formatTacticalSubUnitDisplayName,
  tacticalSubUnitLabelForUserMessage,
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
    { id: 'human-air-1', unitType: 'air', displayOrder: 1 },
    { id: 'opponent-air-1', unitType: 'air', displayOrder: 1 },
  ]);

  assert.strictEqual(lookup.get('opponent-infantry-1'), 'I Infantry');
  assert.strictEqual(lookup.get('opponent-infantry-2'), 'II Infantry');
  assert.strictEqual(lookup.get('opponent-infantry-6'), 'VI Infantry');
  assert.strictEqual(lookup.get('opponent-infantry-20'), 'XX Infantry');
  assert.strictEqual(lookup.get('human-infantry-1'), '1st Infantry');
  assert.strictEqual(lookup.get('human-infantry-2'), '2nd Infantry');
  assert.strictEqual(lookup.get('human-air-1'), '1st Squadron');
  assert.strictEqual(lookup.get('opponent-air-1'), 'I Squadron');
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
  assert.strictEqual(
    fallbackDisplayNameFromUnitId('opponent-air-prod-3-276'),
    'opponent-air-prod-3-276',
    'production spawn sequence must not become a roman formation label'
  );
  assert.strictEqual(
    fallbackDisplayNameFromUnitId('opponent-infantry-prod-9-281'),
    'opponent-infantry-prod-9-281'
  );
}

/**
 * Verifies production roster rows label by per-type display order, not global spawn sequence suffixes.
 *
 * Purpose: Regression guard for AI squadron/armor/infantry/navals produced mid-campaign (`*-prod-*` ids).
 * When to use: After changing `buildUnitDisplayNameLookup` or production unit insertion.
 * Expected outcome: Roman/ordinal labels follow `displayOrder` within each unit type; corrupted spawn-sequence orders fall back to id sort.
 * Exceptions: None.
 */
function testProductionUnitsUseDisplayOrderNotSpawnSequence(): void {
  const lookup = buildUnitDisplayNameLookup([
    { id: 'opponent-air-1', unitType: 'air', displayOrder: 1 },
    { id: 'opponent-air-prod-3-276', unitType: 'air', displayOrder: 2 },
    { id: 'opponent-air-prod-4-277', unitType: 'air', displayOrder: 3 },
    { id: 'opponent-infantry-1', unitType: 'infantry', displayOrder: 1 },
    { id: 'opponent-infantry-prod-9-281', unitType: 'infantry', displayOrder: 2 },
    { id: 'opponent-armor-2', unitType: 'armor', displayOrder: 2 },
    { id: 'opponent-armor-prod-8-275', unitType: 'armor', displayOrder: 3 },
    { id: 'opponent-naval-1', unitType: 'naval', displayOrder: 1 },
    { id: 'opponent-naval-prod-5-279', unitType: 'naval', displayOrder: 2 },
  ]);
  assert.strictEqual(lookup.get('opponent-air-1'), 'I Squadron');
  assert.strictEqual(lookup.get('opponent-air-prod-3-276'), 'II Squadron');
  assert.strictEqual(lookup.get('opponent-air-prod-4-277'), 'III Squadron');
  assert.strictEqual(lookup.get('opponent-infantry-prod-9-281'), 'II Infantry');
  assert.strictEqual(lookup.get('opponent-armor-prod-8-275'), 'III Armored');
  assert.strictEqual(lookup.get('opponent-naval-prod-5-279'), 'II Fleet');

  const corruptedLookup = buildUnitDisplayNameLookup([
    { id: 'opponent-air-1', unitType: 'air', displayOrder: 1 },
    { id: 'opponent-air-prod-3-276', unitType: 'air', displayOrder: 276 },
    { id: 'opponent-air-prod-4-277', unitType: 'air', displayOrder: 277 },
  ]);
  assert.strictEqual(corruptedLookup.get('opponent-air-prod-3-276'), 'II Squadron');
  assert.strictEqual(corruptedLookup.get('opponent-air-prod-4-277'), 'III Squadron');
}

/**
 * Verifies kill-label roster rows let toast formatters name fog-hidden production killers by display order.
 *
 * Purpose: Regression guard for update lines like `VIII Armored destroyed 1st Armored` when the killer is absent from fog-filtered snapshot units.
 * When to use: After changing `buildKillLabelUnitRoster` or kill toast roster merge logic.
 * Expected outcome: Lookup resolves production killer ids to roman labels when only `killLabelUnits` carries the hidden row.
 * Exceptions: None.
 */
function testKillLabelRosterResolvesHiddenProductionKillers(): void {
  const killEdges = [{ victimId: 'human-armor-1', killerIds: ['opponent-armor-prod-7-308', 'opponent-armor-2'] }];
  const killLabelUnits = buildKillLabelUnitRoster(
    killEdges,
    [
      { id: 'opponent-armor-prod-7-308', unitType: 'armor', displayOrder: 8 },
      { id: 'opponent-armor-2', unitType: 'armor', displayOrder: 2 },
    ],
    [{ id: 'human-armor-1', unitType: 'armor', displayOrder: 1 }]
  );
  const fogFilteredStateUnits = [{ id: 'human-armor-1', unitType: 'armor', displayOrder: 1 }];
  const lookup = buildUnitDisplayNameLookup([...fogFilteredStateUnits, ...killLabelUnits]);
  assert.strictEqual(lookup.get('opponent-armor-prod-7-308'), 'VIII Armored');
  assert.strictEqual(lookup.get('opponent-armor-2'), 'II Armored');
  assert.strictEqual(lookup.get('human-armor-1'), '1st Armored');
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
 * Defines the `testBuildStrategicResolverMatchesLookupAndFallback` function shape (function testBuildStrategicResolverMatchesLookupAndFallback(): void).

 * Purpose: Locks `buildStrategicUnitDisplayLabelResolver` to the same labels as `buildUnitDisplayNameLookup`, with id-safe fallback for unknown roster rows.
 * When to use: Regression guard when changing resolver wiring in submit-order or AI validation paths.
 * Expected outcome: Known ids match lookup strings; unknown ids use `fallbackDisplayNameFromUnitId`.
 * Exceptions: None.
 */
function testBuildStrategicResolverMatchesLookupAndFallback(): void {
  const units = [{ id: 'human-infantry-1', unitType: 'infantry', displayOrder: 1 }];
  const resolve = buildStrategicUnitDisplayLabelResolver(units);
  assert.strictEqual(resolve('human-infantry-1'), '1st Infantry');
  assert.strictEqual(resolve('human-infantry-99'), fallbackDisplayNameFromUnitId('human-infantry-99'));
}

/**
 * Defines the `testTacticalSubUnitLabelForUserMessage` function shape (function testTacticalSubUnitLabelForUserMessage(): void).

 * Purpose: Ensures tactical IPC/status strings can resolve `displayName` instead of raw sub-unit ids.
 * When to use: Regression guard for `tacticalSubUnitLabelForUserMessage` used by tactical validation reasons.
 * Expected outcome: Known id maps to display name; unknown id falls back to the id string.
 * Exceptions: None.
 */
function testTacticalSubUnitLabelForUserMessage(): void {
  const subUnits = [
    { id: 'human-naval-1:01', displayName: '1st Fleet (01)' },
    { id: 'human-naval-1:02', displayName: '  ' },
  ];
  assert.strictEqual(tacticalSubUnitLabelForUserMessage(subUnits, 'human-naval-1:01'), '1st Fleet (01)');
  assert.strictEqual(tacticalSubUnitLabelForUserMessage(subUnits, 'human-naval-1:02'), 'human-naval-1:02');
  assert.strictEqual(tacticalSubUnitLabelForUserMessage(subUnits, 'missing'), 'missing');
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
  testProductionUnitsUseDisplayOrderNotSpawnSequence();
  testKillLabelRosterResolvesHiddenProductionKillers();
  testFormatTacticalSubUnitDisplayName();
  testBuildStrategicResolverMatchesLookupAndFallback();
  testTacticalSubUnitLabelForUserMessage();
  console.log('unitDisplayNames tests passed');
}

run();
