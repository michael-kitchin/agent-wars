/**
 * Tool-group counts on the Commanders tab.
 *
 * Purpose: The toggles show the pool's total for the current consult.
 * When to use: After a pool snapshot is applied, and when the toggles are first painted.
 * Expected outcome: Each toggle shows that group's count, or 0 when the group has none.
 * Exceptions: None.
 */

import { rendererSharedState as S } from '../core/state';

/**
 * Writes each tool group's count onto its toggle.
 *
 * Purpose: The number on the cell is the use count, separate from whether the group is on.
 * When to use: After `S.toolInvocationCounts` changes, and when a cell is created.
 * Expected outcome: Each existing toggle shows that group's count, or 0 when the group has none. A missing toggle is skipped.
 * Exceptions: None.
 */
export function updateOpenRouterToolCountLabels(): void {
  for (const group of S.openRouterToolGroups) {
    const btn = document.querySelector(`.openrouter-tool-toggle[data-tool-group="${group.id}"]`);
    if (btn) btn.textContent = String(S.toolInvocationCounts[group.id] ?? 0);
  }
}

/**
 * Replaces the visible counts with the current consult's total.
 *
 * Purpose: The pool snapshot is the only source for these cells.
 * When to use: After a pool read or a planning start.
 * Expected outcome: The cells match `counts`. A group missing from the map shows 0.
 * Exceptions: None.
 */
export function applyCommanderToolCountSum(counts: Readonly<Record<string, number>>): void {
  S.toolInvocationCounts = { ...counts };
  updateOpenRouterToolCountLabels();
}
