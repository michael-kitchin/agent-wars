/**
 * Checks the Beat limit dropdown and, later, an observed battle that hits it.
 *
 * Purpose: The layout check cannot see that None restores the player's last choice.
 * When to use: From the several-side smoke session, before the observed match starts.
 * Expected outcome: Throws an Error naming the mismatch. A passing run leaves Balanced and 30 selected and closes Game Options.
 * Exceptions: Propagates a Playwright timeout when a control never appears.
 */
'use strict';

const { LAND_UNIT_TYPES, readGameState } = require('./ui-smoke-map.cjs');

const OPTION_TEXTS = ['20 beats', '30 beats', '40 beats', '50 beats', 'Unlimited'];

/**
 * Reads the Beat limit select from the page.
 *
 * Purpose: Disabled, value, and option text are what the behavior check compares.
 * When to use: After each AI-only or Beat limit change.
 * Expected outcome: The three fields, or null when the select is missing.
 * Exceptions: None.
 */
async function readBeatLimit(page) {
  return page.evaluate(() => {
    const select = document.getElementById('new-game-beat-limit-select');
    if (!(select instanceof HTMLSelectElement)) return null;
    return {
      disabled: select.disabled,
      value: select.value,
      texts: [...select.options].map((option) => option.text),
    };
  });
}

/**
 * Throws when the select does not match the expected disabled flag, value, and option texts.
 *
 * Purpose: Each step names itself in the error.
 * When to use: After `readBeatLimit`.
 * Expected outcome: Returns when the select matches. Option texts are compared only when `texts` is set.
 * Exceptions: Throws an Error naming the mismatch.
 */
function expectBeatLimit(actual, expected, label) {
  if (!actual) throw new Error(`${label}: beat limit select is missing`);
  if (actual.disabled !== expected.disabled) throw new Error(`${label}: disabled is ${actual.disabled}`);
  if (actual.value !== expected.value) throw new Error(`${label}: value is "${actual.value}"`);
  if (expected.texts && actual.texts.join('|') !== expected.texts.join('|')) {
    throw new Error(`${label}: options are ${actual.texts.join(', ')}`);
  }
}

/**
 * Opens Game Options and checks that Beat limit follows AI-only battles.
 *
 * Purpose: None shows Unlimited and disables the control. Leaving None restores the last choice, including Unlimited.
 * When to use: While the new-game overlay is open and before the observed match starts.
 * Expected outcome: Game Options is closed, AI-only battles is Balanced, and Beat limit is 30.
 * Exceptions: Throws an Error naming the mismatch, or a Playwright timeout.
 */
async function checkBeatLimitControl(page) {
  await page.click('#new-game-options-btn');
  await page.waitForSelector('#new-game-beat-limit-select', { state: 'visible' });
  await page.selectOption('#new-game-ai-only-battles-select', 'balanced');
  expectBeatLimit(await readBeatLimit(page), { disabled: false, value: '30', texts: OPTION_TEXTS }, 'balanced');
  await page.selectOption('#new-game-ai-only-battles-select', 'none');
  expectBeatLimit(await readBeatLimit(page), { disabled: true, value: 'unlimited', texts: ['Unlimited'] }, 'none');
  await page.selectOption('#new-game-ai-only-battles-select', 'random');
  expectBeatLimit(await readBeatLimit(page), { disabled: false, value: '30' }, 'random restores 30');
  await page.selectOption('#new-game-beat-limit-select', 'unlimited');
  await page.selectOption('#new-game-ai-only-battles-select', 'none');
  await page.selectOption('#new-game-ai-only-battles-select', 'unbalanced');
  expectBeatLimit(await readBeatLimit(page), { disabled: false, value: 'unlimited' }, 'unbalanced restores unlimited');
  await page.selectOption('#new-game-beat-limit-select', '50');
  await page.selectOption('#new-game-ai-only-battles-select', 'none');
  await page.selectOption('#new-game-ai-only-battles-select', 'balanced');
  expectBeatLimit(await readBeatLimit(page), { disabled: false, value: '50' }, 'balanced restores 50');
  await page.selectOption('#new-game-beat-limit-select', '30');
  await page.click('#new-game-options-btn');
}

/**
 * Moves one active side's land units onto the other side's first land hex.
 *
 * Purpose: An observed match offers a battle only where two sides share a hex, and a fresh match has none.
 * When to use: With the game state read just before the app closes.
 * Expected outcome: One update per land unit of the second side still playing.
 * Exceptions: Throws when either side has no land unit.
 */
function aiContestedHexStatements(state) {
  const isLand = (unit) => LAND_UNIT_TYPES.includes(unit.unitType);
  const active = (state.seats || []).filter((seat) => seat.outTurn == null);
  const first = active[0]?.seatId;
  const second = active[1]?.seatId;
  const firstLand = (state.units || []).filter((unit) => unit.player === first && isLand(unit));
  const secondLand = (state.units || []).filter((unit) => unit.player === second && isLand(unit));
  if (!first || !second || firstLand.length === 0 || secondLand.length === 0) {
    throw new Error('a battle needs a land unit on each side');
  }
  const h3Index = firstLand[0].h3Index;
  return secondLand.map((unit) => ({ sql: 'UPDATE units SET h3_index = ? WHERE id = ?', params: [h3Index, unit.id] }));
}

