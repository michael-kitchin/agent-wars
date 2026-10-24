/**
 * The one toast for a drained commander-pool read.
 *
 * Purpose: Several commanders finishing together share one Messages toast.
 * When to use: The pool client, after it has filed one Reports entry per message.
 * Expected outcome: "Messages ({n})" and one line per sender. No Reports entry is filed from the toast.
 * Exceptions: None.
 */

import { appendMapToastSectionHeader, showFilledAiStrategyToast } from './openRouterUiHelpers';

/**
 * Shows one toast listing every commander's message.
 *
 * Purpose: A draining pool read is one Messages toast, not one toast per seat.
 * When to use: After a draining read that has at least one message.
 * Expected outcome: The strategy toast shows the title and the lines. It does not file a Reports entry.
 * Exceptions: None.
 */
export function showCommanderMessagesToast(lines: readonly string[]): void {
  if (lines.length === 0) return;
  showFilledAiStrategyToast((target) => {
    appendMapToastSectionHeader(target, `Messages (${lines.length})`);
    for (const line of lines) {
      const span = document.createElement('span');
      span.style.display = 'block';
      span.textContent = line;
      target.appendChild(span);
    }
  }, false);
}
