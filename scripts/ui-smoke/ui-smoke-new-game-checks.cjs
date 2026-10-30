/**
 * Checks of the new-game screen for the UI smoke run: the top bar while the new-game overlay is open, the game menu
 * there, the setup panel floating over the map with its Map, Sides, and Forces sections, and the map under it.
 *
 * Purpose: Keeps the new-game screen's checks apart from the frame, console, scenario, map chrome, and battle checks,
 *   so each table stays readable.
 * When to use: Required by `ui-smoke-checks.cjs`, which adds these rows to the run.
 * Expected outcome: Rows in the same shape as the other check tables.
 * Exceptions: None.
 */
'use strict';

const { TOPBAR_HEIGHT, SCENES, NEW_GAME_SCENES, NEW_GAME_MOVE, near, fmt } = require('./ui-smoke-scenes.cjs');

/**
 * Sizes of the setup panel, in CSS pixels.
 *
 * Purpose: The panel floats 12 px in from the map's top-left corner, inside a 1 px border. Its header bar is 50 px
 *   tall, with the 32 px expand control at its left edge. Start game spans the footer inside 18 px of side padding and
 *   12 px of bottom padding, and each section's content sits inside 18 px of padding. A map row's dropdown starts
 *   after that padding, the 5em label column (65 px at the rows' 13 px text), and a 6 px gap.
 * When to use: The panel, hidden-choices, moved-panel, and section checks.
 * Expected outcome: Matches `--new-game-panel-width` in `static/shellChrome.css`, `MAP_CHROME_INSET` in
 *   `src/shared/mapChromePlacement.ts`, and the sizes in `static/newGameChrome.css`.
 * Exceptions: None.
 */
const PANEL = Object.freeze({
  width: 432,
  inset: 12,
  border: 1,
  barHeight: 50,
  controlWidth: 32,
  headerStartMargin: 6,
  footerInset: 18,
  footerBottom: 12,
  sectionInset: 18,
  rowSelectInset: 89,
});

/**
 * The first two side rows, used to check that their homes share one left edge.
 *
 * Purpose: The default setup has You and Opponent 1. Scenes that add sides check their own labels.
 * When to use: The map-rows check.
 * Expected outcome: Selectors for the label, the home, and the randomize button of each of the first two rows.
 * Exceptions: None.
 */
const SIDE_ROW = Object.freeze({
  labels: '.new-game-side-label',
  firstSelect: '#new-game-side-rows .new-game-side-row:nth-child(1) select',
  firstRandomize: '#new-game-side-rows .new-game-side-row:nth-child(1) .new-game-randomize',
  secondSelect: '#new-game-side-rows .new-game-side-row:nth-child(2) select',
  secondRandomize: '#new-game-side-rows .new-game-side-row:nth-child(2) .new-game-randomize',
});

/**
 * The unit types in the Forces row, left to right, with each icon's name.
 *
 * Purpose: The row shows icons without words, so each icon names its type for assistive technology.
 * When to use: The unit row check.
 * Expected outcome: Infantry, Armor, Naval, Air, Missile.
 * Exceptions: None.
 */
const UNIT_ICONS = Object.freeze(['Infantry', 'Armor', 'Naval', 'Air', 'Missile'].map((name) => `.new-game-unit-token img[alt="${name}"]`));

/**
 * The four bonus dropdowns, in reading order: Origin and Tech on the first row, Terrain and Weather on the second.
 *
 * Purpose: The Rules section lays them out in two columns.
 * When to use: The Game Options check.
 * Expected outcome: Matches the ids in `static/index.html`.
 * Exceptions: None.
 */
const BONUS_SELECTS = Object.freeze([
  '#new-game-origin-bonus-select',
  '#new-game-tech-bonus-select',
  '#new-game-terrain-bonus-select',
  '#new-game-weather-bonus-select',
]);

/**
 * The new-game scenes that show the setup panel with its choices hidden.
 *
 * Purpose: Those scenes show Start in the header. The expanded layout checks must not run on them.
 * When to use: The hidden-choices check, and the filter that builds `PANEL_SCENES`.
 * Expected outcome: The startup screen and the regional screen, each after the expand control is clicked. Game over
 *   has its own check, because the button there reads "New game".
 * Exceptions: None.
 */
const HIDDEN_CHOICE_SCENES = Object.freeze([SCENES.newGameHidden, SCENES.newGameRegionalHidden]);

