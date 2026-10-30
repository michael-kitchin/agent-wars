/**
 * UI smoke run: starts the built app in Electron, plays fixed scenarios over three sessions, and records screenshots
 * plus layout checks. The first three sessions play one global match, reopen it for a battle, and reopen the regional
 * match that follows as lost. A later pass, on the same folder, records several sides, a knockout, standings, and Observe.
 *
 * Purpose: Lets a layout change be verified the same way every time, with a report a reviewer can read and
 *   screenshots a person can compare.
 * When to use: `npm run ui:smoke` (it builds first). Pass `-- --label <name>` to choose the output folder.
 * Expected outcome: Writes `.test/ui-smoke/<label>/` with numbered PNG files and `report.json`, prints one line per
 *   check, and exits 0 only when no check failed and the page threw no uncaught error.
 * Exceptions: Exits 1 when the app cannot start, the scenario cannot be set up, or a check fails.
 *
 * The run uses a fresh, temporary Electron user-data folder (`AGENT_WARS_USER_DATA_DIR`), so it never reads or
 * changes the player's saved match, API key, or model choice, and it never calls a model. The first three sessions
 * share that folder: the first plays a new global match, the second reopens it with a hex both sides hold, plays the
 * first beat of a battle there, hides the new-game choices, and starts a regional match from the header button, and
 * the third reopens that match after the run marks it as lost. The later pass starts further matches in the same folder.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { SCENES, probePage, probeSelectors, runChecks } = require('./ui-smoke-checks.cjs');
const { NEW_GAME_MOVE, SETTLE_MS } = require('./ui-smoke-scenes.cjs');
const { chooseRegionalScenario, clickStartGame, openNewGameOverlay, startScenarioMatch, waitForNewGameOverlay } = require('./ui-smoke-new-game.cjs');
const { runMultiCommanderScenes } = require('./ui-smoke-multi.cjs');
const {
  LAND_UNIT_TYPES,
  captureMainMap,
  contestedHexEdit,
  dragGrip,
  dragSelectionPanelGrip,
  enterBattleAt,
  queueBattleMarch,
  queueLoneUnitMarch,
  readGameState,
  selectHumanStack,
  selectLoneBattleUnit,
  selectLoneUnit,
} = require('./ui-smoke-map.cjs');
const { FINISHED_MATCH_EDIT, REPO_ROOT, editSavedMatch, launchApp } = require('./ui-smoke-session.cjs');

/**
 * Window sizes for the strategic scene, in CSS pixels.
 *
 * Purpose: The layout must hold at the common sizes and at the app's minimum window size.
 * When to use: The strategic scene runs once per size. Every other scene uses the first size.
 * Expected outcome: 1280 x 720, 1920 x 1080, then the 800 x 600 minimum.
 * Exceptions: None.
 */
const VIEWPORTS = Object.freeze([
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
  { w: 800, h: 600 },
]);

/**
 * The window size of the small-window scene: the app's minimum.
 *
 * Purpose: The console's contents, the selection panel, and the toast band must still fit there.
 * When to use: The small-window scene and the turn played after it.
 * Expected outcome: The last entry of `VIEWPORTS`.
 * Exceptions: None.
 */
const SMALL_WINDOW = VIEWPORTS[VIEWPORTS.length - 1];

/**
 * Reads `--label <name>` from the command line.
 *
 * Purpose: Keeps each run's output in its own folder, so an earlier run can be compared with a later one.
 * When to use: Once at start-up.
 * Expected outcome: The label, or `latest` when none is given. Only letters, digits, dots, dashes, and underscores are kept.
 * Exceptions: None.
 */
function readLabel(argv) {
  const index = argv.indexOf('--label');
  const raw = index >= 0 && argv[index + 1] ? argv[index + 1] : 'latest';
  const label = raw.replace(/[^A-Za-z0-9._-]/g, '');
  return label || 'latest';
}

