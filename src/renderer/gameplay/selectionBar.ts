/**
 * The selection bar's parts that follow targeting and playback rather than the selection alone: the hint on its second
 * line, and the border color while the player aims a ranged attack or an air strike.
 *
 * Purpose: Targeting and playback start and stop without a selection change, so the selection panel's redraw alone
 *   would leave the bar out of date.
 * When to use: `renderSelectionBarState` after the selection panel redraws, after Ranged or Strike targeting turns on
 *   or off, and when playback starts or ends.
 * Expected outcome: `#selection-panel-hint` and the panel's `data-aim` match the current state.
 * Exceptions: None; missing elements are skipped.
 */
import { resolutionPlaybackBlocksMapOrders } from '../../shared/mapOrderGestureGate';
import { selectionBarHint } from '../../shared/selectionBarText';
import { rendererSharedState as S } from '../core/state';

/**
 * Returns the types of the selected units: battle sub-units in a battle, strategic units on the world map.
 *
 * Purpose: The hint and the Ranged or Strike control decide from the same list.
 * When to use: After the selection or the snapshot changes.
 * Expected outcome: One type per selected id that still matches a unit, in selection order.
 * Exceptions: None.
 */
export function selectedUnitTypes(): string[] {
  const battle = S.tacticalBattleSnapshot;
  const units: readonly { readonly id: string; readonly unitType: string }[] = battle
    ? battle.subUnits
    : (S.gameState?.units ?? []);
  const byId = new Map(units.map((unit) => [unit.id, unit.unitType]));
  return S.selectedUnitIds.flatMap((id) => {
    const unitType = byId.get(id);
    return unitType === undefined ? [] : [unitType];
  });
}

/**
 * Writes the bar's hint and marks the panel while targeting is on.
 *
 * Purpose: Keeps the hint true to what the next map gesture does, and colors the bar's border with the order being aimed.
 * When to use: See the module comment.
 * Expected outcome: The hint follows `selectionBarHint`. `data-aim` on `#selection-panel` is `ranged` or `strike` while
 *   that targeting is on, and absent otherwise; the styles color the border from it.
 * Exceptions: None.
 */
export function renderSelectionBarState(): void {
  const aim = S.airStrikeModeActive ? 'strike' : S.rangedModeActive ? 'ranged' : null;
  const panel = document.getElementById('selection-panel');
  if (panel) {
    if (aim) panel.dataset.aim = aim;
    else delete panel.dataset.aim;
  }
  const hint = document.getElementById('selection-panel-hint');
  if (hint) {
    hint.textContent = selectionBarHint({
      playbackRunning: resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation),
      targetingOn: aim !== null,
      unitTypes: selectedUnitTypes(),
    });
  }
}
