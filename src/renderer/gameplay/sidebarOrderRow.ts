import { UNIT_DESELECT_GLYPH, UNIT_SELECT_GLYPH } from '../core/constants';
import { setUnitNameContent } from '../core/unitOriginFlags';

/**
 * Arguments for one sidebar order row (movement, ferry, ranged, or air-strike order).
 *
 * Purpose: One shared shape for `createSidebarOrderRow` and every dependency interface that forwards it.
 * When to use: When building or forwarding a sidebar order row.
 * Expected outcome: Describes the row label, the selection state, and the row's button callbacks.
 * Exceptions: None.
 */
export type SidebarOrderRowArgs = {
  /**
   * Full row label, typically `Unit name → target`.
   *
   * Contract: Plain text; it is never parsed as HTML.
   * When to use: Always.
   * Expected outcome: Shown as the row's label text.
   * Exceptions: None.
   */
  readonly labelText: string;
  /**
   * Id of the unit the row's label starts with.
   *
   * Contract: Optional; when present and the unit's origin is known, the label gets the unit's country flag.
   * When to use: Whenever the label begins with a unit's full display name.
   * Expected outcome: A flag before the label, or plain text when the id is absent or has no origin.
   * Exceptions: None.
   */
  readonly unitId?: string;
  /**
   * Whether the row's unit is currently selected.
   *
   * Contract: Chooses the select or deselect glyph.
   * When to use: Always.
   * Expected outcome: The select button reflects this state.
   * Exceptions: None.
   */
  readonly selected: boolean;
  /**
   * Called when the row's select button is clicked.
   *
   * Contract: Receives the click event so modifier keys can extend the selection.
   * When to use: Always.
   * Expected outcome: The caller updates the selection.
   * Exceptions: Whatever the callback throws.
   */
  readonly onToggleSelect: (event: MouseEvent) => void;
  /**
   * Called when the row's cancel button is clicked.
   *
   * Contract: Removes the order the row represents.
   * When to use: Always.
   * Expected outcome: The caller cancels the order and refreshes the list.
   * Exceptions: Whatever the callback throws.
   */
  readonly onCancel: () => void;
  /**
   * Whether to use the compact blue square button style.
   *
   * Contract: Optional; defaults to the standard button style.
   * When to use: For rows in the compact orders lists.
   * Expected outcome: Both buttons use the compact style when `true`.
   * Exceptions: None.
   */
  readonly compactBlueButtons?: boolean;
};

/**
 * Builds one sidebar order row: a label followed by select and cancel buttons.
 *
 * Purpose: Gives every order list the same row layout and controls.
 * When to use: From the pending-orders and ranged-orders sidebar renderers.
 * Expected outcome: A flex row element, not yet attached. When `args.unitId` is given, the label starts with
 *   that unit's country flag if its origin is known.
 * Exceptions: None.
 */
export function createSidebarOrderRow(args: SidebarOrderRowArgs): HTMLDivElement {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '0.5rem';
  row.style.marginBottom = '0.35rem';
  const label = document.createElement('span');
  if (args.unitId) setUnitNameContent(label, args.unitId, args.labelText);
  else label.textContent = args.labelText;
  label.style.flex = '1';
  label.style.fontSize = '0.9em';
  const selectBtn = document.createElement('button');
  selectBtn.type = 'button';
  selectBtn.className = args.compactBlueButtons ? 'unit-select compact-blue-btn compact-square-btn' : 'unit-select';
  selectBtn.textContent = args.selected ? UNIT_DESELECT_GLYPH : UNIT_SELECT_GLYPH;
  selectBtn.style.flexShrink = '0';
  selectBtn.style.fontSize = '0.8em';
  selectBtn.addEventListener('click', (event) => {
    args.onToggleSelect(event as MouseEvent);
  });
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = args.compactBlueButtons ? 'unit-select compact-blue-btn compact-square-btn' : 'unit-select';
  cancelBtn.textContent = '×';
  cancelBtn.style.flexShrink = '0';
  cancelBtn.style.fontSize = '0.8em';
  cancelBtn.addEventListener('click', args.onCancel);
  row.appendChild(label);
  row.appendChild(selectBtn);
  row.appendChild(cancelBtn);
  return row;
}