/**
 * Sets the page to an exact CSS size and waits until the page reports it.
 *
 * Purpose: Screenshots and checks must describe the size they claim.
 * When to use: Before each sized scene.
 * Expected outcome: True when `innerWidth` and `innerHeight` match. Falls back to resizing the window's content
 *   area when viewport emulation does not take.
 * Exceptions: None; returns false when neither method reaches the size.
 */
async function setViewport(app, page, size) {
  const matches = async () => page.evaluate(([w, h]) => window.innerWidth === w && window.innerHeight === h, [size.w, size.h]);
  await page.setViewportSize({ width: size.w, height: size.h });
  await page.waitForTimeout(200);
  if (await matches()) return true;
  await app.evaluate(({ BrowserWindow }, s) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.setContentSize(s.w, s.h);
  }, size);
  await page.waitForTimeout(500);
  return matches();
}

/**
 * Moves the pointer to empty space in the top bar.
 *
 * Purpose: After a click the pointer would rest on a control, and that control's tip would show up in the next screenshot.
 * When to use: After each click in a scene, and after a scene that shows a tip.
 * Expected outcome: The pointer is over the top bar's spacer, or over the battle header's title while a battle is open.
 *   Neither has a tip or a click action.
 * Exceptions: Throws when neither is on screen.
 */
