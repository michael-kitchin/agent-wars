import { rendererSharedState as S } from '../core/state';
import { setUnitNameContent } from '../core/unitOriginFlags';
import { publishQueuedOrders, type QueuedOrderGroup } from './queuedOrderRows';
import { appendMutedPlaceholder } from './sidebarListHelpers';

/**
 * Arguments for one order row (movement, ferry, ranged, or air-strike order).
 *
 * Purpose: One shared shape for `createSidebarOrderRow` and `renderSidebarOrderGroup`.
 * When to use: When building the rows of an Orders tab group.
 * Expected outcome: Describes the unit, the order's line, the selection state, and the row's callbacks.
 * Exceptions: None.
 */
export type SidebarOrderRowArgs = {
  /**
   * Id of the unit the order belongs to.
   *
   * Contract: A strategic unit id, or a battle sub-unit id during a battle.
   * When to use: Always.
   * Expected outcome: The row shows the unit's origin flag when its origin is known.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * The unit's display name.
   *
   * Contract: Plain text; it is never parsed as HTML.
   * When to use: Always.
   * Expected outcome: The row's first line.
   * Exceptions: None.
   */
  readonly unitName: string;
  /**
   * The order's line, such as `→ E5 · 1h`.
   *
   * Contract: Built by the shared order-line formatters; plain text.
   * When to use: Always.
   * Expected outcome: The row's second line.
   * Exceptions: None.
   */
  readonly detail: string;
  /**
   * Whether the row's unit is currently selected.
   *
   * Contract: Marks the row as pressed.
   * When to use: Always.
   * Expected outcome: A selected row is highlighted.
   * Exceptions: None.
   */
  readonly selected: boolean;
  /**
   * Called when the row is clicked.
   *
   * Contract: Receives the click event so Shift can add or remove the unit.
   * When to use: Always.
   * Expected outcome: The caller updates the selection.
   * Exceptions: Whatever the callback throws.
   */
  readonly onToggleSelect: (event: MouseEvent) => void;
  /**
   * Called when the row's × is clicked.
   *
   * Contract: Removes the order the row represents.
   * When to use: Always.
   * Expected outcome: The caller cancels the order and refreshes the list.
   * Exceptions: Whatever the callback throws.
   */
  readonly onCancel: () => void;
};

/**
 * Renderer callbacks every order row needs.
 *
 * Purpose: Lets the Movement, Ranged attacks, and Air strikes renderers build rows the same way.
 * When to use: Pass the renderer's dependency bundle to `sidebarOrderRowArgs`.
 * Expected outcome: Names come from the shared display-name lookup; a row click goes through the shared selection rule.
 * Exceptions: None.
 */
export interface SidebarOrderRowDeps {
  /**
   * Returns a unit's display name.
   *
   * Contract: Same names the map and the stack callout show.
   * When to use: The first line of each row.
   * Expected outcome: The name, or a fallback built from the id.
   * Exceptions: None.
   */
  readonly formatUnitDisplayName: (unitId: string) => string;
  /**
   * Selects a row's unit: a plain click replaces the selection, and Shift adds or removes the unit.
   *
   * Contract: Same rule as the stack callout's unit buttons.
   * When to use: The row's click handler.
   * Expected outcome: The selection and the views that follow it are refreshed.
   * Exceptions: None.
   */
  readonly applySelectionFromSidebarUnitButton: (unitId: string, event: MouseEvent) => void;
}

/**
 * Builds the arguments for one order row.
 *
 * Purpose: The three group renderers share the name lookup, the selected state, and the click rule.
 * When to use: Once per queued order, with that order's line and cancel action.
 * Expected outcome: Arguments for `renderSidebarOrderGroup`; `selected` is true when the unit is in the current selection.
 * Exceptions: None.
 */
export function sidebarOrderRowArgs(
  unitId: string,
  detail: string,
  onCancel: () => void,
  deps: SidebarOrderRowDeps
): SidebarOrderRowArgs {
  return {
    unitId,
    unitName: deps.formatUnitDisplayName(unitId),
    detail,
    selected: S.selectedUnitIds.includes(unitId),
    onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(unitId, event),
    onCancel,
  };
}

