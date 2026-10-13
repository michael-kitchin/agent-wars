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
    needs: ['#sidebar'],
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
      return near(c.x, 0) && near(c.y, 0) && near(c.x + c.w, s.x) && near(c.y + c.h, p.viewport.h)
        ? null
        : `#canvas-container ${fmt(c)} should run from 0,0 to the right panel at x=${Math.round(s.x)} and the window bottom`;
    },
  },
  {
    name: 'scenario-turn-line',
    scenes: [SCENES.strategic],
    needs: ['#sidebar-turn'],
    run: (p, el) => {
      const turn = el('#sidebar-turn').text;
      return turn === 'Turn: 1 · September, Year 1' ? null : `#sidebar-turn reads "${turn}", expected "Turn: 1 · September, Year 1"`;
    },
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
