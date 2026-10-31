/**
 * Source-text contracts for ranged/air-strike overlay stroke width and perimeter dash animation.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Absolute path of the renderer source tree.
 *
 * Purpose: Overlay stroke tests read renderer files relative to this root.
 * When to use: `readRenderer` joins a path under it.
 * Expected outcome: A stable absolute directory for source-contract reads.
 * Exceptions: None.
 */
const rendererRoot = path.resolve(process.cwd(), 'src', 'renderer');

/**
 * Reads a renderer TypeScript source file relative to `src/renderer`.
 *
 * Purpose: Shared fixture load for overlay stroke contract assertions.
 * When to use: Each test that inspects canvas stroke wiring.
 * Expected outcome: UTF-8 file contents.
 * Exceptions: Throws if the path is missing.
 */
function readRenderer(relativePath: string): string {
  return fs.readFileSync(path.join(rendererRoot, relativePath), 'utf8');
}

/**
 * Verifies tactical support overlay strokes stay at movement-line width while strategic strokes restore home-border scale.
 *
 * Purpose: Prevents tactical ranged/air-strike overlays from thickening, and keeps strategic overlays on the previous 2×/1.5× home-border widths.
 * When to use: Regression guard after restyling support overlays.
 * Expected outcome: Width helper returns `ORDER_LINE_WIDTH` in tactical battles and home-border multipliers on the strategic map; overlay and shot drawers share `rangePerimeterStaticLineStyle`, and hover draws through the shared `strokeSupportOrderLines`.
 * Exceptions: None.
 */
function testSupportOverlayStrokeWidthsByMapLayer(): void {
  const orderDrawing = readRenderer(path.join('rendering', 'orderDrawing.ts'));
  const overlay = readRenderer(path.join('rendering', 'rangePerimeterOverlay.ts'));
  const hover = readRenderer(path.join('rendering', 'hoverPreview.ts'));
  const stroke = readRenderer(path.join('rendering', 'rangeOverlayStroke.ts'));
  const constants = readRenderer(path.join('core', 'constants.ts'));

  assert.ok(
    stroke.includes('if (S.tacticalBattleSnapshot) return ORDER_LINE_WIDTH') &&
      stroke.includes('kind === \'perimeter\' ? getRangePerimeterOutlineLineWidth(zoom) : getRangeSupportPlanLineWidth(zoom)'),
    'tactical overlay width should be ORDER_LINE_WIDTH; strategic should use perimeter vs connector home-border helpers'
  );
  assert.ok(
    constants.includes('RANGE_PERIMETER_WIDTH_MULTIPLIER = 2') &&
      constants.includes('RANGE_SUPPORT_LINE_WIDTH_MULTIPLIER = 1.5'),
    'strategic overlay multipliers should remain 2× perimeter and 1.5× connectors'
  );
  assert.ok(
    orderDrawing.includes('getCurrentRangeOverlayLineWidth(kind)') &&
      orderDrawing.includes('kind: RangeOverlayStrokeKind = \'connector\''),
    'rangePerimeterStaticLineStyle should resolve width from getCurrentRangeOverlayLineWidth'
  );
  assert.ok(
    overlay.includes("rangePerimeterStaticLineStyle(S.airStrikeModeActive ? 'airStrike' : 'ranged', 'perimeter')") &&
      hover.includes('strokeSupportOrderLines'),
    'perimeter overlay should request perimeter width; hover should draw through the shared support-line drawer'
  );
  assert.ok(
    orderDrawing.includes('drawRangedResolutionShotLines') &&
      orderDrawing.includes('strokeSupportOrderLines'),
    'resolution shot lines should share the support-order stroke path'
  );
}

/**
 * Verifies the animated perimeter uses butt caps and dashes that stay open at 2× home-border thickness.
 *
 * Purpose: Round caps plus 1×-width dashes filled in the strategic perimeter trough; this contract keeps flow visible without thinning the stroke.
 * When to use: Regression guard when changing perimeter dash/cap policy.
 * Expected outcome: Perimeter cap is `butt`; dash segment is `lineWidth * RANGE_PERIMETER_ANIMATED_DASH_VS_WIDTH` (2); connectors stay `round`.
 * Exceptions: None.
 */
