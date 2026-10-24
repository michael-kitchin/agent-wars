/**
 * Checks of what the console's tabs and the selection panel show, for the UI smoke run.
 *
 * Purpose: Keeps the content checks apart from the frame checks, so each table stays readable.
 * When to use: Required by `ui-smoke-checks.cjs`, which runs these rows after the frame's rows.
 * Expected outcome: Rows in the same shape as the frame checks: `{ name, scenes, needs, run(p, el) }`.
 * Exceptions: None.
 */
'use strict';

const { SCENES, SELECTION_BAR, near, fmt, readSummaryLine } = require('./ui-smoke-scenes.cjs');

/**
 * The line under a queued order's unit name: an arrow, a two-character hex code, and the distance in hexes.
 *
 * Purpose: The runner queues a short march, so its row must read like `→ E5 · 1h`.
 * When to use: Checks of a world-map movement row.
 * Expected outcome: Matches a world-map row with no ferry or strike note.
 * Exceptions: None.
 */
const WORLD_ORDER_DETAIL = /^→ [0-9A-Z]{2} · \d+h$/;

/**
 * The selection panel's size limits while its grip is dragged, in CSS pixels.
 *
 * Purpose: Dragged sizes stop at these limits.
 * When to use: The dragged-size geometry checks.
 * Expected outcome: Matches `src/shared/selectionPanelSize.ts`.
 * Exceptions: None.
 */
const SELECTION_PANEL_LIMITS = Object.freeze({ minWidth: 400, maxWidth: 640, minHeight: 140, mapMargin: 24 });

/**
 * The gap between the reticle and the close control, in CSS pixels.
 *
 * Purpose: Opening the strike target list must not push the reticle. The list grows to the reticle's left.
 * When to use: The strike aiming and strike stopped checks.
 * Expected outcome: Matches `gap` on `.selection-panel-bar` in `static/selectionChrome.css`.
 * Exceptions: None.
 */
const RETICLE_CLOSE_GAP = 10;

/**
 * The narrowest the toast band may be beside the minimap panel, in CSS pixels.
 *
 * Purpose: Below this width the allowed range starts at the map's left inset, so a right-aligned toast may overlap the left chrome. Its width is still capped at one third of the map.
 * When to use: Only by `toastBandSpace`.
 * Expected outcome: Matches `TOAST_BAND_MIN_WIDTH` in `src/shared/mapChromePlacement.ts`.
 * Exceptions: None.
 */
const TOAST_BAND_MIN_WIDTH = 280;

/**
 * Works out where the toast band may sit, from the boxes of the chrome around it.
 *
 * Purpose: The toast sits between the minimap panel (or the legend, when it is open beside the panel) and the map's
 *   right edge, each 12 px away. On a map too narrow for that, the allowed range starts at the map's left inset.
 * When to use: The toast band check, with probed boxes in window coordinates.
 * Expected outcome: `{ left, right }`, the x range the toast must fit in. Its right edge is the map's right inset. A
 *   short toast may start to the right of `left`.
 * Exceptions: None.
 */
function toastBandSpace(map, panel, legend) {
  const legendBeside = legend.shown && legend.y < panel.y + panel.h;
  const left = (legendBeside ? legend.x + legend.w : panel.x + panel.w) + MAP_OVERLAY_INSET;
  const right = map.x + map.w - MAP_OVERLAY_INSET;
  return right - left >= TOAST_BAND_MIN_WIDTH ? { left, right } : { left: map.x + MAP_OVERLAY_INSET, right };
}

/**
 * What the footer status line reads in a fresh match: Run is off and there is no API key, so no model loads.
 *
 * Purpose: The smoke run uses an empty user-data folder, so these values never depend on the network.
 * When to use: The status line check.
 * Expected outcome: The label, the model name, and the match cost, in that order.
 * Exceptions: None.
 */
const FRESH_STATUS_LINE = Object.freeze(['Commanders off', 'No model', '$0.00']);