/**
 * The list and count elements of each Orders tab group.
 *
 * Purpose: Keeps the group ids in one place for the renderers.
 * When to use: Through `renderSidebarOrderGroup`.
 * Expected outcome: Every id exists in `static/index.html`.
 * Exceptions: None.
 */
const ORDER_GROUP_ELEMENT_IDS: Readonly<Record<QueuedOrderGroup, { readonly listId: string; readonly countId: string }>> =
  Object.freeze({
    movement: { listId: 'pending-orders-list', countId: 'pending-orders-count' },
    ranged: { listId: 'ranged-attacks-list', countId: 'ranged-attacks-count' },
    strike: { listId: 'air-strikes-list', countId: 'air-strikes-count' },
    launch: { listId: 'missile-launches-list', countId: 'missile-launches-count' },
  });

/**
 * Builds one order row: the unit and its order's line in one select button, then a cancel button.
 *
 * Purpose: Gives every order group the same row layout and controls.
 * When to use: From `renderSidebarOrderGroup`.
 * Expected outcome: An unattached row. Clicking the row's main part selects its unit; × cancels the order.
 * Exceptions: None.
 */
export function createSidebarOrderRow(args: SidebarOrderRowArgs): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'console-order-row';
  row.dataset.unitId = args.unitId;
  const selectBtn = document.createElement('button');
  selectBtn.type = 'button';
  selectBtn.className = 'console-order-select';
  selectBtn.setAttribute('aria-pressed', args.selected ? 'true' : 'false');
  const name = document.createElement('span');
  name.className = 'console-order-name';
  setUnitNameContent(name, args.unitId, args.unitName);
  const detail = document.createElement('span');
  detail.className = 'console-order-detail';
  detail.textContent = args.detail;
  selectBtn.append(name, detail);
  selectBtn.addEventListener('click', (event) => args.onToggleSelect(event));
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'console-order-cancel';
  cancelBtn.setAttribute('aria-label', `Cancel the order for ${args.unitName}`);
  cancelBtn.textContent = '×';
  cancelBtn.addEventListener('click', args.onCancel);
  row.append(selectBtn, cancelBtn);
  return row;
}

/**
 * Redraws one Orders tab group: its rows, its count, and its published copy.
 *
 * Purpose: The three groups fill their lists the same way, and other views read the result.
 * When to use: Each time a group's drafts or the selection change.
 * Expected outcome: The list shows one row per order, or "None" when there are none. The heading count shows
 *   the number of rows. `publishQueuedOrders` receives the same orders. A missing list element changes nothing.
 * Exceptions: None.
 */
export function renderSidebarOrderGroup(group: QueuedOrderGroup, rows: readonly SidebarOrderRowArgs[]): void {
  const ids = ORDER_GROUP_ELEMENT_IDS[group];
  const list = document.getElementById(ids.listId);
  if (!list) return;
  list.replaceChildren();
  if (rows.length === 0) appendMutedPlaceholder(list, 'None');
  for (const row of rows) list.appendChild(createSidebarOrderRow(row));
  const count = document.getElementById(ids.countId);
  if (count) count.textContent = String(rows.length);
  publishQueuedOrders(
    group,
    rows.map((row) => ({ unitId: row.unitId, detail: row.detail, cancel: row.onCancel }))
  );
}

/**
 * Marks the order rows whose unit is selected, without rebuilding the lists.
 *
 * Purpose: Some selection changes refresh only the selected-unit readout, so the rows would keep an old highlight.
 * When to use: After every selection change; `updateSidebar` calls it.
 * Expected outcome: Each row's select button is pressed exactly when its unit is in `S.selectedUnitIds`.
 * Exceptions: None.
 */
export function syncSidebarOrderRowSelection(): void {
  const selected = new Set(S.selectedUnitIds);
  document.querySelectorAll<HTMLElement>('.console-order-row').forEach((row) => {
    const pressed = row.dataset.unitId !== undefined && selected.has(row.dataset.unitId);
    row.querySelector('.console-order-select')?.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  });
}
