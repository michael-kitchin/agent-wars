import * as assert from 'assert';
import {
  buildHumanOrderGroupPreviewEnvelope,
  groupedStrategicMarchPreviewUnitIds,
  groupedTacticalMarchPreviewUnitIds,
} from './humanMarchPreviewGroupAssembly';
import type { HumanOrderPreviewResult } from './ipc/humanOrderPreviewTypes';

/**
 * Builds a minimal preview row for envelope assembly tests.
 *
 * Purpose: Reduces boilerplate when constructing grouped march preview envelopes in unit tests.
 * When to use: From grouped preview assembly regression tests in this module.
 * Expected outcome: Returns a `{ unitId, preview }` row with optional invalid marker and segment count.
 * Exceptions: None.
 */
function previewRow(unitId: string, valid: boolean, segmentCount: number): {
  unitId: string;
  preview: HumanOrderPreviewResult;
} {
  return {
    unitId,
    preview: {
      valid,
      showInvalidMarker: !valid,
      invalidReason: valid ? undefined : 'blocked',
      segments:
        segmentCount > 0
          ? [
              {
                turn: 1,
                hexes: [
                  [0, 0],
                  [1, 1],
                ],
              },
            ]
          : [],
    },
  };
}

/**
 * Regression guard: grouped envelope strips route segments when any unit preview is invalid.
 *
 * Purpose: Ensures mixed or partial failures do not draw route lines for any unit in the envelope.
 * When to use: Run via `npm test` after changes to `buildHumanOrderGroupPreviewEnvelope`.
 * Expected outcome: `validForAll` is false and every preview row has empty segments.
 * Exceptions: None.
 */
function testBuildHumanOrderGroupPreviewEnvelopeClearsSegmentsWhenAnyInvalid(): void {
  const envelope = buildHumanOrderGroupPreviewEnvelope({
    previews: [previewRow('naval-1', true, 1), previewRow('land-1', false, 0)],
    slowestMovementRange: 2,
  });
  assert.strictEqual(envelope.validForAll, false);
  assert.strictEqual(envelope.showInvalidMarker, true);
  for (const row of envelope.previews) {
    assert.strictEqual(row.preview.segments.length, 0, `expected no segments for ${row.unitId}`);
  }
}

/**
 * Regression guard: grouped envelope keeps route segments when every unit preview is valid.
 *
 * Purpose: Ensures successful grouped previews retain drawable route geometry for all units.
 * When to use: Run via `npm test` after changes to `buildHumanOrderGroupPreviewEnvelope`.
 * Expected outcome: `validForAll` is true and every preview row retains segments.
 * Exceptions: None.
 */
function testBuildHumanOrderGroupPreviewEnvelopeKeepsSegmentsWhenAllValid(): void {
  const envelope = buildHumanOrderGroupPreviewEnvelope({
    previews: [previewRow('naval-1', true, 1), previewRow('land-1', true, 1)],
    slowestMovementRange: 2,
  });
  assert.strictEqual(envelope.validForAll, true);
  assert.ok(envelope.previews.every((row) => row.preview.segments.length > 0));
}

/**
 * Regression guard: mixed land/naval strategic previews include every selected unit id.
 *
 * Purpose: Ensures grouped strategic march preview IPC includes all mixed-selection unit ids.
 * When to use: Run via `npm test` after changes to `groupedStrategicMarchPreviewUnitIds`.
 * Expected outcome: Returns every unit id when `mixedLandAndNaval` is true.
 * Exceptions: None.
 */
function testGroupedStrategicMarchPreviewUnitIdsIncludesAllMixedSelectionUnits(): void {
  const ids = groupedStrategicMarchPreviewUnitIds({
    rows: [
      { unitId: 'land-1', originH3: 'same-origin' },
      { unitId: 'naval-1', originH3: 'same-origin' },
    ],
    mixedLandAndNaval: true,
  });
  assert.deepStrictEqual(ids, ['land-1', 'naval-1']);
}

