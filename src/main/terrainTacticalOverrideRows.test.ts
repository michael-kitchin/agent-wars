/**
 * Contracts for which tactical cells receive an explicit terrain row.
 */

import * as assert from 'assert';
import type { PipelineTerrainKind } from '../shared/pipelineTerrain';
import type { StrategicLandMassRecord } from '../shared/landTraversalStrategic';
import {
  clearTerrainClassificationCacheForTests,
  ensureTerrainClassificationCacheLoaded,
  getStrategicLandMassByH3,
  getTacticalFeatureRowsForSeeding,
  getTacticalTerrainOverridesForRenderer,
  getTerrainStrategicKindsFromCache,
} from './terrainClassificationCache';
import {
  buildStoredStrategicKindByH3,
  buildTacticalOverrideRows,
  type TacticalClassifiedCell,
} from './terrainTacticalOverrideRows';

/**
 * Builds a land-mass record for one synthetic parent.
 *
 * Purpose: The stored-kind helper needs a record keyed by the same id the classified map uses.
 * When to use: Synthetic cases in this file only.
 * Expected outcome: A record whose occupancy and water fraction drive `storedStrategicTerrainKind`.
 * Exceptions: None.
 */
function landRecord(
  h3Index: string,
  waterPct: number,
  continentIds: readonly number[]
): StrategicLandMassRecord {
  return { h3Index, waterPct, continentIds, islandIds: [] };
}

/**
 * One classified child of a synthetic parent.
 *
 * Purpose: Keeps the case tables short.
 * When to use: Arguments to `buildTacticalOverrideRows` in this file.
 * Expected outcome: A cell whose parent id is `parentH3`.
 * Exceptions: None.
 */
function cell(
  h3Index: string,
  parentH3: string,
  childKind: PipelineTerrainKind,
  isUrban = false
): TacticalClassifiedCell {
  return { h3Index, parentH3, childKind, isUrban };
}

/**
 * A land-traversable water parent stores as coastal, so its open-water children need their own rows.
 *
 * Purpose: That is the case that let infantry stand on open sea.
 * When to use: Direct run of this file.
 * Expected outcome: Water and desert children have rows. A coastal child, which matches the stored parent, does not.
 * Exceptions: None.
 */
function testWaterParentStoredAsCoastalKeepsWaterChildren(): void {
  const parent = '8139bffffffffff';
  const classified = new Map<string, PipelineTerrainKind>([[parent, 'water']]);
  const landMass = new Map<string, StrategicLandMassRecord>([[parent, landRecord(parent, 49.5, [1])]]);
  const stored = buildStoredStrategicKindByH3(classified, landMass);
  assert.strictEqual(stored.get(parent), 'coastal');
  const rows = buildTacticalOverrideRows(
    [
      cell('8439ac1ffffffff', parent, 'water'),
      cell('8439851ffffffff', parent, 'coastal'),
      cell('8439a01ffffffff', parent, 'desert'),
    ],
    stored
  );
  const byId = new Map(rows.map((row) => [row.h3Index, row]));
  assert.strictEqual(byId.get('8439ac1ffffffff')?.terrainKind, 'water');
  assert.strictEqual(byId.has('8439851ffffffff'), false);
  assert.strictEqual(byId.get('8439a01ffffffff')?.terrainKind, 'desert');
}

/**
 * Open ocean stays water, and only an urban water cell gets a row.
 *
 * Purpose: A parent that seeding leaves as water must not gain a row for every water child.
 * When to use: Direct run of this file.
 * Expected outcome: The plain water child is omitted. The urban water child is present with `isUrban` true.
 * Exceptions: None.
 */
function testOpenOceanOmitsMatchingWaterChildren(): void {
  const parent = '81357ffffffffff';
  const classified = new Map<string, PipelineTerrainKind>([[parent, 'water']]);
  const landMass = new Map<string, StrategicLandMassRecord>([[parent, landRecord(parent, 100, [])]]);
  const stored = buildStoredStrategicKindByH3(classified, landMass);
  assert.strictEqual(stored.get(parent), 'water');
  const rows = buildTacticalOverrideRows(
    [cell('8400001ffffffff', parent, 'water'), cell('8400003ffffffff', parent, 'water', true)],
    stored
  );
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(rows[0], {
    h3Index: '8400003ffffffff',
    terrainKind: 'water',
    isUrban: true,
  });
}

