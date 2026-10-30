/**
 * Order and save/load screenshots for the guide, taken in the first match session.
 *
 * Purpose: The guide's Playing a Turn, Ranged Attacks, and Saving and Loading sections show the controls a player uses.
 * When to use: From the `match` group of `doc-shots.cjs`, right after the `setup` group, on the new-game overlay's Global tab.
 * Expected outcome: Writes the stack, ranged, air strike, movement, game menu, and load confirm images. The match stays
 *   open with no order queued, and the app is not closed.
 * Exceptions: A shot that cannot be set up is skipped by `runShot`; the old file stays. Starting the match can throw.
 */
'use strict';

const h3 = require('h3-js');
const { SETTLE_MS } = require('../ui-smoke/ui-smoke-scenes.cjs');
const { startScenarioMatch } = require('../ui-smoke/ui-smoke-new-game.cjs');
const { parkPointer, setViewport } = require('../ui-smoke/ui-smoke-page.cjs');
const {
  captureMainMap,
  clearSelection,
  hexClientPoint,
  loneHumanUnits,
  panMapToHex,
  panMidpointTo,
  readGameState,
  readMapZoom,
  selectUnitInItsHex,
  setMapZoom,
  unitCountByHex,
} = require('../ui-smoke/ui-smoke-map.cjs');
const { LINE_RISE_PX, MATCH_VIEWPORT, clipAround, pointAbove, runShot, skipShot, waitForMapTiles } = require('./doc-shots-capture.cjs');
const { farthestClearHex, hexRing } = require('./doc-shots-edits.cjs');

/**
 * The images this session writes, in the order it takes them.
 *
 * Purpose: When the map never loads, every one of them is reported as skipped.
 * When to use: Only by `writeOrderShots`.
 * Expected outcome: Eight file names under `doc/media/`.
 * Exceptions: None.
 */
const ORDER_SHOTS = Object.freeze([
  'stack-select-1.png',
  'stack-select-2.png',
  'ranged-attack-1.png',
  'air-strike.png',
  'movement-planning-1.png',
  'movement-planning-2.png',
  'save-load-menu.png',
  'load-confirm.png',
]);

/**
 * How far the first session zooms in from the match's starting zoom.
 *
 * Purpose: At the starting zoom the player's units are small and a one-hex route is hard to see. One mouse-wheel
 *   notch (`MAIN_MAP_WHEEL_ZOOM_STEP`) is still below the zoom where build markers appear, so no marker covers a unit.
 * When to use: Once, after the map is centered on the player's stack.
 * Expected outcome: 0.5 zoom levels.
 * Exceptions: None.
 */
const ORDER_ZOOM_STEP = 0.5;

/**
 * How much further the air strike shot zooms in past the order zoom.
 *
 * Purpose: A strike reaches only `AIR_STRIKE_RANGE_HEXES`, so its line is short. Larger hexes make it longer on
 *   screen. Together with `ORDER_ZOOM_STEP` this stays below the build marker zoom, one level past the default.
 * When to use: Only by the air strike shot.
 * Expected outcome: 0.4 zoom levels.
 * Exceptions: None.
 */
const AIR_STRIKE_ZOOM_STEP = 0.4;

/**
 * Clears whatever the previous shot left open, so the next one starts from an empty map centered on the stack.
 *
 * Purpose: While units are selected, a click on another hex plans an order instead of selecting. The order shots pan
 *   the map, so re-centering keeps every later shot's units on screen.
 * When to use: At the start of each shot that starts a new gesture.
 * Expected outcome: No selection, no open popup, the map centered on the player's stack, and the pointer parked in
 *   the top bar.
 * Exceptions: Throws a Playwright timeout when the selection panel stays open, and throws when the scenario has no
 *   stack.
 */
async function startGesture(page) {
  await clearSelection(page);
  await page.keyboard.press('Escape');
  await panMapToHex(page, humanStackHex(await readGameState(page)));
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
}

/**
 * Finds a hex that holds two or more of the player's units and no enemy.
 *
 * Purpose: The stack popup shots need such a hex. The rule is the one `selectHumanStack` uses.
 * When to use: With the current game state.
 * Expected outcome: The hex index.
 * Exceptions: Throws when the scenario has no such hex.
 */
function humanStackHex(state) {
  const countByHex = unitCountByHex(state.units);
  const stack = state.units.find((u) => u.player === 'human' && countByHex.get(u.h3Index) >= 2
    && state.units.every((other) => other.h3Index !== u.h3Index || other.player === 'human'));
  if (!stack) throw new Error('the scenario has no hex holding two or more human units and no enemy');
  return stack.h3Index;
}

