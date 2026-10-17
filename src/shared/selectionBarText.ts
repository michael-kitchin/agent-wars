/**
 * The hint while a turn or a battle beat plays back. This module holds the text for the selection bar at the top of the
 * selection panel: the hint on its second line, which says what the next map gesture does, and the note on its first
 * line for selected units in other hexes. The hint must stay true to the map's gestures in every state, so its rules
 * live here with tests. Nothing here touches the page.
 *
 * Purpose: Map gestures that change orders wait until playback ends; right-click still clears the selection.
 * When to use: Returned by `selectionBarHint`.
 * Expected outcome: Shown on the selection bar's second line.
 * Exceptions: None.
 */
export const SELECTION_HINT_PLAYBACK = 'Playback is running · right-click to deselect';

/**
 * The hint while Ranged or Strike targeting is on.
 *
 * Purpose: The next double-click places the attack.
 * When to use: Returned by `selectionBarHint`.
 * Expected outcome: Shown on the selection bar's second line.
 * Exceptions: None.
 */
export const SELECTION_HINT_TARGETING = 'Double-click a target in range';

/**
 * The hint for a selection of air units only.
 *
 * Purpose: A double-click with an all-air selection plans a ferry.
 * When to use: Returned by `selectionBarHint`.
 * Expected outcome: Shown on the selection bar's second line.
 * Exceptions: None.
 */
export const SELECTION_HINT_FERRY = 'Double-click a hex to ferry · right-click to deselect';

/**
 * The hint for air units selected with other types.
 *
 * Purpose: A double-click with that selection is rejected, so the hint says why instead of naming a gesture.
 * When to use: Returned by `selectionBarHint`.
 * Expected outcome: Shown on the selection bar's second line.
 * Exceptions: None.
 */
export const SELECTION_HINT_MIXED = "Air units can't move with other units";

/**
 * The hint for any other selection.
 *
 * Purpose: A double-click plans a march.
 * When to use: Returned by `selectionBarHint`.
 * Expected outcome: Shown on the selection bar's second line.
 * Exceptions: None.
 */
export const SELECTION_HINT_MOVE = 'Double-click a hex to move · right-click to deselect';

/**
 * What decides the selection bar's hint.
 *
 * Purpose: The renderer reads these from its state; the rule stays testable.
 * When to use: Pass to `selectionBarHint`.
 * Expected outcome: Only these fields are read.
 * Exceptions: None.
 */
export interface SelectionBarHintInput {
  /**
   * Whether a turn or a battle beat is playing back.
   *
   * Contract: True while resolution playback ignores gestures that change orders.
   * When to use: Always.
   * Expected outcome: True wins over every other field.
   * Exceptions: None.
   */
  readonly playbackRunning: boolean;
  /**
   * Whether Ranged or Strike targeting is on.
   *
   * Contract: True while the next double-click places a ranged attack or an air strike.
   * When to use: Always.
   * Expected outcome: True wins over the unit types.
   * Exceptions: None.
   */
  readonly targetingOn: boolean;
  /**
   * The types of the selected units, such as `air` or `infantry`.
   *
   * Contract: One entry per selected unit or battle sub-unit.
   * When to use: Always.
   * Expected outcome: Decides between move, ferry, and the mixed-selection hint.
   * Exceptions: None.
   */
  readonly unitTypes: readonly string[];
}

/**
 * Chooses the selection bar's hint: playback, then targeting, then what a double-click does with this selection.
 *
 * Purpose: One rule for the world map and battles, which share these gestures.
 * When to use: Each time the selection, targeting, or playback changes.
 * Expected outcome: One of the `SELECTION_HINT_*` sentences. An empty selection gets the move hint, though the panel is
 *   hidden then.
 * Exceptions: None.
 */
export function selectionBarHint(input: SelectionBarHintInput): string {
  if (input.playbackRunning) return SELECTION_HINT_PLAYBACK;
  if (input.targetingOn) return SELECTION_HINT_TARGETING;
  const airCount = input.unitTypes.filter((unitType) => unitType === 'air').length;
  if (airCount > 0 && airCount === input.unitTypes.length) return SELECTION_HINT_FERRY;
  if (airCount > 0) return SELECTION_HINT_MIXED;
  return SELECTION_HINT_MOVE;
}

/**
 * Counts the selected units that stand outside the hex the bar names, as the end of the bar's first line.
 *
 * Purpose: The compact bar hides the unit rows, so the first line must say when the selection reaches other hexes.
 * When to use: With the rows from `summarizeSelectionPanel`.
 * Expected outcome: `+1 elsewhere` for one such unit, `+2 elsewhere` for two, and null when every selected unit stands
 *   in that hex.
 * Exceptions: None.
 */
export function selectionElsewhereText(rows: readonly { readonly inPanelHex: boolean }[]): string | null {
  const elsewhere = rows.filter((row) => !row.inPanelHex).length;
  return elsewhere > 0 ? `+${elsewhere} elsewhere` : null;
}
