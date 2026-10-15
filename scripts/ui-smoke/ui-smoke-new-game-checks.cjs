/**
 * Checks of the new-game screen for the UI smoke run: the top bar while the new-game overlay is open, the game menu
 * there, the setup panel docked at the left, and the map beside it.
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
 * Sizes of the setup panel, in CSS pixels.
 *
 * Purpose: The panel is docked at the left, the hide-choices button sits 12 px in from the panel's top-left corner,
 *   and Start game spans the footer inside its 18 px padding.
 * When to use: The panel and hidden-choices checks.
 * Expected outcome: Matches `--new-game-panel-width` in `static/shellChrome.css` and the padding in
 *   `static/newGameChrome.css`.
 * Exceptions: None.
 */
const PANEL = Object.freeze({ width: 432, headerInset: 12, footerInset: 18 });

/**
 * The new-game scenes that show the setup panel: every new-game scene except the one with the choices hidden.
 *
 * Purpose: The panel's layout checks apply only while the panel shows.
 * When to use: The `scenes` list of a panel layout check.
 * Expected outcome: Derived from `NEW_GAME_SCENES`.
 * Exceptions: None.
 */
const PANEL_SCENES = Object.freeze(NEW_GAME_SCENES.filter((scene) => scene !== SCENES.newGameHidden));

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
    name: 'new-game-panel-beside-map',
    scenes: PANEL_SCENES,
    needs: ['#game-over-overlay', '#canvas-container'],
    run: (p, el) => {
      const panel = el('#game-over-overlay');
      const c = el('#canvas-container');
      if (!panel.shown) return 'the setup panel is not shown';
      if (!near(panel.x, 0) || !near(panel.y, TOPBAR_HEIGHT) || !near(panel.w, PANEL.width) || !near(panel.y + panel.h, p.viewport.h)) {
        return `the setup panel is at ${fmt(panel)}, expected ${PANEL.width} px wide at the left, from the top bar to the window's bottom`;
      }
      return near(c.x, PANEL.width) && near(c.y, TOPBAR_HEIGHT) && near(c.x + c.w, p.viewport.w) && near(c.y + c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} should fill the rest of the window, right of the panel and under the top bar`;
    },
  },
  {
    name: 'new-game-panel-layout',
    scenes: PANEL_SCENES,
    needs: ['#game-over-overlay', '#new-game-dialog-collapse', '#game-over-message', '#game-over-dialog', '#new-game-btn'],
    run: (p, el) => {
      const panel = el('#game-over-overlay');
      const collapse = el('#new-game-dialog-collapse');
      const message = el('#game-over-message');
      const body = el('#game-over-dialog');
      const start = el('#new-game-btn');
      if (!near(collapse.x, panel.x + PANEL.headerInset) || !near(collapse.y, panel.y + PANEL.headerInset)) {
        return `the hide-choices button is at ${fmt(collapse)}, expected ${PANEL.headerInset} px in from the panel's top-left corner`;
      }
      if (collapse.expanded !== 'true') return `the hide-choices button reads aria-expanded=${collapse.expanded}`;
      if (!message.shown || message.x < collapse.x + collapse.w) return `the message ${fmt(message)} is not right of the hide-choices button`;
      if (!start.shown || !near(start.x, panel.x + PANEL.footerInset) || !near(start.x + start.w, panel.x + panel.w - 1 - PANEL.footerInset)) {
        return `Start game is at ${fmt(start)}, expected the footer's width inside ${PANEL.footerInset} px of padding`;
      }
      if (start.y + start.h > p.viewport.h || start.y + start.h < p.viewport.h - 2 * PANEL.footerInset) {
        return `Start game is at ${fmt(start)}, expected at the bottom of the window`;
      }
      if (body.y < collapse.y + collapse.h || body.y + body.h > start.y) return `the choices ${fmt(body)} are not between the header and the footer`;
      return body.scrollWidth <= body.clientWidth + 1 ? null : `the choices are ${body.scrollWidth} px wide in a ${body.clientWidth} px panel`;
    },
  },
  {
    name: 'new-game-choices-hidden',
    scenes: [SCENES.newGameHidden],
    needs: ['#game-over-overlay', '#canvas-container', '#new-game-dialog-collapse', '#game-over-message', '#game-over-dialog', '#new-game-btn'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const collapse = el('#new-game-dialog-collapse');
      if (!near(c.x, 0) || !near(c.y, TOPBAR_HEIGHT) || !near(c.w, p.viewport.w)) {
        return `#canvas-container ${fmt(c)} should fill the window's width under the top bar while the choices are hidden`;
      }
      if (!collapse.shown || !near(collapse.x, PANEL.headerInset) || !near(collapse.y, TOPBAR_HEIGHT + PANEL.headerInset)) {
        return `the hide-choices button is at ${fmt(collapse)}, expected where it sits while the choices show`;
      }
      if (collapse.expanded !== 'false') return `the hide-choices button reads aria-expanded=${collapse.expanded}`;
      const shown = ['#game-over-message', '#game-over-dialog', '#new-game-btn'].filter((selector) => el(selector).shown);
      return shown.length === 0 ? null : `still shown with the choices hidden: ${shown.join(', ')}`;
    },
  },
  {
    name: 'new-game-map-takes-pointer',
    scenes: NEW_GAME_SCENES,
    needs: ['#main-map'],
    run: (p, el) => (el('#main-map').pointerEvents === 'none' ? 'the preview map ignores the pointer on the new-game screen' : null),
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
