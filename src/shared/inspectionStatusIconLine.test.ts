import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  INSPECTION_STATUS_ICON_SLASH_TEXT,
  inspectionStatusIconFontPx,
  inspectionStatusIconsForHex,
  inspectionStatusSlashIsBold,
  strategicOverlayBandOffsetPx,
  strategicProductionLabelSurface,
  techInspectionIconAssetPath,
  weatherInspectionIconAssetPath,
} from './inspectionStatusIconLine';

/**
 * Checks which production surface a world hex uses.
 *
 * Purpose: The icon row follows the same hexes as the production label, including the build button.
 * When to use: From this file's runner.
 * Expected outcome: Tactical, hidden hexes, and opponent hexes outside inspection are `'none'`. The build button wins when it is shown. Inspection reveals a canvas label on the remaining hexes.
 * Exceptions: AssertionError when the surface drifts from the production overlay.
 */
test('a production label is a button, a canvas line, or absent', () => {
  const base = {
    tacticalRendered: false,
    explored: true,
    mapInspectionHeld: false,
    controlledByHuman: true,
    humanUrbanProduction: true,
    buildEntryZoom: true,
  };
  assert.equal(strategicProductionLabelSurface({ ...base, tacticalRendered: true }), 'none');
  assert.equal(
    strategicProductionLabelSurface({ ...base, explored: false, humanUrbanProduction: false, buildEntryZoom: false }),
    'none'
  );
  assert.equal(
    strategicProductionLabelSurface({
      ...base,
      controlledByHuman: false,
      humanUrbanProduction: false,
      buildEntryZoom: false,
    }),
    'none'
  );
  assert.equal(strategicProductionLabelSurface(base), 'button');
  assert.equal(strategicProductionLabelSurface({ ...base, mapInspectionHeld: true }), 'button');
  assert.equal(
    strategicProductionLabelSurface({ ...base, explored: false, mapInspectionHeld: true }),
    'canvas'
  );
  assert.equal(
    strategicProductionLabelSurface({ ...base, humanUrbanProduction: false, buildEntryZoom: false }),
    'canvas'
  );
  assert.equal(
    strategicProductionLabelSurface({
      ...base,
      explored: false,
      controlledByHuman: false,
      humanUrbanProduction: false,
      buildEntryZoom: false,
      mapInspectionHeld: true,
    }),
    'canvas'
  );
  assert.equal(
    strategicProductionLabelSurface({
      ...base,
      controlledByHuman: false,
      humanUrbanProduction: false,
      buildEntryZoom: false,
      mapInspectionHeld: true,
    }),
    'canvas'
  );
  assert.equal(strategicProductionLabelSurface({ ...base, buildEntryZoom: false }), 'canvas');
});

/**
 * Checks which tech and weather icons a labeled hex receives.
 *
 * Purpose: The icon row uses the same omissions as the hex tooltip Tech and Weather lines.
 * When to use: From this file's runner.
 * Expected outcome: No row when the production surface is absent or both icons are absent. One icon when only one applies. Basic at 20 urban cells and Advanced at 21.
 * Exceptions: AssertionError when a missing count becomes Basic or an unknown weather becomes Mild.
 */
test('tech and weather icons follow the hex tooltip omissions', () => {
  assert.equal(
    inspectionStatusIconsForHex({
      productionSurface: 'none',
      techBonusEnabled: true,
      baselineUrbanHexCount: 21,
      weather: 'heat',
    }),
    null
  );
  assert.deepEqual(
    inspectionStatusIconsForHex({
      productionSurface: 'canvas',
      techBonusEnabled: false,
      baselineUrbanHexCount: 21,
      weather: 'heat',
    }),
    { tech: null, weather: 'heat' }
  );
  assert.deepEqual(
    inspectionStatusIconsForHex({
      productionSurface: 'canvas',
      techBonusEnabled: true,
      baselineUrbanHexCount: 21,
      weather: null,
    }),
    { tech: 'advanced', weather: null }
  );
  assert.deepEqual(
    inspectionStatusIconsForHex({
      productionSurface: 'button',
      techBonusEnabled: true,
      baselineUrbanHexCount: 20,
      weather: 'rain',
    }),
    { tech: 'basic', weather: 'rain' }
  );
  assert.deepEqual(
    inspectionStatusIconsForHex({
      productionSurface: 'canvas',
      techBonusEnabled: true,
      baselineUrbanHexCount: 0,
      weather: 'mild',
    }),
    { tech: null, weather: 'mild' }
  );
  assert.equal(
    inspectionStatusIconsForHex({
      productionSurface: 'canvas',
      techBonusEnabled: true,
      baselineUrbanHexCount: 0,
      weather: 'fog',
    }),
    null
  );
  assert.equal(
    inspectionStatusIconsForHex({
      productionSurface: 'canvas',
      techBonusEnabled: true,
      baselineUrbanHexCount: Number.NaN,
      weather: null,
    }),
    null
  );
  assert.deepEqual(
    inspectionStatusIconsForHex({
      productionSurface: 'canvas',
      techBonusEnabled: true,
      baselineUrbanHexCount: -1,
      weather: 'snow',
    }),
    { tech: null, weather: 'snow' }
  );
});

