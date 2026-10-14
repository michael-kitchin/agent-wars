/**
 * Map actions for the UI smoke run: find the hexes of the fixed scenario, and click them the way a player would.
 *
 * Purpose: Scenes that need a selection or a queued order must click real units on the map. Units are drawn on a
 *   canvas, so the runner works out where a hex is from the game state and the main Leaflet map.
 * When to use: From `ui-smoke.cjs`, after the scenario match has started.
 * Expected outcome: Each action waits until the page shows its result, or throws an error naming what was missing.
 * Exceptions: Throws when the main map cannot be found, or when the scenario has no hex the action needs.
 */
'use strict';

const h3 = require('h3-js');

/**
 * Name of the page global that holds the main Leaflet map after `captureMainMap`.
 *
 * Purpose: Leaflet keeps no list of its maps, so the smoke run keeps its own handle. The app never reads it.
 * When to use: Only inside this file's `page.evaluate` calls.
 * Expected outcome: Set once per run.
 * Exceptions: None.
 */
const MAP_HANDLE = '__uiSmokeMainMap';

/**
 * How long each map action may take, in milliseconds.
 *
 * Purpose: Selection uses a short deferred timer, a march order makes a round trip to the main process, and a battle
 *   builds its own map when it opens.
 * When to use: `settle` after a click, `order` while waiting for a selection or a queued order to appear, `capture`
 *   while finding the main map, and `battle` while a battle opens.
 * Expected outcome: Generous fixed limits; the waits end as soon as the page shows the result.
 * Exceptions: None.
 */
const MAP_WAIT_MS = Object.freeze({ settle: 700, order: 8000, capture: 300, battle: 60000 });

/**
 * The unit types that march over land, in the order the smoke run tries them.
 *
 * Purpose: Marches and battles use land units; armor comes first because the scenario's lone armor unit is the
 *   one the first march scene moves.
 * When to use: The default unit types of `queueLoneUnitMarch`, and choosing the battle's units.
 * Expected outcome: Armor, then infantry.
 * Exceptions: None.
 */
const LAND_UNIT_TYPES = Object.freeze(['armor', 'infantry']);

/**
 * How many mouse-wheel notches the run may zoom in to reveal a battle marker.
 *
 * Purpose: Battle markers show only when the map is zoomed in past its starting zoom.
 * When to use: Only by `enterBattleAt`.
 * Expected outcome: Enough notches for the marker at any window size the run uses.
 * Exceptions: None.
 */
const MAX_BATTLE_ZOOM_NOTCHES = 6;

/**
 * Finds the main Leaflet map and keeps a handle to it in the page.
 *
 * Purpose: Turning a hex into a window point needs the map's projection.
 * When to use: Once, after the match has started and before any other action in this file.
 * Expected outcome: The handle is set. Leaflet map methods are wrapped only for the moment it takes to see which
 *   map answers for `#main-map`, then restored.
 * Exceptions: Throws when no map answers for `#main-map`.
 */
async function captureMainMap(page) {
  const found = await page.evaluate(async ({ handle, waitMs }) => {
    const proto = window.L.Map.prototype;
    const names = ['latLngToContainerPoint', 'containerPointToLatLng', 'mouseEventToContainerPoint', 'getZoom', 'getBounds', 'getContainer', 'getSize'];
    const originals = new Map(names.map((name) => [name, proto[name]]));
    const seen = new Set();
    for (const name of names) {
      const original = originals.get(name);
      proto[name] = function wrapped(...args) {
        seen.add(this);
        return original.apply(this, args);
      };
    }
    try {
      // Any redraw or hover asks the map for its projection; a pointer move over the map causes both.
      const mapEl = document.getElementById('main-map');
      const box = mapEl.getBoundingClientRect();
      mapEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }));
      window.dispatchEvent(new Event('resize'));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } finally {
      for (const name of names) proto[name] = originals.get(name);
    }
    const main = [...seen].find((map) => map.getContainer().id === 'main-map');
    if (main) window[handle] = main;
    return Boolean(main);
  }, { handle: MAP_HANDLE, waitMs: MAP_WAIT_MS.capture });
  if (!found) throw new Error('the main Leaflet map did not answer for #main-map');
}

/**
 * Returns the window point at the center of a hex.
 *
 * Purpose: Units are drawn at their hex's center, so a click there hits the unit.
 * When to use: After `captureMainMap`.
 * Expected outcome: `{ x, y }` in CSS pixels of the window.
 * Exceptions: Throws when the hex index is not valid.
 */
async function hexClientPoint(page, h3Index) {
  const [lat, lng] = h3.cellToLatLng(h3Index);
  return page.evaluate(({ handle, latLng }) => {
    const map = window[handle];
    const point = map.latLngToContainerPoint(latLng);
    const box = map.getContainer().getBoundingClientRect();
    return { x: box.x + point.x, y: box.y + point.y };
  }, { handle: MAP_HANDLE, latLng: [lat, lng] });
}

