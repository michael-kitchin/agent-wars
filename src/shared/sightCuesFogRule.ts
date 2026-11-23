/**
 * How the Sight cues checkbox follows Fog of war.
 *
 * Purpose: Sight cues draw lines to the units a commander could see, and with Fog of war off every unit is visible, so the cue has nothing to say. The checkbox is locked off while Fog is off and its choice is restored when Fog returns.
 * When to use: The new-game dialog and the in-match options dialog.
 * Expected outcome: A pure transition over the checkbox state. Nothing is read from the page here.
 * Exceptions: None. The functions do not throw.
 */

/**
 * Tooltip on the Sight cues checkbox while Fog of war is off.
 *
 * Purpose: Says why the box is unchecked and disabled.
 * When to use: `#new-game-sight-cues-checkbox` while it is locked by Fog of war.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const SIGHT_CUES_FOG_OFF_TOOLTIP = 'Sight cues need Fog of war. Check Fog of war to use them.';

/**
 * The Sight cues checkbox state the rule moves between.
 *
 * Purpose: One value holds what the box shows and what to restore.
 * When to use: The argument and result of `sightCuesAfterFogChange`.
 * Expected outcome: Plain booleans.
 * Exceptions: None.
 */
export interface SightCuesControlState {
  /**
   * Whether the box is checked.
   *
   * Contract: The value the page shows.
   * When to use: Writing the checkbox.
   * Expected outcome: False while Fog has disabled the box.
   * Exceptions: None.
   */
  readonly checked: boolean;
  /**
   * Whether the box is disabled.
   *
   * Contract: True while Fog of war is off.
   * When to use: Writing the checkbox.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly disabled: boolean;
  /**
   * The checked value to restore when Fog returns.
   *
   * Contract: Non-null only while Fog has disabled the box.
   * When to use: Fog turning back on.
   * Expected outcome: Null or the value the box had before Fog was unchecked.
   * Exceptions: None.
   */
  readonly rememberedChecked: boolean | null;
}

/**
 * The checkbox state after Fog of war changes.
 *
 * Purpose: Fog off remembers the choice once and locks the box off. Fog on unlocks the box and restores the choice once.
 * When to use: Each time the Fog checkbox changes, and when the dialog opens.
 * Expected outcome: A new state. Fog off with a memory already held, and Fog on with nothing remembered, return the state unchanged. The input is not mutated.
 * Exceptions: None.
 */
export function sightCuesAfterFogChange(args: {
  /** Contract: True when Fog of war is checked. */
  readonly fogOn: boolean;
  /** Contract: The state the checkbox has now. */
  readonly current: SightCuesControlState;
}): SightCuesControlState {
  const { fogOn, current } = args;
  if (!fogOn) {
    if (current.rememberedChecked !== null) return current;
    return { checked: false, disabled: true, rememberedChecked: current.checked };
  }
  if (current.rememberedChecked === null) return current;
  return { checked: current.rememberedChecked, disabled: false, rememberedChecked: null };
}