/**
 * The Commanders tab's parts, top to bottom.
 *
 * Purpose: The four sections show together, in this order, with no sub-tabs.
 * When to use: The Opponent sections check.
 * Expected outcome: Run (Status), Commander, Tool groups, the log's heading, and the log.
 * Exceptions: None.
 */
const OPPONENT_SECTION_ORDER = Object.freeze([
  '#openrouter-run-btn',
  '#openrouter-model-panel',
  '#openrouter-tools-panel',
  '#commander-log-heading',
  '#openrouter-log',
]);

/**
 * Default width of the selection panel in CSS pixels.
 *
 * Purpose: The panel opens at this width until the player resizes it.
 * When to use: The selection panel geometry check.
 * Expected outcome: Matches `.selection-panel` in `static/selectionChrome.css`.
 * Exceptions: None.
 */
const SELECTION_PANEL_WIDTH = 440;

/**
 * Height of the selection panel's summary bar in CSS pixels.
 *
 * Purpose: The bar is one row at the top of the panel.
 * When to use: The summary bar layout check.
 * Expected outcome: Matches `.selection-panel-bar` in `static/selectionChrome.css`.
 * Exceptions: None.
 */
const SELECTION_BAR_HEIGHT = 50;

/**
 * Inset of map overlays from the map's edges, in CSS pixels.
 *
 * Purpose: The selection panel sits this far from the map's left and bottom edges, and the toast band this far from the
 *   map's top and from the chrome beside it.
 * When to use: The selection panel and toast band checks.
 * Expected outcome: Matches `.selection-panel` in `static/selectionChrome.css` and `MAP_CHROME_INSET` in
 *   `src/shared/mapChromePlacement.ts`.
 * Exceptions: None.
 */
const MAP_OVERLAY_INSET = 12;

/**
 * Checks that the selection panel is anchored at the map's bottom-left at the given size.
 *
 * Purpose: The default size and both dragged sizes share one geometry rule.
 * When to use: From the selection panel geometry rows below.
 * Expected outcome: Null when the panel is shown, 12 px in from the map's left and bottom edges, and the given size
 *   (within one pixel); otherwise a failure message.
 * Exceptions: None.
 */
function selectionPanelPlacement(c, s, width, height) {
  if (!s.shown) return 'the selection panel is not shown';
  const anchored = near(s.x, c.x + MAP_OVERLAY_INSET) && near(s.y + s.h, c.y + c.h - MAP_OVERLAY_INSET);
  const sized = near(s.w, width) && (height === null || near(s.h, height));
  const expected = `${width}${height === null ? '' : `x${height}`}`;
  return anchored && sized ? null : `the selection panel is at ${fmt(s)}, expected ${expected} at the map's bottom-left, ${MAP_OVERLAY_INSET} px in`;
}

/**
 * The console header's inset on each side, in CSS pixels.
 *
 * Purpose: With no collapse button, the subtitle runs to the same inset on the right as the title has on the left.
 * When to use: The console header check.
 * Expected outcome: Matches the padding of `.console-header` in `static/frameChrome.css`.
 * Exceptions: None.
 */
const CONSOLE_HEADER_INSET = 16;

/**
 * Says what is wrong with the selection bar's reticle, if anything.
 *
 * Purpose: Every reticle check reads the same things: it shows in the bar as an icon with no text, its accessible name
 *   says which attack it aims, and its enabled and pressed states.
 * When to use: With the probe of `#ranged-attack-btn` and the expected `{ name, enabled, pressed }`.
 * Expected outcome: Null when the reticle matches, otherwise a failure message.
 * Exceptions: None.
 */
