/**
 * Checks place names when the new-game screen opens over a running battle.
 *
 * Purpose: A battle under that screen must not keep the names in battle mode, and closing it must
 *   return the battle's own names without leaving the battle.
 * When to use: From the reopened session, after the battle orders scene and before the small-window beat.
 * Expected outcome: Three pass or fail lines. The overlay is closed again, and the battle is still on screen.
 * Exceptions: Throws a Playwright timeout when the overlay does not open or close.
 */
'use strict';

const { SETTLE_MS } = require('./ui-smoke-scenes.cjs');
const { openNewGameOverlay } = require('./ui-smoke-new-game.cjs');

/**
 * Records one label check.
 *
 * Purpose: The smoke report is a list of pass or fail lines.
 * When to use: After each assertion in this file.
 * Expected outcome: One result row. A failure names what was seen.
 * Exceptions: None.
 */
function record(report, check, ok, detail) {
  report.results.push({
    scene: 'map-labels',
    check,
    status: ok ? 'PASS' : 'FAIL',
    detail: ok ? '' : detail,
  });
}

/**
 * Reads the kinds painted on the label canvas.
 *
 * Purpose: The names are canvas pixels, so the paint pass publishes the kinds it drew.
 * When to use: After the overlay has settled, and again after it closes.
 * Expected outcome: The kind names, or null when the canvas or the attribute is missing.
 * Exceptions: None.
 */
async function readDrawnLabelKinds(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('map-label-overlay');
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const value = canvas.dataset.drawnLabelKinds;
    if (value == null) return null;
    return value.split(',').filter(Boolean);
  });
}

/**
 * Checks names over a battle, then returns to that battle.
 *
 * Purpose: Opening New game from the menu must not be left open, and must not end the battle.
 * When to use: Once, while a battle is on screen and Ready has not been clicked for the beat.
 * Expected outcome: The world-names check, the restored-names check, and the battle-still-there check are recorded.
 *   The overlay is closed. Start is not clicked. A missing battle stops the run after that check is recorded.
 * Exceptions: Throws a Playwright timeout when the overlay does not open or close, and throws when the battle header is gone.
 */
async function checkNewGameOverBattleLabels(page, report) {
  await openNewGameOverlay(page);
  await page.waitForTimeout(SETTLE_MS.overlay);
  const overBattle = await readDrawnLabelKinds(page);
  const overBattleOk = overBattle != null && overBattle.includes('continent') && !overBattle.includes('state');
  record(
    report,
    'new game over a battle uses world names',
    overBattleOk,
    overBattle == null ? 'attribute missing' : (overBattle.join(',') || 'none'),
  );

  await page.click('#new-game-dialog-close');
  await page.waitForFunction(
    () => document.getElementById('game-over-overlay')?.classList.contains('hidden'),
    null,
    { timeout: 10000 },
  );
  await page.waitForTimeout(SETTLE_MS.resize);
  const restored = await readDrawnLabelKinds(page);
  const restoredOk = restored != null && restored.includes('state') && !restored.includes('continent');
  record(
    report,
    'closing new game restores battle names',
    restoredOk,
    restored == null ? 'attribute missing' : (restored.join(',') || 'none'),
  );

  const battleText = await page.locator('#battle-header-status').innerText().catch(() => '');
  const battleVisible = await page.locator('#battle-header-status').isVisible().catch(() => false);
  const battleOk = battleVisible && battleText.trim().length > 0;
  record(
    report,
    'closing new game leaves the battle',
    battleOk,
    battleText.trim() || 'battle header missing',
  );
  if (!battleOk) throw new Error('closing new game leaves the battle');
}

module.exports = { checkNewGameOverBattleLabels };
