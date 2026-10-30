/**
 * Draws the credits symbol on a token that still contains a mercenary.
 *
 * Purpose: Anyone who can see the unit can see that it is paid from a treasury.
 * When to use: After the count badges, once per token whose remaining units include a mercenary.
 * Expected outcome: One credits symbol at the center of that token. A token whose mercenaries were excluded is not badged.
 * Exceptions: None.
 */

import { CREDITS_SYMBOL } from '../../shared/economySymbols';

/** The character drawn on a mercenary token. */
export const MERCENARY_BADGE_TEXT = CREDITS_SYMBOL;

/** Font for the mercenary badge. 14 px keeps the currency sign readable at the token center. */
export const MERCENARY_BADGE_FONT = 'bold 14px system-ui, sans-serif';

/**
 * Draws one credits symbol at a token center.
 *
 * Purpose: The badge sits on the top token of a stack, not on every marker in the hex.
 * When to use: With the token's top coordinates. Those coordinates are already the center of that token.
 * Expected outcome: A white stroke and a black credits symbol at that point, then the canvas state restored.
 * Exceptions: None.
 */
export function drawMercenaryBadge(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.font = MERCENARY_BADGE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeText(MERCENARY_BADGE_TEXT, x, y);
  ctx.fillStyle = '#000';
  ctx.fillText(MERCENARY_BADGE_TEXT, x, y);
  ctx.restore();
}
