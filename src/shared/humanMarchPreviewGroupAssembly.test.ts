import * as assert from 'assert';
import {
  buildHumanOrderGroupPreviewEnvelope,
  groupedStrategicMarchPreviewUnitIds,
  groupedTacticalMarchPreviewUnitIds,
} from './humanMarchPreviewGroupAssembly';
import type { HumanOrderPreviewResult } from './ipc/humanOrderPreviewTypes';

/**
 * Builds a minimal preview row for envelope assembly tests.
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