/**
 * Regression guard: homogeneous strategic previews keep one representative id per origin.
 *
 * Purpose: Ensures non-mixed grouped previews deduplicate same-origin stacks to one representative unit id.
 * When to use: Run via `npm test` after changes to `groupedStrategicMarchPreviewUnitIds`.
 * Expected outcome: Returns only the first unit id for a shared origin hex.
 * Exceptions: None.
 */
function testGroupedStrategicMarchPreviewUnitIdsUsesRepresentativeForHomogeneousSelection(): void {
  const ids = groupedStrategicMarchPreviewUnitIds({
    rows: [
      { unitId: 'land-1', originH3: 'same-origin' },
      { unitId: 'land-2', originH3: 'same-origin' },
    ],
    mixedLandAndNaval: false,
  });
  assert.deepStrictEqual(ids, ['land-1']);
}

/**
 * Regression guard: homogeneous tactical previews keep one representative id per origin.
 *
 * Purpose: Ensures non-mixed tactical grouped previews deduplicate same-origin sub-units to one representative id.
 * When to use: Run via `npm test` after changes to `groupedTacticalMarchPreviewUnitIds`.
 * Expected outcome: Returns only the first sub-unit id for a shared origin hex.
 * Exceptions: None.
 */
function testGroupedTacticalMarchPreviewUnitIdsUsesRepresentativeForHomogeneousSelection(): void {
  const ids = groupedTacticalMarchPreviewUnitIds({
    rows: [
      { unitId: 'nav-same-hex', originH3: 'same-origin', unitType: 'naval' },
      { unitId: 'inf-same-hex', originH3: 'same-origin', unitType: 'infantry' },
    ],
    mixedLandAndNaval: false,
  });
  assert.deepStrictEqual(ids, ['nav-same-hex']);
}

/**
 * Regression guard: mixed land/naval tactical previews include every selected sub-unit id.
 *
 * Purpose: Ensures grouped tactical march preview IPC includes all mixed-selection sub-unit ids.
 * When to use: Run via `npm test` after changes to `groupedTacticalMarchPreviewUnitIds`.
 * Expected outcome: Returns every sub-unit id when `mixedLandAndNaval` is true.
 * Exceptions: None.
 */
function testGroupedTacticalMarchPreviewUnitIdsIncludesAllMixedSelectionUnits(): void {
  const ids = groupedTacticalMarchPreviewUnitIds({
    rows: [
      { unitId: 'inf-same-hex', originH3: 'same-origin', unitType: 'infantry' },
      { unitId: 'nav-same-hex', originH3: 'same-origin', unitType: 'naval' },
    ],
    mixedLandAndNaval: true,
  });
  assert.deepStrictEqual(ids, ['inf-same-hex', 'nav-same-hex']);
}

/**
 * Entry point for grouped march preview assembly unit tests.
 *
 * Purpose: Runs all tests in this module and prints a pass marker for CI harnesses.
 * When to use: Invoked automatically when the compiled test file is executed by `npm test`.
 * Expected outcome: All assertions pass and a success line is logged.
 * Exceptions: Propagates assertion failures to the Node process exit code.
 */
function main(): void {
  testBuildHumanOrderGroupPreviewEnvelopeClearsSegmentsWhenAnyInvalid();
  testBuildHumanOrderGroupPreviewEnvelopeKeepsSegmentsWhenAllValid();
  testGroupedStrategicMarchPreviewUnitIdsIncludesAllMixedSelectionUnits();
  testGroupedStrategicMarchPreviewUnitIdsUsesRepresentativeForHomogeneousSelection();
  testGroupedTacticalMarchPreviewUnitIdsUsesRepresentativeForHomogeneousSelection();
  testGroupedTacticalMarchPreviewUnitIdsIncludesAllMixedSelectionUnits();
  console.log('humanMarchPreviewGroupAssembly.test.ts: all tests passed');
}

main();