/**
 * The new-game scenes that show the setup panel expanded.
 *
 * Purpose: The panel's layout checks apply only while the choices and the footer show.
 * When to use: The `scenes` list of a panel layout check.
 * Expected outcome: Derived from `NEW_GAME_SCENES`, without the three scenes whose choices are hidden.
 * Exceptions: None.
 */
const PANEL_SCENES = Object.freeze(NEW_GAME_SCENES.filter((scene) => !HIDDEN_CHOICE_SCENES.includes(scene) && scene !== SCENES.gameOverHidden));

/**
 * Setup scenes whose side list is still the default two rows.
 *
 * Purpose: The four-side and three-side scenes have their own label checks.
 * When to use: The map-rows check.
 * Expected outcome: Every expanded setup scene except those two.
 * Exceptions: None.
 */
const TWO_SIDE_PANEL_SCENES = Object.freeze(PANEL_SCENES.filter((scene) => scene !== SCENES.newGameFourSides && scene !== SCENES.newGameThreeSides));

/**
 * The top bar's parts that the new-game screen shows, and the parts it hides.
 *
 * Purpose: The new-game bar is the menu button, the title, Load game… (enabled), Settings, and Help; the match status and the
 *   battle header stay hidden, even when the overlay was opened from a battle.
 * When to use: The new-game top bar check.
 * Expected outcome: Selectors only.
 * Exceptions: None.
 */
