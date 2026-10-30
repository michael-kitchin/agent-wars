/**
 * Economy and missile screenshots for the guide, taken in the second match session.
 *
 * Purpose: The guide's Building Units, Credits and Hiring, Fortifications, Ballistic Missiles, and Ranged Attacks
 *   sections show the state `economyEdit` stored: a queued missile and Credits item, a fortified city, a treasury,
 *   a lone missile, and an enemy beside the armor.
 * When to use: From the `match` group of `doc-shots.cjs`, after the app has reopened the edited match in planning.
 * Expected outcome: Writes up to six images, then plays one turn for the top bar shot.
 * Exceptions: None; each failed image is a `SKIP` and keeps its old file.
 */
'use strict';

const h3 = require('h3-js');
const { SETTLE_MS } = require('../ui-smoke/ui-smoke-scenes.cjs');
const { parkPointer, waitForWorldPlanning } = require('../ui-smoke/ui-smoke-page.cjs');
const {
  captureMainMap,
  clearSelection,
  hexClientPoint,
  latLngClientPoint,
  panMapToHex,
  panMidpointTo,
  readMapZoom,
  selectUnitInItsHex,
  setMapZoom,
  zoomUntilVisible,
} = require('../ui-smoke/ui-smoke-map.cjs');
const { LINE_RISE_PX, MATCH_VIEWPORT, clipAround, pointAbove, runShot, skipShot, waitForMapTiles } = require('./doc-shots-capture.cjs');
const { INSERTED_MISSILE_ID } = require('./doc-shots-edits.cjs');

/**
 * The images this session writes, in the order it takes them.
 *
 * Purpose: When the session cannot start, every one of them is reported as skipped.
 * When to use: `writeEconomyShots`, and `doc-shots.cjs` when the edit or the relaunch fails.
 * Expected outcome: Six file names under `doc/media/`.
 * Exceptions: None.
 */
const ECONOMY_SHOTS = Object.freeze([
  'ranged-attack-2.png',
  'unit-building.png',
  'missile-launch.png',
  'fortification-map.png',
  'hire-panel.png',
  'credits-topbar.png',
]);

/**
 * How many mouse-wheel notches the run may turn, each way, to reveal a build marker.
 *
 * Purpose: Build markers show only between the build zoom and the tactical zoom.
 * When to use: Only by `zoomToBuildMarker`.
 * Expected outcome: Six notches in, then up to six out.
 * Exceptions: None.
 */
const MAX_BUILD_ZOOM_NOTCHES = 6;

/**
 * How many times the fortification shot steps back toward the stored zoom when a hex corner is off screen.
 *
 * Purpose: A deep zoom can push the fortified hex past the window's edge.
 * When to use: Only by the fortification shot.
 * Expected outcome: Four half-level steps.
 * Exceptions: None.
 */
const FORT_ZOOM_RETRIES = 4;

/**
 * How far the missile shot zooms in from the stored zoom.
 *
 * Purpose: Unit tokens keep their size as the map zooms, so larger hexes leave more of the launch line between them.
 *   This stays below the build marker zoom, one level past the zoom the session opened at, so no marker covers the
 *   line.
 * When to use: Only by the missile shot.
 * Expected outcome: 0.9 zoom levels.
 * Exceptions: None.
 */
const MISSILE_ZOOM_STEP = 0.9;

/**
 * The selector of a hex's build marker, not a hire-only marker.
 *
 * Purpose: The build popup opens from this marker.
 * When to use: `zoomToBuildMarker` and clicks on the marker.
 * Expected outcome: A CSS selector for the marker on that hex.
 * Exceptions: None.
 */
function buildMarkerSelector(h3Index) {
  return `#build-entry-layer .build-entry-btn:not(.hire-entry-btn)[data-h3-index="${h3Index}"]`;
}

/**
 * Centers the map on a hex and zooms until that hex's build marker shows.
 *
 * Purpose: Build markers show only past the starting zoom and hide again at tactical zoom.
 * When to use: Before clicking a build marker or photographing a hex's ticks.
 * Expected outcome: The marker is visible. The map zooms in a notch at a time, and back out when it went too far.
 * Exceptions: Throws when the marker never shows.
 */
async function zoomToBuildMarker(page, h3Index) {
  const selector = buildMarkerSelector(h3Index);
  await panMapToHex(page, h3Index);
  if (await zoomUntilVisible(page, h3Index, selector, MAX_BUILD_ZOOM_NOTCHES)) return;
  for (let notch = 0; notch < MAX_BUILD_ZOOM_NOTCHES; notch += 1) {
    const point = await hexClientPoint(page, h3Index);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(SETTLE_MS.click);
    if (await page.isVisible(selector)) return;
  }
  throw new Error(`the build marker on ${h3Index} did not show`);
}

