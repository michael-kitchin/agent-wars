/**
 * Scene names, sizes, and small helpers shared by the UI smoke checks and the runner.
 *
 * Purpose: The frame checks, the console checks, the scenario checks, and the runner name scenes and compare boxes the
 *   same way.
 * When to use: Required by `ui-smoke-checks.cjs`, `ui-smoke-console-checks.cjs`, `ui-smoke-scenario-checks.cjs`, and
 *   `ui-smoke.cjs`.
 * Expected outcome: Plain constants and pure functions; nothing runs on load.
 * Exceptions: None.
 */
'use strict';

/**
 * Height of the top bar in CSS pixels.
 *
 * Purpose: The top bar, the map, and the console are all placed against this edge.
 * When to use: Geometry checks for the top bar, the map, the console, and the game menu.
 * Expected outcome: Matches `--topbar-height` in `static/shellChrome.css`.
 * Exceptions: None.
 */
const TOPBAR_HEIGHT = 44;

/**
 * Width of the expanded console in CSS pixels: the content column plus the tab rail.
 *
 * Purpose: The map must end where the console starts.
 * When to use: The expanded-console geometry check.
 * Expected outcome: Matches `--console-content-width` plus `--console-rail-width` in `static/shellChrome.css`.
 * Exceptions: None.
 */
const CONSOLE_EXPANDED_WIDTH = 376;

/**
 * Width of the collapsed console in CSS pixels: the tab rail alone.
 *
 * Purpose: A collapsed console must give the rest of the width to the map.
 * When to use: The collapsed-console geometry check.
 * Expected outcome: Matches `--console-rail-width` in `static/shellChrome.css`.
 * Exceptions: None.
 */
const CONSOLE_COLLAPSED_WIDTH = 56;

/**
 * Scene names. Each check lists the scenes it applies to; the runner records one probe per scene.
 *
 * Purpose: Keeps scene names in one place for the runner and the checks.
 * When to use: The runner passes one of these, optionally followed by `@<width>x<height>`, to `runChecks`.
 * Expected outcome: Strings only; the runner owns the order.
 * Exceptions: None.
 */
const SCENES = Object.freeze({
  newGameStartup: 'new-game-startup',
  strategic: 'strategic',
  opponentTab: 'opponent-tab',
  consoleCollapsed: 'console-collapsed',
  consoleExpandedAgain: 'console-expanded-again',
  gameMenuOpen: 'game-menu-open',
  gameMenuEscape: 'game-menu-escape',
  gameMenuOutside: 'game-menu-outside',
  readyTip: 'ready-tip',
  ordersQueued: 'orders-queued',
  selectionCleared: 'selection-cleared',
  selectionStack: 'selection-stack',
  strikeAiming: 'strike-aiming',
  smallWindow: 'small-window',
  matchReopened: 'match-reopened',
  battleStart: 'battle-start',
  battleSelection: 'battle-selection',
  battleOrders: 'battle-orders',
  newGameReopened: 'new-game-reopened',
  regionalStart: 'regional-start',
  regionalSelection: 'regional-selection',
  gameOverReopened: 'game-over-reopened',
});

/**
 * Scenes that show the new-game overlay.
 *
 * Purpose: The overlay hides the match chrome, so these scenes get their own checks.
 * When to use: The `scenes` list of a check that applies only while the overlay is open.
 * Expected outcome: The first scene, the overlay opened from a match, and the finished match reopened.
 * Exceptions: None.
 */
const NEW_GAME_SCENES = Object.freeze([SCENES.newGameStartup, SCENES.newGameReopened, SCENES.gameOverReopened]);

/**
 * Scenes that show a match: every scene that is not a new-game scene.
 *
 * Purpose: A scene added to `SCENES` is covered by the match checks without editing them.
 * When to use: The `scenes` list of a check that applies while a match is on screen.
 * Expected outcome: Derived from `SCENES` and `NEW_GAME_SCENES`.
 * Exceptions: None.
 */
const MATCH_SCENES = Object.freeze(Object.values(SCENES).filter((scene) => !NEW_GAME_SCENES.includes(scene)));

/**
 * Reports whether two numbers are within one CSS pixel.
 *
 * Purpose: Layout boxes can land on fractional pixels; a one-pixel tolerance keeps checks stable.
 * When to use: Every geometry comparison in the check files.
 * Expected outcome: True when `|a - b| <= 1`.
 * Exceptions: None.
 */
function near(a, b) {
  return Math.abs(a - b) <= 1;
}

/**
 * Formats a box for a failure message.
 *
 * Purpose: Failure lines should show the numbers that failed.
 * When to use: Inside check failure messages.
 * Expected outcome: `x,y wxh` rounded to whole pixels, with ` (hidden)` when the element is not shown.
 * Exceptions: None.
 */
function fmt(b) {
  return `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}${b.shown ? '' : ' (hidden)'}`;
}

module.exports = {
  TOPBAR_HEIGHT,
  CONSOLE_EXPANDED_WIDTH,
  CONSOLE_COLLAPSED_WIDTH,
  SCENES,
  NEW_GAME_SCENES,
  MATCH_SCENES,
  near,
  fmt,
};
