/**
 * Layout checks for the UI smoke run.
 *
 * Purpose: Turns one probe of the page into PASS or FAIL results, so a layout change can be verified without
 *   comparing screenshots pixel by pixel.
 * When to use: From `ui-smoke.cjs`. `probePage` runs in the renderer; `runChecks` runs in Node.
 * Expected outcome: Each check names the scenes it applies to and the elements it reads. A check fails, and names
 *   the elements, when any of them is missing from the page.
 * Exceptions: None. A check that throws is reported as FAIL with the error message.
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
  newGameReopened: 'new-game-reopened',
});

/**
 * Scenes that show the new-game overlay.
 *
 * Purpose: The overlay hides the match chrome, so these scenes get their own checks.
 * When to use: The `scenes` list of a check that applies only while the overlay is open.
 * Expected outcome: The first scene and the last scene of every run.
 * Exceptions: None.
 */
const NEW_GAME_SCENES = Object.freeze([SCENES.newGameStartup, SCENES.newGameReopened]);

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
 * Collects what the checks read from the renderer page.
 *
 * Purpose: Runs inside the page through `page.evaluate`, so it may only use browser globals and its argument.
 * When to use: Once per scene, after the scene has settled, with every selector that any check reads.
 * Expected outcome: A plain object that can be passed back to Node. `elements` has one entry per selector:
 *   null when the selector matches nothing, otherwise its box, text, and the attributes the checks use.
 * Exceptions: None.
 */
function probePage(selectors) {
  /**
   * Describes one element for the checks.
   *
   * Purpose: Every check reads elements the same way.
   * When to use: For each selector passed to `probePage`.
   * Expected outcome: The element's box, whether it is shown, its trimmed text, and selected attributes,
   *   or null when the selector matches nothing.
   * Exceptions: None.
   */
  const describe = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const shown = el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    const ancestorIds = [];
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (parent.id) ancestorIds.push(parent.id);
    }
    return {
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
      shown,
      text: (el.textContent || '').trim(),
      disabled: el.disabled === true,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      canvasWidth: el instanceof HTMLCanvasElement ? el.width : null,
      canvasHeight: el instanceof HTMLCanvasElement ? el.height : null,
      collapsed: el.getAttribute('data-collapsed'),
      expanded: el.getAttribute('aria-expanded'),
      ancestorIds,
    };
  };
  const elements = {};
  for (const selector of selectors) elements[selector] = describe(selector);
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
    activeElementId: document.activeElement ? document.activeElement.id : '',
    elements,
  };
}

