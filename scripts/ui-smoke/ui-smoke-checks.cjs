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

const {
  TOPBAR_HEIGHT,
  CONSOLE_EXPANDED_WIDTH,
  CONSOLE_COLLAPSED_WIDTH,
  SCENES,
  NEW_GAME_SCENES,
  MATCH_SCENES,
  near,
  fmt,
} = require('./ui-smoke-scenes.cjs');
const { CONSOLE_CHECKS } = require('./ui-smoke-console-checks.cjs');
const { SCENARIO_CHECKS } = require('./ui-smoke-scenario-checks.cjs');
const { MAP_CHROME_CHECKS } = require('./ui-smoke-map-chrome-checks.cjs');
const { BATTLE_CHECKS } = require('./ui-smoke-battle-checks.cjs');
const { NEW_GAME_CHECKS } = require('./ui-smoke-new-game-checks.cjs');

/**
 * Collects what the checks read from the renderer page.
 *
 * Purpose: Runs inside the page through `page.evaluate`, so it may only use browser globals and its argument.
 * When to use: Once per scene, after the scene has settled, with every selector that any check reads.
 * Expected outcome: A plain object that can be passed back to Node. `elements` has one entry per selector:
 *   null when the selector matches nothing, otherwise the first match's box, text, font size, border color, pointer
 *   events, tip, and the attributes the checks use, plus the text of every match in `allTexts`.
 *   `minimapBorderWidth` is the computed top border width of `.minimap-overview::after`, such as `2px`, or `''` when
 *   the overview is missing. `minimapBorderColor` is that border's computed color, and `minimapToggleBackground` is
 *   the expand control's computed background, or `''` when that control is missing. `minimapHasZoom` is true when the
 *   overview itself has a zoom control.
 * Exceptions: None.
 */
