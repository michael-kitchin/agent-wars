/**
 * Checks of the chat panel's resize grip and its entry bar for the UI smoke run.
 *
 * Purpose: Keeps the chat panel's rows apart from the other check tables.
 * When to use: Required by `ui-smoke-checks.cjs`, which runs these rows after the map chrome checks.
 * Expected outcome: Rows in the same shape as the frame checks: `{ name, scenes, needs, run(p, el) }`.
 * Exceptions: None.
 */
'use strict';

const { SCENES, near, fmt } = require('./ui-smoke-scenes.cjs');

/**
 * The chat panel's size limits while its grip is dragged, in CSS pixels, and its inset from the map.
 *
 * Purpose: Dragged sizes stop at these limits, and the panel stays 12 px in from the map's right and bottom edges.
 * When to use: The dragged-size geometry checks.
 * Expected outcome: Matches `src/shared/chatPanelSize.ts` and `MAP_CHROME_INSET` in `src/shared/mapChromePlacement.ts`.
 * Exceptions: None.
 */
const CHAT_PANEL_LIMITS = Object.freeze({ minWidth: 280, maxWidth: 640, minHeight: 140, mapMargin: 24, inset: 12 });

/**
 * The narrowest the message field may get beside the side list, in CSS pixels.
 *
 * Purpose: The side list takes room from the field so a full nickname shows, but the field keeps a usable width.
 * When to use: The entry bar check.
 * Expected outcome: Matches `min-width` on `.chat-panel-input` in `static/chatChrome.css`.
 * Exceptions: None.
 */
const CHAT_FIELD_MIN_WIDTH = 48;

/**
 * Says what is wrong with the chat panel's box, if anything.
 *
 * Purpose: Both dragged sizes share one geometry rule: anchored at the map's bottom-right, at the given size.
 * When to use: From the dragged-size rows below.
 * Expected outcome: Null when the panel is shown, 12 px in from the map's right and bottom edges, and the given size
 *   within one pixel (the width may be held under its limit by the map); otherwise a failure message.
 * Exceptions: None.
 */
function chatPanelPlacement(c, panel, width, height) {
  if (!panel.shown) return 'the chat panel is not shown';
  const expectedWidth = Math.min(width, c.w - 2 * CHAT_PANEL_LIMITS.inset);
  const anchored = near(panel.x + panel.w, c.x + c.w - CHAT_PANEL_LIMITS.inset) && near(panel.y + panel.h, c.y + c.h - CHAT_PANEL_LIMITS.inset);
  const sized = near(panel.w, expectedWidth) && near(panel.h, height);
  return anchored && sized
    ? null
    : `the chat panel is at ${fmt(panel)}, expected ${expectedWidth}x${height} at the map's bottom-right, ${CHAT_PANEL_LIMITS.inset} px in`;
}

/**
 * The chat panel's rows, one per rule.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Spread into the list in `ui-smoke-checks.cjs`. `needs` lists every selector the row reads.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const CHAT_CHECKS = Object.freeze([
  {
    name: 'chat-panel-grip-at-top-left',
    scenes: [
      SCENES.ordersQueued,
      SCENES.selectionStack,
      SCENES.chatExpanded,
      SCENES.chatResized,
      SCENES.chatResizedMin,
      SCENES.chatCompactResized,
    ],
    needs: ['#chat-panel', '#chat-panel-grip'],
    run: (p, el) => {
      const panel = el('#chat-panel');
      const grip = el('#chat-panel-grip');
      if (!panel.shown) return 'the chat panel is not shown';
      if (!grip.shown) return 'the grip is hidden';
      return near(grip.x, panel.x + 1) && near(grip.y, panel.y + 1)
        ? null
        : `the grip is at ${fmt(grip)}, expected the top-left corner of the chat panel ${fmt(panel)}`;
    },
  },
  {
    name: 'chat-panel-dragged-large',
    scenes: [SCENES.chatResized],
    needs: ['#canvas-container', '#chat-panel'],
    run: (p, el) => {
      const c = el('#canvas-container');
      return chatPanelPlacement(c, el('#chat-panel'), CHAT_PANEL_LIMITS.maxWidth, c.h - CHAT_PANEL_LIMITS.mapMargin);
    },
  },
  {
    name: 'chat-panel-dragged-small',
    scenes: [SCENES.chatResizedMin],
    needs: ['#canvas-container', '#chat-panel'],
    run: (p, el) => chatPanelPlacement(el('#canvas-container'), el('#chat-panel'), CHAT_PANEL_LIMITS.minWidth, CHAT_PANEL_LIMITS.minHeight),
  },
  {
    name: 'chat-panel-dragged-compact',
    scenes: [SCENES.chatCompactResized],
    needs: ['#canvas-container', '#chat-panel', '#chat-panel-bar', '#chat-panel-expand'],
    run: (p, el) => {
      if (el('#chat-panel-expand').expanded !== 'false') return 'the chat panel is not compact';
      const bar = el('#chat-panel-bar');
      return chatPanelPlacement(el('#canvas-container'), el('#chat-panel'), CHAT_PANEL_LIMITS.minWidth + 100, bar.h + 2);
    },
  },
  {
    name: 'chat-recipient-shows-full-name',
    scenes: [SCENES.ordersQueued, SCENES.chatExpanded, SCENES.chatResizedMin, SCENES.chatCompactResized],
    needs: ['#chat-panel', '#chat-panel-recipient', '#chat-panel-input'],
    run: (p, el) => {
      const recipient = el('#chat-panel-recipient');
      const input = el('#chat-panel-input');
      if (!el('#chat-panel').shown || !recipient.shown) return null;
      const wanted = Number.parseFloat(recipient.styleWidth);
      if (Number.isFinite(wanted) && recipient.w + 0.5 < wanted) {
        return `the side list is ${Math.round(recipient.w)} px wide, narrower than the ${Math.round(wanted)} px its longest name needs`;
      }
      return input.w + 0.5 >= CHAT_FIELD_MIN_WIDTH ? null : `the message field is ${Math.round(input.w)} px wide, under its ${CHAT_FIELD_MIN_WIDTH} px minimum`;
    },
  },
]);

module.exports = { CHAT_CHECKS };