async function parkPointer(page) {
  const spacer = await page.locator('#app-topbar .topbar-spacer').boundingBox();
  const box = spacer ?? (await page.locator('#battle-header-place').boundingBox());
  if (!box) throw new Error('neither the top bar spacer nor the battle header title is on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * Probes, checks, and photographs the page for one scene.
 *
 * Purpose: Every scene produces the same three things.
 * When to use: After the scene's clicks or resize have settled.
 * Expected outcome: Appends the scene's results to `report.results` and writes `<NN>-<scene>.png`.
 * Exceptions: None from the checks; Playwright errors propagate to the caller.
 */
async function recordScene(page, report, outDir, sceneName) {
  const probe = await page.evaluate(probePage, probeSelectors());
  for (const result of runChecks(sceneName, probe)) report.results.push({ scene: sceneName, ...result });
  report.sceneCount += 1;
  const fileName = `${String(report.sceneCount).padStart(2, '0')}-${sceneName.replace('@', '-')}.png`;
  await page.screenshot({ path: path.join(outDir, fileName) });
  report.screenshots.push(fileName);
}

/**
 * Waits until world-map planning is open again after a turn plays, skipping any offered battle.
 *
 * Purpose: A played turn can offer the tactical battles list; the run never fights from it, so it chooses Ignore,
 *   which resolves the fight as a player's Ignore does.
 * When to use: After Ready on the world map, and after leaving a battle.
 * Expected outcome: The battle header is gone, the top bar reads a world-map planning line, and Ready can be clicked.
 * Exceptions: Throws a Playwright timeout when planning does not return within `SETTLE_MS.turn`.
 */
async function waitForWorldPlanning(page) {
  const battlesList = '[role="dialog"][aria-label="Tactical battles"]';
  const deadline = Date.now() + SETTLE_MS.turn;
  while (Date.now() < deadline) {
    // In a battle the date block is hidden but still names the world-map turn, so the battle header must be gone too.
    const planning = await page.evaluate(() => !document.getElementById('app-topbar')?.classList.contains('topbar-battle')
      && /^Turn \d+(?: of \d+)? · Planning$/.test(document.getElementById('topbar-turn-phase')?.textContent || '')
      && document.getElementById('ready-btn')?.disabled === false);
    if (planning) return;
    if (await page.isVisible(battlesList)) await page.click(`${battlesList} button:has-text("Ignore")`);
    await page.waitForTimeout(SETTLE_MS.click);
  }
  throw new Error('world-map planning did not return after the turn');
}

/**
 * Clicks the selection panel's expand control and waits for the panel to settle.
 *
 * Purpose: The panel slides between compact and expanded for 150 ms; the click wait is longer.
 * When to use: While the selection panel is shown.
 * Expected outcome: The panel has switched between compact and expanded, and the pointer is parked.
 * Exceptions: Propagates Playwright errors.
 */
async function toggleSelectionPanel(page) {
  await page.click('#selection-panel-expand');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
}

/**
 * Drags the selection panel's grip to the window's top-right corner.
 *
 * Purpose: The largest size a player can drag to must still fit inside the map.
 * When to use: While the selection panel is shown.
 * Expected outcome: The panel is as large as its limits and the map allow.
 * Exceptions: Throws when the grip is not on screen.
 */
async function dragSelectionPanelToCorner(page, size) {
  const box = await page.locator('#selection-panel-grip').boundingBox();
  if (!box) throw new Error('the selection panel grip is not on screen');
  await dragSelectionPanelGrip(page, size.w - 8 - (box.x + box.width / 2), 8 - (box.y + box.height / 2));
}

/**
 * Runs the first session: a new match, the frame scenes, the map views and the legend, the console scenes, the small
 * window, and one played turn.
 *
 * Purpose: The scene order is part of the contract with the checks. The match starts after the first scene. Scenes
 *   that select units or queue orders come after the frame scenes, so the frame screenshots show an untouched match.
 *   The session ends with one march queued, which the reopened match must still show.
 * When to use: Once, on a fresh user-data folder.
 * Expected outcome: One recorded scene per step below, in this order. Returns the game state at the end.
 * Exceptions: Propagates Playwright and scenario errors.
 */
async function runFirstSession(app, page, report, outDir) {
  const first = VIEWPORTS[0];
  if (!(await setViewport(app, page, first))) report.notes.push(`could not size the page to ${first.w}x${first.h}`);
  await waitForNewGameOverlay(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.newGameStartup);
  await page.click('#new-game-options-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.newGameOptions);
  await page.click('#new-game-options-btn');
  await parkPointer(page);
  // The game menu works on the new-game screen, with New game disabled there. Game Options is closed before Escape.
  await page.click('#game-menu-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.newGameMenu);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(SETTLE_MS.click);
  // Hiding the choices leaves the header bar, with Start in place of the message. Show them again, then move the
  // panel by its grip; the next open puts it back in the corner.
  await page.click('#new-game-dialog-collapse');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.newGameHidden);
  await page.click('#new-game-dialog-collapse');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await dragGrip(page, '#new-game-panel-grip', NEW_GAME_MOVE.x, NEW_GAME_MOVE.y);
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.newGameMoved);

  await startScenarioMatch(page);
  for (const size of VIEWPORTS) {
    if (!(await setViewport(app, page, size))) {
      report.results.push({ scene: `${SCENES.strategic}@${size.w}x${size.h}`, check: 'viewport-size', status: 'FAIL', detail: 'the page did not take this size' });
      continue;
    }
    await page.waitForTimeout(SETTLE_MS.resize);
    await recordScene(page, report, outDir, `${SCENES.strategic}@${size.w}x${size.h}`);
  }
  await setViewport(app, page, first);
  await page.waitForTimeout(SETTLE_MS.resize);

  await page.click('#console-tab-commanders');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.opponentTab);
  await page.click('#console-tab-orders');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);

  // Ready sits at the window's bottom-right corner, so its tip has to open up and to the left.
  await page.hover('#console-footer .control-tooltip-host');
  await page.waitForTimeout(SETTLE_MS.tip);
  await recordScene(page, report, outDir, SCENES.readyTip);
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);

  // Orders is the selected tab, so a click on it collapses the console to its rail; the console has no collapse button.
  await page.click('#console-tab-orders');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.consoleCollapsed);
  await page.click('#console-tab-orders');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.consoleExpandedAgain);

  await page.click('#game-menu-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.gameMenuOpen);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.gameMenuEscape);
  await page.click('#game-menu-btn');
  await page.waitForTimeout(SETTLE_MS.click);
  // Empty top-bar space is outside the menu, and a click there does nothing else.
  await page.click('#app-topbar .topbar-spacer');
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.gameMenuOutside);

  // Show the map-mode tabs from the toggle on the overview's corner; they start hidden and stay shown until the toggle
  // hides them in the small window below. Turn Tech on and record it with the weather icons still on, then turn it
  // off. Turn Weather off and record the map without weather icons, then turn it back on. Turn Control off and
  // Production on and record that, then put both back.
  await page.click('#map-mode-tabs-toggle');
  await page.click('#map-mode-tech');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.mapTech);
  await page.click('#map-mode-tech');
  await page.click('#map-mode-weather');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.mapWeatherOff);
  await page.click('#map-mode-weather');
  await page.click('#map-mode-control');
  await page.click('#map-mode-production');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.mapLayersSwapped);
  await page.click('#map-mode-control');
  await page.click('#map-mode-production');

  // Open the terrain legend beside the minimap panel and record it, then close it.
  await page.click('#map-legend-toggle');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.legendOpen);
  await page.click('#map-legend-toggle');

  // Queue a one-hex march with the lone armor unit, then select it again from its row in the Orders tab.
  await captureMainMap(page);
  await queueLoneUnitMarch(page);
  await page.click('#pending-orders-list .console-order-select');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.ordersQueued);

  // Aim a ranged attack with the armor unit from the reticle, record it, then click the reticle again to stop aiming.
  await page.click('#ranged-attack-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.rangedAiming);
  await page.click('#ranged-attack-btn');

  await page.click('#selection-panel-close');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.selectionCleared);

  await selectHumanStack(page);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.selectionStack);

  // Aim an air strike from the reticle and record it, then click the reticle again to stop aiming and record that.
  await selectLoneUnit(page, await readGameState(page), 'air');
  await page.click('#ranged-attack-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.strikeAiming);
  await page.click('#ranged-attack-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.strikeStopped);

  // Expand the panel on the stack and record it. It stays expanded for the rest of this session, so its grip shows.
  await selectHumanStack(page);
  await toggleSelectionPanel(page);
  await recordScene(page, report, outDir, SCENES.selectionExpanded);

  // Drag the grip far up and right, then far down and left: both ends stop at the panel's size limits.
  await dragSelectionPanelGrip(page, 800, -500);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.selectionResized);
  await dragSelectionPanelGrip(page, -600, 600);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.selectionResizedMin);

  // At the minimum window size, select the stack and drag the panel as large as it goes; it must stay on the map.
  await setViewport(app, page, SMALL_WINDOW);
  await page.waitForTimeout(SETTLE_MS.resize);
  await selectHumanStack(page);
  await dragSelectionPanelToCorner(page, SMALL_WINDOW);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.smallWindow);
  // Collapse the panel to its bar and record it, so it cannot cover the units that the march after the turn clicks. It
  // stays compact for the rest of this session.
  await toggleSelectionPanel(page);
  await recordScene(page, report, outDir, SCENES.selectionCollapsed);

  // At the minimum size the legend opens beside the minimap panel only if it fits, and under it otherwise. Close the
  // selection panel first so it cannot cover the legend.
  await page.click('#selection-panel-close');
  await page.click('#map-legend-toggle');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.legendSmallWindow);
  // Hide the tabs with the legend still open: the legend closes with them. The tabs stay hidden for the rest of the run.
  await page.click('#map-mode-tabs-toggle');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.mapTabsHidden);

  // Play turn 1 in the small window. With no model, the opponent runs its standing orders and says so in a notice.
  await page.click('#ready-btn');
  await waitForWorldPlanning(page);
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.tip);
  await recordScene(page, report, outDir, SCENES.turnResolved);
  await setViewport(app, page, first);
  await page.waitForTimeout(SETTLE_MS.resize);
  await page.click('#console-tab-reports');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.reportsTab);
  await page.click('#console-tab-orders');

  // Leave one march queued; the reopened match must still list it.
  await queueLoneUnitMarch(page);
  return readGameState(page);
}

