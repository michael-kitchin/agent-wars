/**
 * Checks for the UI smoke run's later scenarios: the small window, the reopened match, a battle, a regional match, and
 * a finished match.
 *
 * Purpose: The console and the selection panel must hold up beyond the first world-map turn. These rows check them in
 *   the scenes that the second and third sessions of the run add.
 * When to use: Required by `ui-smoke-checks.cjs`, which runs these rows after the console's rows.
 * Expected outcome: Rows in the same shape as the frame checks: `{ name, scenes, needs, run(p, el) }`.
 * Exceptions: None.
 */
'use strict';

const { SCENES, SELECTION_BAR, fmt, readSummaryLine } = require('./ui-smoke-scenes.cjs');

/**
 * Inset of map overlays from the map's edges, in CSS pixels.
 *
 * Purpose: The selection panel keeps this distance from every edge of the map, whatever its size.
 * When to use: The small-window check.
 * Expected outcome: Matches `.selection-panel` in `static/selectionChrome.css`.
 * Exceptions: None.
 */
const MAP_OVERLAY_INSET = 12;

/**
 * A world-map order row's line: an arrow, a two-character hex code, and the distance in hexes.
 *
 * Purpose: The reopened match lists the march queued before the app closed.
 * When to use: Checks of a world-map movement row.
 * Expected outcome: Matches a row with no ferry or strike note, such as `→ E5 · 1h`.
 * Exceptions: None.
 */
const WORLD_ORDER_DETAIL = /^→ [0-9A-Z]{2} · \d+h$/;

/**
 * A battle order row's line: an arrow, the battle's hex code and the cell's code, and the distance in cells.
 *
 * Purpose: Battle rows name the cell inside the battle, such as `→ E8.K3 · 1h`.
 * When to use: Checks of a battle movement row.
 * Expected outcome: Matches a battle row with no note.
 * Exceptions: None.
 */
const BATTLE_ORDER_DETAIL = /^→ [0-9A-Z]{2}\.[0-9A-Z]{2} · \d+h$/;

/**
 * Reads the turn number from the top bar's turn line, such as "Turn 2 · Planning".
 *
 * Purpose: The reopened match's turn depends on how far the first session got.
 * When to use: Checks that compare the Orders subtitle with the turn.
 * Expected outcome: The number, or null when the line is not a world-map planning line.
 * Exceptions: None.
 */
function planningTurnNumber(turnLine) {
  const match = /^Turn (\d+) · Planning$/.exec(turnLine);
  return match ? Number(match[1]) : null;
}

