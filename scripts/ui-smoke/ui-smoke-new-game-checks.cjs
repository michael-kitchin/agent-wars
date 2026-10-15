/**
 * Checks of the new-game screen for the UI smoke run: the top bar while the new-game overlay is open, the game menu
 * there, and where the map sits.
 *
 * Purpose: Keeps the new-game screen's checks apart from the frame, console, scenario, map chrome, and battle checks,
 *   so each table stays readable.
 * When to use: Required by `ui-smoke-checks.cjs`, which adds these rows to the run.
 * Expected outcome: Rows in the same shape as the other check tables.
 * Exceptions: None.
 */
'use strict';

const { TOPBAR_HEIGHT, SCENES, NEW_GAME_SCENES, near, fmt } = require('./ui-smoke-scenes.cjs');

/**
 * The top bar's parts that the new-game screen shows, and the parts it hides.
 *
 * Purpose: The new-game bar is the menu button, the title, Load game…, Settings, and Help; the match status and the
 *   battle header stay hidden, even when the overlay was opened from a battle.
 * When to use: The new-game top bar check.
 * Expected outcome: Selectors only.
 * Exceptions: None.
 */
const NEW_GAME_BAR = Object.freeze({
  shown: ['#game-menu-btn', '#topbar-new-game-title', '#topbar-load-btn', '#topbar-settings-btn', '#topbar-help-btn'],
  hidden: ['#app-topbar .topbar-sides', '#app-topbar .topbar-stat', '#app-topbar .topbar-date-block', '#battle-header-place', '#battle-header-center', '#tactical-exit-btn'],
});

/**
 * The tip host around the game menu's New game item, and its tip while the new-game screen is open.
 *
 * Purpose: A disabled button gets no pointer events, so the host carries the reason.
 * When to use: The new-game menu check.
 * Expected outcome: Matches the host and its `data-control-tooltip` in `static/index.html`.
 * Exceptions: None.
 */
const NEW_GAME_ITEM_HOST = '#game-menu .control-tooltip-host:has(#openrouter-new-btn)';
const NEW_GAME_ITEM_OPEN_TIP = 'The new-game screen is already open.';

/**
 * The new-game screen's checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a rule of the new-game screen needs a machine check. `needs` lists every selector the
 *   row reads; `run(p, el)` gets the probe and a lookup for those selectors, and returns null on success or a failure
 *   message.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const NEW_GAME_CHECKS = Object.freeze([
  {
    name: 'new-game-map-under-top-bar',
    scenes: NEW_GAME_SCENES,
    needs: ['#canvas-container', '#game-over-overlay'],
    run: (p, el) => {
      const c = el('#canvas-container');
      if (!el('#game-over-overlay').shown) return 'the new-game overlay is not shown';
      return near(c.x, 0) && near(c.y, TOPBAR_HEIGHT) && near(c.w, p.viewport.w) && near(c.y + c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} should fill the window under the ${TOPBAR_HEIGHT} px top bar`;
    },
  },
  {
    name: 'new-game-console-hidden',
    scenes: NEW_GAME_SCENES,
    needs: ['#sidebar'],
    run: (p, el) => (el('#sidebar').shown ? 'the console is shown on the new-game screen' : null),
  },
  {
    name: 'new-game-top-bar',
    scenes: NEW_GAME_SCENES,
    needs: ['#app-topbar', ...NEW_GAME_BAR.shown, ...NEW_GAME_BAR.hidden],
    run: (p, el) => {
      const bar = el('#app-topbar');
      if (!bar.shown || !near(bar.y, 0) || !near(bar.h, TOPBAR_HEIGHT)) return `the top bar is at ${fmt(bar)}, expected a ${TOPBAR_HEIGHT} px bar at the top`;
      if (bar.pointerEvents === 'none') return 'the top bar ignores the pointer on the new-game screen';
      const missing = NEW_GAME_BAR.shown.filter((selector) => !el(selector).shown);
      if (missing.length > 0) return `not shown on the new-game bar: ${missing.join(', ')}`;
      const extra = NEW_GAME_BAR.hidden.filter((selector) => el(selector).shown);
      if (extra.length > 0) return `shown on the new-game bar: ${extra.join(', ')}`;
      const title = el('#topbar-new-game-title').text;
      if (title !== 'New game') return `the title reads "${title}", expected "New game"`;
      return el('#topbar-load-btn').disabled ? null : 'Load game… is enabled';
    },
  },
  {
    name: 'new-game-menu',
    scenes: [SCENES.newGameMenu],
    needs: ['#game-menu', '#openrouter-new-btn', NEW_GAME_ITEM_HOST, '#openrouter-tactical-battles', '#game-menu-quit-btn'],
    run: (p, el) => {
      if (!el('#game-menu').shown) return 'the game menu is not shown on the new-game screen';
      if (!el('#openrouter-new-btn').disabled) return 'New game… is enabled on the new-game screen';
      const tip = el(NEW_GAME_ITEM_HOST).tip;
      if (tip !== NEW_GAME_ITEM_OPEN_TIP) return `New game…'s host tip reads "${tip}", expected "${NEW_GAME_ITEM_OPEN_TIP}"`;
      if (el('#openrouter-tactical-battles').disabled || el('#game-menu-quit-btn').disabled) {
        return 'Offer tactical battles or Quit is disabled on the new-game screen';
      }
      return null;
    },
  },
]);

module.exports = { NEW_GAME_CHECKS };
