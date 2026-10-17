/**
 * Production, glyph, and air source contracts moved out of the over-limit renderer assertion file.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { assertMatches, getFunctionSource } from './testSupport/rendererSourceAssertions';

/**
 * Defines the `testProductionLabelContractsForExploredVsUnexploredHexes` function shape (function testProductionLabelContractsForExploredVsUnexploredHexes(): void).

 * Purpose: Supports maintainability by documenting why `testProductionLabelContractsForExploredVsUnexploredHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testProductionLabelContractsForExploredVsUnexploredHexes(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const productionOverlayHelpersPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'productionOverlayHelpers.ts');
  const terrainTooltipStatePath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'terrainTooltipStrategicState.ts');
  const policyPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'canvasPreviewPolicy.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const productionOverlayHelpersSource = fs.readFileSync(productionOverlayHelpersPath, 'utf8');
  const policySource = fs.readFileSync(policyPath, 'utf8');
  const terrainTooltipSource = fs.readFileSync(terrainTooltipStatePath, 'utf8');
  const drawProductionFn = getFunctionSource(source, 'drawStrategicProductionOverlays');
  const syncBuildEntryFn = getFunctionSource(source, 'syncBuildEntryButton');
  const getUrbanProductionCapacityForHexFn = getFunctionSource(productionOverlayHelpersSource, 'getUrbanProductionCapacityForHex');
  const canonicalUrbanCapacityFn = getFunctionSource(terrainTooltipSource, 'getUrbanProductionCapacityForHex');
  const isStrategicHexHumanUrbanProductionFn = getFunctionSource(productionOverlayHelpersSource, 'isStrategicHexHumanUrbanProduction');
  const drawHoverPreviewFn = getFunctionSource(source, 'drawHoverRoutePreview');
  const shouldDrawHoveredPathPreviewFn = getFunctionSource(policySource, 'shouldDrawHoveredPathPreview');

  assert.ok(
    drawProductionFn.includes('if (shouldRenderTacticalHexes()) return'),
    'drawStrategicProductionOverlays should draw no production labels when res4 hexes are shown'
  );
  assert.ok(
    drawProductionFn.includes('const overlayContext = buildProductionOverlayContext(S.gameState);'),
    'drawStrategicProductionOverlays should build a shared overlay context once per draw'
  );
  assertMatches(
    drawProductionFn,
    /if\s*\(!explored\s*&&\s*!overlayContext\.productionDetailShown\)\s*continue;/,
    'drawStrategicProductionOverlays should only show unexplored production labels while production detail is shown'
  );
  assert.ok(
    drawProductionFn.includes('!overlayContext.productionDetailShown') &&
      drawProductionFn.includes('isStrategicHexHumanUrbanProduction(S.gameState, hx)'),
    'drawStrategicProductionOverlays should include shared human-urban production eligibility checks'
  );
  assert.ok(
    drawProductionFn.includes(
      'const canShowLabelWithoutInspection = isStrategicHexHumanUrbanProduction(S.gameState, hx) || controlledByHuman;'
    ),
    'drawStrategicProductionOverlays should keep $0 labels visible on explored human-controlled non-urban hexes'
  );
  assert.ok(
    drawProductionFn.includes('const hasClickableBuildEntryForHex =') &&
      drawProductionFn.includes('isStrategicHexHumanUrbanProduction(S.gameState, hx)'),
    'drawStrategicProductionOverlays should keep build-entry clickability restricted to human urban-production hexes'
  );
  assertMatches(
    drawProductionFn,
    /:\s*`\$\$\{Math\.max\(0,\s*capacityPerTurn\)\.toLocaleString\(\)\}`;/,
    'drawStrategicProductionOverlays should show unexplored labels in $N format'
  );
  assert.ok(
    drawProductionFn.includes('const hasClickableBuildEntryForHex =') &&
      drawProductionFn.includes('explored &&') &&
      drawProductionFn.includes('isStrategicHexHumanUrbanProduction(S.gameState, hx)') &&
      drawProductionFn.includes('if (hasClickableBuildEntryForHex) {'),
    'drawStrategicProductionOverlays should hide non-clickable label when clickable build entry exists'
  );
  assert.ok(
    drawProductionFn.includes('const capacityPerTurn = getUrbanProductionCapacityForHex(hx.h3Index);'),
    'drawStrategicProductionOverlays should derive production capacity from shared canonical urban-res4 count helper'
  );
  assert.ok(
    drawProductionFn.includes('overlayContext.revealAllControllerQueues'),
    'drawStrategicProductionOverlays should branch queue visibility by overlay context'
  );

  assert.ok(
    syncBuildEntryFn.includes('if (tacticalOn) {') && syncBuildEntryFn.includes('hideBuildPopup()'),
    'syncBuildEntryButton should suppress build UI and close build popup on res4 zoom'
  );
  assert.ok(
    syncBuildEntryFn.includes('if (areResolutionDiceChipsShowing(S.resolutionMoveAnimation)) {'),
    'syncBuildEntryButton should hide build markers while resolution dice chips are showing'
  );
  assert.ok(
    syncBuildEntryFn.includes('if (!explored) continue;'),
    'syncBuildEntryButton should only render clickable buttons for explored hexes'
  );
  assert.ok(
    syncBuildEntryFn.includes('isStrategicHexHumanUrbanProduction(S.gameState, hx)'),
    'syncBuildEntryButton should use shared human-urban production eligibility'
  );
  assert.ok(
    !syncBuildEntryFn.includes("if (hx.terrain === 'water') continue;") &&
      !drawProductionFn.includes("if (hx.terrain === 'water') continue;"),
    'renderer production labels and build-entry buttons should not hard-exclude controlled water hexes'
  );
  assert.ok(
    isStrategicHexHumanUrbanProductionFn.includes('getUrbanProductionCapacityForHex(hx.h3Index) > 0'),
    'isStrategicHexHumanUrbanProduction should use canonical urban-res4 count for build eligibility'
  );
  assert.ok(
    getUrbanProductionCapacityForHexFn.includes('getUrbanProductionCapacityForHexFromTooltipState'),
    'productionOverlayHelpers should delegate urban capacity to the shared terrain tooltip / res1 cache module'
  );
  assert.ok(
    canonicalUrbanCapacityFn.includes('countUrbanTacticalHexesInStrategicHex(h3Index)'),
    'shared getUrbanProductionCapacityForHex should compute from live urban res4-child count'
  );
  assert.ok(
    drawHoverPreviewFn.includes('if (!shouldDrawHoveredPathPreview()) return;') &&
      shouldDrawHoveredPathPreviewFn.includes('return !S.shiftKeyActive && S.selectedUnitIds.length > 0;'),
    'drawHoverRoutePreview should use shared policy to suppress path-plan preview while Shift is held and when nothing is selected'
  );
}

/**
 * Defines the `testInfrastructureGlyphSetsComeFromTacticalOverrides` function shape (function testInfrastructureGlyphSetsComeFromTacticalOverrides(): void).

 * Purpose: Supports maintainability by documenting why `testInfrastructureGlyphSetsComeFromTacticalOverrides` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testInfrastructureGlyphSetsComeFromTacticalOverrides(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const entrySource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'entryCallbacks.ts'),
    'utf8'
  );
  const drawInfraFn = getFunctionSource(source, 'drawTerrainInfrastructureOverlays');
  const hasVisibleStrategicInfraFn = getFunctionSource(source, 'hasVisibleStrategicInfrastructureGlyphs');

  assert.ok(
    entrySource.includes('const nextState = deriveInfrastructureOverlayState(rows);') &&
      entrySource.includes('terrainInfraTacticalAirport = nextState.terrainInfraTacticalAirport;') &&
      entrySource.includes('terrainInfraTacticalSeaport = nextState.terrainInfraTacticalSeaport;'),
    'applyTacticalTerrainOverrides should use centralized derivation for res4 airport/seaport glyph sets'
  );
  assert.ok(
    entrySource.includes('terrainInfraStrategicAirport = nextState.terrainInfraStrategicAirport;') &&
      entrySource.includes('terrainInfraStrategicSeaport = nextState.terrainInfraStrategicSeaport;'),
    'applyTacticalTerrainOverrides should use centralized derivation for res1 airport/seaport glyph sets'
  );
  assert.ok(
    !source.includes('.getTerrainInfrastructureHints()') &&
      !entrySource.includes('.getTerrainInfrastructureHints()'),
    'renderer init should not overwrite live glyph sets with major-only terrain hint snapshots'
  );
  assert.ok(
    !drawInfraFn.includes('if (unitHexes.has(hx.h3Index)) continue;') &&
      !drawInfraFn.includes('if (unitHexes.has(parent.h3Index)) continue;'),
    'drawTerrainInfrastructureOverlays should not suppress airport/seaport glyphs on hexes that contain units'
  );
  assert.ok(
    !hasVisibleStrategicInfraFn.includes('!unitHexes.has(h3Index)'),
    'hasVisibleStrategicInfrastructureGlyphs should remain true for explored infra hexes even when units are present'
  );
}

/**
 * Defines the `testAirFerryDoubleClickContracts` function shape (function testAirFerryDoubleClickContracts(): void).

 * Purpose: Supports maintainability by documenting why `testAirFerryDoubleClickContracts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAirFerryDoubleClickContracts(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const orderDrawingPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'orderDrawing.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const gameSceneSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'gameScene.ts'),
    'utf8'
  );
  const orderDrawingSource = fs.readFileSync(orderDrawingPath, 'utf8');
  const initFn = getFunctionSource(source, 'init');
  const pendingOrdersFn = getFunctionSource(source, 'updatePendingOrdersSidebar');
  const orderLabelFormattingPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'orderLabelFormatting.ts');
  const orderLabelFormattingSource = fs.readFileSync(orderLabelFormattingPath, 'utf8');
  const formatPendingFerryOrderSidebarLabelFn = getFunctionSource(
    orderLabelFormattingSource,
    'formatPendingFerryOrderSidebarLabel'
  );

  assert.ok(
    initFn.includes('const hasAirSelection = selectedAtMouseDown.some((unit) => unit.unitType === \'air\');') &&
      initFn.includes('const hasNonAirSelection = selectedAtMouseDown.some((unit) => unit.unitType !== \'air\');') &&
      initFn.includes('Cannot issue grouped movement for mixed air and non-air units.'),
    'double-click movement should reject mixed air and non-air selections with a toast'
  );
  assert.ok(
    initFn.includes('window.gameApi?.validateGroupFerryTarget') &&
      initFn.includes('replacePendingFerryOrdersForSelected(selectedIds, destinationH3);'),
    'double-click movement should validate grouped ferry destinations through main-process API and queue ferry orders for air selections'
  );
  assert.ok(
    source.includes('ferryOrders: S.pendingFerryOrders,'),
    'ready submit payload should include pending ferry orders'
  );
  assert.ok(
    pendingOrdersFn.includes('formatPendingFerryOrderSidebarLabel(S.gameState, ferry)'),
    'pending ferry sidebar rows should display via the ferry label formatter for Nh parity'
  );
  assert.ok(
    formatPendingFerryOrderSidebarLabelFn.includes("order.destinationH3Index, battle, 'Ferry')") &&
      !formatPendingFerryOrderSidebarLabelFn.includes('${order.destinationH3Index}'),
    'ferry sidebar labels should name the destination code through the shared order line, never the raw H3 index'
  );
  const overlayStagesPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'orderOverlayStages.ts');
  const overlayStagesSource = fs.readFileSync(overlayStagesPath, 'utf8');
  assert.ok(
    gameSceneSource.includes("from './orderOverlayStages'") &&
      gameSceneSource.includes('drawPendingMarchesHoverAndSupportOrderStack({') &&
      overlayStagesSource.includes('drawPendingSupportOrderOverlays(') &&
      overlayStagesSource.includes(
        'drawPendingFerryLines(ctx, S.pendingFerryOrders, unitsForOrderLines, hexList);'
      ) &&
      orderDrawingSource.includes('function drawPendingFerryLines(') &&
      orderDrawingSource.includes('drawHumanMarchStyleRouteSegments'),
    'pending ferry planning should render march-style map lines via shared overlay stage'
  );
}

/**
 * Defines the `testAirStrikeAndAirGlyphContracts` function shape (function testAirStrikeAndAirGlyphContracts(): void).

 * Purpose: Supports maintainability by documenting why `testAirStrikeAndAirGlyphContracts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAirStrikeAndAirGlyphContracts(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const readyAnnouncementsPath = path.resolve(
    process.cwd(),
    'src',
    'renderer',
    'gameplay',
    'readyResolutionAnnouncements.ts'
  );
  const tacticalOrdersPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'tacticalOrders.ts');
  const sidebarSupportPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'sidebarSupport.ts');
  const rendererConstantsPath = path.resolve(process.cwd(), 'src', 'renderer', 'core', 'constants.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const readyAnnouncementsSource = fs.readFileSync(readyAnnouncementsPath, 'utf8');
  const tacticalOrdersSource = fs.readFileSync(tacticalOrdersPath, 'utf8');
  const sidebarSupportSource = fs.readFileSync(sidebarSupportPath, 'utf8');
  const rendererConstantsSource = fs.readFileSync(rendererConstantsPath, 'utf8');
  const unitTypeLabelSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'core', 'unitTypeLabel.ts'),
    'utf8'
  );
  const gameSceneSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'gameScene.ts'),
    'utf8'
  );
  const resolutionPlaybackSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'resolutionPlayback.ts'),
    'utf8'
  );
  const wiredEntrySource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'wiredEntryCallbacks.ts'),
    'utf8'
  );
  const inferUnitTypeLabelFromIdFn = getFunctionSource(unitTypeLabelSource, 'inferUnitTypeLabelFromId');
  assert.ok(inferUnitTypeLabelFromIdFn.length > 0, 'inferUnitTypeLabelFromId must remain declared in unitTypeLabel.ts');

  assert.ok(
    rendererConstantsSource.includes("air: 'S'") && wiredEntrySource.includes("from './core/constants'"),
    'air unit type label should render as S'
  );
  assert.ok(
    readyAnnouncementsSource.includes("from './turnUpdateSummary'") &&
      readyAnnouncementsSource.includes('buildConsolidatedTurnUpdateToastMessage({') &&
      readyAnnouncementsSource.includes('buildPopupTurnLossSummary({'),
    'ready update toast should use consolidated turn update summary helpers'
  );
  assert.ok(
    tacticalOrdersSource.includes("btnEl.setAttribute('aria-pressed', String(S.airStrikeModeActive));") &&
      tacticalOrdersSource.includes("btnEl.setAttribute('aria-pressed', String(S.rangedModeActive));"),
    'the reticle should stay shown and read as pressed while strike or ranged planning mode is active'
  );
  assert.ok(
    tacticalOrdersSource.includes("from './orderLabelFormatting'") &&
      tacticalOrdersSource.includes(
        'formatPendingRangedAttackSidebarLabel(S.gameState, r, battle)'
      ) &&
      tacticalOrdersSource.includes(
        'formatPendingAirStrikeSidebarLabel(S.gameState, strike, battle)'
      ) &&
      sidebarSupportSource.includes("from './orderLabelFormatting'") &&
      sidebarSupportSource.includes('formatPendingFerryOrderSidebarLabel(S.gameState, ferry)') &&
      sidebarSupportSource.includes(
        'formatPendingFerryOrderSidebarLabel(S.gameState, ferry, battle)'
      ) &&
      !getFunctionSource(sidebarSupportSource, 'updatePendingOrdersSidebar').includes('pendingEmbarkOrders'),
    'planned order list labels should use shared order label formatting helpers'
  );
  assert.ok(
    source.includes('function formatTargetingValidationReason(') &&
      source.includes("formatTargetingValidationReason(validation.reason, 'Selected air units cannot strike that target.')") &&
      source.includes("formatTargetingValidationReason(validation.reason, 'Selected units cannot fire at that target.')"),
    'grouped strike and ranged targeting toasts should format unit IDs as display names'
  );
  assert.ok(
    source.includes('airStrikeOutboundMoves: airStrikeOutboundMoves.length > 0 ? airStrikeOutboundMoves : undefined') &&
      source.includes('airStrikeReturnMoves: airStrikeReturnMoves.length > 0 ? airStrikeReturnMoves : undefined') &&
      gameSceneSource.includes('inAirStrikeOutbound') &&
      gameSceneSource.includes('inAirStrikeReturn'),
    'resolution playback should include outbound/return air-strike movement phases'
  );
  assert.ok(
    source.includes('const knownHumanAirStrikeTargetHexes = new Set(') &&
      source.includes(".filter((move) => move.player === 'human')") &&
      source.includes('.filter((h3) => !knownHumanAirStrikeTargetHexes.has(h3))'),
    'unknown battle announcements should not include known human air-strike target hexes'
  );
  assert.ok(
    wiredEntrySource.includes('phase.inAirStrikeLightning || phase.inAirStrikeCasualty') &&
      wiredEntrySource.includes('h3Index: move.toH3Index') &&
      wiredEntrySource.includes('movingIds = new Set((anim.airStrikeReturnMoves ?? []).map((move) => move.unitId));'),
    'air strike playback should pin strikers at target during combat/casualty and hide survivors at base until return animation completes'
  );
  assert.ok(
    resolutionPlaybackSource.includes('function buildResolutionPlaybackState(') &&
      gameSceneSource.includes('const { phase } = buildResolutionPlaybackState(anim, elapsed);'),
    'resolution playback phase derivation should be centralized for all unit/scenario animation paths'
  );
  assert.ok(
    source.includes('if (!validation.success) {') &&
      source.includes('airStrikeModeActive = false;') &&
      source.includes('rangedModeActive = false;'),
    'invalid ranged/strike target clicks should cancel planning mode'
  );
  assert.ok(
    !source.includes('function formatAirStrikeTargetLabel(') && !source.includes('function formatRangedTargetUnitLabel('),
    'renderer should not keep dead local strike target label helpers after formatter extraction'
  );
}

/**
 * Defines the `testKillUpdateTextOmitsPlayerSuffixes` function shape (function testKillUpdateTextOmitsPlayerSuffixes(): void).

 * Purpose: Supports maintainability by documenting why `testKillUpdateTextOmitsPlayerSuffixes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testKillUpdateTextOmitsPlayerSuffixes(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const buildKillToastFormatterBundleFn = getFunctionSource(source, 'buildKillToastFormatterBundle');

  assert.ok(
    !buildKillToastFormatterBundleFn.includes("' (AI)'") && !buildKillToastFormatterBundleFn.includes("' (human)'"),
    'kill/update formatter should not append AI/human suffixes'
  );
}

/**
 * Defines the `testTacticalRubbleTooltipAndTerrainVariantContracts` function shape (function testTacticalRubbleTooltipAndTerrainVariantContracts(): void).

 * Purpose: Supports maintainability by documenting why `testTacticalRubbleTooltipAndTerrainVariantContracts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testTacticalRubbleTooltipAndTerrainVariantContracts(): void {
  const gameScenePath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'gameScene.ts');
  const rendererSource = fs.readFileSync(gameScenePath, 'utf8');
  const terrainTooltipStatePath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'terrainTooltipStrategicState.ts');
  const terrainTooltipStateSource = fs.readFileSync(terrainTooltipStatePath, 'utf8');
  const terrainTooltipHtmlPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'terrainTooltipHtml.ts');
  const terrainTooltipHtmlSource = fs.readFileSync(terrainTooltipHtmlPath, 'utf8');
  const terrainStylesPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'terrainVisualStyles.ts');
  const terrainStylesSource = fs.readFileSync(terrainStylesPath, 'utf8');
  const drawTerrainHexesFn = getFunctionSource(rendererSource, 'drawTerrainHexes');
  const featureLabelsForTacticalChildFn = getFunctionSource(terrainTooltipStateSource, 'featureLabelsForTacticalChild');
  const terrainStateForPointerFn = getFunctionSource(terrainTooltipStateSource, 'terrainStateForPointer');
  const formatTerrainTooltipHtmlFn = getFunctionSource(terrainTooltipHtmlSource, 'formatTerrainTooltipHtml');

  assert.ok(
    drawTerrainHexesFn.includes('if (tacticalActive) return;'),
    'res1 terrain fills/styles should be suppressed while res4 child hex rendering is active'
  );
  assert.ok(
    !featureLabelsForTacticalChildFn.includes("labels.push('Rubble')") &&
      !getFunctionSource(terrainTooltipStateSource, 'featureLabelsForStrategicHex').includes('Rubble') &&
      !getFunctionSource(terrainTooltipStateSource, 'getStrategicFeaturesSummary').includes('Rubble'),
    'feature lines omit Rubble'
  );
  assert.ok(
    !getFunctionSource(terrainTooltipStateSource, 'getStrategicTerrainSummary').includes('Urban') &&
      !getFunctionSource(terrainTooltipStateSource, 'getStrategicTerrainSummary').includes('Rubble'),
    'a world hex terrain summary stays the kind mix'
  );
  assert.ok(
    featureLabelsForTacticalChildFn.includes('tacticalRoadRailSideMasksForChild') &&
      featureLabelsForTacticalChildFn.includes("labels.push('Road')") &&
      featureLabelsForTacticalChildFn.includes("labels.push('Rail')") &&
      !featureLabelsForTacticalChildFn.includes('tacticalBattleSnapshot'),
    'res4 feature labels should list Road/Rail from global tacticalRoadRailSidesByH3 for explored hexes in strategic and tactical modes'
  );
  assert.ok(
    terrainTooltipStateSource.includes('function tacticalRoadRailSideMasksForChild') &&
      terrainTooltipStateSource.includes('S.tacticalRoadRailSidesByH3.get(detailH3)'),
    'res4 tooltip Features and Effects should share tacticalRoadRailSideMasksForChild lookup'
  );
  assert.ok(
    terrainStateForPointerFn.includes('isRubble: detail?.isRubble ?? false'),
    'res4 tooltip state should preserve rubble override flags from terrain detail state'
  );
  assert.ok(
    formatTerrainTooltipHtmlFn.includes('formatTerrainVariantSuffix(state)'),
    'terrain tooltip rendering should use shared variant suffix formatting for urban/rubble'
  );
  assertMatches(
    terrainStylesSource,
    /const isRubble = options\?\.isRubble === true;/,
    'terrain fill logic should derive rubble variant directly from the rubble override flag'
  );
  assertMatches(
    terrainStylesSource,
    /const isUrban = !isRubble && options\?\.isUrban === true;/,
    'terrain fill logic should derive urban variant directly from the urban override flag'
  );
}

/**
 * Runs this file's source contracts.
 *
 * Purpose: The test runner executes this file as a script, the same way the previous combined file ran.
 * When to use: The call at the bottom of this file.
 * Expected outcome: Each contract function runs, and a thrown assertion fails the process.
 * Exceptions: Assertion errors propagate.
 */
function run(): void {
  testProductionLabelContractsForExploredVsUnexploredHexes();
  testInfrastructureGlyphSetsComeFromTacticalOverrides();
  testAirFerryDoubleClickContracts();
  testAirStrikeAndAirGlyphContracts();
  testKillUpdateTextOmitsPlayerSuffixes();
  testTacticalRubbleTooltipAndTerrainVariantContracts();
  console.log('rendererProductionAirConsolidation.test.ts passed');
}

run();
