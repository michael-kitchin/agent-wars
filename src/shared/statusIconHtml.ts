/**
 * Status icons for magnitude on the hex tooltip Effects line.
 *
 * Purpose: Movement, range, and cover share one set of up, down, and blocked marks.
 * When to use: Any HTML clause that shows a bonus of 1, a bonus of 2 or more, a penalty of 1, or a block.
 * Expected outcome: An escaped `<img>` at text size. The alt text is the magnitude.
 * Exceptions: None.
 */

import { escapeHtmlText } from './htmlTextFormatting';

/**
 * CSS class for a status icon.
 *
 * Purpose: One size next to Effects clauses, styled in `static/overlayChrome.css`.
 * When to use: On every status `<img>`.
 * Expected outcome: `status-icon`.
 * Exceptions: None.
 */
export const STATUS_ICON_CLASS_NAME = 'status-icon';

/**
 * Which status icon a tooltip clause shows.
 *
 * Purpose: Keeps magnitude a closed set.
 * When to use: `formatStatusIconHtml` and the movement-symbol walk.
 * Expected outcome: `up`, `down`, and `blocked` are magnitude 1. `doubleUp` is 2 or more.
 * Exceptions: None.
 */
export type StatusIconKind = 'up' | 'doubleUp' | 'down' | 'blocked';

/**
 * Icon file and alt text for one magnitude.
 *
 * Purpose: The Effects line reads the picture, and the alt text keeps the magnitude for assistive tech.
 * When to use: `formatStatusIconHtml`.
 * Expected outcome: A file under `static/status/` and a short alt string.
 * Exceptions: None.
 */
const STATUS_ICON: Readonly<Record<StatusIconKind, { readonly file: string; readonly alt: string }>> = Object.freeze({
  up: Object.freeze({ file: 'arrow_up.svg', alt: '+' }),
  doubleUp: Object.freeze({ file: 'arrow_up_double.svg', alt: '++' }),
  down: Object.freeze({ file: 'arrow_down.svg', alt: '-' }),
  blocked: Object.freeze({ file: 'x_mark.svg', alt: 'x' }),
});

/**
 * Movement and range symbols that map onto a single-magnitude icon.
 *
 * Purpose: `(+)`, `(-)`, and `(x)` stay magnitude 1. Cover of 2 uses `doubleUp` through `formatStatusIconHtml` directly.
 * When to use: `formatEffectSymbolPrefixHtml`.
 * Expected outcome: `+` is `up`, `-` is `down`, and `x` is `blocked`.
 * Exceptions: None.
 */
const EFFECT_SYMBOL_KIND: Readonly<Record<string, StatusIconKind>> = Object.freeze({
  '+': 'up',
  '-': 'down',
  x: 'blocked',
});

/**
 * Returns one status icon.
 *
 * Purpose: Effects clauses lead with a mark the way weather leads with one.
 * When to use: Cover clauses and movement or range prefixes.
 * Expected outcome: Escaped HTML. `up` is `arrow_up.svg` with alt `+`. `doubleUp` is `arrow_up_double.svg` with alt `++`. `down` is `arrow_down.svg` with alt `-`. `blocked` is `x_mark.svg` with alt `x`.
 * Exceptions: None.
 */
export function formatStatusIconHtml(kind: StatusIconKind): string {
  const icon = STATUS_ICON[kind];
  const src = escapeHtmlText(`status/${icon.file}`);
  const alt = escapeHtmlText(icon.alt);
  return `<img class="${STATUS_ICON_CLASS_NAME}" src="${src}" alt="${alt}" />`;
}

/**
 * Turns a movement or range symbol string into status icons.
 *
 * Purpose: A plain prefix such as `x/-` becomes icons in that same character order.
 * When to use: From the terrain-effect HTML formatter after the plain prefix is parsed.
 * Expected outcome: Icons concatenated with nothing between them. `+`, `-`, and `x` map to the single icons. Any other character is skipped. An empty string returns `''`.
 * Exceptions: None.
 */
export function formatEffectSymbolPrefixHtml(symbols: string): string {
  let html = '';
  for (const symbol of symbols) {
    const kind = EFFECT_SYMBOL_KIND[symbol];
    if (kind) html += formatStatusIconHtml(kind);
  }
  return html;
}
