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
 * True when the unit is a land unit that fights on the world map.
 *
 * Purpose: A land unit still assigned to a ship sits out strategic combat, and moving it does not stick, because its position follows the ship again.
 * When to use: Choosing which units make the battle hex.
 * Expected outcome: True for an armor or infantry unit with no carrier.
 * Exceptions: None.
 */
function isFightingLandUnit(unit) {
  return LAND_UNIT_TYPES.includes(unit.unitType) && !unit.embarkedOnCarrierUnitId;
}

/**
 * Moves one side's land units onto a hex that only another side holds.
 *
 * Purpose: An observed match offers a battle only where exactly two AI sides share a hex after movement and fire, and a fresh match has none. The smoke sides have no model, so they give no orders, and the hex keeps both sides unless a Neutral unit moves or fires there. A side with no land unit off a ship cannot be one of the two, and a hex with a third side's unit offers nothing.
 * When to use: With the game state read just before the app closes.
 * Expected outcome: `{ h3Index, statements }`: one update per land unit off a ship of the second qualifying side, onto the first hex where the first qualifying side has such a unit and no other side has any unit.
 * Exceptions: Throws when fewer than two active sides have a land unit off a ship, or when no hex is held by the first side alone. The first message lists each active side's count.
 */
function aiContestedHexStatements(state) {
  const units = state.units || [];
  const active = (state.seats || []).filter((seat) => seat.outTurn == null);
  const landOf = (seatId) => units.filter((unit) => unit.player === seatId && isFightingLandUnit(unit));
  const counts = active.map((seat) => `${seat.seatId} ${landOf(seat.seatId).length}`).join(', ');
  const qualified = active.filter((seat) => landOf(seat.seatId).length > 0);
  if (qualified.length < 2) throw new Error(`a battle needs a land unit on each side (land units by side: ${counts})`);
  const first = qualified[0].seatId;
  const second = qualified[1].seatId;
  const heldAlone = (h3Index) => units.every((unit) => unit.h3Index !== h3Index || unit.player === first);
  const anchor = landOf(first).find((unit) => heldAlone(unit.h3Index));
  if (!anchor) throw new Error(`no hex holds only ${first}'s units`);
  const h3Index = anchor.h3Index;
  const statements = landOf(second).map((unit) => ({ sql: 'UPDATE units SET h3_index = ? WHERE id = ?', params: [h3Index, unit.id] }));
  return { h3Index, statements };
}

/**
 * Describes a Ready that resolved without offering the battle.
 *
 * Purpose: The scene must fail at once with what happened on the battle hex, rather than wait out the dialog's timeout.
 * When to use: When the turn advanced or the match ended while the Tactical battles dialog was awaited.
 * Expected outcome: One sentence naming the turns, the hex, and each side's unit count there.
 * Exceptions: None.
 */
function missingBattleMessage(turnBefore, state, h3Index) {
  const countBySide = new Map();
  for (const unit of (state.units || []).filter((candidate) => candidate.h3Index === h3Index)) {
    countBySide.set(unit.player, (countBySide.get(unit.player) || 0) + 1);
  }
  const held = [...countBySide.entries()].map(([side, count]) => `${side} ${count}`).join(', ') || 'no units';
  const ended = state.gameOver ? ', and the match ended' : '';
  return `Ready resolved turn ${turnBefore} without offering a battle (now turn ${state.turnNumber}${ended}); hex ${h3Index} holds ${held}`;
}

/**
 * Waits for the Tactical battles dialog, and fails as soon as the turn resolves without it.
 *
 * Purpose: A Ready that finds no battle resolves the turn, and the dialog would then never open.
 * When to use: Right after clicking Ready on the edited match.
 * Expected outcome: Resolves when the dialog is visible.
 * Exceptions: Throws `missingBattleMessage` when the turn advances or the match ends first, or an Error after 120 seconds.
 */
async function waitForBattlesDialog(page, battles, turnBefore, h3Index) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (await battles.isVisible()) return;
    const state = await readGameState(page);
    if (state.turnNumber > turnBefore || state.gameOver) throw new Error(missingBattleMessage(turnBefore, state, h3Index));
    await page.waitForTimeout(500);
  }
  throw new Error(`the Tactical battles dialog did not open within 120 s, and turn ${turnBefore} did not resolve`);
}

/**
 * Builds the pattern for a battle header status line that starts with one beat.
 *
 * Purpose: An AI-only battle with a beat limit shows " (N left)" right after the beat number (`formatAiOnlyBeatsLeftLabel`), so the line reads "Beat 1 (29 left) · Tactical planning".
 * When to use: `waitForBattleStatus`.
 * Expected outcome: A pattern for "Beat {beat}", an optional " (N left)", then `rest` exactly. With no `rest`, the beat number may not continue with another digit.
 * Exceptions: None.
 */
function battleStatusPattern(beat, rest) {
  const escaped = rest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tail = escaped === '' ? '(?!\\d)' : escaped;
  return `^Beat ${beat}(?: \\(\\d+ left\\))?${tail}`;
}

/**
 * Waits until the battle header shows the given beat, followed by the given text.
 *
 * Purpose: Reopening a saved battle should show that beat, not the world map.
 * When to use: After a reopen that left a battle in the file, or after Fight opens one.
 * Expected outcome: Resolves when the status matches `battleStatusPattern(beat, rest)`, with or without the beats-left count.
 * Exceptions: Throws a Playwright timeout.
 */
async function waitForBattleStatus(page, beat, rest = '') {
  const source = battleStatusPattern(beat, rest);
  await page.waitForFunction((pattern) => new RegExp(pattern).test(document.getElementById('battle-header-status')?.textContent || ''), source, { timeout: 60000 });
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
 * Exceptions: Throws an Error naming a missing battle, with the turn and the battle hex's units when Ready resolved without one, a wrong sentence, a notice that closed early, or a notice that stayed outside 2.5 to 6 seconds.
 */
async function runBeatLimitBattleScenes(args) {
  let { app, page } = args;
  const state = await readGameState(page);
  const { h3Index, statements } = aiContestedHexStatements(state);
  ({ app, page } = await args.reopen(app, statements));
  await page.waitForFunction(() => (document.getElementById('topbar-sides')?.textContent || '').includes('Observing'), null, { timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('ready-btn')?.disabled === false, null, { timeout: 120000 });
  const readyTurn = (await readGameState(page)).turnNumber;
  await page.click('#ready-btn');
  const battles = page.getByRole('dialog', { name: 'Tactical battles' });
  await waitForBattlesDialog(page, battles, readyTurn, h3Index);
  await battles.getByRole('button', { name: 'Fight', exact: true }).click();
  await waitForBattleStatus(page, 1, ' · Tactical planning');

  ({ app, page } = await args.reopen(app, [{
    sql: "UPDATE game_config SET value = json_set(value, '$.tacticalTurnNumber', 30) WHERE key = 'tactical_battle_snapshot_json_v1'",
    params: [],
  }]));
  await waitForBattleStatus(page, 30);
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
  await waitForBattleStatus(page, 30);
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

module.exports = { aiContestedHexStatements, battleStatusPattern, checkBeatLimitControl, missingBattleMessage, runBeatLimitBattleScenes };
