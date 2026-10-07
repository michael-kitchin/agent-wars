import * as assert from 'assert';
import { dbRun, getGameState } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import {
  configureHumanMarchPreviewCacheLimitsForTests,
  getHumanMarchPreviewDiagnostics,
  resolveHumanMarchOrderPreviews,
  resetHumanMarchPreviewDiagnosticsForTests,
} from './humanMarchPreview';

/**
 * Defines the `withTempDb` function shape (function withTempDb(runCase: () => void): void).

 * Purpose: Supports maintainability by documenting why `withTempDb` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function withTempDb(runCase: () => void): void {
  withTempGameDb('aw-human-march-preview-', runCase);
}

/**
 * Defines the `testSessionInvalidatesOnSelectionChange` function shape (function testSessionInvalidatesOnSelectionChange(): void).

 * Purpose: Supports maintainability by documenting why `testSessionInvalidatesOnSelectionChange` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testSessionInvalidatesOnSelectionChange(): void {
  withTempDb(() => {
    resetHumanMarchPreviewDiagnosticsForTests();
    const state = getGameState();
    const humanUnits = state.units.filter((u) => u.player === 'human');
    assert.ok(humanUnits.length >= 2, 'expected at least two human units');
    const hovered = state.hexes[0]?.h3Index ?? '';
    assert.ok(hovered, 'expected a hovered destination hex');

    resolveHumanMarchOrderPreviews([humanUnits[0]!.id], hovered);
    resolveHumanMarchOrderPreviews([humanUnits[0]!.id], hovered);
    resolveHumanMarchOrderPreviews([humanUnits[1]!.id], hovered);

    const diagnostics = getHumanMarchPreviewDiagnostics();
    assert.ok(diagnostics.sessionCreateCount >= 2, 'expected a new session after selection change');
    assert.ok(diagnostics.sessionReuseCount >= 1, 'expected session reuse for repeated selection');
    assert.ok(diagnostics.sessionInvalidateCount >= 1, 'expected invalidation when selection changed');
  });
}

/**
 * Defines the `testCacheEvictionRespectsConfiguredBounds` function shape (function testCacheEvictionRespectsConfiguredBounds(): void).

 * Purpose: Supports maintainability by documenting why `testCacheEvictionRespectsConfiguredBounds` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testCacheEvictionRespectsConfiguredBounds(): void {
  withTempDb(() => {
    resetHumanMarchPreviewDiagnosticsForTests();
    configureHumanMarchPreviewCacheLimitsForTests({ route: 3, result: 4 });
    const state = getGameState();
    const unit = state.units.find((u) => u.player === 'human');
    assert.ok(unit, 'expected a seeded human unit');
    const hoveredHexes = state.hexes.slice(0, 20).map((hex) => hex.h3Index);
    assert.ok(hoveredHexes.length >= 8, 'expected enough destination hexes for eviction test');

    for (const hoveredH3Index of hoveredHexes) {
      resolveHumanMarchOrderPreviews([unit!.id], hoveredH3Index);
    }

    const diagnostics = getHumanMarchPreviewDiagnostics();
    assert.ok(diagnostics.routeCacheSize <= 3, `route cache exceeded bound: ${diagnostics.routeCacheSize}`);
    assert.ok(diagnostics.resultCacheSize <= 4, `result cache exceeded bound: ${diagnostics.resultCacheSize}`);
    configureHumanMarchPreviewCacheLimitsForTests();
  });
}

/**
 * Defines the `testSessionInvalidatesOnVisibleOccupancyChange` function shape (function testSessionInvalidatesOnVisibleOccupancyChange(): void).

 * Purpose: Supports maintainability by documenting why `testSessionInvalidatesOnVisibleOccupancyChange` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testSessionInvalidatesOnVisibleOccupancyChange(): void {
  withTempDb(() => {
    resetHumanMarchPreviewDiagnosticsForTests();
    const state = getGameState();
    const humanUnit = state.units.find((u) => u.player === 'human');
    const movingUnit = state.units.find((u) => u.player === 'opponent');
    assert.ok(humanUnit, 'expected a seeded human unit');
    assert.ok(movingUnit, 'expected a seeded opponent unit');
    const originalHex = movingUnit!.h3Index;
    const destinationHex = state.hexes.find((hex) => hex.h3Index !== originalHex)?.h3Index;
    assert.ok(destinationHex, 'expected an alternate hex for occupancy change');
    const hovered = state.hexes[0]?.h3Index ?? '';
    assert.ok(hovered, 'expected a hovered destination hex');

    resolveHumanMarchOrderPreviews([humanUnit!.id], hovered);
    resolveHumanMarchOrderPreviews([humanUnit!.id], hovered);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [destinationHex!, movingUnit!.id]);
    resolveHumanMarchOrderPreviews([humanUnit!.id], hovered);

    const diagnostics = getHumanMarchPreviewDiagnostics();
    assert.ok(diagnostics.sessionReuseCount >= 1, 'expected session reuse before occupancy changed');
    assert.ok(diagnostics.sessionInvalidateCount >= 1, 'expected invalidation after occupancy changed');
  });
}

/**
 * Ensures strategic march previews never attach slower-terrain tooltip fields.
 *
 * Purpose: Strategic movement has no §12.4 slowdowns; `#order-slower-tooltip` must stay dark on the strategic map.
 * When to use: After edits to `emptyStrategicTerrainFields` or grouped envelope merge.
 * Expected outcome: Envelope and per-row `slowerTerrainDisplayTitle` / `orderPreviewTerrainImpact` are null.
 * Exceptions: None.
 */
function testStrategicPreviewOmitsSlowerTerrainImpact(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find((u) => u.player === 'human' && (u.unitType === 'armor' || u.unitType === 'infantry'));
    assert.ok(landUnit, 'expected a seeded human land unit');
    const hovered = state.hexes.find((hex) => hex.h3Index !== landUnit!.h3Index && hex.terrain !== 'water')?.h3Index;
    assert.ok(hovered, 'expected a non-water destination hex');
    const result = resolveHumanMarchOrderPreviews([landUnit!.id], hovered);
    assert.equal(result.slowerTerrainDisplayTitle ?? null, null);
    assert.equal(result.orderPreviewTerrainImpact ?? null, null);
    for (const row of result.previews) {
      assert.equal(row.preview.slowerTerrainDisplayTitle ?? null, null);
      assert.equal(row.preview.orderPreviewTerrainImpact ?? null, null);
    }
  });
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testSessionInvalidatesOnSelectionChange();
  testCacheEvictionRespectsConfiguredBounds();
  testSessionInvalidatesOnVisibleOccupancyChange();
  testStrategicPreviewOmitsSlowerTerrainImpact();
  console.log('humanMarchPreview tests passed');
}

run();