/**
 * Reads the game state the renderer reads.
 *
 * Purpose: The scenario's units and hexes come from the running match, not from fixed numbers.
 * When to use: Before choosing which hex to click.
 * Expected outcome: The same snapshot `window.gameApi.getGameState()` returns.
 * Exceptions: Propagates IPC errors.
 */
async function readGameState(page) {
  return page.evaluate(() => window.gameApi.getGameState());
}

/**
 * Counts every unit, of either side, in each hex.
 *
 * Purpose: A click on a hex with one unit selects it; a click on a hex with more opens the unit list.
 * When to use: Choosing which hex to click, on the world map or in a battle.
 * Expected outcome: A map from hex index to unit count.
 * Exceptions: None.
 */
function unitCountByHex(units) {
  const countByHex = new Map();
  for (const unit of units) countByHex.set(unit.h3Index, (countByHex.get(unit.h3Index) || 0) + 1);
  return countByHex;
}

/**
 * Lists the player's units that stand alone in their hex, of the given types, in type order.
 *
 * Purpose: A plain click on such a hex selects that unit without opening the unit list.
 * When to use: Before selecting a lone unit, on the world map or in a battle. Pass one type or a list.
 * Expected outcome: Every unit of the first type, then of the next, each in the units' own order.
 * Exceptions: None; the list may be empty.
 */
function loneHumanUnits(units, unitTypes) {
  const countByHex = unitCountByHex(units);
  return [].concat(unitTypes).flatMap((unitType) => units.filter((u) => u.player === 'human' && u.unitType === unitType && countByHex.get(u.h3Index) === 1));
}

/**
 * Finds the player's first unit that stands alone in its hex, of the given types.
 *
 * Purpose: Scenes that need one selected unit start from such a unit.
 * When to use: Before `selectLoneUnit`.
 * Expected outcome: The first unit `loneHumanUnits` lists.
 * Exceptions: Throws when there is none.
 */
function loneHumanUnit(units, unitTypes) {
  const unit = loneHumanUnits(units, unitTypes)[0];
  if (!unit) throw new Error(`no hex holds a single human unit of type ${[].concat(unitTypes).join(' or ')}`);
  return unit;
}

/**
 * Waits until the selection panel lists exactly these units.
 *
 * Purpose: Each selection action ends when the panel shows its result.
 * When to use: After a click that changes the selection.
 * Expected outcome: Resolves once the panel's rows are these unit ids, in any order.
 * Exceptions: Throws a Playwright timeout when the panel does not show them.
 */
async function waitForSelectedUnits(page, unitIds) {
  await page.waitForFunction((expected) => {
    const rows = [...document.querySelectorAll('#selection-panel-units .selection-panel-unit')].map((row) => row.dataset.unitId);
    return rows.length === expected.length && expected.every((id) => rows.includes(id));
  }, unitIds, { timeout: MAP_WAIT_MS.order });
  await page.waitForTimeout(MAP_WAIT_MS.settle);
}

/**
 * Clears the selection with the selection panel's ×, when anything is selected.
 *
 * Purpose: While units are selected, a click on another hex plans an order instead of selecting, so every
 *   selection action starts from an empty selection.
 * When to use: At the start of each selection action.
 * Expected outcome: The selection panel is hidden.
 * Exceptions: Throws a Playwright timeout when the panel stays open.
 */
async function clearSelection(page) {
  if (await page.isVisible('#selection-panel')) await page.click('#selection-panel-close');
  await page.waitForSelector('#selection-panel', { state: 'hidden', timeout: MAP_WAIT_MS.order });
}

/**
 * Clicks a lone unit's hex and waits until it is the only selected unit.
 *
 * Purpose: Starts every scene that needs one selected unit.
 * When to use: After `captureMainMap`.
 * Expected outcome: The selection panel lists only that unit. Returns the unit's hex.
 * Exceptions: Throws when the scenario has no such unit, or the selection does not appear.
 */
async function selectLoneUnit(page, state, unitType) {
  const unit = loneHumanUnit(state.units, unitType);
  await selectUnitInItsHex(page, unit);
  return unit.h3Index;
}

/**
 * Clicks a unit that stands alone in its hex and waits until it is the only selected unit.
 *
 * Purpose: World-map units and battle units are selected the same way.
 * When to use: For a unit `loneHumanUnits` returned.
 * Expected outcome: The selection panel lists only that unit.
 * Exceptions: Throws a Playwright timeout when the selection does not appear.
 */