/**
 * Waits until the battle header starts with the given text.
 *
 * Purpose: Reopening a saved battle should show that beat, not the world map.
 * When to use: After a reopen that left a battle in the file.
 * Expected outcome: Resolves when the status starts with `prefix`.
 * Exceptions: Throws a Playwright timeout, or an Error naming the status when the wait ends another way.
 */
async function waitForBattleStatus(page, prefix) {
  await page.waitForFunction((expected) => (document.getElementById('battle-header-status')?.textContent || '').startsWith(expected), prefix, { timeout: 60000 });
}

/**
 * Reads the beat-limit notice and requires the exact sentence and Ok.
 *
 * Purpose: Both observe modes show the same reason. The button must not still say Exit Battle.
 * When to use: Once `#tactical-annihilation-overlay` is visible.
 * Expected outcome: Returns when the message and the button match.
 * Exceptions: Throws an Error naming the text that was showing.
 */
async function expectBeatLimitNotice(page) {
  const message = await page.locator('#tactical-annihilation-message').innerText();
  const button = await page.locator('#tactical-annihilation-exit-btn').innerText();
  if (message !== 'The battle reached its maximum of 30 beats.' || button.trim() !== 'Ok') {
    throw new Error(`beat-limit notice was "${message}" / "${button.trim()}"`);
  }
}

/**
 * Drives an observed battle to its beat limit with auto-advance off, then on.
 *
 * Purpose: This is the check that the notice waits for Ok, and that the timed notice then starts the next turn.
 * When to use: After the Observe scene, on a match with four AI sides, Balanced, and Beat limit 30.
 * Expected outcome: Returns the app and page still open, with auto-advance off. Adds one report note with how long the notice stayed up.
 * Exceptions: Throws an Error naming a missing battle, a wrong sentence, a notice that closed early, or a notice that stayed outside 2.5 to 6 seconds.
 */
async function runBeatLimitBattleScenes(args) {
  let { app, page } = args;
  const state = await readGameState(page);
  const statements = aiContestedHexStatements(state);
  ({ app, page } = await args.reopen(app, statements));
  await page.waitForFunction(() => (document.getElementById('topbar-sides')?.textContent || '').includes('Observing'), null, { timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('ready-btn')?.disabled === false, null, { timeout: 120000 });
  await page.click('#ready-btn');
  const battles = page.getByRole('dialog', { name: 'Tactical battles' });
  await battles.waitFor({ timeout: 120000 });
  await battles.getByRole('button', { name: 'Fight', exact: true }).click();
  await waitForBattleStatus(page, 'Beat 1 · Tactical planning');

  ({ app, page } = await args.reopen(app, [{
    sql: "UPDATE game_config SET value = json_set(value, '$.tacticalTurnNumber', 30) WHERE key = 'tactical_battle_snapshot_json_v1'",
    params: [],
  }]));
  await waitForBattleStatus(page, 'Beat 30');
  await page.waitForFunction(() => document.getElementById('ready-btn')?.disabled === false, null, { timeout: 120000 });
  await page.click('#ready-btn');
  const overlay = page.locator('#tactical-annihilation-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 60000 });
  await expectBeatLimitNotice(page);
  await page.waitForTimeout(4000);
  if (!(await overlay.isVisible())) throw new Error('the beat-limit notice closed before Ok');

  ({ app, page } = await args.reopen(app, [{
    sql: "UPDATE game_config SET value = json_set(json_remove(value, '$.aiOnlyEndReason'), '$.tacticalTurnNumber', 30) WHERE key = 'tactical_battle_snapshot_json_v1'",
    params: [],
  }]));
  await waitForBattleStatus(page, 'Beat 30');
  const turnBefore = (await readGameState(page)).turnNumber;
  await page.click('#observe-auto-advance-input');
  const timedOverlay = page.locator('#tactical-annihilation-overlay');
  await timedOverlay.waitFor({ state: 'visible', timeout: 60000 });
  const visibleAt = Date.now();
  await expectBeatLimitNotice(page);
  await timedOverlay.waitFor({ state: 'hidden', timeout: 15000 });
  const elapsed = Date.now() - visibleAt;
  if (elapsed < 2500 || elapsed > 6000) throw new Error(`the beat-limit notice stayed open ${elapsed} ms`);
  await page.locator('#tactical-exit-btn').waitFor({ state: 'hidden', timeout: 60000 });
  const deadline = Date.now() + 120000;
  let advanced = false;
  while (Date.now() < deadline) {
    const next = await readGameState(page);
    if (next.turnNumber > turnBefore) {
      advanced = true;
      break;
    }
    await page.waitForTimeout(500);
  }
  if (!advanced) throw new Error('the next turn did not start after the beat-limit notice');
  await page.click('#observe-auto-advance-input');
  args.report.notes.push(`beat-limit notice stayed open ${elapsed} ms`);
  return { app, page };
}

module.exports = { checkBeatLimitControl, runBeatLimitBattleScenes };