/**
 * A plains parent still omits plains children and keeps water children.
 *
 * Purpose: Parents that are not relabeled must keep today's rows.
 * When to use: Direct run of this file.
 * Expected outcome: No row for plains. A water row for the water child. The stored kind stays plains.
 * Exceptions: None.
 */
function testPlainsParentIsUnchanged(): void {
  const parent = '812abffffffffff';
  const classified = new Map<string, PipelineTerrainKind>([[parent, 'plains']]);
  const landMass = new Map<string, StrategicLandMassRecord>([[parent, landRecord(parent, 0, [1])]]);
  const stored = buildStoredStrategicKindByH3(classified, landMass);
  assert.strictEqual(stored.get(parent), 'plains');
  const rows = buildTacticalOverrideRows(
    [cell('8410001ffffffff', parent, 'plains'), cell('8410003ffffffff', parent, 'water')],
    stored
  );
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]?.h3Index, '8410003ffffffff');
  assert.strictEqual(rows[0]?.terrainKind, 'water');
}

/**
 * A child whose parent was never classified is a metadata error.
 *
 * Purpose: The snapshot build must fail the same way it did when the parent lookup missed.
 * When to use: Direct run of this file.
 * Expected outcome: The thrown message names the missing parent.
 * Exceptions: The assertion fails if no error is thrown.
 */
function testMissingParentThrows(): void {
  assert.throws(
    () => buildTacticalOverrideRows([cell('8400001ffffffff', '81missingffffffff', 'water')], new Map()),
    (err: unknown) => err instanceof Error && err.message.includes('missing from res1 map')
  );
}

/**
 * Every loaded tactical cell resolves to its classified kind through a row or its stored parent.
 *
 * Purpose: Confirms the cache comparison matches seeding, including the Morocco hex that showed infantry on open water.
 * When to use: Direct run of this file, after the classification cache can load.
 * Expected outcome: The resolved kind equals the classified kind for every cell. `8139bffffffffff` is stored coastal, and `8439ac1ffffffff` has a water row. Skips when the metadata pack cannot load.
 * Exceptions: None. A loaded pack that lacks the anchor ids fails the assertion.
 */
function testLoadedCellsResolveToClassifiedKind(): void {
  clearTerrainClassificationCacheForTests();
  try {
    try {
      ensureTerrainClassificationCacheLoaded();
    } catch {
      console.log('terrainTacticalOverrideRows.test: skipped loaded-cell check (terrain cache failed to load)');
      return;
    }
    const stored = buildStoredStrategicKindByH3(getTerrainStrategicKindsFromCache(), getStrategicLandMassByH3());
    const rowByH3 = new Map(getTacticalTerrainOverridesForRenderer().map((row) => [row.h3Index, row]));
    for (const feature of getTacticalFeatureRowsForSeeding()) {
      const rowKind = rowByH3.get(feature.h3Index)?.terrainKind;
      const storedParent = stored.get(feature.parentH3Index);
      const resolved = rowKind ?? storedParent;
      assert.strictEqual(
        resolved,
        feature.terrainKind,
        `${feature.h3Index} classified ${feature.terrainKind}, stored parent ${storedParent ?? 'missing'}, row ${rowKind ?? 'missing'}`
      );
    }
    assert.strictEqual(stored.get('8139bffffffffff'), 'coastal', '8139bffffffffff should be stored as coastal');
    assert.strictEqual(
      rowByH3.get('8439ac1ffffffff')?.terrainKind,
      'water',
      '8439ac1ffffffff should keep an explicit water row'
    );
  } finally {
    clearTerrainClassificationCacheForTests();
  }
}

/**
 * Runs the override-row contracts.
 *
 * Purpose: Entry point for `node dist/main/terrainTacticalOverrideRows.test.js`.
 * When to use: After `npm run build:main`.
 * Expected outcome: Prints the ok marker when every assertion passes.
 * Exceptions: Propagates assertion failures.
 */
function main(): void {
  testWaterParentStoredAsCoastalKeepsWaterChildren();
  testOpenOceanOmitsMatchingWaterChildren();
  testPlainsParentIsUnchanged();
  testMissingParentThrows();
  testLoadedCellsResolveToClassifiedKind();
  console.log('terrainTacticalOverrideRows.test: ok');
}

main();
