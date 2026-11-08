/**
 * Photographs each map theme and checks that a theme change does not remount the tiles.
 *
 * Purpose: The theme select replaces itself on every change, and later scenes must see Standard at the
 *   camera the match started with.
 * When to use: From the first smoke session, after the strategic scenes and before any unit is selected.
 * Expected outcome: One world, zoom-6, and zoom-10 picture per theme, plus pass or fail lines on the report.
 * Exceptions: Restores the theme and the camera even when a check throws.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { captureMainMap } = require('./ui-smoke-map.cjs');

const MAP_HANDLE = '__uiSmokeMainMap';
const SETTLE_MS = 700;

const THEMES = Object.freeze([
  { id: 'standard', label: 'Standard', water: 'rgb(163, 199, 223)', roadCenter: '#ffffff' },
  { id: 'topographic', label: 'Topographic', water: 'rgb(166, 217, 239)', roadCenter: '#ffffff' },
  { id: 'nautical', label: 'Nautical', water: 'rgb(227, 241, 248)', roadCenter: '#ffffff' },
  { id: 'night', label: 'Night', water: 'rgb(15, 26, 38)', roadCenter: '#8b95a3' },
]);

/**
 * Records one theme check.
 *
 * Purpose: The smoke report is a list of pass or fail lines.
 * When to use: After each assertion in this file.
 * Expected outcome: One result row. A failure names what was seen.
 * Exceptions: None.
 */
function record(report, check, ok, detail) {
  report.results.push({
    scene: 'map-themes',
    check,
    status: ok ? 'PASS' : 'FAIL',
    detail: ok ? '' : detail,
  });
}

/**
 * Reads the theme select's option labels.
 *
 * Purpose: The select is rebuilt on every change, so it is queried each time.
 * When to use: Before selecting a theme, and again in the restore step.
 * Expected outcome: The current option texts.
 * Exceptions: Throws when the select is missing.
 */
async function optionLabels(page) {
  return page.locator('#terrain-legend select').evaluate((select) =>
    [...select.options].map((option) => option.textContent),
  );
}

/**
 * Moves the main map without animation.
 *
 * Purpose: `setZoom` would keep the previous center.
 * When to use: For the Gibraltar pictures and for restoring the saved view.
 * Expected outcome: The map center and zoom match the arguments once the settle wait ends.
 * Exceptions: Throws when the map handle is missing.
 */
/**
 * Counts strokes of one color on the main map.
 *
 * Purpose: Road and rail lines are SVG paths, so the smoke run can count them. Grid lines use rgba and do not match.
 * When to use: After a theme has settled at a zoom where roads are on screen.
 * Expected outcome: The number of paths whose stroke is `color`. A light theme's white count includes rail halos.
 * Exceptions: None.
 */
async function countRoadCenters(page, color) {
  return page.locator(`#main-map path[stroke="${color}"]`).count();
}

