/**
 * Checks of what the console's tabs show, for the UI smoke run.
 *
 * Purpose: Keeps the content checks apart from the frame checks, so each table stays readable.
 * When to use: Required by `ui-smoke-checks.cjs`, which runs these rows after the frame's rows.
 * Expected outcome: Rows in the same shape as the frame checks: `{ name, scenes, needs, run(p, el) }`.
 * Exceptions: None.
 */
'use strict';

const { SCENES } = require('./ui-smoke-scenes.cjs');

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
 * The console's content checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a rule about a console tab needs a machine check.
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
      '#sidebar-selected-unit',
    ],
    run: (p, el) => {
      const count = el('#pending-orders-count').text;
      if (count !== '1') return `the Movement count reads "${count}", expected "1"`;
      const detail = el('#pending-orders-list .console-order-detail').text;
      if (!WORLD_ORDER_DETAIL.test(detail)) return `the row's line reads "${detail}", expected something like "→ E5 · 1h"`;
      if (el('#pending-orders-list .console-order-select').pressed !== 'true') return 'the clicked row is not marked as selected';
      const name = el('#pending-orders-list .console-order-name').text;
      const selected = el('#sidebar-selected-unit').text;
      return name !== '' && name === selected ? null : `the row names "${name}" but the selected unit is "${selected}"`;
    },
  },
]);

module.exports = { CONSOLE_CHECKS };