/**
 * Reports whether two numbers are within one CSS pixel.
 *
 * Purpose: Layout boxes can land on fractional pixels; a one-pixel tolerance keeps checks stable.
 * When to use: Every geometry comparison in this file.
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

/**
 * The checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a layout rule needs a machine check. `needs` lists every selector the row reads;
 *   `run(p, el)` gets the probe and a lookup for those selectors, and returns null on success or a failure message.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const CHECKS = Object.freeze([
  {
    name: 'no-page-scroll',
    scenes: [...MATCH_SCENES, ...NEW_GAME_SCENES],
    needs: [],
    run: (p) => (p.scroll.w <= p.viewport.w + 1 && p.scroll.h <= p.viewport.h + 1
      ? null
      : `page scrolls: content ${p.scroll.w}x${p.scroll.h}, window ${p.viewport.w}x${p.viewport.h}`),
  },
  {
    name: 'map-fills-container',
    scenes: [...MATCH_SCENES, ...NEW_GAME_SCENES],
    needs: ['#canvas-container', '#main-map'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const m = el('#main-map');
      return near(c.x, m.x) && near(c.y, m.y) && near(c.w, m.w) && near(c.h, m.h)
        ? null
        : `#main-map ${fmt(m)} differs from #canvas-container ${fmt(c)}`;
    },
  },
  {
    name: 'overlay-canvas-matches-container',
    scenes: MATCH_SCENES,
    needs: ['#canvas-container', '#map-overlay'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const o = el('#map-overlay');
      if (!(near(c.x, o.x) && near(c.y, o.y) && near(c.w, o.w) && near(c.h, o.h))) {
        return `#map-overlay ${fmt(o)} differs from #canvas-container ${fmt(c)}`;
      }
      const expectedWidth = Math.floor(c.w) * p.viewport.dpr;
      const expectedHeight = Math.floor(c.h) * p.viewport.dpr;
      return near(o.canvasWidth, expectedWidth) && near(o.canvasHeight, expectedHeight)
        ? null
        : `canvas backing store ${o.canvasWidth}x${o.canvasHeight}, expected about ${expectedWidth}x${expectedHeight}`;
    },
  },
  {
    name: 'new-game-fills-window',
    scenes: NEW_GAME_SCENES,
    needs: ['#canvas-container', '#game-over-overlay'],
    run: (p, el) => {
      const c = el('#canvas-container');
      if (!el('#game-over-overlay').shown) return 'the new-game overlay is not shown';
      return near(c.x, 0) && near(c.y, 0) && near(c.w, p.viewport.w) && near(c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} does not fill the ${p.viewport.w}x${p.viewport.h} window`;
    },
  },
  {
    name: 'frame-hidden-during-new-game',
    scenes: NEW_GAME_SCENES,
    needs: ['#sidebar', '#app-topbar', '#game-menu'],
    run: (p) => {
      const shown = Object.entries(p.elements).filter(([, e]) => e.shown).map(([selector]) => selector);
      return shown.length === 0 ? null : `still shown during the new-game overlay: ${shown.join(', ')}`;
    },
  },
  {
    name: 'map-beside-console',
    scenes: MATCH_SCENES,
    needs: ['#canvas-container', '#sidebar'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const s = el('#sidebar');
      return near(c.x, 0) && near(c.y, TOPBAR_HEIGHT) && near(c.x + c.w, s.x) && near(c.y + c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} should run from 0,${TOPBAR_HEIGHT} to the console at x=${Math.round(s.x)} and the window bottom`;
    },
  },
  {
    name: 'topbar-geometry',
    scenes: MATCH_SCENES,
    needs: ['#app-topbar'],
    run: (p, el) => {
      const t = el('#app-topbar');
      return t.shown && near(t.x, 0) && near(t.y, 0) && near(t.w, p.viewport.w) && near(t.h, TOPBAR_HEIGHT)
        ? null
        : `#app-topbar is ${fmt(t)}, expected 0,0 ${p.viewport.w}x${TOPBAR_HEIGHT}`;
    },
  },
  {
    name: 'topbar-no-overflow',
    scenes: MATCH_SCENES,
    needs: ['#app-topbar'],
    run: (p, el) => {
      const t = el('#app-topbar');
      return t.scrollWidth <= t.clientWidth + 1 ? null : `top bar content is ${t.scrollWidth}px wide in ${t.clientWidth}px`;
    },
  },
  {
    name: 'topbar-sides',
    scenes: [SCENES.strategic],
    needs: ['#topbar-human-side', '#topbar-opponent-side'],
    run: (p, el) => {
      const human = el('#topbar-human-side').text;
      const opponent = el('#topbar-opponent-side').text;
      return human === 'Southern Europe' && opponent === 'Northern Africa' ? null : `sides read "${human}" vs "${opponent}"`;
    },
  },
  {
    name: 'topbar-date-block',
    scenes: [SCENES.strategic],
    needs: ['#topbar-date', '#topbar-turn-phase'],
    run: (p, el) => {
      const date = el('#topbar-date').text;
      const turn = el('#topbar-turn-phase').text;
      return date === 'September, Year 1' && turn === 'Turn 1 · Planning'
        ? null
        : `date block reads "${date}" / "${turn}", expected "September, Year 1" / "Turn 1 · Planning"`;
    },
  },
  {
    name: 'placeholders-disabled',
    scenes: [SCENES.strategic, SCENES.gameMenuOpen],
    needs: [
      '#topbar-settings-btn',
      '#topbar-help-btn',
      '#console-tab-build',
      '#console-tab-forces',
      '#game-menu-save-btn',
      '#game-menu-load-btn',
      '#game-menu-how-to-play-btn',
    ],
    run: (p, el) => {
      const enabled = Object.entries(p.elements).filter(([, e]) => e && !e.disabled).map(([selector]) => selector);
      return enabled.length === 0 ? null : `placeholders that are not disabled: ${enabled.join(', ')}`;
    },
  },
  {
    name: 'console-expanded-geometry',
    scenes: MATCH_SCENES.filter((scene) => scene !== SCENES.consoleCollapsed),
    needs: ['#sidebar', '#console-main', '#console-rail'],
    run: (p, el) => {
      const s = el('#sidebar');
      if (!el('#console-main').shown) return 'the console content column is not shown';
      return near(s.w, CONSOLE_EXPANDED_WIDTH) && near(s.x + s.w, p.viewport.w) && near(s.y, TOPBAR_HEIGHT) && near(s.y + s.h, p.viewport.h)
        ? null
        : `#sidebar is ${fmt(s)}, expected ${CONSOLE_EXPANDED_WIDTH} wide on the right edge from y=${TOPBAR_HEIGHT} to the bottom`;
    },
  },
  {
    name: 'ready-in-footer',
    scenes: MATCH_SCENES,
    needs: ['#console-footer', '#ready-btn'],
    run: (p, el) => {
      const f = el('#console-footer');
      const r = el('#ready-btn');
      const inside = r.shown && r.x >= f.x - 1 && r.y >= f.y - 1 && r.x + r.w <= f.x + f.w + 1 && r.y + r.h <= f.y + f.h + 1;
      return inside ? null : `#ready-btn ${fmt(r)} is not inside #console-footer ${fmt(f)}`;
    },
  },
  {
    name: 'orders-tab-shows-panel',
    scenes: [SCENES.strategic, SCENES.consoleExpandedAgain],
    needs: ['#console-panel-orders', '#console-panel-opponent', '#console-title'],
    run: (p, el) => {
      if (!el('#console-panel-orders').shown) return 'the Orders panel is not shown';
      if (el('#console-panel-opponent').shown) return 'the Opponent panel is shown with Orders';
      const title = el('#console-title').text;
      return title === 'Orders' ? null : `console title is "${title}"`;
    },
  },
  {
    name: 'opponent-tab-shows-panel',
    scenes: [SCENES.opponentTab],
    needs: ['#console-panel-orders', '#console-panel-opponent', '#openrouter-log', '#console-title'],
    run: (p, el) => {
      if (!el('#console-panel-opponent').shown) return 'the Opponent panel is not shown';
      if (el('#console-panel-orders').shown) return 'the Orders panel is still shown';
      if (!el('#openrouter-log').shown) return 'the AI activity log is not shown';
      const title = el('#console-title').text;
      return title === 'Opponent' ? null : `console title is "${title}"`;
    },
  },
  {
    name: 'control-tip-inside-window',
    scenes: [SCENES.readyTip],
    needs: ['#control-tooltip'],
    run: (p, el) => {
      const t = el('#control-tooltip');
      if (!t.shown) return 'the Ready tip is not shown';
      if (t.w < 100) return `the Ready tip is squeezed to ${Math.round(t.w)}px wide`;
      return t.x >= 0 && t.y >= 0 && t.x + t.w <= p.viewport.w + 1 && t.y + t.h <= p.viewport.h + 1
        ? null
        : `the Ready tip is at ${fmt(t)}, outside the ${p.viewport.w}x${p.viewport.h} window`;
    },
  },
  {
    name: 'console-collapsed-geometry',
    scenes: [SCENES.consoleCollapsed],
    needs: ['#sidebar', '#console-main', '#ready-btn'],
    run: (p, el) => {
      const s = el('#sidebar');
      if (s.collapsed !== 'true') return `#sidebar data-collapsed is "${s.collapsed}"`;
      if (!(near(s.w, CONSOLE_COLLAPSED_WIDTH) && near(s.x + s.w, p.viewport.w))) {
        return `#sidebar is ${fmt(s)}, expected ${CONSOLE_COLLAPSED_WIDTH} wide on the right edge`;
      }
      if (el('#console-main').shown) return 'the console content column is still shown';
      return el('#ready-btn').shown ? null : 'Ready is not shown while collapsed';
    },
  },
  {
    name: 'console-expands-on-tab-click',
    scenes: [SCENES.consoleExpandedAgain],
    needs: ['#sidebar'],
    run: (p, el) => (el('#sidebar').collapsed === 'false' ? null : `#sidebar data-collapsed is "${el('#sidebar').collapsed}"`),
  },
  {
    name: 'topbar-stats',
    scenes: [SCENES.strategic],
    needs: [
      '#topbar-stat-production',
      '#topbar-stat-forces',
      '#topbar-stat-forces-cap',
      '#topbar-stat-human-home',
      '#topbar-stat-human-home-total',
      '#topbar-stat-opponent-home',
      '#topbar-stat-opponent-home-total',
    ],
    run: (p, el) => {
      const text = (selector) => el(selector).text;
      const problems = [];
      if (!/^\+[\d,]+$/.test(text('#topbar-stat-production'))) problems.push(`production "${text('#topbar-stat-production')}"`);
      if (!/^\d+$/.test(text('#topbar-stat-forces')) || text('#topbar-stat-forces-cap') !== '/34') {
        problems.push(`forces "${text('#topbar-stat-forces')}${text('#topbar-stat-forces-cap')}" (cap should be /34)`);
      }
      if (!/^\d+$/.test(text('#topbar-stat-human-home')) || text('#topbar-stat-human-home-total') !== '/15') {
        problems.push(`your home "${text('#topbar-stat-human-home')}${text('#topbar-stat-human-home-total')}" (total should be /15)`);
      }
      if (!/^\d+$/.test(text('#topbar-stat-opponent-home')) || text('#topbar-stat-opponent-home-total') !== '/24') {
        problems.push(`enemy home "${text('#topbar-stat-opponent-home')}${text('#topbar-stat-opponent-home-total')}" (total should be /24)`);
      }
      return problems.length === 0 ? null : problems.join('; ');
    },
  },
  {
    name: 'game-menu-opens',
    scenes: [SCENES.gameMenuOpen],
    needs: ['#game-menu', '#game-menu-btn', '#openrouter-new-btn', '#openrouter-tactical-battles'],
    run: (p, el) => {
      const m = el('#game-menu');
      if (!m.shown) return 'the game menu is not shown';
      if (el('#game-menu-btn').expanded !== 'true') return `menu button aria-expanded is "${el('#game-menu-btn').expanded}"`;
      if (!(near(m.x, 0) && near(m.y, TOPBAR_HEIGHT))) return `game menu is at ${fmt(m)}, expected its top-left at 0,${TOPBAR_HEIGHT}`;
      const moved = ['#openrouter-new-btn', '#openrouter-tactical-battles'].filter((selector) => !el(selector).ancestorIds.includes('game-menu'));
      return moved.length === 0 ? null : `not inside #game-menu: ${moved.join(', ')}`;
    },
  },
  {
    name: 'game-menu-escape-closes',
    scenes: [SCENES.gameMenuEscape],
    needs: ['#game-menu', '#game-menu-btn'],
    run: (p, el) => {
      if (el('#game-menu').shown) return 'Escape left the game menu open';
      if (el('#game-menu-btn').expanded !== 'false') return `menu button aria-expanded is "${el('#game-menu-btn').expanded}"`;
      return p.activeElementId === 'game-menu-btn' ? null : `focus is on "${p.activeElementId}", expected the menu button`;
    },
  },
  {
    name: 'game-menu-outside-click-closes',
    scenes: [SCENES.gameMenuOutside],
    needs: ['#game-menu', '#game-menu-btn'],
    run: (p, el) => (!el('#game-menu').shown && el('#game-menu-btn').expanded === 'false' ? null : 'a click outside the menu left it open'),
  },
]);

/**
 * Lists every selector the checks read.
 *
 * Purpose: The runner probes these once per scene, so each check can read any of them.
 * When to use: Before calling `probePage`.
 * Expected outcome: Each selector once, in first-use order.
 * Exceptions: None.
 */
