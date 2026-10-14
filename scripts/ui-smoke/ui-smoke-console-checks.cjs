/**
 * Checks of what the console's tabs and the selection panel show, for the UI smoke run.
 *
 * Purpose: Keeps the content checks apart from the frame checks, so each table stays readable.
 * When to use: Required by `ui-smoke-checks.cjs`, which runs these rows after the frame's rows.
 * Expected outcome: Rows in the same shape as the frame checks: `{ name, scenes, needs, run(p, el) }`.
 * Exceptions: None.
 */
'use strict';

const { SCENES, near, fmt } = require('./ui-smoke-scenes.cjs');

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
const SELECTION_PANEL_LIMITS = Object.freeze({ minWidth: 320, maxWidth: 640, minHeight: 140, mapMargin: 24 });

/**
 * The left edge of the toast band, measured from the map's left edge, in CSS pixels.
 *
 * Purpose: The band starts right of the minimap so a toast never covers it.
 * When to use: The toast band check.
 * Expected outcome: Matches `.map-toast-band` in `static/feedbackChrome.css`.
 * Exceptions: None.
 */
const TOAST_BAND_LEFT = 224;

/**
 * The widest the toast band can be, in CSS pixels.
 *
 * Purpose: Toasts stay readable lines, not banners across the map.
 * When to use: The toast band check.
 * Expected outcome: Matches `.map-toast-band` in `static/feedbackChrome.css`.
 * Exceptions: None.
 */
const TOAST_BAND_MAX_WIDTH = 560;

/**
 * Default width of the selection panel in CSS pixels.
 *
 * Purpose: The panel opens at this width until the player resizes it.
 * When to use: The selection panel geometry check.
 * Expected outcome: Matches `.selection-panel` in `static/selectionChrome.css`.
 * Exceptions: None.
 */
const SELECTION_PANEL_WIDTH = 400;

/**
 * Inset of map overlays from the map's edges, in CSS pixels.
 *
 * Purpose: The selection panel sits this far from the map's left and bottom edges.
 * When to use: The selection panel geometry check.
 * Expected outcome: Matches `.selection-panel` in `static/selectionChrome.css`.
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
    name: 'selection-panel-one-unit',
    scenes: [SCENES.ordersQueued],
    needs: [
      '#sidebar-selected-unit',
      '#selection-panel-count',
      '#selection-panel-units .selection-panel-order > span',
      '#pending-orders-list .console-order-detail',
      '#ranged-attack-btn',
      '#selection-panel-action-note',
    ],
    run: (p, el) => {
      const place = el('#sidebar-selected-unit');
      if (!place.ancestorIds.includes('selection-panel')) return '#sidebar-selected-unit is not inside the selection panel';
      if (!/^\([0-9A-Z]{2}\)/.test(place.text)) return `the header reads "${place.text}", expected it to start with a hex code such as "(D4)"`;
      const count = el('#selection-panel-count').text;
      if (count !== '1 selected of 1') return `the count reads "${count}", expected "1 selected of 1"`;
      const chip = el('#selection-panel-units .selection-panel-order > span').text;
      const row = el('#pending-orders-list .console-order-detail').text;
      if (chip !== row) return `the order chip reads "${chip}" but the Orders row reads "${row}"`;
      const ranged = el('#ranged-attack-btn');
      if (el('#selection-panel-action-note').shown) return `a reason shows for an armor unit: "${el('#selection-panel-action-note').text}"`;
      return ranged.shown && !ranged.disabled && ranged.text === 'Ranged' && ranged.ancestorIds.includes('selection-panel')
        ? null
        : `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}${ranged.disabled ? ' and is disabled' : ''}, expected it enabled in the selection panel`;
    },
  },
  {
    name: 'selection-panel-stack',
    scenes: [SCENES.selectionStack],
    needs: ['#selection-panel-count', '#selection-panel-units .selection-panel-unit:nth-child(2)', '#selection-panel-units .selection-panel-order-none'],
    run: (p, el) => {
      const count = el('#selection-panel-count').text;
      if (count !== '2 selected of 2') return `the count reads "${count}", expected "2 selected of 2"`;
      const none = el('#selection-panel-units .selection-panel-order-none').text;
      return none === 'No orders' ? null : `a unit without orders reads "${none}"`;
    },
  },
  {
    name: 'support-button-greyed',
    scenes: [SCENES.selectionStack],
    needs: ['#ranged-attack-btn', '#selection-panel-action-note'],
    run: (p, el) => {
      const ranged = el('#ranged-attack-btn');
      if (!(ranged.shown && ranged.disabled && ranged.text === 'Ranged')) {
        return `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}${ranged.disabled ? '' : ' and is enabled'}, expected it greyed out`;
      }
      const note = el('#selection-panel-action-note').text;
      return note === "Infantry can't fire on the world map." ? null : `the reason reads "${note}"`;
    },
  },
  {
    name: 'strike-aiming-in-panel',
    scenes: [SCENES.strikeAiming],
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#air-strike-cancel-btn', '#selection-panel-count'],
    run: (p, el) => {
      if (el('#ranged-attack-btn').shown) return 'Strike still shows while aiming';
      const missing = ['#air-strike-target-type', '#air-strike-cancel-btn']
        .filter((selector) => !el(selector).shown || !el(selector).ancestorIds.includes('selection-panel'));
      if (missing.length > 0) return `not shown in the selection panel: ${missing.join(', ')}`;
      const count = el('#selection-panel-count').text;
      return count === '1 selected of 1' ? null : `the count reads "${count}", expected "1 selected of 1"`;
    },
  },
  {
    name: 'toast-band-top-centre',
    scenes: [SCENES.turnResolved],
    needs: ['#canvas-container', '#map-toast-band', '#map-toast'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const band = el('#map-toast-band');
      const toast = el('#map-toast');
      if (!toast.shown || !toast.ancestorIds.includes('map-toast-band')) return 'the map toast is not shown in the toast band';
      if (!near(band.y, c.y + MAP_OVERLAY_INSET)) return `the toast band is at ${fmt(band)}, expected its top ${MAP_OVERLAY_INSET} px below the map's top`;
      if (band.w > TOAST_BAND_MAX_WIDTH + 1) return `the toast band is ${Math.round(band.w)} wide, more than ${TOAST_BAND_MAX_WIDTH}`;
      if (band.x < c.x + TOAST_BAND_LEFT - 1 || band.x + band.w > c.x + c.w - MAP_OVERLAY_INSET + 1) {
        return `the toast band is at ${fmt(band)}, outside the space right of the minimap on the map ${fmt(c)}`;
      }
      const centre = c.x + (TOAST_BAND_LEFT + c.w - MAP_OVERLAY_INSET) / 2;
      return near(band.x + band.w / 2, centre) ? null : `the toast band is at ${fmt(band)}, expected it centred at x=${Math.round(centre)}`;
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
    name: 'selection-cleared-rows',
    scenes: [SCENES.selectionCleared],
    needs: ['#pending-orders-list .console-order-select'],
    run: (p, el) => (el('#pending-orders-list .console-order-select').pressed === 'false' ? null : 'the order row still shows as selected'),
  },
]);

module.exports = { CONSOLE_CHECKS };
