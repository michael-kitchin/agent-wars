/**
 * The UI smoke run's new-game steps: waiting for the overlay, opening it from a match, and starting the fixed global
 * and regional scenarios.
 *
 * Purpose: Keeps the overlay's choices and their checks together, apart from the scene order in `ui-smoke.cjs`.
 * When to use: Required by `ui-smoke.cjs`.
 * Expected outcome: Async helpers that drive the overlay the way a player would. Choosing a regional match and
 *   clicking Start are separate, so the runner can hide the choices between them. Nothing runs on load.
 * Exceptions: None.
 */
'use strict';

const { SETTLE_MS } = require('./ui-smoke-scenes.cjs');

/**
 * The fixed scenario, as option values in the new-game overlay.
 *
 * Purpose: Every run shows the same match, so checks can compare known values.
 * When to use: Only by `startScenarioMatch`.
 * Expected outcome: Southern Europe against Northern Africa, a small game, starting in September.
 * Exceptions: None.
 */
const SCENARIO = Object.freeze({
  humanRegion: 'Southern Europe',
  aiRegion: 'Northern Africa',
  startMonth: '9',
  gameSize: 'small',
  victoryRule: 'most_city_hexes_at_turn_limit',
  turnLimit: '30',
});

/**
 * The fixed regional scenario, as option values on the new-game overlay's Regional tab.
 *
 * Purpose: The regional scenes always show the same region and sides, so their checks can compare known values.
 * When to use: Only by `chooseRegionalScenario`.
 * Expected outcome: Southern Mexico and the isthmus against NE Mexico and the Bajio in Central America, a small game,
 *   starting in April.
 * Exceptions: None.
 */
const REGIONAL_SCENARIO = Object.freeze({
  region: 'central_america',
  humanSide: 'southern_mexico_isthmus',
  aiSide: 'ne_mexico_bajio',
  startMonth: '4',
  gameSize: 'small',
});

/**
 * Waits for the new-game overlay to be open.
 *
 * Purpose: Both the first start and a new game opened from the match end on this overlay.
 * When to use: After launch, and after opening the overlay from the match.
 * Expected outcome: Resolves once `#game-over-overlay` is in the page without the `hidden` class and the side list has at least two rows.
 * Exceptions: Throws a Playwright timeout after 60 seconds.
 */
async function waitForNewGameOverlay(page) {
  await page.waitForFunction(() => {
    const overlay = document.getElementById('game-over-overlay');
    return overlay !== null && !overlay.classList.contains('hidden')
      && document.querySelectorAll('#new-game-side-rows .new-game-side-row').length >= 2;
  }, null, { timeout: 60000 });
}

/**
 * Answers Yes when Start asks because no opponent has a model.
 *
 * Purpose: The smoke profile has no saved model, and Start waits for that answer before the match begins.
 * When to use: Immediately after clicking Start.
 * Expected outcome: Yes is clicked when the dialog is open. A start that does not ask is left alone.
 * Exceptions: None. A dialog that never opens is not an error.
 */