/**
 * Clears the selection and any open popup, and parks the pointer.
 *
 * Purpose: Each shot starts from an empty map.
 * When to use: Before and after each map shot.
 * Expected outcome: No selection, no popup, and the pointer in the top bar.
 * Exceptions: Throws a Playwright timeout when the selection panel stays open.
 */
async function resetMap(page) {
  await clearSelection(page);
  await page.keyboard.press('Escape');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
}

/**
 * Opens a hex's build popup from its marker.
 *
 * Purpose: The build and hire shots both start here.
 * When to use: After `zoomToBuildMarker` on that hex.
 * Expected outcome: The popup is open and the pointer is parked. Returns the marker's center, for the crop.
 * Exceptions: Throws when the marker is hidden or the popup does not open.
 */
async function openBuildPopup(page, h3Index) {
  const marker = await page.locator(buildMarkerSelector(h3Index)).boundingBox();
  if (!marker) throw new Error(`the build marker on ${h3Index} is hidden`);
  await page.click(buildMarkerSelector(h3Index));
  await page.waitForSelector('#build-popup:not(.hidden)', { timeout: 8000 });
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  return { x: marker.x + marker.width / 2, y: marker.y + marker.height / 2 };
}

/**
 * Closes the build popup when it is open.
 *
 * Purpose: The next shot needs the map clear.
 * When to use: After each build popup shot, including one that failed.
 * Expected outcome: The popup is hidden.
 * Exceptions: None; a popup that is already closed is left alone.
 */
async function closeBuildPopup(page) {
  if (await page.isVisible('#build-popup .build-close-btn')) await page.click('#build-popup .build-close-btn');
  await page.waitForSelector('#build-popup', { state: 'hidden', timeout: 8000 }).catch(() => undefined);
}

/**
 * Clicks a tab of the build popup by its label, when the popup has tabs.
 *
 * Purpose: A city that can also hire shows Build and Hire tabs. A city that cannot shows the build panel alone.
 * When to use: After `openBuildPopup`.
 * Expected outcome: True when the tab was there and is now selected, false when the popup has no tabs.
 * Exceptions: None.
 */
async function chooseBuildPopupTab(page, label) {
  const tab = page.locator('#build-popup [role="tab"]', { hasText: label });
  if ((await tab.count()) === 0) return false;
  await tab.first().click();
  await page.waitForTimeout(SETTLE_MS.click);
  return true;
}

/**
 * Takes the ranged attack shot that hovers the enemy beside the armor.
 *
 * Purpose: The guide's second ranged attack step.
 * When to use: At the stored zoom, first in this session.
 * Expected outcome: `ranged-attack-2.png`, with aiming stopped afterwards.
 * Exceptions: None; a failure is a `SKIP`.
 */
async function writeRangedTargetShot(page, report, edit) {
  await runShot(report, 'ranged-attack-2.png', async () => {
    await panMapToHex(page, edit.armorHex);
    await selectUnitInItsHex(page, { id: edit.armorId, h3Index: edit.armorHex });
    await page.click('#ranged-attack-btn');
    try {
      await panMidpointTo(page, edit.armorHex, edit.enemyHex, await pointAbove(page, '#selection-panel', LINE_RISE_PX));
      const armor = await hexClientPoint(page, edit.armorHex);
      const enemy = await hexClientPoint(page, edit.enemyHex);
      await page.mouse.move(enemy.x, enemy.y);
      await page.waitForTimeout(SETTLE_MS.tip);
      return await page.screenshot({ clip: await clipAround(page, { selectors: ['#selection-panel'], points: [armor, enemy], pad: 60, viewport: MATCH_VIEWPORT }) });
    } finally {
      await page.click('#ranged-attack-btn');
    }
  });
  await resetMap(page);
}

/**
 * Takes the build popup shot on the queue city.
 *
 * Purpose: The guide's Building Units picture, showing the queued missile or infantry and the Credits item.
 * When to use: After the ranged shot.
 * Expected outcome: `unit-building.png`, and a `NOTE build queue:` line naming the two queued values. The map returns
 *   to the stored zoom.
 * Exceptions: None; a failure is a `SKIP`, including a queue that does not show the stored items.
 */