/**
 * Runs the second session: the reopened match, a battle on the hex both sides now hold, leaving that battle, the
 * new-game screen opened over the match and closed again, and a new regional match.
 *
 * Purpose: Checks what a player sees after restarting the app, inside a battle, and on a regional map.
 * When to use: After `runFirstSession` and the saved-match change from `contestedHexEdit`, on the same folder.
 * Expected outcome: One recorded scene per step below, in this order.
 * Exceptions: Propagates Playwright and scenario errors.
 */
async function runReopenedSession(app, page, report, outDir, battleHex) {
  await setViewport(app, page, VIEWPORTS[0]);
  await page.waitForFunction(() => document.getElementById('game-over-overlay')?.classList.contains('hidden')
    && /· Planning$/.test(document.getElementById('topbar-turn-phase')?.textContent || ''), null, { timeout: 60000 });
  await page.waitForTimeout(SETTLE_MS.start);
  await page.click('#console-tab-orders');
  await page.waitForTimeout(SETTLE_MS.click);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.matchReopened);

  await captureMainMap(page);
  await enterBattleAt(page, battleHex);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.battleStart);
  const unit = await selectLoneBattleUnit(page);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.battleSelection);
  await queueBattleMarch(page, unit);
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.battleOrders);

  // The battle header at the 800 x 600 minimum, then back to the first size for the beat.
  await setViewport(app, page, SMALL_WINDOW);
  await page.waitForTimeout(SETTLE_MS.resize);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.battleSmallWindow);
  await setViewport(app, page, VIEWPORTS[0]);
  await page.waitForTimeout(SETTLE_MS.resize);

  // Play beat 1. If one side is wiped out, close the result; the world-map turn then plays.
  await page.click('#ready-btn');
  const annihilation = '#tactical-annihilation-overlay:not(.hidden)';
  await page.waitForFunction((selector) => document.querySelector(selector) !== null
    || ((document.getElementById('battle-header-status')?.textContent || '').startsWith('Beat 2 · Tactical planning')
      && document.getElementById('ready-btn')?.disabled === false), annihilation, { timeout: SETTLE_MS.turn });
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.tip);
  await recordScene(page, report, outDir, SCENES.battleBeat);

  // Leave the battle mid-fight with Exit Battle in the header, or close the result if a side was wiped out. Either way
  // the world-map turn then plays.
  await page.click((await page.isVisible(annihilation)) ? '#tactical-annihilation-exit-btn' : '#tactical-exit-btn');
  await waitForWorldPlanning(page);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.battleExited);

  await openNewGameOverlay(page);
  await recordScene(page, report, outDir, SCENES.newGameReopened);
  // Close the screen and go back to the match that kept running under it, then open the screen again for the regional
  // match.
  await page.click('#new-game-dialog-close');
  await page.waitForFunction(() => document.getElementById('game-over-overlay')?.classList.contains('hidden'), null, { timeout: 10000 });
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.newGameClosed);
  await openNewGameOverlay(page);
  await page.click('#new-game-tab-regional');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.overlay);
  await recordScene(page, report, outDir, SCENES.newGameRegional);
  // Choose the regional match, hide the choices, and start from the button in the header.
  await chooseRegionalScenario(page);
  await page.click('#new-game-dialog-collapse');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.newGameRegionalHidden);
  await clickStartGame(page, 90000);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.regionalStart);
  await captureMainMap(page);
  await selectLoneUnit(page, await readGameState(page), LAND_UNIT_TYPES);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.regionalSelection);
}