async function selectUnitInItsHex(page, unit) {
  await clearSelection(page);
  const point = await hexClientPoint(page, unit.h3Index);
  await page.mouse.click(point.x, point.y);
  await waitForSelectedUnits(page, [unit.id]);
}

/**
 * Clicks a hex that holds two or more of the player's units and no enemy, and selects them all from the unit list.
 *
 * Purpose: Gives the selection panel several units in one hex.
 * When to use: After `captureMainMap`.
 * Expected outcome: Every unit in that hex is selected and the unit list is closed again.
 * Exceptions: Throws when the scenario has no such hex, or the list or the selection does not appear.
 */
async function selectHumanStack(page) {
  const state = await readGameState(page);
  const countByHex = unitCountByHex(state.units);
  const stack = state.units.find((u) => u.player === 'human' && countByHex.get(u.h3Index) >= 2
    && state.units.every((other) => other.h3Index !== u.h3Index || other.player === 'human'));
  if (!stack) throw new Error('the scenario has no hex holding two or more human units and no enemy');
  const unitIds = state.units.filter((u) => u.h3Index === stack.h3Index).map((u) => u.id);
  await clearSelection(page);
  const point = await hexClientPoint(page, stack.h3Index);
  await page.mouse.click(point.x, point.y);
  await page.waitForSelector('#stack-callout:not(.hidden)', { timeout: MAP_WAIT_MS.order });
  await page.click('#stack-callout .stack-callout-actions button:not(.stack-close-btn)');
  await waitForSelectedUnits(page, unitIds);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#stack-callout.hidden', { state: 'attached', timeout: MAP_WAIT_MS.order });
}

/**
 * Lists empty neighbors of a hex inside the player's home region, land first.
 *
 * Purpose: A march into an empty home hex next door is always a legal short order in the scenario.
 * When to use: Choosing where to send a selected land unit.
 * Expected outcome: Neighbor indexes that hold no unit, are in the human home region, and are not water.
 * Exceptions: None.
 */
function marchDestinations(state, fromHex) {
  const home = new Set(state.humanHomeRegionHexes || []);
  const occupied = new Set(state.units.map((u) => u.h3Index));
  const kindByHex = new Map(state.hexes.map((hex) => [hex.h3Index, hex.terrainKind]));
  return h3.gridDisk(fromHex, 1).filter((hex) => hex !== fromHex && home.has(hex) && !occupied.has(hex) && kindByHex.get(hex) !== 'water');
}

/**
 * Selects a unit and double-clicks each destination in turn until the Movement group counts one order.
 *
 * Purpose: World-map and battle marches are queued the same way; a destination the rules refuse is skipped.
 * When to use: While nothing is queued in the Movement group, after `captureMainMap`.
 * Expected outcome: True once the Movement count reads 1; false when no destination took the order.
 * Exceptions: Throws a Playwright timeout when the unit cannot be selected.
 */
async function queueMarchToFirstFree(page, unit, destinations) {
  for (const destination of destinations) {
    await selectUnitInItsHex(page, unit);
    const point = await hexClientPoint(page, destination);
    await page.mouse.dblclick(point.x, point.y);
    const queued = await page.waitForFunction(() => document.getElementById('pending-orders-count')?.textContent === '1', null, { timeout: MAP_WAIT_MS.order })
      .then(() => true, () => false);
    if (queued) return true;
  }
  return false;
}

/**
 * Queues a one-hex march with the first lone land unit that can make one.
 *
 * Purpose: Gives the Orders tab one movement row to show, at the start of the match or after a played turn.
 * When to use: After `captureMainMap`, while nothing is queued. Armor is tried first, then infantry.
 * Expected outcome: The Movement count reads 1. Returns the unit.
 * Exceptions: Throws when no lone land unit has a neighbor that takes the order.
 */
async function queueLoneUnitMarch(page, unitTypes = LAND_UNIT_TYPES) {
  const state = await readGameState(page);
  for (const unit of loneHumanUnits(state.units, unitTypes)) {
    if (await queueMarchToFirstFree(page, unit, marchDestinations(state, unit.h3Index))) return unit;
  }
  throw new Error('no lone land unit could queue a one-hex march');
}

/**
 * Reads the active battle from the game state.
 *
 * Purpose: Battle units are drawn on a canvas, so the run finds them through the battle's own record.
 * When to use: While a battle is open.
 * Expected outcome: The battle record, with `subUnits` and `tacticalChildH3Indexes`, or null outside a battle.
 * Exceptions: Propagates IPC errors.
 */
async function readBattle(page) {
  return page.evaluate(() => window.gameApi.getGameState().then((state) => state.tacticalBattleSession || null));
}