/**
 * The scenario checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a later scenario needs a machine check.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const SCENARIO_CHECKS = Object.freeze([
  {
    name: 'orders-fit-small-window',
    scenes: [SCENES.smallWindow],
    needs: ['#console-panel-orders'],
    run: (p, el) => {
      const panel = el('#console-panel-orders');
      return panel.scrollWidth <= panel.clientWidth + 1 ? null : `the Orders tab is ${panel.scrollWidth}px wide in ${panel.clientWidth}px`;
    },
  },
  {
    name: 'orders-after-reopen',
    scenes: [SCENES.matchReopened],
    needs: ['#topbar-turn-phase', '#console-subtitle', '#pending-orders-list .console-order-detail', '#console-tab-orders-badge'],
    run: (p, el) => {
      const turn = planningTurnNumber(el('#topbar-turn-phase').text);
      if (turn === null) return `the top bar reads "${el('#topbar-turn-phase').text}", expected world-map planning`;
      const subtitle = el('#console-subtitle').text;
      if (subtitle !== `1 queued for turn ${turn}`) return `the subtitle reads "${subtitle}", expected "1 queued for turn ${turn}"`;
      const detail = el('#pending-orders-list .console-order-detail').text;
      if (!WORLD_ORDER_DETAIL.test(detail)) return `the Movement row reads "${detail}"`;
      const badge = el('#console-tab-orders-badge');
      return badge.shown && badge.text === '1' ? null : `the Orders badge reads "${badge.text}"${badge.shown ? '' : ' and is hidden'}`;
    },
  },
  {
    name: 'orders-battle-start',
    scenes: [SCENES.battleStart],
    needs: ['#battle-header-status', '#console-subtitle'],
    run: (p, el) => {
      const status = el('#battle-header-status').text;
      if (!status.startsWith('Beat 1 · Tactical planning')) return `the battle header reads "${status}", expected beat 1 planning`;
      const subtitle = el('#console-subtitle').text;
      return subtitle === '0 queued for beat 1' ? null : `the Orders subtitle reads "${subtitle}", expected "0 queued for beat 1"`;
    },
  },
  {
    name: 'orders-battle-march',
    scenes: [SCENES.battleOrders],
    needs: ['#console-subtitle', '#pending-orders-list .console-order-detail'],
    run: (p, el) => {
      const subtitle = el('#console-subtitle').text;
      if (subtitle !== '1 queued for beat 1') return `the subtitle reads "${subtitle}", expected "1 queued for beat 1"`;
      const detail = el('#pending-orders-list .console-order-detail').text;
      return BATTLE_ORDER_DETAIL.test(detail) ? null : `the battle row reads "${detail}", expected a line like "→ E8.K3 · 1h"`;
    },
  },
  {
    name: 'orders-regional-start',
    scenes: [SCENES.regionalStart],
    needs: ['#topbar-turn-phase', '#console-subtitle', '#pending-orders-list'],
    run: (p, el) => {
      const line = `${el('#topbar-turn-phase').text} / ${el('#console-subtitle').text}`;
      if (line !== 'Turn 1 · Planning / 0 queued for turn 1') return `the top bar and the Orders subtitle read "${line}"`;
      return el('#pending-orders-list').text === 'None' ? null : `the Movement group reads "${el('#pending-orders-list').text}"`;
    },
  },
  {
    name: 'game-over-message',
    scenes: [SCENES.gameOverReopened],
    needs: ['#game-over-overlay', '#game-over-message'],
    run: (p, el) => {
      if (!el('#game-over-overlay').shown) return 'the game-over screen is not shown';
      const message = el('#game-over-message').text;
      return message === 'You lose.' ? null : `the game-over message reads "${message}", expected "You lose."`;
    },
  },
  {
    name: 'selection-panel-small-window',
    scenes: [SCENES.smallWindow],
    needs: ['#canvas-container', '#selection-panel'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const s = el('#selection-panel');
      if (!s.shown) return 'the selection panel is not shown';
      const inside = s.x >= c.x + MAP_OVERLAY_INSET - 1 && s.y >= c.y + MAP_OVERLAY_INSET - 1
        && s.x + s.w <= c.x + c.w - MAP_OVERLAY_INSET + 1 && s.y + s.h <= c.y + c.h - MAP_OVERLAY_INSET + 1;
      return inside ? null : `the selection panel is at ${fmt(s)}, outside the map ${fmt(c)} less ${MAP_OVERLAY_INSET} px on each side`;
    },
  },
  {
    name: 'selection-panel-battle',
    scenes: [SCENES.battleSelection],
    needs: ['#selection-panel', '#sidebar-selected-unit', '#selection-panel-units .selection-panel-unit-name', '#selection-panel-hint'],
    run: (p, el) => {
      if (!el('#selection-panel').shown) return 'the selection panel is not shown';
      const text = el('#sidebar-selected-unit').text;
      const line = readSummaryLine(text);
      const name = el('#selection-panel-units .selection-panel-unit-name').text;
      if (!line || !line.code.includes('.') || line.rest !== name) {
        return `the first line reads "${text}", expected a battle cell code such as "(E8.K3)", then "${name}"`;
      }
      const hint = el('#selection-panel-hint').text;
      return hint === SELECTION_BAR.moveHint ? null : `the hint reads "${hint}", expected "${SELECTION_BAR.moveHint}"`;
    },
  },
  {
    name: 'selection-panel-regional',
    scenes: [SCENES.regionalSelection],
    needs: ['#selection-panel', '#sidebar-selected-unit', '#selection-panel-units .selection-panel-unit-name', '#selection-panel-caption'],
    run: (p, el) => {
      if (!el('#selection-panel').shown) return 'the selection panel is not shown';
      const text = el('#sidebar-selected-unit').text;
      const line = readSummaryLine(text);
      const name = el('#selection-panel-units .selection-panel-unit-name').text;
      if (!line || line.code.includes('.') || line.rest !== name) return `the first line reads "${text}", expected a hex code such as "(D4)", then "${name}"`;
      const caption = el('#selection-panel-caption').text;
      return caption !== '' ? null : 'the hex caption is empty';
    },
  },
  {
    name: 'support-button-battle',
    scenes: [SCENES.battleSelection],
    needs: ['#ranged-attack-btn', '#selection-panel-action-note'],
    run: (p, el) => {
      const ranged = el('#ranged-attack-btn');
      if (el('#selection-panel-action-note').shown) return `a reason shows in a battle: "${el('#selection-panel-action-note').text}"`;
      return ranged.shown && !ranged.disabled && ranged.text === 'Ranged'
        ? null
        : `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}${ranged.disabled ? ' and is disabled' : ''}, expected it enabled`;
    },
  },
  {
    name: 'reports-after-reopen',
    scenes: [SCENES.matchReopened],
    needs: ['#reports-list'],
    run: (p, el) => (el('#reports-list').text.includes('Turn report') ? 'a turn report from before the app closed is still listed' : null),
  },
  {
    name: 'reports-battle-beat',
    scenes: [SCENES.battleBeat],
    needs: ['#reports-list'],
    run: (p, el) => {
      // Reports are not kept across a restart, so every turn report listed here came from the beat just played. The
      // beat files one only when the dice give it fighting to report, so an empty list also passes.
      const tags = [...el('#reports-list').text.matchAll(/([TB]\d+)Turn report/g)].map((match) => match[1]);
      return tags.every((tag) => tag === 'B1') ? null : `the turn reports are tagged ${tags.join(', ')}, expected only B1`;
    },
  },
  {
    name: 'reports-new-match',
    scenes: [SCENES.regionalStart],
    needs: ['#reports-list'],
    run: (p, el) => {
      const text = el('#reports-list').text;
      return text.includes('Turn report') || text.includes('B1') ? 'entries from the previous match are still listed' : null;
    },
  },
]);

module.exports = { SCENARIO_CHECKS };
