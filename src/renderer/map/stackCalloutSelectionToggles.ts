import { UNIT_DESELECT_GLYPH, UNIT_SELECT_GLYPH } from '../core/constants';
import { stackUnitToggleTooltipText } from '../../shared/popupControlTooltipText';
import { rendererSharedState as S } from '../core/state';
import { removeUnitsFromSelection } from '../core/selection';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { syncUiAfterSelectionChange } from './stackCalloutHost';

/**
 * Units whose stack-popup selection toggle is hidden because they are embarked.
 *
 * Purpose: The sealift section records embarked land units. Each open or close of the popup clears the set.
 * When to use: Read when building Select All and when painting toggle visibility. Replaced by the sealift section.
 * Expected outcome: The unit ids that stay in the list but cannot be selected from it.
 * Exceptions: None.
 */
let stackCalloutNonSelectableUnitIds: ReadonlySet<string> = new Set<string>();

/**
 * Clears the embarked-unit set so every human toggle can show again.
 *
 * Purpose: Opening or closing the popup starts with no embarked exclusions until sealift state loads.
 * When to use: `hideStackCallout` and the start of `showStackCallout`.
 * Expected outcome: The set is empty.
 * Exceptions: None.
 */
export function resetStackCalloutNonSelectableUnitIds(): void {
  stackCalloutNonSelectableUnitIds = new Set<string>();
}

/**
 * The unit ids whose selection toggles are currently hidden.
 *
 * Purpose: The stack list applies visibility from the set the sealift section last stored.
 * When to use: After the stack list is built, before a later sealift render replaces the set.
 * Expected outcome: The current set. Empty until sealift reports embarked units.
 * Exceptions: None.
 */
export function currentStackCalloutNonSelectableUnitIds(): ReadonlySet<string> {
  return stackCalloutNonSelectableUnitIds;
}

/**
 * Hides selection toggles for embarked units and keeps each visible toggle matched to the current selection.
 *
 * Purpose: Embark hides a toggle without removing its row. Debark shows that same button, so its mark has to follow selection rather than the mark from when the list opened.
 * When to use: After the stack list is built and whenever sealift state changes which units are selectable.
 * Expected outcome: A non-selectable unit's toggle stays in the layout and is hidden. Every other toggle is visible, shows select or unselect for the current selection, and its tip matches that mark.
 * Exceptions: None.
 */
export function applyStackCalloutSelectionButtonVisibility(calloutEl: HTMLElement, nonSelectableUnitIds: ReadonlySet<string>): void {
  const listEl = document.getElementById('stack-callout-list');
  if (!listEl) return;
  const rows = Array.from(listEl.querySelectorAll('li'));
  for (const row of rows) {
    const unitId = row.getAttribute('data-unit-id');
    if (!unitId) continue;
    const btn = row.querySelector('button.stack-unit-toggle') as HTMLButtonElement | null;
    if (!btn) continue;
    const selected = S.selectedUnitIds.includes(unitId);
    btn.textContent = selected ? UNIT_DESELECT_GLYPH : UNIT_SELECT_GLYPH;
    btn.setAttribute('data-control-tooltip', stackUnitToggleTooltipText(selected));
    btn.style.visibility = nonSelectableUnitIds.has(unitId) ? 'hidden' : 'visible';
  }
}

/**
 * Records embarked units and hides their selection toggles.
 *
 * Purpose: A land unit in a sealift slot stays in the list but must not be selected from it.
 * When to use: After sealift state names the units in cargo slots.
 * Expected outcome: Those ids are stored, any of them already selected are removed, and the list's toggles update.
 * Exceptions: None.
 */
export function setStackPopupNonSelectableUnitIds(calloutEl: HTMLElement, unitIds: string[]): void {
  const normalized = [...new Set(unitIds)].sort((a, b) => a.localeCompare(b));
  const nonSelectable = new Set<string>(normalized);
  stackCalloutNonSelectableUnitIds = nonSelectable;
  const selectedBlockedIds = normalized.filter((unitId) => S.selectedUnitIds.includes(unitId));
  if (selectedBlockedIds.length > 0) {
    removeUnitsFromSelection(selectedBlockedIds);
    syncUiAfterSelectionChange({ refreshHoverPreview: false, refreshStackCallout: false });
  }
  applyStackCalloutSelectionButtonVisibility(calloutEl, nonSelectable);
}

/**
 * Human unit ids in this hex that are not embarked.
 *
 * Purpose: Select All, Add All, and Remove All must skip cargo the sealift section marked non-selectable.
 * When to use: The stack header's all-unit buttons.
 * Expected outcome: Human ids from `units` that are absent from the non-selectable set.
 * Exceptions: None.
 */
export function getSelectableHumanIdsForStackCallout(units: GameStateSnapshot['units']): string[] {
  return units.filter((u) => u.player === HUMAN_SEAT_ID && !stackCalloutNonSelectableUnitIds.has(u.id)).map((u) => u.id);
}