/**
 * Zooms the map in on a hex until its battle marker shows, then opens the battle.
 *
 * Purpose: A player starts a battle from the marker on a hex both sides hold; the marker shows only when zoomed in.
 * When to use: During world-map planning, on a hex that holds units of both sides, after `captureMainMap`.
 * Expected outcome: The battle header's status line starts with "Beat 1 · Tactical planning".
 * Exceptions: Throws when the marker never shows or the battle does not open within a minute.
 */
async function enterBattleAt(page, h3Index) {
  const marker = `#tactical-entry-layer .tactical-entry-btn[data-h3-index="${h3Index}"]`;
  for (let notch = 0; notch < MAX_BATTLE_ZOOM_NOTCHES && !(await page.isVisible(marker)); notch += 1) {
    const point = await hexClientPoint(page, h3Index);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(MAP_WAIT_MS.settle);
  }
  await page.click(marker);
  await page.waitForFunction(() => (document.getElementById('battle-header-status')?.textContent || '').startsWith('Beat 1 · Tactical planning'), null, { timeout: MAP_WAIT_MS.battle });
  await page.waitForTimeout(MAP_WAIT_MS.settle);
}

/**
 * Selects one of the player's battle units that stands alone in its cell, infantry first.
 *
 * Purpose: Battle scenes check the selection and a battle march for one unit.
 * When to use: While a battle is in planning, after `enterBattleAt`.
 * Expected outcome: The unit is the only selected unit. Returns it.
 * Exceptions: Throws when no battle unit of the player stands alone.
 */
async function selectLoneBattleUnit(page) {
  const battle = await readBattle(page);
  const unit = loneHumanUnit(battle.subUnits, ['infantry', ...LAND_UNIT_TYPES]);
  await selectUnitInItsHex(page, unit);
  return unit;
}

/**
 * Queues a one-cell battle march for a battle unit.
 *
 * Purpose: Gives the Orders tab a battle row to show.
 * When to use: While a battle is in planning and nothing is queued.
 * Expected outcome: The Movement count reads 1.
 * Exceptions: Throws when no neighboring cell takes the order.
 */
async function queueBattleMarch(page, unit) {
  const battle = await readBattle(page);
  const cells = new Set(battle.tacticalChildH3Indexes);
  const occupied = new Set(battle.subUnits.map((u) => u.h3Index));
  const kindByCell = battle.tacticalTerrainKindByH3 || {};
  const destinations = h3.gridDisk(unit.h3Index, 1)
    .filter((cell) => cell !== unit.h3Index && cells.has(cell) && !occupied.has(cell) && kindByCell[cell] !== 'water');
  if (!(await queueMarchToFirstFree(page, unit, destinations))) throw new Error('no neighboring cell took a battle march');
}

/**
 * Works out the saved-match change that gives the reopened match a hex both sides hold.
 *
 * Purpose: A battle starts only on such a hex, and play cannot make one on cue. The change moves every enemy land unit
 *   into the hex where the player has the most land units, so the battle's first beat usually has fighting to report.
 * When to use: With the game state read just before the app closes; pass the result to `editSavedMatch`.
 * Expected outcome: `{ h3Index, statements }`, where `h3Index` is the hex that will hold both sides.
 * Exceptions: Throws when either side has no land unit left.
 */
function contestedHexEdit(state) {
  const isLand = (u) => LAND_UNIT_TYPES.includes(u.unitType);
  const landCountByHex = unitCountByHex(state.units.filter((u) => u.player === 'human' && isLand(u)));
  const [h3Index] = [...landCountByHex.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best), [null, 0]);
  const enemies = state.units.filter((u) => u.player !== 'human' && isLand(u));
  if (!h3Index || enemies.length === 0) throw new Error('a battle needs a land unit on each side');
  return { h3Index, statements: enemies.map((enemy) => ({ sql: 'UPDATE units SET h3_index = ? WHERE id = ?', params: [h3Index, enemy.id] })) };
}

/**
 * Drags the selection panel's resize grip by an offset and lets go.
 *
 * Purpose: Exercises the grip the way a player would, including its size limits.
 * When to use: While the selection panel is shown. Keep the end point inside the window.
 * Expected outcome: The panel takes the dragged size, held inside its limits.
 * Exceptions: Throws when the grip is not on screen.
 */
async function dragSelectionPanelGrip(page, dx, dy) {
  const box = await page.locator('#selection-panel-grip').boundingBox();
  if (!box) throw new Error('the selection panel grip is not on screen');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(MAP_WAIT_MS.settle);
}

module.exports = {
  LAND_UNIT_TYPES,
  captureMainMap,
  contestedHexEdit,
  enterBattleAt,
  queueBattleMarch,
  selectLoneBattleUnit,
  dragSelectionPanelGrip,
  readGameState,
  selectLoneUnit,
  selectHumanStack,
  queueLoneUnitMarch,
};