/**
 * Asks the game for the route a march preview would draw, as hex indexes.
 *
 * Purpose: A march follows pathfinding, not a straight line, so only the game knows which hexes its line crosses.
 * When to use: Choosing a march destination for a picture. Calls the same preview the hover draws.
 * Expected outcome: The route's hexes from the unit's hex to the destination, or null when the march is not legal.
 * Exceptions: None; a failed preview is null.
 */
async function previewMarchRoute(page, unit, destination) {
  const points = await page.evaluate(async ({ unitId, hoveredH3Index }) => {
    const result = await window.gameApi.previewHumanMarchOrders({ unitIds: [unitId], hoveredH3Index });
    const preview = result?.validForAll ? result.previews?.[0]?.preview : null;
    return preview?.valid ? preview.segments.flatMap((segment) => segment.hexes) : null;
  }, { unitId: unit.id, hoveredH3Index: destination }).catch(() => null);
  if (!points) return null;
  const resolution = h3.getResolution(unit.h3Index);
  return [...new Set(points.map(([lat, lng]) => h3.latLngToCell(lat, lng, resolution)))];
}

/**
 * Chooses the unit and destination the movement shots march, with a route a picture can show clearly.
 *
 * Purpose: A route several hexes long, over hexes no unit token covers, reads as a route in the picture. A march into
 *   an empty home hex is always legal in the scenario, and one into empty land no other seat calls home is too.
 * When to use: For the movement shots, with the current game state.
 * Expected outcome: `{ unit, destination }`. Tries every lone land unit for an empty land hex four or three hexes off
 *   whose previewed route is legal and enters no occupied hex: first a home hex, then any hex outside the other
 *   seats' homes. Otherwise the unit `marchingUnit` picks marches to an empty home land hex one, or else two, hexes off.
 * Exceptions: Throws when the player has no lone land unit or no destination is found.
 */
async function marchPlan(page, state) {
  const homes = state.homeRegionHexesBySeat || {};
  const humanId = (state.seats || []).find((seat) => seat.kind === 'human' && seat.outTurn == null)?.seatId;
  const home = new Set(humanId ? homes[humanId] || [] : []);
  const otherHomes = new Set(Object.entries(homes).filter(([seatId]) => seatId !== humanId).flatMap(([, hexes]) => hexes));
  const occupied = new Set(state.units.map((u) => u.h3Index));
  const kindByHex = new Map(state.hexes.map((hex) => [hex.h3Index, hex.terrainKind]));
  const empty = (hex) => !occupied.has(hex) && kindByHex.has(hex) && kindByHex.get(hex) !== 'water';
  const units = [...loneHumanUnits(state.units, 'infantry'), ...loneHumanUnits(state.units, 'armor')];
  for (const allowed of [(hex) => home.has(hex), (hex) => !otherHomes.has(hex)]) {
    for (const distance of [4, 3]) {
      for (const unit of units) {
        for (const destination of hexRing(unit.h3Index, distance).filter((hex) => empty(hex) && allowed(hex))) {
          const route = await previewMarchRoute(page, unit, destination);
          if (route && route.slice(1).every((hex) => !occupied.has(hex))) return { unit, destination };
        }
      }
    }
  }
  const unit = marchingUnit(state);
  for (const distance of [1, 2]) {
    const destination = hexRing(unit.h3Index, distance).find((hex) => empty(hex) && home.has(hex));
    if (destination) return { unit, destination };
  }
  throw new Error('no empty land hex the unit can march to');
}

/**
 * Chooses a lone air unit and an enemy-held hex it can strike, for the air strike shot.
 *
 * Purpose: The air strike picture shows the strike line, so it needs a target the chosen target type accepts.
 * When to use: For the air strike shot, with the current game state.
 * Expected outcome: `{ unit, targetHex, targetType }`. Prefers a target three or two hexes off whose straight line
 *   crosses no other unit: an enemy unit (`units`), or else an empty enemy home hex with urban cells (`urban`, which
 *   the list calls Production). Otherwise any enemy unit within `AIR_STRIKE_RANGE_HEXES`. `targetHex` is null when
 *   none is in range, and `targetType` is then `units`.
 * Exceptions: Throws when the player has no lone air unit.
 */