/**
 * Runs the last session: the reopened match after it was marked as lost.
 *
 * Purpose: A finished match must open on the game-over screen, with the match's chrome out of the way, and the setup
 *   panel must still fit the 800 x 600 minimum.
 * When to use: After `runReopenedSession` and `FINISHED_MATCH_EDIT`, on the same folder.
 * Expected outcome: Two recorded scenes: the game-over screen, then the same screen at the minimum window.
 * Exceptions: Propagates Playwright errors.
 */
async function runFinishedMatchSession(app, page, report, outDir) {
  await setViewport(app, page, VIEWPORTS[0]);
  await waitForNewGameOverlay(page);
  await page.waitForTimeout(SETTLE_MS.overlay);
  await recordScene(page, report, outDir, SCENES.gameOverReopened);
  // Hide the choices, so the header shows New game in place of the result, then show them again before the small window.
  await page.click('#new-game-dialog-collapse');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.gameOverHidden);
  await page.click('#new-game-dialog-collapse');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await setViewport(app, page, SMALL_WINDOW);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.gameOverSmallWindow);
}

/**
 * Prints the report and returns the exit code.
 *
 * Purpose: The terminal output is what the implementing agent pastes back.
 * When to use: Once, at the end.
 * Expected outcome: One line per result, then a summary line. Exit code 1 when any check failed or the page threw.
 * Exceptions: None.
 */