async function acceptStartWithoutModels(page) {
  const opened = await page
    .waitForFunction(() => {
      const dialog = document.getElementById('start-confirm-dialog');
      return dialog !== null && !dialog.classList.contains('hidden');
    }, null, { timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (opened) await page.click('#start-confirm-yes');
}

/**
 * Clicks Start and waits until the overlay has closed.
 *
 * Purpose: One click for both matches. The button is the same element in the footer and in the collapsed header.
 * When to use: After the scenario's choices are set, whether or not the choices are hidden.
 * Expected outcome: `#game-over-overlay` has `hidden`, and the match has had time to fit the map. A successful start
 *   collapses the console and leaves Orders selected, so this click expands Orders. The scenes after it measure Orders.
 *   A later click on Commanders opens that tab rather than collapsing the console.
 * Exceptions: Throws a Playwright timeout when the overlay does not close within `timeoutMs`.
 */
async function clickStartGame(page, timeoutMs) {
  await page.click('#new-game-btn');
  await acceptStartWithoutModels(page);
  await page.waitForFunction(() => document.getElementById('game-over-overlay').classList.contains('hidden'), null, { timeout: timeoutMs });
  await page.waitForTimeout(SETTLE_MS.start);
  await page.click('#console-tab-orders');
  await page.waitForTimeout(SETTLE_MS.click);
}

/**
 * Chooses the fixed scenario on the new-game overlay and starts the match.
 *
 * Purpose: Every run must show the same match so checks can compare known values.
 * When to use: Once, while the startup overlay is open.
 * Expected outcome: The overlay closes with Southern Europe against Northern Africa, a small game, starting in September, most city hexes at turn 30.
 * Exceptions: Throws when a choice does not hold or the match does not start within 60 seconds.
 */
async function startScenarioMatch(page) {
  await page.waitForFunction((region) => {
    const select = document.querySelector('select[aria-label="You home"]');
    return select !== null && Array.from(select.options).some((option) => option.value === region || option.textContent.trim() === region);
  }, SCENARIO.humanRegion, { timeout: 60000 });
  // The overlay draws random homes and a random month after its lists load; let that finish first.
  await page.waitForTimeout(SETTLE_MS.overlay);
  await page.click('#new-game-tab-global');
  await setSideHome(page, 'You', SCENARIO.humanRegion);
  await setSideHome(page, 'Opponent 1', SCENARIO.aiRegion);
  await page.selectOption('#new-game-start-month', SCENARIO.startMonth);
  await page.selectOption('#new-game-size-select', SCENARIO.gameSize);
  await page.selectOption('#new-game-victory-select', SCENARIO.victoryRule);
  await page.selectOption('#new-game-turn-limit-select', SCENARIO.turnLimit);
  await page.waitForTimeout(SETTLE_MS.click);
  const chosen = await page.evaluate(() => ({
    human: document.querySelector('select[aria-label="You home"]').value,
    ai: document.querySelector('select[aria-label="Opponent 1 home"]').value,
    month: document.getElementById('new-game-start-month').value,
    size: document.getElementById('new-game-size-select').value,
    victory: document.getElementById('new-game-victory-select').value,
    turnLimit: document.getElementById('new-game-turn-limit-select').value,
  }));
  if (chosen.month !== SCENARIO.startMonth || chosen.size !== SCENARIO.gameSize
    || chosen.victory !== SCENARIO.victoryRule || chosen.turnLimit !== SCENARIO.turnLimit
    || !chosen.human.includes(SCENARIO.humanRegion) || !chosen.ai.includes(SCENARIO.aiRegion)) {
    throw new Error(`scenario choices did not hold: ${JSON.stringify(chosen)}`);
  }
  await clickStartGame(page, 60000);
}

/**
 * Opens the new-game overlay from the running match, the way a player would.
 *
 * Purpose: One scene checks the overlay opened from a match, not only at startup, and the regional match starts from it.
 * When to use: In the second session, before the regional match.
 * Expected outcome: The game menu is opened, New game is clicked, and the overlay is open.
 * Exceptions: Throws a Playwright timeout when a control is missing or the overlay does not open.
 */
async function openNewGameOverlay(page) {
  await page.click('#game-menu-btn');
  await page.click('#openrouter-new-btn');
  await waitForNewGameOverlay(page);
  await page.waitForTimeout(SETTLE_MS.click);
}

/**
 * Chooses the fixed regional scenario on the open new-game overlay.
 *
 * Purpose: The runner records that tab, then hides the choices, then starts. Choosing stops before the click.
 * When to use: While the new-game overlay is open.
 * Expected outcome: Regional is selected, with `REGIONAL_SCENARIO`'s region and sides. The overlay stays open.
 * Exceptions: Throws when a choice does not hold.
 */
async function chooseRegionalScenario(page) {
  await page.click('#new-game-tab-regional');
  await page.waitForTimeout(SETTLE_MS.click);
  await page.selectOption('#new-game-region-select', REGIONAL_SCENARIO.region);
  await page.waitForFunction((side) => {
    const select = document.querySelector('select[aria-label="You home"]');
    return select !== null && Array.from(select.options).some((option) => option.value === side);
  }, REGIONAL_SCENARIO.humanSide, { timeout: 60000 });
  await page.waitForTimeout(SETTLE_MS.click);
  await setSideHome(page, 'You', REGIONAL_SCENARIO.humanSide);
  await setSideHome(page, 'Opponent 1', REGIONAL_SCENARIO.aiSide);
  await page.selectOption('#new-game-start-month', REGIONAL_SCENARIO.startMonth);
  await page.selectOption('#new-game-size-select', REGIONAL_SCENARIO.gameSize);
  await page.waitForTimeout(SETTLE_MS.click);
  const chosen = await page.evaluate(() => ({
    region: document.getElementById('new-game-region-select').value,
    human: document.querySelector('select[aria-label="You home"]').value,
    ai: document.querySelector('select[aria-label="Opponent 1 home"]').value,
  }));
  if (chosen.region !== REGIONAL_SCENARIO.region || chosen.human !== REGIONAL_SCENARIO.humanSide || chosen.ai !== REGIONAL_SCENARIO.aiSide) {
    throw new Error(`regional choices did not hold: ${JSON.stringify(chosen)}`);
  }
}

/**
 * Sets one side's home, moving another side off it first when that home is taken.
 *
 * Purpose: The rows start on random homes, and a taken home cannot be selected.
 * When to use: While the side rows are on screen. `label` is the row's visible name, such as "You".
 * Expected outcome: The row's home select shows `value`.
 * Exceptions: Throws when the home is not in the list, or no other home is free to receive the side that held it.
 */
async function setSideHome(page, label, value) {
  const selector = `select[aria-label="${label} home"]`;
  await page.waitForSelector(selector);
  const ready = () => page.$eval(selector, (el, wanted) => {
    const option = [...el.options].find((entry) => entry.value === wanted);
    return { current: el.value, exists: Boolean(option), enabled: Boolean(option) && !option.disabled };
  }, value);
  const state = await ready();
  if (state.current === value) return;
  if (!state.exists) throw new Error(`${label} has no home "${value}"`);
  if (!state.enabled) {
    const holders = await page.$$eval('#new-game-side-rows select', (els, wanted) => els
      .filter((el) => el.value === wanted)
      .map((el) => el.getAttribute('aria-label')), value);
    const holder = holders.find((name) => name && name !== `${label} home`);
    if (!holder) throw new Error(`${value} is not free for ${label}`);
    const holderSelector = `select[aria-label="${holder}"]`;
    const swap = await page.$eval(holderSelector, (el, wanted) => {
      const option = [...el.options].find((entry) => !entry.disabled && entry.value !== wanted);
      return option ? option.value : '';
    }, value);
    if (!swap) throw new Error(`no free home to move ${holder} off ${value}`);
    await page.selectOption(holderSelector, swap);
    await page.waitForTimeout(SETTLE_MS.click);
  }
  await page.selectOption(selector, value);
  await page.waitForTimeout(SETTLE_MS.click);
  const after = await page.$eval(selector, (el) => el.value);
  if (after !== value) throw new Error(`${label} home is "${after}", expected "${value}"`);
}

/**
 * Starts a match and waits until Observe is on screen.
 *
 * Purpose: An Observe start must not select Orders, because that tab is disabled.
 * When to use: After Observe is checked and the sides are chosen.
 * Expected outcome: The overlay is closed, the top bar says Observing, and View as is shown.
 * Exceptions: Throws a Playwright timeout when the match does not start within `timeoutMs`.
 */
async function startObservedMatch(page, timeoutMs) {
  await page.click('#new-game-btn');
  await acceptStartWithoutModels(page);
  await page.waitForFunction(() => document.getElementById('game-over-overlay').classList.contains('hidden'), null, { timeout: timeoutMs });
  await page.waitForFunction(() => {
    const sides = document.getElementById('topbar-sides');
    const view = document.getElementById('topbar-view-as');
    return sides !== null && (sides.textContent || '').includes('Observing') && view !== null && !view.hidden;
  }, null, { timeout: timeoutMs });
  await page.waitForTimeout(SETTLE_MS.start);
}

module.exports = {
  chooseRegionalScenario,
  clickStartGame,
  openNewGameOverlay,
  setSideHome,
  startObservedMatch,
  startScenarioMatch,
  waitForNewGameOverlay,
};