function airStrikeAim(state) {
  const airUnits = loneHumanUnits(state.units, 'air');
  if (airUnits.length === 0) throw new Error('the scenario has no lone air unit');
  const occupied = new Set(state.units.map((u) => u.h3Index));
  const enemyHexes = new Set(state.units.filter((u) => u.player !== 'human').map((u) => u.h3Index));
  const homes = state.homeRegionHexesBySeat || {};
  const enemyHome = new Set(Object.entries(homes).filter(([seatId]) => seatId !== 'human').flatMap(([, hexes]) => hexes));
  const urbanHexes = new Set((state.strategicInfrastructure || []).filter((row) => row.urbanHexCount > 0).map((row) => row.h3Index));
  const choices = [
    { targetType: 'units', accept: (hex) => enemyHexes.has(hex) },
    { targetType: 'urban', accept: (hex) => enemyHome.has(hex) && urbanHexes.has(hex) && !occupied.has(hex) },
  ];
  for (const { targetType, accept } of choices) {
    for (const unit of airUnits) {
      const targetHex = farthestClearHex({ fromHex: unit.h3Index, distances: [3, 2], accept, blocked: (hex) => occupied.has(hex) });
      if (targetHex) return { unit, targetHex, targetType };
    }
  }
  for (const unit of airUnits) {
    for (const distance of [1, 2, 3]) {
      const targetHex = hexRing(unit.h3Index, distance).find((hex) => enemyHexes.has(hex));
      if (targetHex) return { unit, targetHex, targetType: 'units' };
    }
  }
  return { unit: airUnits[0], targetHex: null, targetType: 'units' };
}

/**
 * Moves the map so an order line sits just above the selection panel, then reads both ends' screen points.
 *
 * Purpose: The order pictures crop the panel and the line together. Keeping the line next to the panel keeps the crop
 *   tight and keeps the line clear of the panel.
 * When to use: After the unit is selected (the panel is open) and before hovering the line's far end.
 * Expected outcome: `{ from, to }` client points of the two hex centers after the pan.
 * Exceptions: Throws when the panel is not visible.
 */
async function placeLineAbovePanel(page, fromHex, toHex) {
  await panMidpointTo(page, fromHex, toHex, await pointAbove(page, '#selection-panel', LINE_RISE_PX));
  return { from: await hexClientPoint(page, fromHex), to: await hexClientPoint(page, toHex) };
}

/**
 * Chooses the unit the movement shots march when no unit has a long clear route.
 *
 * Purpose: The ranged shots use the first lone armor, so the march uses another unit when it can.
 * When to use: By `marchPlan`, with the current game state.
 * Expected outcome: The first lone infantry, or else the last lone armor. That is the first lone armor only when it is
 *   the only lone land unit.
 * Exceptions: Throws when the player has no lone land unit.
 */
function marchingUnit(state) {
  const infantry = loneHumanUnits(state.units, 'infantry');
  const armor = loneHumanUnits(state.units, 'armor');
  const unit = infantry[0] ?? armor[armor.length - 1];
  if (!unit) throw new Error('the scenario has no lone land unit');
  return unit;
}

/**
 * Takes the two stack popup shots: the popup as it opens, then with Shift held.
 *
 * Purpose: The guide pairs a plain click with Shift, which shows both + All and - All.
 * When to use: Once, after the map has loaded.
 * Expected outcome: `stack-select-1.png` and `stack-select-2.png`. Shift is released afterwards even when a shot fails.
 * Exceptions: None; a failed shot is a `SKIP`.
 */
async function writeStackShots(page, report) {
  const shared = {};
  await runShot(report, 'stack-select-1.png', async () => {
    await startGesture(page);
    const hex = humanStackHex(await readGameState(page));
    shared.point = await hexClientPoint(page, hex);
    await page.mouse.click(shared.point.x, shared.point.y);
    await page.waitForSelector('#stack-callout:not(.hidden)', { timeout: 8000 });
    await parkPointer(page);
    await page.waitForTimeout(SETTLE_MS.click);
    return page.screenshot({ clip: await clipAround(page, { selectors: ['#stack-callout'], points: [shared.point], pad: 24, viewport: MATCH_VIEWPORT }) });
  });
  await runShot(report, 'stack-select-2.png', async () => {
    if (!shared.point) throw new Error('the stack popup did not open');
    try {
      await page.keyboard.down('Shift');
      await page.waitForFunction(() => {
        const labels = [...document.querySelectorAll('#stack-callout .stack-callout-actions button')].map((button) => button.textContent.trim());
        return labels.includes('+ All') && labels.includes('- All');
      }, null, { timeout: 8000 });
      await page.waitForTimeout(SETTLE_MS.click);
      return await page.screenshot({ clip: await clipAround(page, { selectors: ['#stack-callout'], points: [shared.point], pad: 24, viewport: MATCH_VIEWPORT }) });
    } finally {
      await page.keyboard.up('Shift');
    }
  });
  await startGesture(page);
}

