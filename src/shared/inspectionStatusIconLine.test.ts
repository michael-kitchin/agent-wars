import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  inspectionStatusIconDrawPx,
  inspectionStatusIconFontPx,
  inspectionStatusIconsForHex,
  statusIconCentersX,
  strategicOverlayBandOffsetPx,
  strategicProductionLabelSurface,
  techInspectionIconAssetPath,
  weatherInspectionIconAssetPath,
} from './inspectionStatusIconLine';

/**
 * Checks which production surface a world hex uses.
 *
 * Purpose: Production labels stay on their current hexes. The status icon does not use this surface as a yes-or-no gate.
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
 * Checks which status icons a world hex receives.
 *
 * Purpose: The inspection view allows tech, and the Weather tab allows weather, each on its own. A missing bonus or a
 *   missing hex fact omits that icon.
 * When to use: From this file's runner.
 * Expected outcome: Tech then weather when both apply. Weather alone when the tech icon cannot show: the tech bonus is
 *   off, or the urban count cannot produce units. Tech alone when the weather word is unknown. An empty list when
 *   neither applies.
 * Exceptions: AssertionError when a missing count becomes Basic, an unknown weather becomes Mild, or a toggle leaks into
 *   the other icon.
 */
test('status icons follow the inspection view, the Weather tab, and the bonuses', () => {
  const both = {
    mapInspectionHeld: true,
    weatherIconsShown: true,
    techBonusEnabled: true,
    weatherBonusEnabled: true,
    baselineUrbanHexCount: 21,
    weather: 'heat',
  };
  assert.deepEqual(inspectionStatusIconsForHex(both), [
    { kind: 'tech', level: 'advanced' },
    { kind: 'weather', state: 'heat' },
  ]);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, weatherIconsShown: false, baselineUrbanHexCount: 20 }), [
    { kind: 'tech', level: 'basic' },
  ]);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, mapInspectionHeld: false }), [{ kind: 'weather', state: 'heat' }]);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, techBonusEnabled: false }), [{ kind: 'weather', state: 'heat' }]);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, weather: 'fog' }), [{ kind: 'tech', level: 'advanced' }]);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, baselineUrbanHexCount: -1 }), [{ kind: 'weather', state: 'heat' }]);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, techBonusEnabled: false, weatherBonusEnabled: false }), []);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, baselineUrbanHexCount: Number.NaN, weather: 'fog' }), []);
  assert.deepEqual(inspectionStatusIconsForHex({ ...both, baselineUrbanHexCount: 0, weather: null }), []);
});

/**
 * Checks where each status icon sits across a hex.
 *
 * Purpose: One icon is centered. Two sit side by side, centered as a pair, 2 px apart.
 * When to use: From this file's runner.
 * Expected outcome: One 16 px icon at the center. Two 16 px icons 9 px either side of it.
 * Exceptions: AssertionError when the pair is off center or the gap drifts.
 */
test('one status icon is centered, and two sit side by side as a centered pair', () => {
  assert.deepEqual(statusIconCentersX(100, 16, 1), [100]);
  assert.deepEqual(statusIconCentersX(100, 16, 2), [91, 109]);
  assert.deepEqual(statusIconCentersX(100, 16, 0), []);
});

/**
 * Checks the production-text height that the status icon is scaled from.
 *
 * Purpose: The painted icon is this height times 1.5, from `inspectionStatusIconDrawPx`.
 * When to use: From this file's runner.
 * Expected outcome: A build button is 10. A canvas label with infrastructure or units is 10. A plain canvas label is 11.
 * Exceptions: AssertionError when the base drifts from the production label.
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
 * Checks the enlarged status-icon size.
 *
 * Purpose: Weather and tech are one and a half times the production-text height on that hex.
 * When to use: From this file's runner.
 * Expected outcome: A build button, infrastructure, or a unit yields 15. A plain canvas label yields 16.5.
 * Exceptions: AssertionError when the size is rounded or drifts from 1.5 times the base.
 */
test('the status icon is one and a half times the production text', () => {
  assert.equal(
    inspectionStatusIconDrawPx({ productionSurface: 'button', hasInfraSymbols: false, hasVisibleUnits: false }),
    15
  );
  assert.equal(
    inspectionStatusIconDrawPx({ productionSurface: 'canvas', hasInfraSymbols: false, hasVisibleUnits: true }),
    15
  );
  assert.equal(
    inspectionStatusIconDrawPx({ productionSurface: 'canvas', hasInfraSymbols: true, hasVisibleUnits: false }),
    15
  );
  assert.equal(
    inspectionStatusIconDrawPx({ productionSurface: 'canvas', hasInfraSymbols: false, hasVisibleUnits: false }),
    16.5
  );
});

/**
 * Checks the shared band offset and the asset paths.
 *
 * Purpose: The icon sits one production-band above the hex center, and the assets match the tooltip icons.
 * When to use: From this file's runner.
 * Expected outcome: Span 100 offsets by 24. Advanced and Heat use their existing files.
 * Exceptions: AssertionError when the offset is rounded or the path changes.
 */
test('the band offset and icon paths stay fixed', () => {
  assert.equal(strategicOverlayBandOffsetPx(100), 24);
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