async function writeBuildShot(page, report, edit, storedZoom) {
  await runShot(report, 'unit-building.png', async () => {
    try {
      await zoomToBuildMarker(page, edit.queueHex);
      const marker = await openBuildPopup(page, edit.queueHex);
      await chooseBuildPopupTab(page, 'Build');
      const values = await page.$$eval('#build-popup .build-queue-list select', (selects) => selects.map((select) => select.value));
      const expected = [edit.showMissile ? 'missile' : 'infantry', 'credits'];
      if (values.join() !== expected.join()) throw new Error(`build queue did not show the stored items: ${values.join(', ')}`);
      console.log(`NOTE build queue: ${values.join(', ')}`);
      return await page.screenshot({ clip: await clipAround(page, { selectors: ['#build-popup'], points: [marker], pad: 16, viewport: MATCH_VIEWPORT }) });
    } finally {
      await closeBuildPopup(page);
      await setMapZoom(page, storedZoom);
    }
  });
  await resetMap(page);
}

/**
 * Takes the missile launch shot.
 *
 * Purpose: The guide's Ballistic Missiles picture: a selected missile aiming at a hex in range, with the launch line
 *   drawn across open hexes.
 * When to use: After the build shot.
 * Expected outcome: `missile-launch.png`, with aiming stopped afterwards. The map zooms in by `MISSILE_ZOOM_STEP`,
 *   places the launch line just above the selection panel, and returns to the stored zoom.
 * Exceptions: None; a failure is a `SKIP`.
 */
async function writeMissileShot(page, report, edit, storedZoom) {
  await runShot(report, 'missile-launch.png', async () => {
    let aiming = false;
    try {
      await panMapToHex(page, edit.missileHex);
      await setMapZoom(page, storedZoom + MISSILE_ZOOM_STEP);
      await selectUnitInItsHex(page, { id: INSERTED_MISSILE_ID, h3Index: edit.missileHex });
      await page.click('#ranged-attack-btn');
      aiming = true;
      await panMidpointTo(page, edit.missileHex, edit.launchHoverHex, await pointAbove(page, '#selection-panel', LINE_RISE_PX));
      const stand = await hexClientPoint(page, edit.missileHex);
      const target = await hexClientPoint(page, edit.launchHoverHex);
      await page.mouse.move(target.x, target.y);
      await page.waitForTimeout(SETTLE_MS.tip);
      return await page.screenshot({ clip: await clipAround(page, { selectors: ['#selection-panel'], points: [stand, target], pad: 40, viewport: MATCH_VIEWPORT }) });
    } finally {
      if (aiming) await page.click('#ranged-attack-btn');
      await setMapZoom(page, storedZoom);
    }
  });
  await resetMap(page);
}

/**
 * Takes the fortified hex shot.
 *
 * Purpose: The guide's Fortifications picture: the tick pattern on a fully fortified city.
 * When to use: After the missile shot.
 * Expected outcome: `fortification-map.png`, cropped to the hex's six corners. The map is set three zoom steps past
 *   the stored zoom, so the tick pattern is large enough to read and still clear of battle-detail zoom. When a
 *   corner is off screen, the map steps back toward the stored zoom and tries again. The map returns to the stored zoom.
 * Exceptions: None; a failure is a `SKIP`.
 */
async function writeFortificationShot(page, report, edit, storedZoom) {
  await runShot(report, 'fortification-map.png', async () => {
    try {
      await panMapToHex(page, edit.fortHex);
      await setMapZoom(page, storedZoom + 3);
      const fortified = await page.evaluate(async (hex) => {
        const state = await window.gameApi.getGameState();
        const row = (state.strategicInfrastructure || []).find((item) => item.h3Index === hex);
        return row ? `${row.fortifiedCount} of ${row.urbanHexCount}` : 'missing';
      }, edit.fortHex);
      console.log(`NOTE fortification: ${fortified}`);
      await page.keyboard.press('Escape');
      await parkPointer(page);
      for (let attempt = 0; ; attempt += 1) {
        await page.waitForTimeout(SETTLE_MS.click);
        const corners = [];
        for (const corner of h3.cellToBoundary(edit.fortHex)) corners.push(await latLngClientPoint(page, corner));
        try {
          return await page.screenshot({ clip: await clipAround(page, { points: corners, pad: 24, viewport: MATCH_VIEWPORT }) });
        } catch (err) {
          if (!/point is off screen/.test(err.message) || attempt >= FORT_ZOOM_RETRIES) throw err;
          const zoom = await readMapZoom(page);
          await setMapZoom(page, Math.max(storedZoom, zoom - 0.5));
          await panMapToHex(page, edit.fortHex);
        }
      }
    } finally {
      await setMapZoom(page, storedZoom);
    }
  });
  await resetMap(page);
}

/**
 * Places one infantry raise on the Hire tab of the queue city.
 *
 * Purpose: The hire shot shows a raise in the Hire Queue, paid from the treasury when it is placed.
 * When to use: With the build popup open on a city that can hire.
 * Expected outcome: The Hire Queue section is shown. Prints the treasury readout before and after.
 * Exceptions: Throws when the Hire tab or the raise row is missing, the panel reports a shortage before the click, or
 *   the order is not placed within five seconds.
 */