/**
 * Takes the two movement shots: a hovered route, then the queued order.
 *
 * Purpose: The guide's Planning Movement steps.
 * When to use: Once, after the aiming shots. Marches the unit `marchPlan` chooses.
 * Expected outcome: `movement-planning-1.png` and `movement-planning-2.png`. The march is cancelled afterwards, so its
 *   line is not in later pictures; a failed cancel prints a `NOTE`.
 * Exceptions: None; a failed shot is a `SKIP`.
 */
async function writeMovementShots(page, report) {
  const shared = {};
  await runShot(report, 'movement-planning-1.png', async () => {
    await startGesture(page);
    const state = await readGameState(page);
    const { unit, destination } = await marchPlan(page, state);
    shared.fromHex = unit.h3Index;
    shared.destination = destination;
    await selectUnitInItsHex(page, unit);
    const ends = await placeLineAbovePanel(page, shared.fromHex, shared.destination);
    shared.point = ends.to;
    await page.mouse.move(ends.to.x, ends.to.y);
    await page.waitForTimeout(SETTLE_MS.tip);
    return page.screenshot({ clip: await clipAround(page, { selectors: ['#selection-panel'], points: [ends.from, ends.to], pad: 40, viewport: MATCH_VIEWPORT }) });
  });
  await runShot(report, 'movement-planning-2.png', async () => {
    if (!shared.point) throw new Error('no route was planned');
    await page.mouse.dblclick(shared.point.x, shared.point.y);
    await page.waitForFunction(() => document.getElementById('pending-orders-count')?.textContent === '1', null, { timeout: 8000 });
    await parkPointer(page);
    const listBox = await page.locator('#pending-orders-list').first().boundingBox();
    if (!listBox) throw new Error('#pending-orders-list is not visible');
    await panMidpointTo(page, shared.fromHex, shared.destination, { x: listBox.x - 260, y: listBox.y + 160 });
    await page.waitForTimeout(SETTLE_MS.click);
    const from = await hexClientPoint(page, shared.fromHex);
    const to = await hexClientPoint(page, shared.destination);
    try {
      return await page.screenshot({ clip: await clipAround(page, { selectors: ['#pending-orders-list'], points: [from, to], pad: 40, viewport: MATCH_VIEWPORT }) });
    } finally {
      await page.click('#pending-orders-list .console-order-cancel', { timeout: 8000 })
        .then(() => page.waitForFunction(() => document.getElementById('pending-orders-count')?.textContent === '0', null, { timeout: 8000 }))
        .catch((err) => console.log(`NOTE queued march was not cancelled: ${err.message}`));
    }
  });
  await startGesture(page);
}

/**
 * Takes the first ranged attack shot and the air strike shot.
 *
 * Purpose: The guide's Ranged Attacks and Air Strikes section shows the reticle's tip, and the strike target list with
 *   the strike line to a hovered enemy when one is in range.
 * When to use: Once, after the stack shots.
 * Expected outcome: `ranged-attack-1.png` and `air-strike.png`, with aiming stopped, the target list back on Enemy
 *   Units, and the order zoom restored afterwards. The air strike shot zooms in by `AIR_STRIKE_ZOOM_STEP`.
 * Exceptions: None; a failed shot is a `SKIP`.
 */
async function writeAimingShots(page, report) {
  await runShot(report, 'ranged-attack-1.png', async () => {
    await startGesture(page);
    const unit = loneHumanUnits((await readGameState(page)).units, 'armor')[0];
    if (!unit) throw new Error('the scenario has no lone armor');
    await selectUnitInItsHex(page, unit);
    const point = await hexClientPoint(page, unit.h3Index);
    await page.hover('#ranged-attack-btn');
    await page.waitForTimeout(SETTLE_MS.tip);
    await page.waitForSelector('#control-tooltip:not(.hidden)', { timeout: 8000 });
    return page.screenshot({ clip: await clipAround(page, { selectors: ['#selection-panel', '#control-tooltip'], points: [point], pad: 24, viewport: MATCH_VIEWPORT }) });
  });
  await runShot(report, 'air-strike.png', async () => {
    await startGesture(page);
    const { unit, targetHex, targetType } = airStrikeAim(await readGameState(page));
    console.log(`NOTE air strike target type: ${targetType}`);
    const orderZoom = await readMapZoom(page);
    let aiming = false;
    try {
      await setMapZoom(page, orderZoom + AIR_STRIKE_ZOOM_STEP);
      await panMapToHex(page, unit.h3Index);
      await selectUnitInItsHex(page, unit);
      await page.click('#ranged-attack-btn');
      aiming = true;
      await page.selectOption('#air-strike-target-type', targetType);
      if (!targetHex) {
        await parkPointer(page);
        await page.waitForTimeout(SETTLE_MS.click);
        const point = await hexClientPoint(page, unit.h3Index);
        return await page.screenshot({ clip: await clipAround(page, { selectors: ['#selection-panel', '#air-strike-target-type'], points: [point], pad: 160, viewport: MATCH_VIEWPORT }) });
      }
      const ends = await placeLineAbovePanel(page, unit.h3Index, targetHex);
      await page.mouse.move(ends.to.x, ends.to.y);
      await page.waitForTimeout(SETTLE_MS.tip);
      return await page.screenshot({ clip: await clipAround(page, { selectors: ['#selection-panel', '#air-strike-target-type'], points: [ends.from, ends.to], pad: 40, viewport: MATCH_VIEWPORT }) });
    } finally {
      if (aiming) {
        await page.selectOption('#air-strike-target-type', 'units').catch(() => undefined);
        await page.click('#ranged-attack-btn');
      }
      await setMapZoom(page, orderZoom);
    }
  });
  await startGesture(page);
}

