/**
 * Draws the `$` on a token that still contains a mercenary.
 *
 * Purpose: Anyone who can see the unit can see that it is paid from a treasury.
 * When to use: After the count badges, once per token whose remaining units include a mercenary.
 * Expected outcome: One `$` low and centered on that token. A token whose mercenaries were excluded is not badged.
 * Exceptions: None.
 */

import { UNIT_RADIUS } from '../core/constants';

/** The character drawn on a mercenary token. */
export const MERCENARY_BADGE_TEXT = '$';

/** Font for the mercenary badge. */
export const MERCENARY_BADGE_FONT = 'bold 11px system-ui, sans-serif';

/** How far below the token center the badge sits, in token radii. */
export const MERCENARY_BADGE_Y_OFFSET_RATIO = 0.6;

/**
 * Draws one `$` below a token center.
 *
 * Purpose: The badge sits on the top token of a stack, not on every marker in the hex.
 * When to use: With the token's top coordinates.
 * Expected outcome: A white stroke and a black `$`, then the canvas state restored.
 * Exceptions: None.
 */
export function drawMercenaryBadge(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const badgeY = y + UNIT_RADIUS * MERCENARY_BADGE_Y_OFFSET_RATIO;
  ctx.save();
  ctx.font = MERCENARY_BADGE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeText(MERCENARY_BADGE_TEXT, x, badgeY);
  ctx.fillStyle = '#000';
  ctx.fillText(MERCENARY_BADGE_TEXT, x, badgeY);
  ctx.restore();
}