function probePage(selectors) {
  /**
   * Describes one element for the checks.
   *
   * Purpose: Every check reads elements the same way.
   * When to use: For each selector passed to `probePage`.
   * Expected outcome: The first match's box, whether it is shown, its trimmed text, its computed font size, top
   *   border color, background color, and pointer events, its control tip sentence, and selected attributes, including
   *   its accessible name, and the trimmed text of every match, or null when the selector matches nothing.
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
      allTexts: Array.from(document.querySelectorAll(selector), (match) => (match.textContent || '').trim()),
      disabled: el.disabled === true,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      canvasWidth: el instanceof HTMLCanvasElement ? el.width : null,
      canvasHeight: el instanceof HTMLCanvasElement ? el.height : null,
      collapsed: el.getAttribute('data-collapsed'),
      expanded: el.getAttribute('aria-expanded'),
      pressed: el.getAttribute('aria-pressed'),
      checked: el instanceof HTMLInputElement ? el.checked : null,
      optionCount: el instanceof HTMLSelectElement ? el.options.length : null,
      label: el.getAttribute('aria-label'),
      fontSize: getComputedStyle(el).fontSize,
      borderColor: getComputedStyle(el).borderTopColor,
      background: getComputedStyle(el).backgroundColor,
      pointerEvents: getComputedStyle(el).pointerEvents,
      tip: el.getAttribute('data-control-tooltip'),
      ancestorIds,
    };
  };
  const elements = {};
  for (const selector of selectors) elements[selector] = describe(selector);
  const overview = document.querySelector('.minimap-overview');
  const overviewStyle = overview ? getComputedStyle(overview, '::after') : null;
  const minimapBorderWidth = overviewStyle ? overviewStyle.borderTopWidth : '';
  const minimapBorderColor = overviewStyle ? overviewStyle.borderTopColor : '';
  const toggle = document.getElementById('map-mode-tabs-toggle');
  const minimapToggleBackground = toggle ? getComputedStyle(toggle).backgroundColor : '';
  const minimapHasZoom = document.querySelector('#minimap .leaflet-control-zoom') != null;
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
    activeElementId: document.activeElement ? document.activeElement.id : '',
    minimapBorderWidth,
    minimapBorderColor,
    minimapToggleBackground,
    minimapHasZoom,
    elements,
  };
}

/**
 * The frame's checks, one row each: the top bar, the map, the console's shell, and the game menu.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a frame layout rule needs a machine check. `needs` lists every selector the row reads;
 *   `run(p, el)` gets the probe and a lookup for those selectors, and returns null on success or a failure message.
 *   Checks of what the console's tabs show belong in `ui-smoke-console-checks.cjs`, checks of the later scenes in
 *   `ui-smoke-scenario-checks.cjs`, checks of the chrome on the map in `ui-smoke-map-chrome-checks.cjs`, and checks of
 *   the battle header in `ui-smoke-battle-checks.cjs`.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const FRAME_CHECKS = Object.freeze([
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
    needs: ['#topbar-human-side', '#topbar-second-side'],
    run: (p, el) => {
      const human = el('#topbar-human-side').text;
      const opponent = el('#topbar-second-side').text;
      return human === 'Southern Europe' && opponent === 'N. Africa' ? null : `sides read "${human}" vs "${opponent}"`;
    },
  },
  {
    name: 'topbar-date-block',
    scenes: [SCENES.strategic],
    needs: ['#topbar-date', '#topbar-turn-phase'],
    run: (p, el) => {
      const date = el('#topbar-date').text;
      const turn = el('#topbar-turn-phase').text;
      return date === 'September, Year 1' && turn === 'Turn 1 of 30 · Planning'
        ? null
        : `date block reads "${date}" / "${turn}", expected "September, Year 1" / "Turn 1 of 30 · Planning"`;
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
    name: 'ready-check-mark',
    scenes: [SCENES.strategic, SCENES.consoleCollapsed, SCENES.consoleExpandedAgain],
    needs: ['#sidebar', '#ready-btn', '#ready-btn .ready-btn-check', '#ready-btn .ready-btn-label'],
    run: (p, el) => {
      const check = el('#ready-btn .ready-btn-check');
      const label = el('#ready-btn .ready-btn-label');
      if (!check.shown) return 'the check mark is not shown on Ready';
      if (el('#sidebar').collapsed === 'true') {
        return label.w <= 1 ? null : `the Ready label is ${Math.round(label.w)} px wide while the console is collapsed, expected only the check mark`;
      }
      if (label.text !== 'Ready') return `the Ready label reads "${label.text}"`;
      return check.x + check.w <= label.x + 1 ? null : `the check mark ${fmt(check)} is not left of the label ${fmt(label)}`;
    },
  },
  {
    name: 'orders-tab-shows-panel',
    scenes: [SCENES.strategic, SCENES.consoleExpandedAgain],
    needs: ['#console-panel-orders', '#console-panel-commanders', '#console-title'],
    run: (p, el) => {
      if (!el('#console-panel-orders').shown) return 'the Orders panel is not shown';
      if (el('#console-panel-commanders').shown) return 'the Commanders panel is shown with Orders';
      const title = el('#console-title').text;
      return title === 'Orders' ? null : `console title is "${title}"`;
    },
  },
  {
    name: 'opponent-tab-shows-panel',
    scenes: [SCENES.opponentTab],
    needs: ['#console-panel-orders', '#console-panel-commanders', '#openrouter-log', '#console-title'],
    run: (p, el) => {
      if (!el('#console-panel-commanders').shown) return 'the Commanders panel is not shown';
      if (el('#console-panel-orders').shown) return 'the Orders panel is still shown';
      if (!el('#openrouter-log').shown) return 'the AI activity log is not shown';
      const title = el('#console-title').text;
      return title === 'Commanders' ? null : `console title is "${title}"`;
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
      '#topbar-stat-enemy-home-host',
      '#topbar-stat-cities-host',
      '#topbar-stat-cities',
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
      if (el('#topbar-stat-enemy-home-host').shown) problems.push('enemy homes show on a turn-limit match');
      if (!el('#topbar-stat-cities-host').shown || !/^\d+ · \d+ of 2$/.test(text('#topbar-stat-cities'))) {
        problems.push(`cities "${text('#topbar-stat-cities')}"${el('#topbar-stat-cities-host').shown ? '' : ' and the readout is hidden'}`);
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
 * Every check the run applies: the frame's, then the console's, then the later scenarios', then the map chrome's, then
 * the battle header's, then the new-game screen's.
 *
 * Purpose: The runner and `probeSelectors` read one list.
 * When to use: The default `checks` argument of `probeSelectors` and `runChecks`.
 * Expected outcome: Frame checks first, so the report reads from the outside in.
 * Exceptions: None.
 */
const CHECKS = Object.freeze([
  ...FRAME_CHECKS,
  ...CONSOLE_CHECKS,
  ...SCENARIO_CHECKS,
  ...MAP_CHROME_CHECKS,
  ...BATTLE_CHECKS,
  ...NEW_GAME_CHECKS,
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