async function placeInfantryRaise(page) {
  if (!(await chooseBuildPopupTab(page, 'Hire'))) throw new Error('the build popup has no Hire tab');
  const warning = page.locator('.hire-panel .hire-funds-warning');
  if (await warning.first().isVisible().catch(() => false)) throw new Error(`hire panel reports a shortage: ${(await warning.first().textContent()).trim()}`);
  const row = page.locator('.hire-panel .build-queue-row', { has: page.locator('select.unit-select') }).first();
  if ((await row.count()) === 0) throw new Error('the Hire tab has no raise row');
  const before = (await page.textContent('#topbar-stat-credits')).trim();
  await row.locator('select.unit-select').selectOption('infantry');
  await row.locator('button', { hasText: 'Hire' }).click();
  await page.waitForFunction(() => (document.querySelector('#build-popup .hire-panel')?.textContent || '').includes('Hire Queue'), null, { timeout: 5000 })
    .catch(() => {
      throw new Error('hire order was not placed');
    });
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  const after = (await page.textContent('#topbar-stat-credits')).trim();
  console.log(`hire fee taken: ${before} -> ${after}`);
  if (before === after) console.log('NOTE hire fee did not change the readout');
}

/**
 * Takes the Hire tab shot on the queue city.
 *
 * Purpose: The guide's Credits and Hiring picture: one raise in the Hire Queue.
 * When to use: After the fortification shot. Skipped when the queue city cannot raise one infantry.
 * Expected outcome: `hire-panel.png`. The map returns to the stored zoom.
 * Exceptions: None; a failure is a `SKIP`.
 */
async function writeHireShot(page, report, edit, storedZoom) {
  if (!edit.raiseFits) {
    skipShot(report, 'hire-panel.png', 'the queue city is too small to raise one infantry');
    return;
  }
  await runShot(report, 'hire-panel.png', async () => {
    try {
      await zoomToBuildMarker(page, edit.queueHex);
      await openBuildPopup(page, edit.queueHex);
      await placeInfantryRaise(page);
      return await page.screenshot({ clip: await clipAround(page, { selectors: ['#build-popup'], pad: 16, viewport: MATCH_VIEWPORT }) });
    } finally {
      await closeBuildPopup(page);
      await setMapZoom(page, storedZoom);
    }
  });
  await resetMap(page);
}

/**
 * Plays one turn and takes the top bar shot.
 *
 * Purpose: The guide's credits readout. After the turn, a filled raise is a mercenary, and its upkeep shows as a suffix.
 * When to use: Last in this session.
 * Expected outcome: `credits-topbar.png`, and a note saying whether the upkeep suffix had text.
 * Exceptions: None; a failure is a `SKIP`.
 */
async function writeCreditsShot(page, report) {
  await runShot(report, 'credits-topbar.png', async () => {
    await page.click('#ready-btn');
    await waitForWorldPlanning(page);
    await parkPointer(page);
    await page.waitForTimeout(SETTLE_MS.click);
    const suffix = ((await page.textContent('#topbar-stat-credits-suffix')) || '').trim();
    console.log(`NOTE credits suffix: ${suffix || '(none)'}`);
    const production = '#app-topbar .topbar-stat:has(#topbar-stat-production)';
    return page.screenshot({ clip: await clipAround(page, { selectors: [production, '#topbar-stat-credits-host'], pad: 8, viewport: MATCH_VIEWPORT }) });
  });
}

/**
 * Takes every second-session shot.
 *
 * Purpose: The second half of the `match` group.
 * When to use: After the edited match has reopened in planning at the match viewport. Pass `economyEdit`'s result.
 * Expected outcome: One `WROTE` or `SKIP` line per image in `ECONOMY_SHOTS`.
 * Exceptions: None; when the map never loads, every image is skipped.
 */
async function writeEconomyShots(page, report, edit) {
  let storedZoom;
  try {
    await captureMainMap(page);
    await waitForMapTiles(page);
    storedZoom = await readMapZoom(page);
  } catch (err) {
    for (const fileName of ECONOMY_SHOTS) skipShot(report, fileName, err.message);
    return;
  }
  await writeRangedTargetShot(page, report, edit);
  await writeBuildShot(page, report, edit, storedZoom);
  await writeMissileShot(page, report, edit, storedZoom);
  await writeFortificationShot(page, report, edit, storedZoom);
  await writeHireShot(page, report, edit, storedZoom);
  await writeCreditsShot(page, report);
}

module.exports = {
  ECONOMY_SHOTS,
  writeEconomyShots,
};
