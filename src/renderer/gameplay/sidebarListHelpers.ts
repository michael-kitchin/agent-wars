/**
 * Appends a muted placeholder span to a sidebar list.
 *
 * Purpose: Empty Movement, Ranged, and Strike lists share one placeholder element.
 * When to use: After clearing a list that has no rows to show. Pass the visible text, usually `None`.
 * Expected outcome: The container gains a span with that text and class `chrome-muted`.
 * Exceptions: None.
 */
export function appendMutedPlaceholder(container: HTMLElement, text: string): void {
  const span = document.createElement('span');
  span.textContent = text;
  span.className = 'chrome-muted';
  container.appendChild(span);
}