/**
 * Checks the pixel size of the icon row.
 *
 * Purpose: The icons match the production text on that hex.
 * When to use: From this file's runner.
 * Expected outcome: A build button is 10. A canvas label with infrastructure or units is 10. A plain canvas label is 11.
 * Exceptions: AssertionError when the size drifts from the production label.
 */
test('icon height matches the production label on that hex', () => {
  assert.equal(
    inspectionStatusIconFontPx({ productionSurface: 'button', hasInfraSymbols: false, hasVisibleUnits: false }),
    10
  );
  assert.equal(
    inspectionStatusIconFontPx({ productionSurface: 'canvas', hasInfraSymbols: false, hasVisibleUnits: true }),
    10
  );
  assert.equal(
    inspectionStatusIconFontPx({ productionSurface: 'canvas', hasInfraSymbols: true, hasVisibleUnits: false }),
    10
  );
  assert.equal(
    inspectionStatusIconFontPx({ productionSurface: 'canvas', hasInfraSymbols: false, hasVisibleUnits: false }),
    11
  );
});

/**
 * Checks when the slash between the icons is bold.
 *
 * Purpose: The slash uses the same weight as the production numbers on that hex.
 * When to use: From this file's runner.
 * Expected outcome: Bold only for a human hex with capacity above zero.
 * Exceptions: AssertionError when an opponent or empty hex is bold.
 */
test('the slash is bold on a human hex with capacity', () => {
  assert.equal(inspectionStatusSlashIsBold(true, 1), true);
  assert.equal(inspectionStatusSlashIsBold(true, 0), false);
  assert.equal(inspectionStatusSlashIsBold(false, 5), false);
});

/**
 * Checks the shared band offset, the slash text, and the asset paths.
 *
 * Purpose: The icon row sits one production-band above the code, and the assets match the tooltip icons.
 * When to use: From this file's runner.
 * Expected outcome: Span 100 offsets by 24. The slash is space, slash, space. Advanced and Heat use their existing files.
 * Exceptions: AssertionError when the offset is rounded or the path changes.
 */
test('the band offset, slash text, and icon paths stay fixed', () => {
  assert.equal(strategicOverlayBandOffsetPx(100), 24);
  assert.equal(INSPECTION_STATUS_ICON_SLASH_TEXT, ' / ');
  assert.equal(techInspectionIconAssetPath('advanced'), 'tech/tech_advanced.svg');
  assert.equal(techInspectionIconAssetPath('basic'), 'tech/tech_basic.svg');
  assert.equal(weatherInspectionIconAssetPath('heat'), 'weather/heat.svg');
});

/**
 * Reads one function body by matching braces.
 *
 * Purpose: The scene-pass check needs `drawGameScene` without the rest of the renderer file.
 * When to use: The call-site test below.
 * Expected outcome: The function text, including its closing brace.
 * Exceptions: Throws when the function is missing or its braces do not close.
 */
function functionSource(source: string, functionName: string): string {
  const signature = new RegExp(`(?:^|\\n)function\\s+${functionName}\\s*\\(`, 'm').exec(source);
  if (!signature || signature.index == null) throw new Error(`missing ${functionName}`);
  const openBrace = source.indexOf('{', signature.index);
  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(signature.index, i + 1);
  }
  throw new Error(`unterminated ${functionName}`);
}

/**
 * Checks that both scene passes draw the icon row immediately after the hex codes.
 *
 * Purpose: The tactical branch and the strategic branch both call the drawer, and the drawer itself declines the cases it must not paint.
 * When to use: From this file's runner.
 * Expected outcome: Each hex-code call is followed by the icon-row call within 400 characters.
 * Exceptions: AssertionError when either call site is missing. This test reads source and does not draw pixels.
 */
test('both scene passes draw the icon row after the hex codes', () => {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'gameScene.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const scene = functionSource(source, 'drawGameScene');
  const marks = [...scene.matchAll(/drawStrategicInspectionHexCodes\(/g)];
  assert.equal(marks.length, 2);
  for (const mark of marks) {
    const after = scene.slice(mark.index ?? 0, (mark.index ?? 0) + 400);
    assert.equal(after.includes('drawInspectionStatusIcons('), true);
  }
});
