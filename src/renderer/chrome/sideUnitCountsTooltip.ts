/**
 * The unit-count list shown when the pointer rests on a side name in the top bar.
 *
 * Purpose: The player sees how many units of each type a side has without opening a panel.
 * When to use: As the builder passed to `setRichControlTooltip` for a side name.
 * Expected outcome: One line per type, each with that side's mini unit token, then a bold Total line.
 * Exceptions: None.
 */

import type { SideUnitCounts } from '../../shared/sideUnitCounts';
import { createLossTypeToken } from './toastInlineMarks';

/**
 * Builds the tooltip body for one side.
 *
 * Purpose: The mini token uses the side's map fill and text-color ring, the same colors as a dice-chip token.
 * When to use: When the tip opens. `seats` is the roster that colors the tokens.
 * Expected outcome: A `side-unit-tooltip` holding a row per entry in `counts.rows`, in that order, then
 *   `<strong>Total:</strong> N`. A side with no units shows only the Total line.
 * Exceptions: None.
 */
export function buildSideUnitCountsTooltip(
  counts: SideUnitCounts,
  seatId: string,
  seats: readonly { readonly seatId: string; readonly seatOrder: number }[]
): HTMLElement {
  const body = document.createElement('div');
  body.className = 'side-unit-tooltip';
  const rows = counts.rows.map((row) => {
    const line = document.createElement('div');
    line.className = 'side-unit-tooltip-row';
    line.append(createLossTypeToken(row.unitType, seatId, seats), `${row.count} ${row.label}`);
    return line;
  });
  const total = document.createElement('div');
  total.className = 'side-unit-tooltip-total';
  const label = document.createElement('strong');
  label.textContent = 'Total:';
  total.append(label, ` ${counts.total}`);
  body.append(...rows, total);
  return body;
}