function probeSelectors(checks = CHECKS) {
  return [...new Set(checks.flatMap((check) => check.needs))];
}

/**
 * Runs every check that applies to one scene.
 *
 * Purpose: The runner calls this once per probe.
 * When to use: After `probePage` returns for that scene. Pass `checks` only in tests.
 * Expected outcome: One result per applicable check: `{ check, status: 'PASS' | 'FAIL', detail }`. A check whose
 *   elements are missing from the page fails and names them.
 * Exceptions: None; a check that throws becomes FAIL.
 */
function runChecks(sceneName, probe, checks = CHECKS) {
  const sceneKey = sceneName.split('@')[0];
  return checks
    .filter((check) => check.scenes.includes(sceneKey))
    .map((check) => {
      const missing = check.needs.filter((selector) => !probe.elements[selector]);
      if (missing.length > 0) return { check: check.name, status: 'FAIL', detail: `not in page: ${missing.join(', ')}` };
      const lookup = (selector) => probe.elements[selector];
      const scoped = { ...probe, elements: Object.fromEntries(check.needs.map((selector) => [selector, probe.elements[selector]])) };
      try {
        const failure = check.run(scoped, lookup);
        return { check: check.name, status: failure ? 'FAIL' : 'PASS', detail: failure || '' };
      } catch (err) {
        return { check: check.name, status: 'FAIL', detail: `check threw: ${err && err.message ? err.message : String(err)}` };
      }
    });
}

module.exports = {
  SCENES,
  probePage,
  probeSelectors,
  runChecks,
};