function printReport(report, outDir) {
  for (const r of report.results) {
    console.log(`${r.status.padEnd(4)} ${r.scene} :: ${r.check}${r.detail ? ` :: ${r.detail}` : ''}`);
  }
  for (const note of report.notes) console.log(`NOTE ${note}`);
  for (const err of report.pageErrors) console.log(`PAGE-ERROR ${err}`);
  const passed = report.results.filter((r) => r.status === 'PASS').length;
  const failed = report.results.length - passed;
  console.log(`ui-smoke ${report.label}: ${passed} passed, ${failed} failed, ${report.pageErrors.length} page errors, ${report.screenshots.length} screenshots in ${outDir}`);
  return failed === 0 && report.pageErrors.length === 0 ? 0 : 1;
}

/**
 * Entry point.
 *
 * Purpose: Owns the app's lifetime and the temporary user-data folder. The three sessions share the folder, so each
 *   one reopens the match the previous one left, changed as the scenes need.
 * When to use: Run by `npm run ui:smoke`.
 * Expected outcome: The app is closed and the temporary folder removed even when a scene fails.
 * Exceptions: Exits 1 on any failure.
 */
async function main() {
  const label = readLabel(process.argv);
  const outDir = path.join(REPO_ROOT, '.test', 'ui-smoke', label);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-ui-smoke-'));
  const report = { label, startedAt: new Date().toISOString(), sceneCount: 0, results: [], screenshots: [], notes: [], pageErrors: [], consoleErrors: [] };
  let session = null;
  let exitCode = 1;
  try {
    session = await launchApp(userDataDir, report);
    const lastState = await runFirstSession(session.app, session.page, report, outDir);
    await session.app.close();
    session = null;
    const contested = contestedHexEdit(lastState);
    await editSavedMatch(userDataDir, contested.statements);

    session = await launchApp(userDataDir, report);
    await runReopenedSession(session.app, session.page, report, outDir, contested.h3Index);
    await session.app.close();
    session = null;
    await editSavedMatch(userDataDir, FINISHED_MATCH_EDIT);

    session = await launchApp(userDataDir, report);
    await runFinishedMatchSession(session.app, session.page, report, outDir);
    const opened = session;
    session = null;
    await runMultiCommanderScenes({
      app: opened.app,
      page: opened.page,
      userDataDir,
      report,
      outDir,
      viewport: VIEWPORTS[0],
      recordScene,
      setViewport,
      parkPointer,
    });
    exitCode = printReport(report, outDir);
  } catch (err) {
    report.notes.push(`run stopped: ${err && err.stack ? err.stack : String(err)}`);
    printReport(report, outDir);
    exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    if (session) await session.app.close().catch(() => undefined);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (err) {
      // A file still held open by the closing app must not turn a passing run into a failure.
      console.log(`NOTE could not remove the temporary user-data folder ${userDataDir}: ${err && err.message ? err.message : String(err)}`);
    }
  }
  process.exit(exitCode);
}

main();