function reticleProblem(reticle, expected) {
  if (!reticle.shown || !reticle.ancestorIds.includes('selection-panel-bar')) return 'the reticle is not shown in the summary bar';
  if (reticle.text !== '') return `the reticle reads "${reticle.text}", expected an icon with no text`;
  if (reticle.label !== expected.name) return `the reticle is named "${reticle.label}", expected "${expected.name}"`;
  if (reticle.disabled === expected.enabled) return `the reticle is ${reticle.disabled ? 'greyed out' : 'enabled'}, expected it ${expected.enabled ? 'enabled' : 'greyed out'}`;
  return reticle.pressed === String(expected.pressed) ? null : `the reticle reads aria-pressed=${reticle.pressed}, expected ${expected.pressed}`;
}

/**
 * The content checks for the console and the selection panel, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a rule about a console tab or the selection panel needs a machine check.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const CONSOLE_CHECKS = Object.freeze([
  {
    name: 'orders-header-empty',
    scenes: [SCENES.strategic],
    needs: ['#console-subtitle', '#console-tab-orders-badge'],
    run: (p, el) => {
      const subtitle = el('#console-subtitle').text;
      if (subtitle !== '0 queued for turn 1') return `subtitle reads "${subtitle}", expected "0 queued for turn 1"`;
      return el('#console-tab-orders-badge').shown ? 'the Orders badge shows while nothing is queued' : null;
    },
  },
  {
    name: 'order-groups-empty',
    scenes: [SCENES.strategic],
    needs: [
      '#pending-orders-count',
      '#ranged-attacks-count',
      '#air-strikes-count',
      '#pending-orders-list',
      '#ranged-attacks-list',
      '#air-strikes-list',
    ],
    run: (p, el) => {
      const problems = [];
      for (const group of ['pending-orders', 'ranged-attacks', 'air-strikes']) {
        const count = el(`#${group}-count`).text;
        const list = el(`#${group}-list`).text;
        if (count !== '0' || list !== 'None') problems.push(`${group} count "${count}" list "${list}"`);
      }
      return problems.length === 0 ? null : `expected count "0" and "None": ${problems.join('; ')}`;
    },
  },
  {
    name: 'orders-header-queued',
    scenes: [SCENES.ordersQueued],
    needs: ['#console-subtitle', '#console-tab-orders-badge'],
    run: (p, el) => {
      const subtitle = el('#console-subtitle').text;
      if (subtitle !== '1 queued for turn 1') return `subtitle reads "${subtitle}", expected "1 queued for turn 1"`;
      const badge = el('#console-tab-orders-badge');
      return badge.shown && badge.text === '1' ? null : `the Orders badge reads "${badge.text}"${badge.shown ? '' : ' and is hidden'}`;
    },
  },
  {
    name: 'movement-row-selected',
    scenes: [SCENES.ordersQueued],
    needs: [
      '#pending-orders-count',
      '#pending-orders-list .console-order-select',
      '#pending-orders-list .console-order-name',
      '#pending-orders-list .console-order-detail',
      '#selection-panel-units .selection-panel-unit-name',
    ],
    run: (p, el) => {
      const count = el('#pending-orders-count').text;
      if (count !== '1') return `the Movement count reads "${count}", expected "1"`;
      const detail = el('#pending-orders-list .console-order-detail').text;
      if (!WORLD_ORDER_DETAIL.test(detail)) return `the row's line reads "${detail}", expected something like "→ E5 · 1h"`;
      if (el('#pending-orders-list .console-order-select').pressed !== 'true') return 'the clicked row is not marked as selected';
      const name = el('#pending-orders-list .console-order-name').text;
      const selected = el('#selection-panel-units .selection-panel-unit-name').text;
      return name !== '' && name === selected ? null : `the row names "${name}" but the selection panel lists "${selected}"`;
    },
  },
  {
    name: 'selection-panel-hidden',
    scenes: [SCENES.strategic, SCENES.selectionCleared, SCENES.matchReopened, SCENES.battleStart, SCENES.regionalStart, SCENES.gameOverReopened],
    needs: ['#selection-panel'],
    run: (p, el) => (el('#selection-panel').shown ? 'the selection panel shows while nothing is selected' : null),
  },
  {
    name: 'selection-panel-geometry',
    scenes: [SCENES.ordersQueued, SCENES.selectionStack, SCENES.strikeAiming],
    needs: ['#canvas-container', '#selection-panel'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const s = el('#selection-panel');
      const placement = selectionPanelPlacement(c, s, SELECTION_PANEL_WIDTH, null);
      if (placement) return placement;
      return s.h <= c.h / 2 + 1 ? null : `the selection panel is ${Math.round(s.h)} tall, more than half the map's ${Math.round(c.h)}`;
    },
  },
  {
    name: 'selection-panel-dragged-large',
    scenes: [SCENES.selectionResized],
    needs: ['#canvas-container', '#selection-panel'],
    run: (p, el) => {
      const c = el('#canvas-container');
      return selectionPanelPlacement(c, el('#selection-panel'), SELECTION_PANEL_LIMITS.maxWidth, c.h - SELECTION_PANEL_LIMITS.mapMargin);
    },
  },
  {
    name: 'selection-panel-dragged-small',
    scenes: [SCENES.selectionResizedMin],
    needs: ['#canvas-container', '#selection-panel'],
    run: (p, el) => selectionPanelPlacement(el('#canvas-container'), el('#selection-panel'), SELECTION_PANEL_LIMITS.minWidth, SELECTION_PANEL_LIMITS.minHeight),
  },
  {
    name: 'selection-bar-layout',
    scenes: [SCENES.ordersQueued, SCENES.rangedAiming, SCENES.selectionStack, SCENES.strikeAiming, SCENES.selectionExpanded],
    needs: ['#selection-panel', '#selection-panel-bar', '#selection-panel-expand', '#selection-panel-close', '#selection-panel-details'],
    run: (p, el) => {
      const s = el('#selection-panel');
      const bar = el('#selection-panel-bar');
      if (!bar.shown || !near(bar.y, s.y + 1) || !near(bar.h, SELECTION_BAR_HEIGHT)) {
        return `the summary bar is at ${fmt(bar)}, expected a ${SELECTION_BAR_HEIGHT} px row at the top of the panel ${fmt(s)}`;
      }
      const expand = el('#selection-panel-expand');
      if (!near(expand.x, s.x + 1) || !near(expand.h, SELECTION_BAR_HEIGHT)) return `the expand control is at ${fmt(expand)}, expected the bar's full height at its left edge`;
      const close = el('#selection-panel-close');
      if (!close.ancestorIds.includes('selection-panel-bar')) return 'the close control is not in the summary bar';
      if (!near(close.x + close.w, s.x + s.w - 1) || !near(close.h, SELECTION_BAR_HEIGHT) || !near(close.w, expand.w)) {
        return `the close control is at ${fmt(close)}, expected the bar's full height at its right edge, as wide as the expand control ${fmt(expand)}`;
      }
      const details = el('#selection-panel-details');
      if (!details.shown) return null;
      return details.y >= bar.y + bar.h - 1 ? null : `the details start at ${fmt(details)}, above the bottom of the bar ${fmt(bar)}`;
    },
  },
  {
    name: 'selection-panel-compact',
    scenes: [SCENES.ordersQueued, SCENES.selectionStack, SCENES.strikeAiming, SCENES.selectionCollapsed, SCENES.battleSelection, SCENES.regionalSelection],
    needs: ['#selection-panel', '#selection-panel-expand', '#selection-panel-details', '#selection-panel-grip'],
    run: (p, el) => {
      const s = el('#selection-panel');
      const expand = el('#selection-panel-expand');
      if (expand.expanded !== 'false') return `the expand control reads aria-expanded=${expand.expanded}, expected false while the panel is compact`;
      if (el('#selection-panel-details').shown || el('#selection-panel-grip').shown) return 'the details or the grip show while the panel is compact';
      return near(s.h, SELECTION_BAR_HEIGHT + 2) ? null : `the compact panel is ${fmt(s)}, expected only the ${SELECTION_BAR_HEIGHT} px bar inside its border`;
    },
  },
  {
    name: 'selection-panel-expanded',
    scenes: [SCENES.selectionExpanded, SCENES.selectionResized, SCENES.selectionResizedMin, SCENES.smallWindow],
    needs: ['#selection-panel-expand', '#selection-panel-details', '#selection-panel-grip'],
    run: (p, el) => {
      const expand = el('#selection-panel-expand');
      if (expand.expanded !== 'true') return `the expand control reads aria-expanded=${expand.expanded}, expected true while the panel is expanded`;
      return el('#selection-panel-details').shown && el('#selection-panel-grip').shown ? null : 'the details or the grip are hidden while the panel is expanded';
    },
  },
  {
    name: 'selection-panel-one-unit',
    scenes: [SCENES.ordersQueued],
    needs: [
      '#sidebar-selected-unit',
      '#selection-panel-hint',
      '#selection-panel-units .selection-panel-unit-name',
      '#selection-panel-units .selection-panel-order > span',
      '#pending-orders-list .console-order-detail',
      '#ranged-attack-btn',
      '#selection-panel-action-note',
      '#selection-panel',
    ],
    run: (p, el) => {
      const place = el('#sidebar-selected-unit');
      if (!place.ancestorIds.includes('selection-panel-bar')) return '#sidebar-selected-unit is not in the summary bar';
      const line = readSummaryLine(place.text);
      const name = el('#selection-panel-units .selection-panel-unit-name').text;
      if (!line || line.rest !== name) return `the first line reads "${place.text}", expected a hex code such as "(D4)", then "${name}"`;
      const hint = el('#selection-panel-hint').text;
      if (hint !== SELECTION_BAR.moveHint) return `the hint reads "${hint}", expected "${SELECTION_BAR.moveHint}"`;
      const chip = el('#selection-panel-units .selection-panel-order > span').text;
      const row = el('#pending-orders-list .console-order-detail').text;
      if (chip !== row) return `the order chip reads "${chip}" but the Orders row reads "${row}"`;
      if (el('#selection-panel').borderColor === SELECTION_BAR.strikeBorder) return 'the panel has the strike border while nothing is aimed';
      const ranged = el('#ranged-attack-btn');
      if (el('#selection-panel-action-note').shown) return `a reason shows for an armor unit: "${el('#selection-panel-action-note').text}"`;
      return reticleProblem(ranged, { name: SELECTION_BAR.rangedName, enabled: true, pressed: false });
    },
  },
  {
    name: 'selection-panel-stack',
    scenes: [SCENES.selectionStack, SCENES.selectionExpanded],
    needs: ['#sidebar-selected-unit', '#selection-panel-units .selection-panel-unit:nth-child(2)', '#selection-panel-units .selection-panel-order-none'],
    run: (p, el) => {
      const line = readSummaryLine(el('#sidebar-selected-unit').text);
      if (!line || line.rest !== '2 selected of 2') return `the first line reads "${el('#sidebar-selected-unit').text}", expected a hex code, then "2 selected of 2"`;
      const none = el('#selection-panel-units .selection-panel-order-none').text;
      return none === 'No orders' ? null : `a unit without orders reads "${none}"`;
    },
  },
  {
    name: 'support-button-greyed',
    scenes: [SCENES.selectionStack, SCENES.selectionExpanded],
    needs: ['#ranged-attack-btn', '#ranged-attack-tip-host', '#selection-panel-action-note'],
    run: (p, el) => {
      const problem = reticleProblem(el('#ranged-attack-btn'), { name: SELECTION_BAR.rangedName, enabled: false, pressed: false });
      if (problem) return problem;
      const reason = "Infantry can't fire on the world map.";
      const note = el('#selection-panel-action-note');
      if (note.text !== reason || !note.ancestorIds.includes('selection-panel-details')) return `the reason in the details reads "${note.text}"`;
      const tip = el('#ranged-attack-tip-host').tip;
      return tip === reason ? null : `the greyed-out control's tip reads "${tip}", expected "${reason}"`;
    },
  },
  {
    name: 'ranged-aiming-in-panel',
    scenes: [SCENES.rangedAiming],
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#selection-panel-hint', '#selection-panel'],
    run: (p, el) => {
      const ranged = el('#ranged-attack-btn');
      const problem = reticleProblem(ranged, { name: SELECTION_BAR.rangedName, enabled: true, pressed: true });
      if (problem) return problem;
      if (el('#air-strike-target-type').shown) return 'the strike target list shows while a ranged attack is aimed';
      const hint = el('#selection-panel-hint').text;
      if (hint !== SELECTION_BAR.targetingHint) return `the hint reads "${hint}", expected "${SELECTION_BAR.targetingHint}"`;
      const border = el('#selection-panel').borderColor;
      if (border !== SELECTION_BAR.rangedBorder) return `the panel's border is ${border}, expected the ranged amber ${SELECTION_BAR.rangedBorder}`;
      return ranged.background === SELECTION_BAR.rangedBorder ? null : `the pressed reticle's face is ${ranged.background}, expected the ranged amber ${SELECTION_BAR.rangedBorder}`;
    },
  },
  {
    name: 'strike-aiming-in-panel',
    scenes: [SCENES.strikeAiming],
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#sidebar-selected-unit', '#selection-panel-hint', '#selection-panel', '#selection-panel .selection-panel-divider', '#selection-panel-close'],
    run: (p, el) => {
      const strike = el('#ranged-attack-btn');
      const problem = reticleProblem(strike, { name: SELECTION_BAR.strikeName, enabled: true, pressed: true });
      if (problem) return problem;
      const list = el('#air-strike-target-type');
      const divider = el('#selection-panel .selection-panel-divider');
      const close = el('#selection-panel-close');
      const panel = el('#selection-panel');
      if (!list.shown || !list.ancestorIds.includes('selection-panel-bar')) return 'the strike target list is not shown in the summary bar';
      if (divider.x + divider.w > list.x + 1) return `the target list ${fmt(list)} is not to the right of the divider ${fmt(divider)}`;
      if (list.x + list.w > strike.x + 1) return `the target list ${fmt(list)} is not to the left of the reticle ${fmt(strike)}`;
      if (!near(close.x - (strike.x + strike.w), RETICLE_CLOSE_GAP)) {
        return `the reticle ${fmt(strike)} is not ${RETICLE_CLOSE_GAP} px left of the close control ${fmt(close)}`;
      }
      if (close.x + close.w > panel.x + panel.w + 1) return `the close control ${fmt(close)} falls outside the panel ${fmt(panel)}`;
      if (!readSummaryLine(el('#sidebar-selected-unit').text)) return `the first line reads "${el('#sidebar-selected-unit').text}", expected a hex code, then the unit`;
      const hint = el('#selection-panel-hint').text;
      if (hint !== SELECTION_BAR.targetingHint) return `the hint reads "${hint}", expected "${SELECTION_BAR.targetingHint}"`;
      const border = el('#selection-panel').borderColor;
      if (border !== SELECTION_BAR.strikeBorder) return `the panel's border is ${border}, expected the strike purple ${SELECTION_BAR.strikeBorder}`;
      return strike.background === SELECTION_BAR.strikeBorder ? null : `the pressed reticle's face is ${strike.background}, expected the strike purple ${SELECTION_BAR.strikeBorder}`;
    },
  },
  {
    name: 'strike-stopped-by-reticle',
    scenes: [SCENES.strikeStopped],
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#selection-panel-hint', '#selection-panel', '#selection-panel-close'],
    run: (p, el) => {
      const strike = el('#ranged-attack-btn');
      const problem = reticleProblem(strike, { name: SELECTION_BAR.strikeName, enabled: true, pressed: false });
      if (problem) return problem;
      if (el('#air-strike-target-type').shown) return 'the strike target list still shows after the reticle stopped aiming';
      const close = el('#selection-panel-close');
      if (!near(close.x - (strike.x + strike.w), RETICLE_CLOSE_GAP)) {
        return `the reticle ${fmt(strike)} is not ${RETICLE_CLOSE_GAP} px left of the close control ${fmt(close)}`;
      }
      const hint = el('#selection-panel-hint').text;
      if (hint !== SELECTION_BAR.ferryHint) return `the hint reads "${hint}", expected "${SELECTION_BAR.ferryHint}"`;
      const border = el('#selection-panel').borderColor;
      return border === SELECTION_BAR.strikeBorder ? 'the panel keeps the strike border after the reticle stopped aiming' : null;
    },
  },
  {
    name: 'console-header-without-collapse-button',
    scenes: [SCENES.strategic],
    needs: ['#console-main', '#console-subtitle'],
    run: (p, el) => {
      const main = el('#console-main');
      const subtitle = el('#console-subtitle');
      return near(subtitle.x + subtitle.w, main.x + main.w - CONSOLE_HEADER_INSET)
        ? null
        : `the subtitle ends at ${Math.round(subtitle.x + subtitle.w)}, expected it to run to ${CONSOLE_HEADER_INSET} px inside the console's right edge at ${Math.round(main.x + main.w)}`;
    },
  },
  {
    name: 'toast-band-top-right',
    scenes: [SCENES.turnResolved, SCENES.reportsTab],
    needs: ['#canvas-container', '#map-toast-band', '#map-toast', '#minimap-panel', '#terrain-legend'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const band = el('#map-toast-band');
      const toast = el('#map-toast');
      if (!toast.shown || !toast.ancestorIds.includes('map-toast-band')) return 'the map toast is not shown in the toast band';
      if (!near(band.y, c.y + MAP_OVERLAY_INSET)) return `the toast band is at ${fmt(band)}, expected its top ${MAP_OVERLAY_INSET} px below the map's top`;
      const maxWidth = c.w / 3;
      if (band.w > maxWidth + 1) {
        return `the toast band is ${Math.round(band.w)} wide, more than one third of the map (${Math.round(maxWidth)})`;
      }
      const space = toastBandSpace(c, el('#minimap-panel'), el('#terrain-legend'));
      if (band.x < space.left - 1 || band.x + band.w > space.right + 1) {
        return `the toast band is at ${fmt(band)}, outside x=${Math.round(space.left)} to x=${Math.round(space.right)}`;
      }
      return near(band.x + band.w, space.right)
        ? null
        : `the toast band is at ${fmt(band)}, expected its right edge ${MAP_OVERLAY_INSET} px in from the map at x=${Math.round(space.right)}`;
    },
  },
  {
    name: 'reports-badge-unread',
    scenes: [SCENES.turnResolved],
    needs: ['#console-tab-reports-badge', '#console-panel-reports'],
    run: (p, el) => {
      const badge = el('#console-tab-reports-badge');
      if (el('#console-panel-reports').shown) return 'the Reports panel is shown before its tab was clicked';
      return badge.shown && /^[1-9]\d*$/.test(badge.text) ? null : `the Reports badge reads "${badge.text}"${badge.shown ? '' : ' and is hidden'}`;
    },
  },
  {
    name: 'reports-tab-shows-panel',
    scenes: [SCENES.reportsTab],
    needs: ['#console-panel-reports', '#console-panel-orders', '#console-title', '#console-subtitle', '#reports-empty', '#console-tab-reports-badge'],
    run: (p, el) => {
      if (!el('#console-panel-reports').shown || el('#console-panel-orders').shown) return 'the Reports panel is not the only panel shown';
      const title = `${el('#console-title').text} / ${el('#console-subtitle').text}`;
      if (title !== 'Reports / this match') return `the header reads "${title}", expected "Reports / this match"`;
      if (el('#reports-empty').shown) return 'the empty-list sentence shows next to entries';
      return el('#console-tab-reports-badge').shown ? 'the Reports badge still shows after the tab was opened' : null;
    },
  },
  {
    name: 'reports-standing-orders-notice',
    scenes: [SCENES.reportsTab],
    needs: ['#reports-list .console-report-notice'],
    run: (p, el) => {
      const notices = el('#reports-list .console-report-notice').allTexts;
      return notices.some((text) => text.startsWith('T1Notice') && text.includes('standing orders only'))
        ? null
        : `no Notice tagged T1 says "standing orders only": ${JSON.stringify(notices)}`;
    },
  },
  {
    name: 'opponent-sections',
    scenes: [SCENES.opponentTab],
    needs: ['#console-subtitle', '#commander-status-text', ...OPPONENT_SECTION_ORDER],
    run: (p, el) => {
      const subtitle = el('#console-subtitle').text;
      if (subtitle !== '1 opponent') return `the Commanders subtitle reads "${subtitle}", expected "1 opponent"`;
      const sentence = el('#commander-status-text').text;
      if (sentence !== 'Planning is off.') return `the status sentence reads "${sentence}", expected "Planning is off."`;
      const hidden = OPPONENT_SECTION_ORDER.filter((selector) => !el(selector).shown);
      if (hidden.length > 0) return `not shown together: ${hidden.join(', ')}`;
      const misplaced = OPPONENT_SECTION_ORDER.slice(1).filter((selector, i) => el(selector).y <= el(OPPONENT_SECTION_ORDER[i]).y);
      return misplaced.length === 0 ? null : `not below the part before it: ${misplaced.join(', ')}`;
    },
  },
  {
    name: 'opponent-tool-groups-two-columns',
    scenes: [SCENES.opponentTab],
    needs: ['#openrouter-tools-list', '#openrouter-tools-list .openrouter-tool-cell'],
    run: (p, el) => {
      const list = el('#openrouter-tools-list');
      const cell = el('#openrouter-tools-list .openrouter-tool-cell');
      if (cell.allTexts.length < 2) return `${cell.allTexts.length} tool groups are listed`;
      return cell.w <= list.w / 2 + 1 ? null : `a tool group is ${Math.round(cell.w)} wide in a ${Math.round(list.w)}-wide list, expected two columns`;
    },
  },
  {
    name: 'console-status-line',
    scenes: [SCENES.strategic, SCENES.opponentTab, SCENES.matchReopened, SCENES.battleStart, SCENES.regionalStart],
    needs: ['#commander-status-line', '#commander-status-label', '#commander-status-model', '#commander-status-cost', '#ready-btn'],
    run: (p, el) => {
      const line = el('#commander-status-line');
      const ready = el('#ready-btn');
      if (!line.shown || !line.ancestorIds.includes('console-footer')) return 'the status line is not shown in the console footer';
      if (line.y + line.h > ready.y + 1) return `the status line ${fmt(line)} is not above Ready ${fmt(ready)}`;
      if (line.h > 24) return `the status line is ${Math.round(line.h)} tall, so it wraps`;
      const parts = ['#commander-status-label', '#commander-status-model', '#commander-status-cost'].map((selector) => el(selector).text);
      return parts.every((text, i) => text === FRESH_STATUS_LINE[i])
        ? null
        : `the status line reads ${JSON.stringify(parts)}, expected ${JSON.stringify(FRESH_STATUS_LINE)}`;
    },
  },
  {
    name: 'console-status-line-hidden-collapsed',
    scenes: [SCENES.consoleCollapsed],
    needs: ['#commander-status-line'],
    run: (p, el) => (el('#commander-status-line').shown ? 'the status line shows in the collapsed rail' : null),
  },
  {
    name: 'selection-cleared-rows',
    scenes: [SCENES.selectionCleared],
    needs: ['#pending-orders-list .console-order-select'],
    run: (p, el) => (el('#pending-orders-list .console-order-select').pressed === 'false' ? null : 'the order row still shows as selected'),
  },
]);

module.exports = { CONSOLE_CHECKS };
