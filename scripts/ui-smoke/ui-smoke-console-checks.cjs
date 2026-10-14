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
      if (!s.shown) return 'the selection panel is not shown';
      const placed = near(s.x, c.x + MAP_OVERLAY_INSET) && near(s.y + s.h, c.y + c.h - MAP_OVERLAY_INSET) && near(s.w, SELECTION_PANEL_WIDTH);
      if (!placed) return `the selection panel is at ${fmt(s)}, expected ${SELECTION_PANEL_WIDTH} wide at the map's bottom-left, ${MAP_OVERLAY_INSET} px in`;
      return s.h <= c.h / 2 + 1 ? null : `the selection panel is ${Math.round(s.h)} tall, more than half the map's ${Math.round(c.h)}`;
    },
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
      return ranged.shown && ranged.text === 'Ranged' && ranged.ancestorIds.includes('selection-panel')
        ? null
        : `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}, expected it shown in the selection panel`;
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
    name: 'selection-cleared-rows',
    scenes: [SCENES.selectionCleared],
    needs: ['#pending-orders-list .console-order-select'],
    run: (p, el) => (el('#pending-orders-list .console-order-select').pressed === 'false' ? null : 'the order row still shows as selected'),
  },
]);

module.exports = { CONSOLE_CHECKS };
