/**
 * Shared layout for one terrain-legend row and its swatch chrome.
 *
 * Purpose: Kind, Urban, Rubble, and Fortified rows use the same row and the same swatch box.
 * When to use: From those four legend builders. Callers set their own fill after the chrome.
 * Expected outcome: A flex row with a labeled swatch. The swatch has no background of its own.
 * Exceptions: None.
 */

/**
 * Sets the shared swatch box without choosing a fill.
 *
 * Purpose: Every legend chip is the same size and border. The fill differs by row.
 * When to use: On a new span or canvas, before that row's own paint.
 * Expected outcome: Inline-block, 18 by 12 pixels, with the shared border. Background and canvas bitmap size stay untouched.
 * Exceptions: None.
 */
export function applyLegendSwatchChrome(el: HTMLElement): void {
  el.style.display = 'inline-block';
  el.style.width = '18px';
  el.style.height = '12px';
  el.style.border = '1px solid #d5deea';
  el.style.borderRadius = '2px';
}

/**
 * Appends one labeled legend row.
 *
 * Purpose: The four legend builders share the row layout and leave the label unstyled.
 * When to use: After the swatch has its chrome and its own fill.
 * Expected outcome: `container` gains a flex row holding `swatch` and a span whose text is `labelText`.
 * Exceptions: None.
 */
export function appendLegendRow(container: HTMLElement, swatch: HTMLElement, labelText: string): void {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '6px';
  row.style.marginBottom = '2px';
  const label = document.createElement('span');
  label.textContent = labelText;
  row.appendChild(swatch);
  row.appendChild(label);
  container.appendChild(row);
}
