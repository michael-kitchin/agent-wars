import type { HexBuildQueueSnapshot } from '../../shared/ipcTypes';

/**
 * Whether a hex can interactively arm Keep building.
 *
 * Purpose: Shared enablement rule for single- and multi-hex checkbox UI.
 * When to use: Deciding if the Keep building control should be clickable.
 * Expected outcome: True when the hex has queue entries or an active standing order.
 * Exceptions: None.
 */
export function canArmKeepBuilding(snapshot: HexBuildQueueSnapshot): boolean {
  return snapshot.entries.length > 0 || (snapshot.keepBuilding && snapshot.keepBuildingUnitType !== null);
}

/**
 * Multi-hex checked state: all selected hexes have Keep building on.
 *
 * Purpose: Implements the locked mixed-selection display rule.
 * When to use: Rendering the multi-hex Keep building checkbox.
 * Expected outcome: True only when every snapshot has keepBuilding true.
 * Exceptions: Empty snapshot lists return false.
 */
export function areAllKeepBuildingArmed(snapshots: HexBuildQueueSnapshot[]): boolean {
  return snapshots.length > 0 && snapshots.every((snapshot) => snapshot.keepBuilding);
}

/**
 * Multi-hex enablement: every selected hex can arm Keep building.
 *
 * Purpose: Disables the multi checkbox when any selected hex cannot arm.
 * When to use: Rendering the multi-hex Keep building checkbox.
 * Expected outcome: True only when every snapshot passes `canArmKeepBuilding`.
 * Exceptions: Empty snapshot lists return false.
 */
export function canArmKeepBuildingForAll(snapshots: HexBuildQueueSnapshot[]): boolean {
  return snapshots.length > 0 && snapshots.every((snapshot) => canArmKeepBuilding(snapshot));
}

/**
 * Appends the Keep building checkbox row to a build-popup section.
 *
 * Purpose: Shared DOM for single- and multi-hex Keep building controls.
 * When to use: After queue editors are rendered, at the bottom of the build section.
 * Expected outcome: A labeled checkbox wired to `onChange`; disabled/checked reflect the args.
 * Exceptions: None.
 */
export function appendKeepBuildingCheckbox(args: {
  section: HTMLElement;
  checked: boolean;
  disabled: boolean;
  onChange: (keepBuilding: boolean) => void | Promise<void>;
}): void {
  const row = document.createElement('div');
  row.className = 'build-keep-building-row';
  const label = document.createElement('label');
  label.className = 'build-keep-building-label';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'build-keep-building-checkbox';
  checkbox.checked = args.checked;
  checkbox.disabled = args.disabled;
  checkbox.addEventListener('change', () => {
    void args.onChange(checkbox.checked);
  });
  const text = document.createElement('span');
  text.textContent = 'Keep building';
  label.appendChild(checkbox);
  label.appendChild(text);
  row.appendChild(label);
  args.section.appendChild(row);
}
