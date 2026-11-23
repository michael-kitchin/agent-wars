/**
 * Keeps the Sight cues checkbox in step with Fog of war on the page.
 *
 * Purpose: With Fog of war off nothing is hidden, so Sight cues are locked off and their choice returns when Fog comes back.
 * When to use: The new-game dialog (sync and link) and the in-match options dialog (lock).
 * Expected outcome: The checkbox's checked, disabled, and tip follow `sightCuesAfterFogChange`. A missing box makes each function do nothing.
 * Exceptions: None.
 */

import { SIGHT_CUES_FOG_OFF_TOOLTIP, sightCuesAfterFogChange } from '../../shared/sightCuesFogRule';
import { sightCuesCheckboxTooltipText } from '../chrome/controlTooltipText';

const FOG_ID = 'new-game-fog-checkbox';
const SIGHT_CUES_ID = 'new-game-sight-cues-checkbox';

/**
 * The checked value to restore when Fog comes back.
 *
 * Purpose: Survives between Fog changes while the box is locked.
 * When to use: `syncNewGameSightCuesWithFog` only.
 * Expected outcome: Null unless Fog has locked the box.
 * Exceptions: None.
 */
let rememberedChecked: boolean | null = null;

/**
 * One checkbox by id.
 *
 * Purpose: Both boxes are optional on the page.
 * When to use: The functions below.
 * Expected outcome: The input, or null.
 * Exceptions: None.
 */
function checkbox(id: string): HTMLInputElement | null {
  const element = document.getElementById(id);
  return element instanceof HTMLInputElement ? element : null;
}

/**
 * Applies the Fog rule to the Sight cues box.
 *
 * Purpose: Fog unchecked remembers and locks the box. Fog checked unlocks it and restores the choice.
 * When to use: When the dialog opens or resets, and on every Fog change.
 * Expected outcome: The box is unchecked, disabled, and tipped with the Fog-off sentence, or enabled with its normal tip and its remembered choice.
 * Exceptions: None.
 */
export function syncNewGameSightCuesWithFog(): void {
  const fog = checkbox(FOG_ID);
  const cues = checkbox(SIGHT_CUES_ID);
  if (!fog || !cues) return;
  const next = sightCuesAfterFogChange({
    fogOn: fog.checked,
    current: { checked: cues.checked, disabled: cues.disabled, rememberedChecked },
  });
  rememberedChecked = next.rememberedChecked;
  cues.checked = next.checked;
  cues.disabled = next.disabled;
  cues.setAttribute('data-control-tooltip', next.disabled ? SIGHT_CUES_FOG_OFF_TOOLTIP : sightCuesCheckboxTooltipText);
}

/**
 * Puts Sight cues back to a starting value, then applies the Fog rule.
 *
 * Purpose: The new-game reset must not leave a checked box locked by Fog of war or restore an older remembered choice.
 * When to use: `resetNewGameVictory`, in place of writing the checkbox directly.
 * Expected outcome: The memory is cleared and the box takes `checked`. With Fog unchecked it is then locked off and remembers `checked`.
 * Exceptions: None.
 */
export function resetNewGameSightCues(checked: boolean): void {
  const cues = checkbox(SIGHT_CUES_ID);
  if (!cues) return;
  rememberedChecked = null;
  cues.checked = checked;
  cues.disabled = false;
  cues.setAttribute('data-control-tooltip', sightCuesCheckboxTooltipText);
  syncNewGameSightCuesWithFog();
}

/**
 * Locks the Sight cues box off in the in-match dialog when Fog is off.
 *
 * Purpose: The in-match dialog shows the live match, whose Fog never changes, so the box is only locked and never remembered.
 * When to use: The end of `lockOptionControls`.
 * Expected outcome: With Fog unchecked the box is unchecked, disabled, and tipped with the Fog-off sentence. Otherwise nothing changes. The remembered value is not touched.
 * Exceptions: None.
 */
export function lockSightCuesWhenFogOff(): void {
  const fog = checkbox(FOG_ID);
  const cues = checkbox(SIGHT_CUES_ID);
  if (!fog || !cues || fog.checked) return;
  cues.checked = false;
  cues.disabled = true;
  cues.setAttribute('data-control-tooltip', SIGHT_CUES_FOG_OFF_TOOLTIP);
}

/**
 * Links the Fog checkbox to the Sight cues box.
 *
 * Purpose: Changing Fog of war updates Sight cues at once.
 * When to use: Once when the new-game dialog is wired.
 * Expected outcome: One `change` listener on the Fog checkbox that calls `syncNewGameSightCuesWithFog`. Nothing when the box is missing.
 * Exceptions: None.
 */
export function registerFogSightCuesLink(): void {
  checkbox(FOG_ID)?.addEventListener('change', syncNewGameSightCuesWithFog);
}