function testPerimeterDashAndCapStayVisibleAtStrategicWidth(): void {
  const stroke = readRenderer(path.join('rendering', 'rangeOverlayStroke.ts'));
  const overlay = readRenderer(path.join('rendering', 'rangePerimeterOverlay.ts'));
  const orderDrawing = readRenderer(path.join('rendering', 'orderDrawing.ts'));
  const hover = readRenderer(path.join('rendering', 'hoverPreview.ts'));
  const constants = readRenderer(path.join('core', 'constants.ts'));

  assert.ok(
    constants.includes("RANGE_PERIMETER_LINE_CAP = 'butt'") &&
      constants.includes("RANGE_SUPPORT_CONNECTOR_LINE_CAP = 'round'") &&
      constants.includes('RANGE_PERIMETER_ANIMATED_DASH_VS_WIDTH = 2'),
    'perimeter should use butt caps and 2×-width dashes; connectors should stay round'
  );
  assert.ok(
    stroke.includes("kind === 'perimeter' ? RANGE_PERIMETER_LINE_CAP : RANGE_SUPPORT_CONNECTOR_LINE_CAP") &&
      stroke.includes('lineWidth * RANGE_PERIMETER_ANIMATED_DASH_VS_WIDTH'),
    'dash/cap helpers should apply perimeter-specific butt cap and 2× line-width segments'
  );
  assert.ok(
    overlay.includes('ctx.lineCap = style.lineCap') &&
      orderDrawing.includes('cap: style.lineCap') &&
      hover.includes('strokeSupportOrderLines'),
    'perimeter, planned, and hover strokes should apply lineCap from the shared style'
  );
}

/**
 * Verifies playback attacks use the planning crimson stroke, and an air unit's flight home stays a movement line.
 *
 * Purpose: Resolution used to draw amber and purple shots, and seat-colored air and missile flights. Those attacks now share the queued-order stroke.
 * When to use: Regression guard after restyling resolution attack lines.
 * Expected outcome: Outbound air and missile flights go through `drawResolutionOutboundAttackLines`. Return flights still use `drawResolutionMoveLines`. The old playback colors are gone.
 * Exceptions: None.
 */
function testResolutionAttackLinesMatchPlanningStroke(): void {
  const orderDrawing = readRenderer(path.join('rendering', 'orderDrawing.ts'));
  const gameScene = readRenderer(path.join('rendering', 'gameScene.ts'));
  const constants = readRenderer(path.join('core', 'constants.ts'));

  assert.ok(
    !constants.includes('RANGE_PERIMETER_RANGED_COLOR') && !constants.includes('RANGE_PERIMETER_AIR_STRIKE_COLOR'),
    'playback should not keep separate ranged and air-strike colors'
  );
  assert.ok(
    orderDrawing.includes('strokeColor: RANGE_PERIMETER_MISSILE_COLOR') &&
      orderDrawing.includes('ctx.globalAlpha = MOVEMENT_HOVER_VALID_ALPHA') &&
      orderDrawing.includes("strokeSupportOrderLines(ctx, 'airStrike', air)") &&
      orderDrawing.includes("strokeSupportOrderLines(ctx, 'missile', missiles)") &&
      /strokeSupportOrderLines\(\r?\n\s+ctx,\r?\n\s+mode,/.test(orderDrawing),
    'playback attacks should use the crimson planning stroke: solid ranged, dashed air, dotted missile'
  );
  assert.equal(
    (gameScene.match(/drawResolutionOutboundAttackLines\(/g) ?? []).length,
    2,
    'tactical and strategic playback should each draw outbound attacks with the planning stroke'
  );
  assert.equal(
    (gameScene.match(/drawResolutionMoveLines\(ctx, width, height, airStrikeReturnPlaybackMoves/g) ?? []).length,
    2,
    'an air unit flying home should stay a movement line in both theaters'
  );
}

function testRangePerimeterDashAnimationRemainsWired(): void {
  const overlay = readRenderer(path.join('rendering', 'rangePerimeterOverlay.ts'));
  const renderer = readRenderer(path.join('rendering', 'gameScene.ts'));

  assert.ok(
    overlay.includes('ctx.lineDashOffset = phase') &&
      overlay.includes('RANGE_PERIMETER_FLOW_PX_PER_SEC') &&
      overlay.includes('export function ensureRangePerimeterAnimation'),
    'perimeter overlay should animate dashes via lineDashOffset and expose the RAF ensure helper'
  );
  const tacticalEnsure = renderer.indexOf('ensureRangePerimeterAnimation(redraw);');
  const strategicEnsure = renderer.lastIndexOf('ensureRangePerimeterAnimation(redraw);');
  assert.ok(
    tacticalEnsure >= 0 && strategicEnsure > tacticalEnsure,
    'tactical and strategic drawGameScene branches should each start range perimeter animation'
  );
}

/**
 * Runs the overlay stroke contract tests.
 *
 * Purpose: Standalone entry for `npm test` discovery of this file.
 * When to use: Invoked at module load by the Node test runner.
 * Expected outcome: Logs success or sets `process.exitCode` on failure.
 * Exceptions: None; individual assertions throw into the runner loop.
 */
function run(): void {
  const tests = [
    { name: 'support overlay stroke widths follow tactical vs strategic map layer', fn: testSupportOverlayStrokeWidthsByMapLayer },
    { name: 'perimeter dash and cap stay visible at strategic width', fn: testPerimeterDashAndCapStayVisibleAtStrategicWidth },
    { name: 'resolution attack lines match the planning stroke', fn: testResolutionAttackLinesMatchPlanningStroke },
    { name: 'range perimeter dash animation remains wired', fn: testRangePerimeterDashAnimationRemainsWired },
  ];
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exitCode = 1;
    }
  }
}

run();