const NEW_GAME_BAR = Object.freeze({
  shown: ['#game-menu-btn', '#topbar-new-game-title', '#topbar-load-btn', '#topbar-settings-btn', '#topbar-help-btn'],
  hidden: ['#app-topbar .topbar-sides', '#topbar-view-as', '#app-topbar .topbar-stat', '#app-topbar .topbar-date-block', '#battle-header-place', '#battle-header-center', '#tactical-exit-btn'],
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
 * The tip host around Add another opponent.
 *
 * Purpose: The host carries the reason the button is available, or the limit that blocks it.
 * When to use: The Add another opponent checks.
 * Expected outcome: Matches the host in `static/index.html`.
 * Exceptions: None.
 */
const ADD_OPPONENT_HOST = '.control-tooltip-host:has(#new-game-add-side-btn)';

/**
 * Finds the right edge of a section's content in the panel's body.
 *
 * Purpose: The body scrolls when the window is short, and its scrollbar then takes width from the sections.
 * When to use: Checks of controls that reach a section's right edge.
 * Expected outcome: The body's left edge plus its client width, less the sections' padding.
 * Exceptions: None.
 */
function sectionInnerRight(body) {
  return body.x + body.clientWidth - PANEL.sectionInset;
}

/**
 * Checks Start in the header bar while the choices are hidden.
 *
 * Purpose: The same button fills the bar between the expand control and the close control, or the bar's right edge.
 * When to use: The hidden-choices checks, with the label that screen shows.
 * Expected outcome: Null when the button is in the header, inset by `PANEL.headerStartMargin`, and reads `label`.
 *   A failure message otherwise. This does not check whether the button is enabled: at game over the Regional tab
 *   can be a map with fewer than two sides, and Start is disabled then.
 * Exceptions: None.
 */
function hiddenHeaderStartProblem(panel, collapse, start, close, label) {
  const innerY = panel.y + PANEL.border;
  const innerRight = panel.x + panel.w - PANEL.border;
  const margin = PANEL.headerStartMargin;
  if (!start.shown || !start.ancestorIds.includes('new-game-panel-header')) return `Start is not in the header (${fmt(start)})`;
  if (start.text !== label) return `the header button reads "${start.text}", expected "${label}"`;
  if (!near(start.x, collapse.x + collapse.w + margin)) {
    return `the header button is at ${fmt(start)}, expected ${margin} px right of the expand control ${fmt(collapse)}`;
  }
  const rightEdge = close.shown ? close.x : innerRight;
  const rightOf = close.shown ? 'the close control' : "the bar's right edge";
  if (!near(start.x + start.w, rightEdge - margin)) {
    return `the header button is at ${fmt(start)}, expected ${margin} px left of ${rightOf}`;
  }
  if (!near(start.y, innerY + margin) || !near(start.h, PANEL.barHeight - 2 * margin)) {
    return `the header button is at ${fmt(start)}, expected ${margin} px below the header's top and ${PANEL.barHeight - 2 * margin} px tall`;
  }
  return null;
}

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
    name: 'new-game-panel-over-map',
    scenes: PANEL_SCENES.filter((scene) => scene !== SCENES.newGameMoved),
    needs: ['#game-over-overlay', '#canvas-container'],
    run: (p, el) => {
      const panel = el('#game-over-overlay');
      const c = el('#canvas-container');
      if (!panel.shown) return 'the setup panel is not shown';
      if (!near(panel.x, PANEL.inset) || !near(panel.y, TOPBAR_HEIGHT + PANEL.inset) || !near(panel.w, PANEL.width)) {
        return `the setup panel is at ${fmt(panel)}, expected ${PANEL.width} px wide, ${PANEL.inset} px in from the map's top-left corner`;
      }
      if (panel.y + panel.h > p.viewport.h - PANEL.inset + 1) return `the setup panel ${fmt(panel)} runs into the map's bottom inset`;
      return near(c.x, 0) && near(c.y, TOPBAR_HEIGHT) && near(c.w, p.viewport.w) && near(c.y + c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} should fill the window under the top bar, with the panel over it`;
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
      const innerX = panel.x + PANEL.border;
      const innerY = panel.y + PANEL.border;
      const innerRight = panel.x + panel.w - PANEL.border;
      const innerBottom = panel.y + panel.h - PANEL.border;
      if (!near(collapse.x, innerX) || !near(collapse.y, innerY) || !near(collapse.w, PANEL.controlWidth)) {
        return `the expand control is at ${fmt(collapse)}, expected a ${PANEL.controlWidth} px column at the header bar's left edge`;
      }
      if (collapse.expanded !== 'true') return `the expand control reads aria-expanded=${collapse.expanded}`;
      if (!message.shown || message.x < collapse.x + collapse.w) return `the message ${fmt(message)} is not right of the expand control`;
      if (!start.ancestorIds.includes('new-game-panel-footer')) return 'Start game is not in the footer while the choices show';
      if (!start.shown || !near(start.x, innerX + PANEL.footerInset) || !near(start.x + start.w, innerRight - PANEL.footerInset)) {
        return `Start game is at ${fmt(start)}, expected the footer's width inside ${PANEL.footerInset} px of padding`;
      }
      if (!near(start.y + start.h, innerBottom - PANEL.footerBottom)) {
        return `Start game is at ${fmt(start)}, expected ${PANEL.footerBottom} px above the panel's bottom edge`;
      }
      if (body.y < collapse.y + collapse.h || body.y + body.h > start.y) return `the choices ${fmt(body)} are not between the header and the footer`;
      return body.scrollWidth <= body.clientWidth + 1 ? null : `the choices are ${body.scrollWidth} px wide in a ${body.clientWidth} px panel`;
    },
  },
  {
    name: 'new-game-choices-hidden',
    scenes: HIDDEN_CHOICE_SCENES,
    needs: ['#game-over-overlay', '#canvas-container', '#new-game-dialog-collapse', '#game-over-message', '#game-over-dialog', '#new-game-btn', '#new-game-dialog-close'],
    run: (p, el) => {
      const panel = el('#game-over-overlay');
      const c = el('#canvas-container');
      const collapse = el('#new-game-dialog-collapse');
      if (!near(c.x, 0) || !near(c.y, TOPBAR_HEIGHT) || !near(c.w, p.viewport.w)) {
        return `#canvas-container ${fmt(c)} should fill the window's width under the top bar`;
      }
      if (!collapse.shown || !near(collapse.x, PANEL.inset + PANEL.border) || !near(collapse.y, TOPBAR_HEIGHT + PANEL.inset + PANEL.border)) {
        return `the expand control is at ${fmt(collapse)}, expected where it sits while the choices show`;
      }
      if (collapse.expanded !== 'false') return `the expand control reads aria-expanded=${collapse.expanded}`;
      if (el('#game-over-message').shown) return 'the message is shown with the choices hidden';
      if (el('#game-over-dialog').shown) return 'the choices are shown';
      if (!near(panel.h, PANEL.barHeight + 2 * PANEL.border)) {
        return `the panel is ${Math.round(panel.h)} px tall with the choices hidden, expected the ${PANEL.barHeight} px bar inside its border`;
      }
      const start = el('#new-game-btn');
      const problem = hiddenHeaderStartProblem(panel, collapse, start, el('#new-game-dialog-close'), 'Start game');
      if (problem) return problem;
      return start.disabled ? 'Start game is disabled' : null;
    },
  },
  {
    name: 'game-over-choices-hidden',
    scenes: [SCENES.gameOverHidden],
    needs: ['#game-over-overlay', '#new-game-dialog-collapse', '#game-over-message', '#game-over-dialog', '#new-game-btn', '#new-game-dialog-close'],
    run: (p, el) => {
      const panel = el('#game-over-overlay');
      const close = el('#new-game-dialog-close');
      if (close.shown) return 'the close control shows at game over';
      if (el('#game-over-message').shown) return 'the result is shown with the choices hidden';
      if (el('#game-over-dialog').shown) return 'the choices are shown at game over';
      if (!near(panel.h, PANEL.barHeight + 2 * PANEL.border)) {
        return `the panel is ${Math.round(panel.h)} px tall with the choices hidden, expected the ${PANEL.barHeight} px bar inside its border`;
      }
      return hiddenHeaderStartProblem(panel, el('#new-game-dialog-collapse'), el('#new-game-btn'), close, 'New game');
    },
  },
  {
    name: 'new-game-panel-moved',
    scenes: [SCENES.newGameMoved],
    needs: ['#game-over-overlay'],
    run: (p, el) => {
      const panel = el('#game-over-overlay');
      const mapHeight = p.viewport.h - TOPBAR_HEIGHT;
      const x = PANEL.inset + NEW_GAME_MOVE.x;
      const y = TOPBAR_HEIGHT + Math.min(PANEL.inset + NEW_GAME_MOVE.y, Math.max(PANEL.inset, mapHeight - panel.h - PANEL.inset));
      return Math.abs(panel.x - x) <= 2 && Math.abs(panel.y - y) <= 2
        ? null
        : `the moved panel is at ${fmt(panel)}, expected ${Math.round(x)},${Math.round(y)}: dragged by ${NEW_GAME_MOVE.x},${NEW_GAME_MOVE.y} and kept ${PANEL.inset} px inside the map`;
    },
  },
  {
    name: 'new-game-close-hidden-without-match',
    scenes: [SCENES.newGameStartup, SCENES.newGameMenu, SCENES.newGameHidden, SCENES.newGameMoved, SCENES.gameOverReopened, SCENES.gameOverHidden, SCENES.gameOverSmallWindow],
    needs: ['#new-game-dialog-close'],
    run: (p, el) => (el('#new-game-dialog-close').shown ? 'the close control shows with no match to go back to' : null),
  },
  {
    name: 'new-game-close-over-match',
    scenes: [SCENES.newGameReopened, SCENES.newGameRegional, SCENES.newGameRegionalHidden],
    needs: ['#game-over-overlay', '#new-game-dialog-close', '#game-over-message'],
    run: (p, el) => {
      const panel = el('#game-over-overlay');
      const close = el('#new-game-dialog-close');
      const message = el('#game-over-message');
      if (!close.shown) return 'the close control is hidden while a match waits under the screen';
      const atRightEdge = near(close.x + close.w, panel.x + panel.w - PANEL.border) && near(close.y, panel.y + PANEL.border) && near(close.w, PANEL.controlWidth);
      if (!atRightEdge) return `the close control is at ${fmt(close)}, expected a ${PANEL.controlWidth} px column at the header bar's right edge`;
      return message.x + message.w <= close.x + 1 ? null : `the message ${fmt(message)} runs under the close control ${fmt(close)}`;
    },
  },
  {
    name: 'new-game-closed-returns-to-match',
    scenes: [SCENES.newGameClosed],
    needs: ['#game-over-overlay', '#sidebar', '#topbar-turn-phase'],
    run: (p, el) => {
      if (el('#game-over-overlay').shown) return 'the new-game screen still shows after Close';
      if (!el('#sidebar').shown) return 'the console is not back after Close';
      const phase = el('#topbar-turn-phase').text;
      return /· Planning$/.test(phase) ? null : `the top bar reads "${phase}", expected the match's planning step`;
    },
  },
  {
    name: 'new-game-sections',
    scenes: PANEL_SCENES,
    needs: ['#new-game-section-map', '#new-game-section-sides', '#new-game-section-forces'],
    run: (p, el) => {
      const titles = ['#new-game-section-map', '#new-game-section-sides', '#new-game-section-forces'].map(el);
      const text = titles.map((title) => title.text).join(', ');
      if (text !== 'Map, Sides, Forces') return `the section titles read "${text}", expected "Map, Sides, Forces"`;
      return titles[0].y < titles[1].y && titles[1].y < titles[2].y ? null : 'the sections are not in the order Map, Sides, Forces';
    },
  },
  {
    name: 'new-game-map-rows',
    scenes: TWO_SIDE_PANEL_SCENES,
    needs: [
      '#game-over-dialog',
      '#new-game-panel-regional',
      '#new-game-panel-regional label',
      '#new-game-region-select',
      '#new-game-region-randomize',
      SIDE_ROW.labels,
      SIDE_ROW.firstSelect,
      SIDE_ROW.firstRandomize,
      SIDE_ROW.secondSelect,
      SIDE_ROW.secondRandomize,
    ],
    run: (p, el) => {
      const labels = el(SIDE_ROW.labels).allTexts.join(', ');
      if (labels !== 'You, Opponent 1') return `the side labels read "${labels}", expected "You, Opponent 1"`;
      const first = el(SIDE_ROW.firstSelect);
      const second = el(SIDE_ROW.secondSelect);
      if (!near(first.x, second.x) || !near(first.w, second.w)) return 'the side homes do not share a left edge and width';
      const randomize = el(SIDE_ROW.firstRandomize);
      const secondRandomize = el(SIDE_ROW.secondRandomize);
      if (!near(first.x + first.w, randomize.x - 6) || !near(randomize.h, first.h)) {
        return `the first side's randomize button is at ${fmt(randomize)}, expected a square the dropdown's height, 6 px to its right`;
      }
      if (!near(secondRandomize.x, randomize.x)) return 'the side randomize buttons do not line up';
      if (!el('#new-game-panel-regional').shown) return null;
      const regionLabels = el('#new-game-panel-regional label').allTexts.join(', ');
      if (regionLabels !== 'Region') return `the regional labels read "${regionLabels}", expected "Region"`;
      const body = el('#game-over-dialog');
      const region = el('#new-game-region-select');
      const regionButton = el('#new-game-region-randomize');
      const selectLeft = body.x + PANEL.rowSelectInset;
      if (!near(region.x, selectLeft) || !near(region.x + region.w, regionButton.x - 6)) {
        return `the region dropdown is at ${fmt(region)}, expected from x=${selectLeft} to the randomize button`;
      }
      return near(regionButton.x + regionButton.w, sectionInnerRight(body)) && near(regionButton.h, region.h)
        ? null
        : `the region randomize button is at ${fmt(regionButton)}, expected a square the dropdown's height at the panel's inner right edge`;
    },
  },
  {
    name: 'new-game-add-side',
    scenes: PANEL_SCENES.filter((scene) => scene !== SCENES.newGameFourSides),
    needs: ['#game-over-dialog', '#new-game-add-side-btn', ADD_OPPONENT_HOST],
    run: (p, el) => {
      const body = el('#game-over-dialog');
      const button = el('#new-game-add-side-btn');
      if (button.disabled) return 'Add another opponent is disabled while a home is free';
      const tip = el(ADD_OPPONENT_HOST).tip;
      if (tip !== 'Add a side on the next free home.') return `Add another opponent's host tip reads "${tip}"`;
      return near(button.x, body.x + PANEL.sectionInset) && near(button.x + button.w, sectionInnerRight(body))
        ? null
        : `Add another opponent is at ${fmt(button)}, expected the section's inner width`;
    },
  },
  {
    name: 'new-game-four-sides',
    scenes: [SCENES.newGameFourSides],
    needs: ['.new-game-side-label', '.commander-popover', '#new-game-add-side-btn', ADD_OPPONENT_HOST],
    run: (p, el) => {
      const labels = el('.new-game-side-label').allTexts.join(', ');
      if (labels !== 'You, Opponent 1, Opponent 2, Opponent 3') return `the side labels read "${labels}"`;
      if (!el('.commander-popover').shown) return 'the commander popover is not shown';
      if (!el('#new-game-add-side-btn').disabled) return 'Add another opponent is enabled at four sides';
      const tip = el(ADD_OPPONENT_HOST).tip;
      return tip === 'Up to 4 sides' ? null : `Add another opponent's host tip reads "${tip}", expected "Up to 4 sides"`;
    },
  },
  {
    name: 'new-game-three-sides',
    scenes: [SCENES.newGameThreeSides],
    needs: ['.new-game-side-label', 'select[aria-label="You home"]'],
    run: (p, el) => {
      const labels = el('.new-game-side-label').allTexts.join(', ');
      if (labels !== 'You, Opponent 1, Opponent 2') return `the side labels read "${labels}"`;
      const home = el('select[aria-label="You home"]');
      return home.optionCount >= 4 ? null : `the home list has ${home.optionCount} entries, expected the region list`;
    },
  },
  {
    name: 'standings-four-sides',
    scenes: [SCENES.standingsFour],
    needs: ['#game-over-message', '#game-over-standings'],
    run: (p, el) => {
      const message = el('#game-over-message').text;
      if (message !== 'You placed 4th of 4.') return `the heading reads "${message}", expected "You placed 4th of 4."`;
      const section = el('#game-over-standings');
      if (!section.shown) return 'the standings section is hidden';
      return section.text.includes('Winner') ? null : `the standings read "${section.text}"`;
    },
  },
  {
    name: 'new-game-unit-row',
    scenes: PANEL_SCENES,
    needs: ['.new-game-unit', '.new-game-unit:first-child', '.new-game-unit:last-child', ...UNIT_ICONS],
    run: (p, el) => {
      const texts = el('.new-game-unit').allTexts;
      const bad = texts.filter((text) => !/^\d+·\u2692\uFE0E\d+$/.test(text));
      if (texts.length !== 5 || bad.length > 0) return `the unit row reads "${texts.join(' | ')}", expected five cap and production-price entries`;
      return near(el('.new-game-unit:first-child').y, el('.new-game-unit:last-child').y) ? null : 'the five unit types are not on one row';
    },
  },
  {
    name: 'new-game-forces-row',
    scenes: PANEL_SCENES,
    needs: ['#new-game-size-select', '#new-game-start-month', '#new-game-start-month-randomize'],
    run: (p, el) => {
      const size = el('#new-game-size-select');
      const month = el('#new-game-start-month');
      if (!near(size.y, month.y) || !near(size.w, month.w) || !(month.x > size.x)) {
        return `Game size ${fmt(size)} and Starting month ${fmt(month)} are not equal selects on one row`;
      }
      const button = el('#new-game-start-month-randomize');
      return near(button.w, 30) && near(button.h, month.h) && near(month.x + month.w, button.x - 6)
        ? null
        : `the month randomize button is at ${fmt(button)}, expected 30 px wide, the month's height, 6 px to its right`;
    },
  },
  {
    name: 'new-game-options-button',
    scenes: PANEL_SCENES,
    needs: ['#new-game-options-btn', '.new-game-units', '#new-game-section-victory'],
    run: (p, el) => {
      const button = el('#new-game-options-btn');
      if (!button.shown) return 'Game Options is hidden';
      if (button.text !== 'Game Options.') return `the options button reads "${button.text}"`;
      if (!(button.y > el('.new-game-units').y)) return 'Game Options is not under the unit row';
      return el('#new-game-section-victory').shown ? 'Victory is shown on the setup panel' : null;
    },
  },
  {
    name: 'new-game-options-popover',
    scenes: [SCENES.newGameOptions],
    needs: ['#new-game-options-popover', '#new-game-victory-select', ...BONUS_SELECTS, '#new-game-fog-checkbox', '#new-game-auto-start-checkbox'],
    run: (p, el) => {
      if (!el('#new-game-options-popover').shown) return 'Game Options is hidden';
      const victory = el('#new-game-victory-select');
      const [origin, tech, terrain, weather] = BONUS_SELECTS.map(el);
      if (!(victory.y < origin.y)) return 'Victory is not above the bonuses';
      if (!near(origin.y, tech.y) || !near(terrain.y, weather.y) || terrain.y <= origin.y) return 'the bonuses are not two rows of two';
      if (!near(origin.x, terrain.x) || !near(tech.x, weather.x) || tech.x <= origin.x) return 'the bonuses are not two columns';
      const fog = el('#new-game-fog-checkbox');
      const autoStart = el('#new-game-auto-start-checkbox');
      return fog.shown && autoStart.shown && near(autoStart.y, fog.y) && autoStart.x > fog.x
        ? null
        : `Auto-start AI is at ${fmt(autoStart)}, expected right of Fog of war ${fmt(fog)} on the same line`;
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
      return el('#topbar-load-btn').disabled ? 'Load game… is disabled' : null;
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