/**
 * Takes the game menu shot and the load confirm shot.
 *
 * Purpose: The guide's Saving and Loading section. Save and Load open the operating system's file dialogs, which
 *   the run never opens: Load is cancelled at the in-app confirm.
 * When to use: Once, after the movement shots, while a match is in progress.
 * Expected outcome: `save-load-menu.png` and `load-confirm.png`, with the menu and the dialog closed afterwards.
 * Exceptions: None; a failed shot is a `SKIP`.
 */
async function writeSaveLoadShots(page, report) {
  await runShot(report, 'save-load-menu.png', async () => {
    await page.click('#game-menu-btn');
    await page.waitForSelector('#game-menu', { state: 'visible', timeout: 8000 });
    await parkPointer(page);
    await page.waitForTimeout(SETTLE_MS.click);
    try {
      return await page.screenshot({ clip: await clipAround(page, { selectors: ['#game-menu-btn', '#game-menu'], pad: 8, viewport: MATCH_VIEWPORT }) });
    } finally {
      await page.keyboard.press('Escape');
      await page.waitForSelector('#game-menu', { state: 'hidden', timeout: 8000 });
    }
  });
  await runShot(report, 'load-confirm.png', async () => {
    await page.click('#game-menu-btn');
    await page.waitForSelector('#game-menu', { state: 'visible', timeout: 8000 });
    await page.click('#game-menu-load-btn');
    await page.waitForSelector('#load-confirm-dialog:not(.hidden)', { timeout: 8000 });
    await parkPointer(page);
    await page.waitForTimeout(SETTLE_MS.click);
    try {
      return await page.screenshot({ clip: await clipAround(page, { selectors: ['#load-confirm-dialog .game-over-box'], pad: 16, viewport: MATCH_VIEWPORT }) });
    } finally {
      await page.click('#load-confirm-no');
      await page.waitForSelector('#load-confirm-dialog.hidden', { state: 'attached', timeout: 8000 });
    }
  });
}

/**
 * Starts the scenario match and takes every first-session shot.
 *
 * Purpose: The first half of the `match` group.
 * When to use: While the new-game overlay is open on the Global tab.
 * Expected outcome: The map is centered on the player's stack and zoomed in by `ORDER_ZOOM_STEP`, then one `WROTE` or
 *   `SKIP` line is printed per image in `ORDER_SHOTS`. Returns the game state read at the end,
 *   which the second session's saved-match edit needs. The app stays open.
 * Exceptions: Throws when the match does not start or the window cannot be sized.
 */
async function writeOrderShots(app, page, report) {
  await startScenarioMatch(page);
  if (!(await setViewport(app, page, MATCH_VIEWPORT))) throw new Error('the window did not take the match size');
  await page.waitForTimeout(SETTLE_MS.resize);
  await captureMainMap(page);
  try {
    await panMapToHex(page, humanStackHex(await readGameState(page)));
    await setMapZoom(page, (await readMapZoom(page)) + ORDER_ZOOM_STEP);
    await waitForMapTiles(page);
  } catch (err) {
    for (const fileName of ORDER_SHOTS) skipShot(report, fileName, err.message);
    return readGameState(page);
  }
  await writeStackShots(page, report);
  await writeAimingShots(page, report);
  await writeMovementShots(page, report);
  await writeSaveLoadShots(page, report);
  return readGameState(page);
}

module.exports = {
  writeOrderShots,
};