async function setView(page, lat, lng, zoom) {
  await page.evaluate(
    ({ handle, lat, lng, zoom }) => window[handle].setView([lat, lng], zoom, { animate: false }),
    { handle: MAP_HANDLE, lat, lng, zoom },
  );
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Runs the theme pictures and checks, then puts the map back.
 *
 * Purpose: A theme left on Night, or a camera left at Gibraltar, would make the later scenes lie.
 * When to use: Once, after `captureMainMap` can see the match map. This function captures the map itself.
 * Expected outcome: Twelve pictures under the smoke output folder, and the map restored.
 * Exceptions: The restore in `finally` runs even when a check throws. Playwright errors still propagate.
 */
async function runMapThemeScenes(page, report, outDir) {
  await captureMainMap(page);
  const saved = await page.evaluate((handle) => {
    const center = window[handle].getCenter();
    return { lat: center.lat, lng: center.lng, zoom: window[handle].getZoom() };
  }, MAP_HANDLE);
  const tabs = page.locator('#map-mode-tabs');
  const openedTabs = !(await tabs.isVisible());
  if (openedTabs) {
    await page.click('#map-mode-tabs-toggle');
    await page.waitForTimeout(SETTLE_MS);
  }
  const legend = page.locator('#terrain-legend');
  const openedLegend = !(await legend.isVisible());
  if (openedLegend) {
    await page.click('#map-legend-toggle');
    await page.waitForTimeout(SETTLE_MS);
  }
  try {
    const labels = await optionLabels(page);
    record(
      report,
      'map theme options',
      labels.join('|') === THEMES.map((theme) => theme.label).join('|'),
      `options were ${labels.join(', ')}`,
    );
    for (const theme of THEMES) {
      await page.locator('#terrain-legend select').selectOption(theme.id);
      await page.waitForTimeout(SETTLE_MS);
      const tiles = await page.locator('#main-map img.leaflet-tile').evaluateAll(
        (images) => images.filter((image) => image.complete).length,
      );
      record(report, 'theme keeps tiles mounted', tiles > 0, `${theme.id} had ${tiles} complete tiles`);
      const water = await page.locator('.leaflet-basemapWater-pane').first().evaluate(
        (pane) => getComputedStyle(pane).backgroundColor,
      );
      record(report, 'water pane follows theme', water === theme.water, `${theme.id} water was ${water}`);
      fs.mkdirSync(outDir, { recursive: true });
      await page.screenshot({ path: path.join(outDir, `theme-${theme.id}-world.png`) });
      await setView(page, 36.0, -5.6, 6);
      await page.screenshot({ path: path.join(outDir, `theme-${theme.id}-z6.png`) });
      await setView(page, 36.0, -5.6, 10);
      await page.screenshot({ path: path.join(outDir, `theme-${theme.id}-z10.png`) });
      const roadCenters = await countRoadCenters(page, theme.roadCenter);
      record(
        report,
        'roads follow theme',
        roadCenters > 0,
        `${theme.id} had ${roadCenters} ${theme.roadCenter} roads`,
      );
      if (roadCenters === 0) return;
      if (theme.id === 'night') {
        await page.locator('#terrain-legend select').selectOption('standard');
        await page.waitForTimeout(SETTLE_MS);
        const whiteRoads = await countRoadCenters(page, '#ffffff');
        const nightRoads = await countRoadCenters(page, '#8b95a3');
        record(
          report,
          'roads recolor without a pan',
          whiteRoads > 0 && nightRoads === 0,
          `white ${whiteRoads}, night ${nightRoads}`,
        );
        await page.locator('#terrain-legend select').selectOption('night');
        await page.waitForTimeout(SETTLE_MS);
      }
      await setView(page, 46.43, 6.55, 10);
      await page.screenshot({ path: path.join(outDir, `theme-${theme.id}-lake-z10.png`) });
      await setView(page, saved.lat, saved.lng, saved.zoom);
    }
    await setView(page, 20, 0, 2);
    const labelCanvas = await page.evaluate(() => {
      const canvas = document.getElementById('map-label-overlay');
      const container = document.getElementById('canvas-container');
      const dpr = window.devicePixelRatio || 1;
      const overlay = document.getElementById('map-overlay');
      const map = document.getElementById('main-map');
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const sampleWidth = Math.max(1, Math.floor(canvas.width / 3));
      const sampleHeight = Math.max(1, Math.floor(canvas.height / 3));
      const pixels = canvas.getContext('2d').getImageData(sampleWidth, sampleHeight, sampleWidth, sampleHeight).data;
      let ink = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] !== 0) ink += 1;
      }
      return {
        width: canvas.width,
        height: canvas.height,
        expectedWidth: width * dpr,
        expectedHeight: height * dpr,
        ink,
        overlayZ: Number(getComputedStyle(overlay).zIndex),
        labelZ: Number(getComputedStyle(canvas).zIndex),
        mapZ: Number(getComputedStyle(map).zIndex),
        overlayPointer: getComputedStyle(overlay).pointerEvents,
        labelPointer: getComputedStyle(canvas).pointerEvents,
        credit: map.querySelector('.leaflet-control-attribution') != null,
        creditText: /GMTED|Geological Survey/.test(map.innerText),
      };
    });
    record(
      report,
      'label canvas matches the map',
      labelCanvas.width === labelCanvas.expectedWidth && labelCanvas.height === labelCanvas.expectedHeight,
      `label canvas ${labelCanvas.width}x${labelCanvas.height}, expected ${labelCanvas.expectedWidth}x${labelCanvas.expectedHeight}`,
    );
    record(
      report,
      'world view draws place names',
      labelCanvas.ink > 0,
      `center third had ${labelCanvas.ink} inked pixels`,
    );
    record(
      report,
      'game canvas is above place names',
      labelCanvas.overlayZ > labelCanvas.labelZ && labelCanvas.labelZ > labelCanvas.mapZ,
      `z-index overlay ${labelCanvas.overlayZ}, labels ${labelCanvas.labelZ}, map ${labelCanvas.mapZ}`,
    );
    record(
      report,
      'map canvases do not take clicks',
      labelCanvas.overlayPointer === 'none' && labelCanvas.labelPointer === 'none',
      `pointer-events overlay ${labelCanvas.overlayPointer}, labels ${labelCanvas.labelPointer}`,
    );
    record(
      report,
      'map shows no elevation credit',
      !labelCanvas.credit && !labelCanvas.creditText,
      `attribution control ${labelCanvas.credit}, credit text ${labelCanvas.creditText}`,
    );
    const worldBorders = await page.locator('#main-map .leaflet-basemapBorders-pane canvas').count();
    record(report, 'world view hides borders', worldBorders === 0, `world view had ${worldBorders} border canvases`);
    await setView(page, 36.0, -5.6, 6);
    const coast = await page.locator('#main-map .leaflet-basemapCoast-pane canvas').count();
    const maskAtCountryZoom = await page.locator('#main-map .leaflet-basemapWaterMask-pane canvas').count();
    const borders = await page.locator('#main-map .leaflet-basemapBorders-pane canvas').count();
    record(report, 'coastline canvas at zoom 6', coast > 0, `coast canvases ${coast}`);
    record(report, 'edge mask hidden at zoom 6', maskAtCountryZoom === 0, `mask canvases ${maskAtCountryZoom}`);
    record(report, 'national borders at zoom 6', borders > 0, `border canvases ${borders}`);
    await setView(page, 36.0, -5.6, 10);
    const coastAtTacticalZoom = await page.locator('#main-map .leaflet-basemapCoast-pane canvas').count();
    const maskAtTacticalZoom = await page.locator('#main-map .leaflet-basemapWaterMask-pane canvas').count();
    record(report, 'coastline canvas at zoom 10', coastAtTacticalZoom > 0, `coast canvases ${coastAtTacticalZoom}`);
    record(report, 'edge mask shown past native zoom', maskAtTacticalZoom > 0, `mask canvases ${maskAtTacticalZoom}`);
  } finally {
    const select = page.locator('#terrain-legend select');
    await select.selectOption('standard');
    await page.waitForTimeout(SETTLE_MS);
    if (openedLegend && (await legend.isVisible())) {
      await page.click('#map-legend-toggle');
      await page.waitForTimeout(SETTLE_MS);
    }
    if (openedTabs && (await tabs.isVisible())) {
      await page.click('#map-mode-tabs-toggle');
      await page.waitForTimeout(SETTLE_MS);
    }
    await setView(page, saved.lat, saved.lng, saved.zoom);
  }
}

module.exports = { runMapThemeScenes };
