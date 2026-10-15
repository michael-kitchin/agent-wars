/**
 * Scene names, sizes, settle times, and small helpers shared by the UI smoke checks and the runner.
 *
 * Purpose: The frame checks, the console checks, the scenario checks, the map chrome checks, the battle checks, and the
 *   runner name scenes, wait, and compare boxes the same way.
 * When to use: Required by `ui-smoke-checks.cjs`, `ui-smoke-console-checks.cjs`, `ui-smoke-scenario-checks.cjs`,
 *   `ui-smoke-map-chrome-checks.cjs`, `ui-smoke-battle-checks.cjs`, `ui-smoke-new-game.cjs`, and `ui-smoke.cjs`.
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
  mapTech: 'map-tech',
  legendOpen: 'legend-open',
  readyTip: 'ready-tip',
  ordersQueued: 'orders-queued',
  selectionCleared: 'selection-cleared',
  selectionStack: 'selection-stack',
  strikeAiming: 'strike-aiming',
  selectionResized: 'selection-resized',
  selectionResizedMin: 'selection-resized-min',
  smallWindow: 'small-window',
  legendSmallWindow: 'legend-small-window',
  turnResolved: 'turn-resolved',
  reportsTab: 'reports-tab',
  matchReopened: 'match-reopened',
  battleStart: 'battle-start',
  battleSelection: 'battle-selection',
  battleOrders: 'battle-orders',
  battleSmallWindow: 'battle-small-window',
  battleBeat: 'battle-beat',
  battleExited: 'battle-exited',
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
 * Scenes that show a battle.
 *
 * Purpose: In a battle the top bar shows the battle header, so these scenes get their own checks.
 * When to use: The `scenes` list of a check that applies only while a battle is open.
 * Expected outcome: The battle's first scene, the selection and the queued march in it, the battle at the 800 x 600
 *   minimum, and the beat after Ready. The beat can end the battle; its checks allow for that.
 * Exceptions: None.
 */
const BATTLE_SCENES = Object.freeze([
  SCENES.battleStart,
  SCENES.battleSelection,
  SCENES.battleOrders,
  SCENES.battleSmallWindow,
  SCENES.battleBeat,
]);

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
 * How long to let the page settle, in milliseconds.
 *
 * Purpose: Map tiles, canvas redraws, and the new-game overlay's own start-up work finish before a probe.
 * When to use: After a size change (`resize`), a click (`click`), the overlay opening (`overlay`), a match start
 *   (`start`), and while the pointer rests on a control until its tip shows (`tip`, longer than the one-second dwell).
 *   `turn` is the longest a played turn or battle beat may take before the run gives up.
 * Expected outcome: Fixed waits; the checks do not depend on map tiles having loaded.
 * Exceptions: None.
 */
const SETTLE_MS = Object.freeze({ resize: 1500, click: 500, overlay: 2500, start: 2500, tip: 1500, turn: 120000 });

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
  BATTLE_SCENES,
  MATCH_SCENES,
  SETTLE_MS,
  near,
  fmt,
};
