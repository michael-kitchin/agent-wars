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
 * Expected outcome: Resolves once `#game-over-overlay` is in the page without the `hidden` class.
 * Exceptions: Throws a Playwright timeout after 60 seconds.
 */
async function waitForNewGameOverlay(page) {
  await page.waitForFunction(() => {
    const overlay = document.getElementById('game-over-overlay');
    return overlay !== null && !overlay.classList.contains('hidden');
  }, null, { timeout: 60000 });
}

/**
 * Clicks Start and waits until the overlay has closed.
 *
 * Purpose: One click for both matches. The button is the same element in the footer and in the collapsed header.
 * When to use: After the scenario's choices are set, whether or not the choices are hidden.
 * Expected outcome: `#game-over-overlay` has `hidden`, and the match has had time to fit the map. The console is then on
 *   Orders. A start in this profile has no API key, so Auto-start AI opens the Opponent tab; the scenes after this
 *   click measure Orders, and a later click on Opponent must open that tab rather than collapse it.
 * Exceptions: Throws a Playwright timeout when the overlay does not close within `timeoutMs`.
 */
async function clickStartGame(page, timeoutMs) {
  await page.click('#new-game-btn');
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
 * Expected outcome: The overlay closes with Southern Europe against Northern Africa, a small game, starting in September.
 * Exceptions: Throws when a choice does not hold or the match does not start within 60 seconds.
 */
async function startScenarioMatch(page) {
  await page.waitForFunction((region) => {
    const select = document.getElementById('new-game-human-region-select');
    return select !== null && Array.from(select.options).some((o) => o.value === region || o.textContent.trim() === region);
  }, SCENARIO.humanRegion, { timeout: 60000 });
  // The overlay draws random homes and a random month after its lists load; let that finish first.
  await page.waitForTimeout(SETTLE_MS.overlay);
  await page.click('#new-game-tab-global');
  await page.selectOption('#new-game-human-region-select', SCENARIO.humanRegion);
  await page.selectOption('#new-game-ai-region-select', SCENARIO.aiRegion);
  await page.selectOption('#new-game-start-month', SCENARIO.startMonth);
  await page.selectOption('#new-game-size-select', SCENARIO.gameSize);
  await page.waitForTimeout(SETTLE_MS.click);
  const chosen = await page.evaluate(() => ({
    human: document.getElementById('new-game-human-region-select').value,
    ai: document.getElementById('new-game-ai-region-select').value,
    month: document.getElementById('new-game-start-month').value,
    size: document.getElementById('new-game-size-select').value,
  }));
  if (chosen.month !== SCENARIO.startMonth || chosen.size !== SCENARIO.gameSize
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
  await page.waitForTimeout(SETTLE_MS.click);
  await page.selectOption('#new-game-human-side-select', REGIONAL_SCENARIO.humanSide);
  await page.selectOption('#new-game-ai-side-select', REGIONAL_SCENARIO.aiSide);
  await page.selectOption('#new-game-start-month', REGIONAL_SCENARIO.startMonth);
  await page.selectOption('#new-game-size-select', REGIONAL_SCENARIO.gameSize);
  await page.waitForTimeout(SETTLE_MS.click);
  const chosen = await page.evaluate(() => ({
    region: document.getElementById('new-game-region-select').value,
    human: document.getElementById('new-game-human-side-select').value,
    ai: document.getElementById('new-game-ai-side-select').value,
  }));
  if (chosen.region !== REGIONAL_SCENARIO.region || chosen.human !== REGIONAL_SCENARIO.humanSide || chosen.ai !== REGIONAL_SCENARIO.aiSide) {
    throw new Error(`regional choices did not hold: ${JSON.stringify(chosen)}`);
  }
}

module.exports = { chooseRegionalScenario, clickStartGame, openNewGameOverlay, startScenarioMatch, waitForNewGameOverlay };
